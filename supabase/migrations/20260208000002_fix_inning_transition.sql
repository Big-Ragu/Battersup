-- Fix: record_play was not advancing inning/half when 3 outs were recorded.
-- The game's inning and inning_half stayed on the current half even after
-- the third out, so the scorekeeper was stuck in the same half-inning.
--
-- This also fixes outs_before to be populated from the previous event state.

CREATE OR REPLACE FUNCTION record_play(
  p_game_id uuid,
  p_event jsonb
)
RETURNS uuid AS $$
DECLARE
  v_league_id uuid;
  v_game_status game_status;
  v_seq integer;
  v_event_id uuid;
  v_inning integer;
  v_inning_half text;
  v_runs integer;
  v_outs integer;
  v_outs_before integer;
  v_home_team_id uuid;
  v_away_team_id uuid;
  v_next_inning integer;
  v_next_inning_half text;
BEGIN
  -- Fetch game info
  SELECT league_id, status, home_team_id, away_team_id
  INTO v_league_id, v_game_status, v_home_team_id, v_away_team_id
  FROM games WHERE id = p_game_id;

  IF v_league_id IS NULL THEN
    RAISE EXCEPTION 'Game not found.';
  END IF;

  IF v_game_status != 'in_progress' THEN
    RAISE EXCEPTION 'Game must be in progress to record plays.';
  END IF;

  -- Verify caller is an assigned scorekeeper
  IF NOT EXISTS (
    SELECT 1 FROM scorekeeper_assignments
    WHERE game_id = p_game_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Only assigned scorekeepers can record plays.';
  END IF;

  -- Get next sequence number
  SELECT coalesce(max(sequence_number), 0) + 1 INTO v_seq
  FROM game_events
  WHERE game_id = p_game_id AND NOT is_deleted;

  v_inning := (p_event->>'inning')::integer;
  v_inning_half := p_event->>'inning_half';
  v_runs := coalesce((p_event->>'runs_scored')::integer, 0);
  v_outs := coalesce((p_event->>'outs_after')::integer, 0);

  -- Get outs_before from the previous event in the same half-inning, or 0
  SELECT coalesce(ge.outs_after, 0) INTO v_outs_before
  FROM game_events ge
  WHERE ge.game_id = p_game_id
    AND ge.inning = v_inning
    AND ge.inning_half = v_inning_half
    AND NOT ge.is_deleted
  ORDER BY ge.sequence_number DESC
  LIMIT 1;

  IF v_outs_before IS NULL THEN
    v_outs_before := 0;
  END IF;

  -- Insert the event (stored with the half-inning where the play occurred)
  INSERT INTO game_events (
    game_id, inning, inning_half, sequence_number,
    batter_user_id, pitcher_user_id,
    outcome, hit_location, fielding_sequence,
    outs_before, outs_after, runs_scored,
    runners_before, runners_after, runner_movements,
    pitch_count_at_event, balls, strikes,
    recorded_by, consensus,
    video_timestamp_seconds, notes
  ) VALUES (
    p_game_id,
    v_inning,
    v_inning_half,
    v_seq,
    (p_event->>'batter_user_id')::uuid,
    (p_event->>'pitcher_user_id')::uuid,
    (p_event->>'outcome')::play_outcome,
    (p_event->>'hit_location')::integer,
    p_event->>'fielding_sequence',
    v_outs_before,
    v_outs,
    v_runs,
    coalesce(p_event->'runners_before', '{"first":null,"second":null,"third":null}'::jsonb),
    coalesce(p_event->'runners_after', '{"first":null,"second":null,"third":null}'::jsonb),
    p_event->'runner_movements',
    (p_event->>'pitch_count_at_event')::integer,
    (p_event->>'balls')::integer,
    (p_event->>'strikes')::integer,
    auth.uid(),
    'pending',
    (p_event->>'video_timestamp_seconds')::integer,
    p_event->>'notes'
  ) RETURNING id INTO v_event_id;

  -- Determine next game state: advance inning if 3 outs
  v_next_inning := v_inning;
  v_next_inning_half := v_inning_half;

  IF v_outs >= 3 THEN
    IF v_inning_half = 'top' THEN
      v_next_inning_half := 'bottom';
      -- same inning
    ELSE
      v_next_inning_half := 'top';
      v_next_inning := v_inning + 1;
    END IF;
  END IF;

  -- Recalculate and update game scores + advance inning state
  UPDATE games SET
    home_score = (
      SELECT coalesce(sum(ge.runs_scored), 0)
      FROM game_events ge
      WHERE ge.game_id = p_game_id
        AND ge.inning_half = 'bottom'
        AND NOT ge.is_deleted
    ),
    away_score = (
      SELECT coalesce(sum(ge.runs_scored), 0)
      FROM game_events ge
      WHERE ge.game_id = p_game_id
        AND ge.inning_half = 'top'
        AND NOT ge.is_deleted
    ),
    inning = v_next_inning,
    inning_half = v_next_inning_half
  WHERE id = p_game_id;

  RETURN v_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Also fix undo_last_play: when the new last event has outs_after >= 3,
-- the game state should be the *next* half-inning (since that half ended).
-- Also handle the case where all events are undone (reset to inning 1, top).

CREATE OR REPLACE FUNCTION undo_last_play(p_game_id uuid)
RETURNS uuid AS $$
DECLARE
  v_event_id uuid;
  v_last_inning integer;
  v_last_half text;
  v_last_outs integer;
  v_game_inning integer;
  v_game_half text;
BEGIN
  -- Verify caller is an assigned scorekeeper
  IF NOT EXISTS (
    SELECT 1 FROM scorekeeper_assignments
    WHERE game_id = p_game_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Only assigned scorekeepers can undo plays.';
  END IF;

  -- Find the last non-deleted event
  SELECT id INTO v_event_id
  FROM game_events
  WHERE game_id = p_game_id AND NOT is_deleted
  ORDER BY sequence_number DESC
  LIMIT 1;

  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'No plays to undo.';
  END IF;

  -- Soft delete it
  UPDATE game_events SET is_deleted = true WHERE id = v_event_id;

  -- Find the new last event (after the undo)
  SELECT ge.inning, ge.inning_half, ge.outs_after
  INTO v_last_inning, v_last_half, v_last_outs
  FROM game_events ge
  WHERE ge.game_id = p_game_id AND NOT ge.is_deleted
  ORDER BY ge.sequence_number DESC
  LIMIT 1;

  IF v_last_inning IS NULL THEN
    -- All events undone, reset to start
    v_game_inning := 1;
    v_game_half := 'top';
  ELSIF v_last_outs >= 3 THEN
    -- The last remaining event ended a half-inning, so game state
    -- should be the *next* half (same logic as record_play)
    IF v_last_half = 'top' THEN
      v_game_inning := v_last_inning;
      v_game_half := 'bottom';
    ELSE
      v_game_inning := v_last_inning + 1;
      v_game_half := 'top';
    END IF;
  ELSE
    -- Still in the same half-inning
    v_game_inning := v_last_inning;
    v_game_half := v_last_half;
  END IF;

  -- Recalculate game scores and set inning state
  UPDATE games SET
    home_score = (
      SELECT coalesce(sum(ge.runs_scored), 0)
      FROM game_events ge
      WHERE ge.game_id = p_game_id
        AND ge.inning_half = 'bottom'
        AND NOT ge.is_deleted
    ),
    away_score = (
      SELECT coalesce(sum(ge.runs_scored), 0)
      FROM game_events ge
      WHERE ge.game_id = p_game_id
        AND ge.inning_half = 'top'
        AND NOT ge.is_deleted
    ),
    inning = v_game_inning,
    inning_half = v_game_half
  WHERE id = p_game_id;

  RETURN v_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
