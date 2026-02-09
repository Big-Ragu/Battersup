-- Game ending logic:
-- 1. Skip bottom of final inning when home team leads
-- 2. Walk-off detection (home team takes lead in bottom of final inning+)
-- 3. Auto-finalize game when last out is recorded
-- 4. Add innings_per_game to leagues (default 9, configurable for youth/rec)
-- 5. Update undo_last_play to revert 'final' status

-- ============================================
-- 1. Add innings_per_game to leagues
-- ============================================
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS innings_per_game integer NOT NULL DEFAULT 9;

-- ============================================
-- 2. Replace record_play with game-ending logic
-- ============================================
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
  v_home_score integer;
  v_away_score integer;
  v_innings_per_game integer;
  v_game_over boolean := false;
BEGIN
  -- Fetch game info
  SELECT g.league_id, g.status, g.home_team_id, g.away_team_id, l.innings_per_game
  INTO v_league_id, v_game_status, v_home_team_id, v_away_team_id, v_innings_per_game
  FROM games g
  JOIN leagues l ON l.id = g.league_id
  WHERE g.id = p_game_id;

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

  -- Recalculate scores
  SELECT coalesce(sum(ge.runs_scored), 0) INTO v_home_score
  FROM game_events ge
  WHERE ge.game_id = p_game_id AND ge.inning_half = 'bottom' AND NOT ge.is_deleted;

  SELECT coalesce(sum(ge.runs_scored), 0) INTO v_away_score
  FROM game_events ge
  WHERE ge.game_id = p_game_id AND ge.inning_half = 'top' AND NOT ge.is_deleted;

  -- Determine next game state
  v_next_inning := v_inning;
  v_next_inning_half := v_inning_half;

  IF v_outs >= 3 THEN
    -- Half-inning is over
    IF v_inning_half = 'top' THEN
      IF v_inning >= v_innings_per_game AND v_home_score > v_away_score THEN
        -- Home team leads after top of final inning → skip bottom, game over
        v_game_over := true;
      ELSE
        v_next_inning_half := 'bottom';
      END IF;
    ELSE
      -- End of bottom half
      IF v_inning >= v_innings_per_game AND v_home_score != v_away_score THEN
        -- Final inning+ bottom over, someone leads → game over
        v_game_over := true;
      ELSE
        -- Tied after regulation → extras, or still early innings
        v_next_inning_half := 'top';
        v_next_inning := v_inning + 1;
      END IF;
    END IF;
  ELSE
    -- Not 3 outs yet — check for walk-off
    IF v_inning_half = 'bottom' AND v_inning >= v_innings_per_game AND v_home_score > v_away_score THEN
      -- Walk-off! Home team takes the lead in bottom of final inning+
      v_game_over := true;
    END IF;
  END IF;

  -- Update game state
  UPDATE games SET
    home_score = v_home_score,
    away_score = v_away_score,
    inning = v_next_inning,
    inning_half = v_next_inning_half,
    status = CASE WHEN v_game_over THEN 'final'::game_status ELSE status END
  WHERE id = p_game_id;

  RETURN v_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 3. Replace undo_last_play to handle reverting from 'final'
-- ============================================
CREATE OR REPLACE FUNCTION undo_last_play(p_game_id uuid)
RETURNS uuid AS $$
DECLARE
  v_event_id uuid;
  v_last_inning integer;
  v_last_half text;
  v_last_outs integer;
  v_game_inning integer;
  v_game_half text;
  v_home_score integer;
  v_away_score integer;
  v_innings_per_game integer;
  v_should_be_final boolean := false;
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

  -- Get innings_per_game
  SELECT l.innings_per_game INTO v_innings_per_game
  FROM games g JOIN leagues l ON l.id = g.league_id
  WHERE g.id = p_game_id;

  -- Recalculate scores
  SELECT coalesce(sum(ge.runs_scored), 0) INTO v_home_score
  FROM game_events ge
  WHERE ge.game_id = p_game_id AND ge.inning_half = 'bottom' AND NOT ge.is_deleted;

  SELECT coalesce(sum(ge.runs_scored), 0) INTO v_away_score
  FROM game_events ge
  WHERE ge.game_id = p_game_id AND ge.inning_half = 'top' AND NOT ge.is_deleted;

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
    -- The last remaining event ended a half-inning — apply same ending logic
    IF v_last_half = 'top' THEN
      IF v_last_inning >= v_innings_per_game AND v_home_score > v_away_score THEN
        -- Home leads after top of final → game should stay final
        v_should_be_final := true;
        v_game_inning := v_last_inning;
        v_game_half := v_last_half;
      ELSE
        v_game_inning := v_last_inning;
        v_game_half := 'bottom';
      END IF;
    ELSE
      IF v_last_inning >= v_innings_per_game AND v_home_score != v_away_score THEN
        -- End of bottom of final+, someone leads → still final
        v_should_be_final := true;
        v_game_inning := v_last_inning;
        v_game_half := v_last_half;
      ELSE
        v_game_inning := v_last_inning + 1;
        v_game_half := 'top';
      END IF;
    END IF;
  ELSE
    -- Still in the same half-inning
    v_game_inning := v_last_inning;
    v_game_half := v_last_half;

    -- Check if the remaining state is a walk-off
    IF v_last_half = 'bottom' AND v_last_inning >= v_innings_per_game AND v_home_score > v_away_score THEN
      v_should_be_final := true;
    END IF;
  END IF;

  -- Update game state — revert to in_progress unless remaining events still show a final state
  UPDATE games SET
    home_score = v_home_score,
    away_score = v_away_score,
    inning = v_game_inning,
    inning_half = v_game_half,
    status = CASE WHEN v_should_be_final THEN 'final'::game_status ELSE 'in_progress'::game_status END
  WHERE id = p_game_id;

  RETURN v_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 4. Update get_game_state to include innings_per_game
-- ============================================
CREATE OR REPLACE FUNCTION get_game_state(p_game_id uuid)
RETURNS json AS $$
DECLARE
  v_league_id uuid;
  v_result json;
BEGIN
  SELECT league_id INTO v_league_id
  FROM games WHERE id = p_game_id;

  IF v_league_id IS NULL THEN
    RAISE EXCEPTION 'Game not found.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() AND league_id = v_league_id
  ) THEN
    RAISE EXCEPTION 'Not a member of this league.';
  END IF;

  SELECT json_build_object(
    'game', (
      SELECT row_to_json(g_row) FROM (
        SELECT g.id, g.league_id, g.home_team_id, g.away_team_id,
               g.field_id, g.diamond_number, g.scheduled_at,
               g.status, g.home_score, g.away_score,
               g.inning, g.inning_half, g.notes,
               ht.name AS home_team_name, ht.color AS home_team_color,
               at_.name AS away_team_name, at_.color AS away_team_color,
               f.name AS field_name, l.name AS league_name,
               l.allow_reentry, l.innings_per_game
        FROM games g
        JOIN teams ht ON ht.id = g.home_team_id
        JOIN teams at_ ON at_.id = g.away_team_id
        LEFT JOIN fields f ON f.id = g.field_id
        JOIN leagues l ON l.id = g.league_id
        WHERE g.id = p_game_id
      ) g_row
    ),
    'home_lineup', (
      SELECT coalesce(json_agg(row_to_json(hl) ORDER BY hl.exited_inning NULLS FIRST, hl.batting_order), '[]'::json) FROM (
        SELECT gl.id, gl.player_user_id, gl.batting_order, gl.fielding_position,
               gl.is_substitute, gl.entered_inning, gl.exited_inning,
               p.full_name AS player_name,
               re.jersey_number
        FROM game_lineups gl
        JOIN profiles p ON p.id = gl.player_user_id
        LEFT JOIN roster_entries re ON re.player_user_id = gl.player_user_id
          AND re.team_id = gl.team_id
        JOIN games g ON g.id = gl.game_id
        WHERE gl.game_id = p_game_id
          AND gl.team_id = g.home_team_id
      ) hl
    ),
    'away_lineup', (
      SELECT coalesce(json_agg(row_to_json(al) ORDER BY al.exited_inning NULLS FIRST, al.batting_order), '[]'::json) FROM (
        SELECT gl.id, gl.player_user_id, gl.batting_order, gl.fielding_position,
               gl.is_substitute, gl.entered_inning, gl.exited_inning,
               p.full_name AS player_name,
               re.jersey_number
        FROM game_lineups gl
        JOIN profiles p ON p.id = gl.player_user_id
        LEFT JOIN roster_entries re ON re.player_user_id = gl.player_user_id
          AND re.team_id = gl.team_id
        JOIN games g ON g.id = gl.game_id
        WHERE gl.game_id = p_game_id
          AND gl.team_id = g.away_team_id
      ) al
    ),
    'events', (
      SELECT coalesce(json_agg(row_to_json(ev) ORDER BY ev.sequence_number), '[]'::json) FROM (
        SELECT ge.id, ge.inning, ge.inning_half, ge.sequence_number,
               ge.batter_user_id, ge.pitcher_user_id,
               ge.outcome::text, ge.hit_location, ge.fielding_sequence,
               ge.outs_before, ge.outs_after, ge.runs_scored,
               ge.runners_before, ge.runners_after, ge.runner_movements,
               ge.pitch_count_at_event, ge.balls, ge.strikes,
               ge.recorded_by, ge.partner_outcome::text,
               ge.partner_recorded_by, ge.consensus::text,
               ge.video_timestamp_seconds, ge.notes, ge.is_deleted,
               bp.full_name AS batter_name,
               pp.full_name AS pitcher_name
        FROM game_events ge
        LEFT JOIN profiles bp ON bp.id = ge.batter_user_id
        LEFT JOIN profiles pp ON pp.id = ge.pitcher_user_id
        WHERE ge.game_id = p_game_id AND NOT ge.is_deleted
      ) ev
    ),
    'scorekeepers', (
      SELECT coalesce(json_agg(row_to_json(sk)), '[]'::json) FROM (
        SELECT sa.id, sa.game_id, sa.team_id, sa.user_id, sa.assigned_by,
               p.full_name AS user_name, p.email AS user_email,
               t.name AS team_name
        FROM scorekeeper_assignments sa
        JOIN profiles p ON p.id = sa.user_id
        JOIN teams t ON t.id = sa.team_id
        WHERE sa.game_id = p_game_id
      ) sk
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
