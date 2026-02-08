-- Allow full-roster batting orders (not just 9)
-- Bat-only players have fielding_position = NULL

-- Remove the batting_order cap of 9
ALTER TABLE team_standard_lineups DROP CONSTRAINT IF EXISTS team_standard_lineups_batting_order_check;
ALTER TABLE team_standard_lineups ADD CONSTRAINT team_standard_lineups_batting_order_check CHECK (batting_order >= 1);

-- Make fielding_position nullable (bat-only players don't field)
ALTER TABLE team_standard_lineups ALTER COLUMN fielding_position DROP NOT NULL;
ALTER TABLE team_standard_lineups DROP CONSTRAINT IF EXISTS team_standard_lineups_fielding_position_check;
ALTER TABLE team_standard_lineups ADD CONSTRAINT team_standard_lineups_fielding_position_check CHECK (fielding_position IS NULL OR fielding_position BETWEEN 1 AND 9);

-- Drop the unique constraint on player per team so the same player
-- isn't blocked if we need to rebuild the lineup
-- (batting_order is already unique per team, and player_user_id should still be unique per team)
-- Keep (team_id, player_user_id) unique - each player appears once in lineup

-- Update save_standard_lineup to handle nullable fielding_position
CREATE OR REPLACE FUNCTION save_standard_lineup(
  p_team_id uuid,
  p_lineup jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry jsonb;
  v_fielding integer;
BEGIN
  -- Verify caller has permission
  IF NOT EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN teams t ON t.league_id = ur.league_id
    WHERE ur.user_id = auth.uid()
      AND t.id = p_team_id
      AND (
        ur.role = 'commissioner'
        OR (ur.role = 'coach' AND ur.team_id = p_team_id)
        OR (ur.role = 'manager' AND ur.team_id = p_team_id)
      )
  ) THEN
    RAISE EXCEPTION 'Not authorized to edit this team''s standard lineup';
  END IF;

  -- Delete existing standard lineup
  DELETE FROM team_standard_lineups WHERE team_id = p_team_id;

  -- Insert new entries
  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_lineup)
  LOOP
    -- fielding_position: 0 or null means bat-only
    v_fielding := NULLIF((v_entry->>'fielding_position')::integer, 0);

    INSERT INTO team_standard_lineups (team_id, batting_order, player_user_id, fielding_position)
    VALUES (
      p_team_id,
      (v_entry->>'batting_order')::integer,
      (v_entry->>'player_user_id')::uuid,
      v_fielding
    );
  END LOOP;
END;
$$;

-- Update get_team_standard_lineup to return nullable fielding_position
CREATE OR REPLACE FUNCTION get_team_standard_lineup(
  p_team_id uuid
) RETURNS TABLE (
  batting_order integer,
  player_user_id uuid,
  fielding_position integer,
  full_name text,
  jersey_number integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    sl.batting_order,
    sl.player_user_id,
    sl.fielding_position,
    p.full_name,
    re.jersey_number
  FROM team_standard_lineups sl
  JOIN profiles p ON p.id = sl.player_user_id
  LEFT JOIN roster_entries re ON re.player_user_id = sl.player_user_id AND re.team_id = sl.team_id
  WHERE sl.team_id = p_team_id
  ORDER BY sl.batting_order;
END;
$$;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
