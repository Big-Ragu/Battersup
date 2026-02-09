-- fill_vacant_position: moves a bench or re-entry player into a specific position/batting_order.
-- Used after a substitution creates a vacant fielding position (e.g., a fielder moves to pitcher
-- and the old pitcher exits, leaving the fielder's old position open).

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
  v_row record;
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
    RAISE EXCEPTION 'Not authorized.';
  END IF;

  -- Find the player's current active lineup entry (bench player)
  SELECT id, fielding_position
  INTO v_row
  FROM game_lineups
  WHERE game_id = p_game_id
    AND team_id = p_team_id
    AND player_user_id = p_player_id
    AND exited_inning IS NULL
  LIMIT 1;

  IF v_row IS NOT NULL THEN
    UPDATE game_lineups
    SET batting_order = p_batting_order,
        fielding_position = p_fielding_position,
        is_substitute = true,
        entered_inning = p_inning
    WHERE id = v_row.id
    RETURNING id INTO v_result_id;
  ELSE
    -- Check for exited player (re-entry)
    SELECT id
    INTO v_row
    FROM game_lineups
    WHERE game_id = p_game_id
      AND team_id = p_team_id
      AND player_user_id = p_player_id
      AND exited_inning IS NOT NULL
    ORDER BY exited_inning DESC
    LIMIT 1;

    IF v_row IS NOT NULL THEN
      IF NOT v_allow_reentry THEN
        RAISE EXCEPTION 'This league does not allow player re-entry.';
      END IF;

      UPDATE game_lineups
      SET exited_inning = NULL,
          batting_order = p_batting_order,
          fielding_position = p_fielding_position,
          is_substitute = true,
          entered_inning = p_inning
      WHERE id = v_row.id
      RETURNING id INTO v_result_id;
    ELSE
      -- Not in game at all — insert fresh
      INSERT INTO game_lineups (
        game_id, team_id, player_user_id,
        batting_order, fielding_position,
        is_substitute, entered_inning
      ) VALUES (
        p_game_id, p_team_id, p_player_id,
        p_batting_order, p_fielding_position,
        true, p_inning
      ) RETURNING id INTO v_result_id;
    END IF;
  END IF;

  RETURN v_result_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
