-- Fix substitution RPCs to avoid constraint violations on partial unique indexes.
-- Strategy: exit old entries first, then INSERT fresh rows (never UPDATE indexed columns).

-- ============================================
-- 1. Fix swap_fielding_positions (atomic)
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
  SELECT league_id INTO v_league_id FROM games WHERE id = p_game_id;
  IF v_league_id IS NULL THEN RAISE EXCEPTION 'Game not found.'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() AND league_id = v_league_id
      AND role IN ('commissioner', 'manager', 'coach')
  ) AND NOT EXISTS (
    SELECT 1 FROM scorekeeper_assignments
    WHERE game_id = p_game_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized.';
  END IF;

  SELECT id, fielding_position INTO v_id_a, v_pos_a
  FROM game_lineups
  WHERE game_id = p_game_id AND team_id = p_team_id
    AND player_user_id = p_player_a_id AND exited_inning IS NULL
  LIMIT 1;
  IF v_id_a IS NULL THEN RAISE EXCEPTION 'Player A not in active lineup.'; END IF;

  SELECT id, fielding_position INTO v_id_b, v_pos_b
  FROM game_lineups
  WHERE game_id = p_game_id AND team_id = p_team_id
    AND player_user_id = p_player_b_id AND exited_inning IS NULL
  LIMIT 1;
  IF v_id_b IS NULL THEN RAISE EXCEPTION 'Player B not in active lineup.'; END IF;

  UPDATE game_lineups
  SET fielding_position = CASE
    WHEN id = v_id_a THEN v_pos_b
    WHEN id = v_id_b THEN v_pos_a
  END
  WHERE id IN (v_id_a, v_id_b);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 2. Fix substitute_player
-- Strategy: exit ALL active rows for both players, then INSERT fresh row for incoming.
-- This avoids any partial unique index conflicts from duplicate data.
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
  v_was_active boolean;
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

  IF NOT EXISTS (
    SELECT 1 FROM games
    WHERE id = p_game_id
      AND (home_team_id = p_team_id OR away_team_id = p_team_id)
  ) THEN
    RAISE EXCEPTION 'Team is not part of this game.';
  END IF;

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

  IF p_outgoing_player_id = p_incoming_player_id THEN
    RAISE EXCEPTION 'Cannot substitute a player for themselves.';
  END IF;

  -- Find outgoing player's active lineup entry (need their batting_order)
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

  -- Check if incoming player is currently active (determines re-entry check)
  v_was_active := EXISTS (
    SELECT 1 FROM game_lineups
    WHERE game_id = p_game_id
      AND team_id = p_team_id
      AND player_user_id = p_incoming_player_id
      AND exited_inning IS NULL
  );

  -- If incoming was NOT active, they need re-entry permission (if they were ever in the game)
  IF NOT v_was_active AND NOT v_allow_reentry THEN
    IF EXISTS (
      SELECT 1 FROM game_lineups
      WHERE game_id = p_game_id
        AND team_id = p_team_id
        AND player_user_id = p_incoming_player_id
        AND exited_inning IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'This league does not allow player re-entry.';
    END IF;
  END IF;

  -- Exit ALL active entries for the outgoing player
  UPDATE game_lineups
  SET exited_inning = p_inning
  WHERE game_id = p_game_id
    AND team_id = p_team_id
    AND player_user_id = p_outgoing_player_id
    AND exited_inning IS NULL;

  -- Exit ALL active entries for the incoming player (clears index for safe INSERT)
  UPDATE game_lineups
  SET exited_inning = p_inning
  WHERE game_id = p_game_id
    AND team_id = p_team_id
    AND player_user_id = p_incoming_player_id
    AND exited_inning IS NULL;

  -- INSERT a fresh entry for the incoming player at the outgoing's batting slot
  INSERT INTO game_lineups (
    game_id, team_id, player_user_id,
    batting_order, fielding_position,
    is_substitute, entered_inning
  ) VALUES (
    p_game_id, p_team_id, p_incoming_player_id,
    v_outgoing_row.batting_order, p_fielding_position,
    true, p_inning
  ) RETURNING id INTO v_result_id;

  RETURN v_result_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 3. Fix fill_vacant_position
-- Same strategy: exit old entries, INSERT fresh row.
-- ============================================
CREATE OR REPLACE FUNCTION fill_vacant_position(
  p_game_id uuid,
  p_team_id uuid,
  p_player_id uuid,
  p_batting_order integer,
  p_fielding_position integer,
  p_inning integer
)
RETURNS uuid AS $$
DECLARE
  v_league_id uuid;
  v_allow_reentry boolean;
  v_was_active boolean;
  v_result_id uuid;
BEGIN
  SELECT g.league_id, l.allow_reentry
  INTO v_league_id, v_allow_reentry
  FROM games g
  JOIN leagues l ON l.id = g.league_id
  WHERE g.id = p_game_id;

  IF v_league_id IS NULL THEN
    RAISE EXCEPTION 'Game not found.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM games
    WHERE id = p_game_id
      AND (home_team_id = p_team_id OR away_team_id = p_team_id)
  ) THEN
    RAISE EXCEPTION 'Team is not part of this game.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
      AND league_id = v_league_id
      AND role IN ('commissioner', 'manager', 'coach')
  ) AND NOT EXISTS (
    SELECT 1 FROM scorekeeper_assignments
    WHERE game_id = p_game_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized.';
  END IF;

  -- Check if player is currently active
  v_was_active := EXISTS (
    SELECT 1 FROM game_lineups
    WHERE game_id = p_game_id
      AND team_id = p_team_id
      AND player_user_id = p_player_id
      AND exited_inning IS NULL
  );

  -- If NOT active, check re-entry eligibility
  IF NOT v_was_active AND NOT v_allow_reentry THEN
    IF EXISTS (
      SELECT 1 FROM game_lineups
      WHERE game_id = p_game_id
        AND team_id = p_team_id
        AND player_user_id = p_player_id
        AND exited_inning IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'This league does not allow player re-entry.';
    END IF;
  END IF;

  -- Exit ALL active entries for this player (clears partial unique index)
  UPDATE game_lineups
  SET exited_inning = p_inning
  WHERE game_id = p_game_id
    AND team_id = p_team_id
    AND player_user_id = p_player_id
    AND exited_inning IS NULL;

  -- INSERT a fresh entry at the target position
  INSERT INTO game_lineups (
    game_id, team_id, player_user_id,
    batting_order, fielding_position,
    is_substitute, entered_inning
  ) VALUES (
    p_game_id, p_team_id, p_player_id,
    p_batting_order, p_fielding_position,
    true, p_inning
  ) RETURNING id INTO v_result_id;

  RETURN v_result_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
