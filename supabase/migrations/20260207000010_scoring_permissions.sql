-- Allow managers and commissioners to record/undo plays (not just assigned scorekeepers)
-- This enables simultaneous scoring by both team managers.

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
  v_home_team_id uuid;
  v_away_team_id uuid;
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

  -- Verify caller is authorized: assigned scorekeeper, manager, or commissioner
  IF NOT EXISTS (
    SELECT 1 FROM scorekeeper_assignments
    WHERE game_id = p_game_id AND user_id = auth.uid()
  ) AND NOT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
      AND league_id = v_league_id
      AND role IN ('commissioner', 'manager')
  ) THEN
    RAISE EXCEPTION 'Not authorized to record plays for this game.';
  END IF;

  -- Get next sequence number
  SELECT coalesce(max(sequence_number), 0) + 1 INTO v_seq
  FROM game_events
  WHERE game_id = p_game_id AND NOT is_deleted;

  v_inning := (p_event->>'inning')::integer;
  v_inning_half := p_event->>'inning_half';
  v_runs := coalesce((p_event->>'runs_scored')::integer, 0);
  v_outs := coalesce((p_event->>'outs_after')::integer, 0);

  -- Insert the event
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
    coalesce((p_event->>'outs_before')::integer, 0),
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

  -- Recalculate and update game scores from all non-deleted events
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
    inning = v_inning,
    inning_half = v_inning_half
  WHERE id = p_game_id;

  RETURN v_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Also update undo_last_play with the same expanded permissions
CREATE OR REPLACE FUNCTION undo_last_play(p_game_id uuid)
RETURNS uuid AS $$
DECLARE
  v_event_id uuid;
  v_league_id uuid;
BEGIN
  -- Get league for role check
  SELECT league_id INTO v_league_id
  FROM games WHERE id = p_game_id;

  -- Verify caller is authorized: assigned scorekeeper, manager, or commissioner
  IF NOT EXISTS (
    SELECT 1 FROM scorekeeper_assignments
    WHERE game_id = p_game_id AND user_id = auth.uid()
  ) AND NOT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
      AND league_id = v_league_id
      AND role IN ('commissioner', 'manager')
  ) THEN
    RAISE EXCEPTION 'Not authorized to undo plays for this game.';
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

  -- Recalculate game scores
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
    inning = (
      SELECT ge.inning FROM game_events ge
      WHERE ge.game_id = p_game_id AND NOT ge.is_deleted
      ORDER BY ge.sequence_number DESC LIMIT 1
    ),
    inning_half = (
      SELECT ge.inning_half FROM game_events ge
      WHERE ge.game_id = p_game_id AND NOT ge.is_deleted
      ORDER BY ge.sequence_number DESC LIMIT 1
    )
  WHERE id = p_game_id;

  RETURN v_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
