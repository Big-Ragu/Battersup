-- Substitution system: league re-entry setting, substitute_player RPC, swap_fielding_positions RPC.
-- Also updates get_game_state to return ALL lineup entries (including exited) and allow_reentry flag.

-- ============================================
-- 1. Add re-entry column to leagues
-- ============================================
ALTER TABLE leagues ADD COLUMN allow_reentry boolean NOT NULL DEFAULT false;

-- ============================================
-- 2. substitute_player RPC
-- ============================================
CREATE OR REPLACE FUNCTION substitute_player(
  p_game_id uuid,
  p_team_id uuid,
  p_outgoing_player_id uuid,
  p_incoming_player_id uuid,
  p_fielding_position integer,
  p_inning integer
)
RETURNS uuid AS $$
DECLARE
  v_league_id uuid;
  v_allow_reentry boolean;
  v_outgoing_row record;
  v_incoming_row record;
  v_result_id uuid;
BEGIN
  -- Get league info
  SELECT g.league_id, l.allow_reentry
  INTO v_league_id, v_allow_reentry
  FROM games g
  JOIN leagues l ON l.id = g.league_id
  WHERE g.id = p_game_id;

  IF v_league_id IS NULL THEN
    RAISE EXCEPTION 'Game not found.';
  END IF;

  -- Verify team is part of game
  IF NOT EXISTS (
    SELECT 1 FROM games
    WHERE id = p_game_id
      AND (home_team_id = p_team_id OR away_team_id = p_team_id)
  ) THEN
    RAISE EXCEPTION 'Team is not part of this game.';
  END IF;

  -- Verify caller is authorized (scorekeeper, coach, manager, commissioner)
  IF NOT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
      AND league_id = v_league_id
      AND role IN ('commissioner', 'manager', 'coach')
  ) AND NOT EXISTS (
    SELECT 1 FROM scorekeeper_assignments
    WHERE game_id = p_game_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized to make substitutions.';
  END IF;

  -- Find outgoing player's active lineup entry
  SELECT id, batting_order, fielding_position
  INTO v_outgoing_row
  FROM game_lineups
  WHERE game_id = p_game_id
    AND team_id = p_team_id
    AND player_user_id = p_outgoing_player_id
    AND exited_inning IS NULL
  LIMIT 1;

  IF v_outgoing_row IS NULL THEN
    RAISE EXCEPTION 'Outgoing player not found in active lineup.';
  END IF;

  -- Mark outgoing player as exited
  UPDATE game_lineups
  SET exited_inning = p_inning
  WHERE id = v_outgoing_row.id;

  -- Find incoming player's current lineup entry (could be bench, starter, or exited)
  -- First check for an active entry (bench or starter)
  SELECT id, batting_order, fielding_position, exited_inning
  INTO v_incoming_row
  FROM game_lineups
  WHERE game_id = p_game_id
    AND team_id = p_team_id
    AND player_user_id = p_incoming_player_id
    AND exited_inning IS NULL
  LIMIT 1;

  IF v_incoming_row IS NOT NULL THEN
    -- Incoming player is currently active (bench or starter)
    UPDATE game_lineups
    SET batting_order = v_outgoing_row.batting_order,
        fielding_position = p_fielding_position,
        is_substitute = true,
        entered_inning = p_inning
    WHERE id = v_incoming_row.id
    RETURNING id INTO v_result_id;
  ELSE
    -- Check for an exited entry (re-entry scenario)
    SELECT id, exited_inning
    INTO v_incoming_row
    FROM game_lineups
    WHERE game_id = p_game_id
      AND team_id = p_team_id
      AND player_user_id = p_incoming_player_id
      AND exited_inning IS NOT NULL
    ORDER BY exited_inning DESC
    LIMIT 1;

    IF v_incoming_row IS NOT NULL THEN
      -- Re-entry: verify league allows it
      IF NOT v_allow_reentry THEN
        RAISE EXCEPTION 'This league does not allow player re-entry.';
      END IF;

      UPDATE game_lineups
      SET exited_inning = NULL,
          batting_order = v_outgoing_row.batting_order,
          fielding_position = p_fielding_position,
          is_substitute = true,
          entered_inning = p_inning
      WHERE id = v_incoming_row.id
      RETURNING id INTO v_result_id;
    ELSE
      -- Player not in game_lineups at all — insert fresh (e.g. late roster addition)
      INSERT INTO game_lineups (
        game_id, team_id, player_user_id,
        batting_order, fielding_position,
        is_substitute, entered_inning
      ) VALUES (
        p_game_id, p_team_id, p_incoming_player_id,
        v_outgoing_row.batting_order, p_fielding_position,
        true, p_inning
      ) RETURNING id INTO v_result_id;
    END IF;
  END IF;

  RETURN v_result_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 3. swap_fielding_positions RPC
-- ============================================
CREATE OR REPLACE FUNCTION swap_fielding_positions(
  p_game_id uuid,
  p_team_id uuid,
  p_player_a_id uuid,
  p_player_b_id uuid
)
RETURNS void AS $$
DECLARE
  v_league_id uuid;
  v_pos_a integer;
  v_pos_b integer;
  v_id_a uuid;
  v_id_b uuid;
BEGIN
  -- Get league
  SELECT league_id INTO v_league_id
  FROM games WHERE id = p_game_id;

  IF v_league_id IS NULL THEN
    RAISE EXCEPTION 'Game not found.';
  END IF;

  -- Verify caller is authorized
  IF NOT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
      AND league_id = v_league_id
      AND role IN ('commissioner', 'manager', 'coach')
  ) AND NOT EXISTS (
    SELECT 1 FROM scorekeeper_assignments
    WHERE game_id = p_game_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized to swap positions.';
  END IF;

  -- Get player A's active entry
  SELECT id, fielding_position INTO v_id_a, v_pos_a
  FROM game_lineups
  WHERE game_id = p_game_id
    AND team_id = p_team_id
    AND player_user_id = p_player_a_id
    AND exited_inning IS NULL
  LIMIT 1;

  IF v_id_a IS NULL THEN
    RAISE EXCEPTION 'Player A not found in active lineup.';
  END IF;

  -- Get player B's active entry
  SELECT id, fielding_position INTO v_id_b, v_pos_b
  FROM game_lineups
  WHERE game_id = p_game_id
    AND team_id = p_team_id
    AND player_user_id = p_player_b_id
    AND exited_inning IS NULL
  LIMIT 1;

  IF v_id_b IS NULL THEN
    RAISE EXCEPTION 'Player B not found in active lineup.';
  END IF;

  -- Swap positions
  UPDATE game_lineups SET fielding_position = v_pos_b WHERE id = v_id_a;
  UPDATE game_lineups SET fielding_position = v_pos_a WHERE id = v_id_b;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 4. Update get_game_state to include ALL lineup entries + allow_reentry
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
               l.allow_reentry
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
