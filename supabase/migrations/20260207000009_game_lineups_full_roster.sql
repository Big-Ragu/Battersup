-- Allow full-roster batting orders in game lineups (bench players have NULL fielding_position)

-- Make fielding_position nullable (bench/bat-only players don't field)
ALTER TABLE game_lineups ALTER COLUMN fielding_position DROP NOT NULL;

-- Update set_game_lineup RPC to convert 0 → NULL for bench players
CREATE OR REPLACE FUNCTION set_game_lineup(
  p_game_id uuid,
  p_team_id uuid,
  p_lineup jsonb
)
RETURNS integer AS $$
DECLARE
  v_league_id uuid;
  v_entry jsonb;
  v_count integer := 0;
  v_player_id uuid;
  v_batting integer;
  v_position integer;
BEGIN
  -- Get game's league
  SELECT league_id INTO v_league_id
  FROM games WHERE id = p_game_id;

  IF v_league_id IS NULL THEN
    RAISE EXCEPTION 'Game not found.';
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
    RAISE EXCEPTION 'Not authorized to set lineup for this game.';
  END IF;

  -- Verify team is part of this game
  IF NOT EXISTS (
    SELECT 1 FROM games
    WHERE id = p_game_id
      AND (home_team_id = p_team_id OR away_team_id = p_team_id)
  ) THEN
    RAISE EXCEPTION 'Team is not part of this game.';
  END IF;

  -- Mark existing active lineup as exited (soft clear)
  UPDATE game_lineups
  SET exited_inning = 0
  WHERE game_id = p_game_id
    AND team_id = p_team_id
    AND exited_inning IS NULL;

  -- Insert new lineup entries
  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_lineup)
  LOOP
    v_player_id := (v_entry->>'player_user_id')::uuid;
    v_batting := (v_entry->>'batting_order')::integer;
    -- fielding_position: 0 means bat-only (bench), store as NULL
    v_position := NULLIF((v_entry->>'fielding_position')::integer, 0);

    -- Validate player is on team roster
    IF NOT EXISTS (
      SELECT 1 FROM roster_entries
      WHERE team_id = p_team_id
        AND player_user_id = v_player_id
        AND status = 'active'
    ) THEN
      RAISE EXCEPTION 'Player % is not on the active roster for this team.', v_player_id;
    END IF;

    INSERT INTO game_lineups (game_id, team_id, player_user_id, batting_order, fielding_position)
    VALUES (p_game_id, p_team_id, v_player_id, v_batting, v_position);

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
