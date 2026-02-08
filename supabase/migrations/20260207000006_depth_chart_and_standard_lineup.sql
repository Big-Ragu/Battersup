-- Phase: Depth Chart & Standard Lineup
-- Tables: team_depth_chart, team_standard_lineups
-- RPCs: save_depth_chart, save_standard_lineup, get_team_standard_lineup
-- Trigger: cascade delete from roster_entries

-- ============================================================
-- TABLE: team_depth_chart
-- ============================================================
CREATE TABLE IF NOT EXISTS team_depth_chart (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  position text NOT NULL CHECK (position IN ('P','C','1B','2B','3B','SS','LF','CF','RF','DH','UTIL')),
  player_user_id uuid NOT NULL REFERENCES auth.users(id),
  depth_order integer NOT NULL DEFAULT 1 CHECK (depth_order >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, player_user_id),
  UNIQUE (team_id, position, depth_order)
);

ALTER TABLE team_depth_chart ENABLE ROW LEVEL SECURITY;

-- SELECT: any league member
CREATE POLICY "depth_chart_select" ON team_depth_chart FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN teams t ON t.league_id = ur.league_id
    WHERE ur.user_id = auth.uid()
      AND t.id = team_depth_chart.team_id
  )
);

-- INSERT: coach/manager of team or commissioner
CREATE POLICY "depth_chart_insert" ON team_depth_chart FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN teams t ON t.league_id = ur.league_id
    WHERE ur.user_id = auth.uid()
      AND t.id = team_depth_chart.team_id
      AND (
        (ur.role = 'commissioner')
        OR (ur.role = 'coach' AND ur.team_id = team_depth_chart.team_id)
        OR (ur.role = 'manager' AND ur.team_id = team_depth_chart.team_id)
      )
  )
);

-- UPDATE: coach/manager of team or commissioner
CREATE POLICY "depth_chart_update" ON team_depth_chart FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN teams t ON t.league_id = ur.league_id
    WHERE ur.user_id = auth.uid()
      AND t.id = team_depth_chart.team_id
      AND (
        (ur.role = 'commissioner')
        OR (ur.role = 'coach' AND ur.team_id = team_depth_chart.team_id)
        OR (ur.role = 'manager' AND ur.team_id = team_depth_chart.team_id)
      )
  )
);

-- DELETE: coach/manager of team or commissioner
CREATE POLICY "depth_chart_delete" ON team_depth_chart FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN teams t ON t.league_id = ur.league_id
    WHERE ur.user_id = auth.uid()
      AND t.id = team_depth_chart.team_id
      AND (
        (ur.role = 'commissioner')
        OR (ur.role = 'coach' AND ur.team_id = team_depth_chart.team_id)
        OR (ur.role = 'manager' AND ur.team_id = team_depth_chart.team_id)
      )
  )
);

-- ============================================================
-- TABLE: team_standard_lineups
-- ============================================================
CREATE TABLE IF NOT EXISTS team_standard_lineups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  batting_order integer NOT NULL CHECK (batting_order BETWEEN 1 AND 9),
  player_user_id uuid NOT NULL REFERENCES auth.users(id),
  fielding_position integer NOT NULL CHECK (fielding_position BETWEEN 1 AND 9),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, batting_order),
  UNIQUE (team_id, player_user_id)
);

ALTER TABLE team_standard_lineups ENABLE ROW LEVEL SECURITY;

-- SELECT: any league member
CREATE POLICY "standard_lineup_select" ON team_standard_lineups FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN teams t ON t.league_id = ur.league_id
    WHERE ur.user_id = auth.uid()
      AND t.id = team_standard_lineups.team_id
  )
);

-- INSERT: coach/manager of team or commissioner
CREATE POLICY "standard_lineup_insert" ON team_standard_lineups FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN teams t ON t.league_id = ur.league_id
    WHERE ur.user_id = auth.uid()
      AND t.id = team_standard_lineups.team_id
      AND (
        (ur.role = 'commissioner')
        OR (ur.role = 'coach' AND ur.team_id = team_standard_lineups.team_id)
        OR (ur.role = 'manager' AND ur.team_id = team_standard_lineups.team_id)
      )
  )
);

-- UPDATE: coach/manager of team or commissioner
CREATE POLICY "standard_lineup_update" ON team_standard_lineups FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN teams t ON t.league_id = ur.league_id
    WHERE ur.user_id = auth.uid()
      AND t.id = team_standard_lineups.team_id
      AND (
        (ur.role = 'commissioner')
        OR (ur.role = 'coach' AND ur.team_id = team_standard_lineups.team_id)
        OR (ur.role = 'manager' AND ur.team_id = team_standard_lineups.team_id)
      )
  )
);

-- DELETE: coach/manager of team or commissioner
CREATE POLICY "standard_lineup_delete" ON team_standard_lineups FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN teams t ON t.league_id = ur.league_id
    WHERE ur.user_id = auth.uid()
      AND t.id = team_standard_lineups.team_id
      AND (
        (ur.role = 'commissioner')
        OR (ur.role = 'coach' AND ur.team_id = team_standard_lineups.team_id)
        OR (ur.role = 'manager' AND ur.team_id = team_standard_lineups.team_id)
      )
  )
);

-- ============================================================
-- RPC: save_depth_chart
-- Atomic replace: delete all existing entries for this team, insert new ones
-- ============================================================
CREATE OR REPLACE FUNCTION save_depth_chart(
  p_team_id uuid,
  p_entries jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry jsonb;
BEGIN
  -- Verify caller has permission (coach/manager of team or commissioner)
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
    RAISE EXCEPTION 'Not authorized to edit this team''s depth chart';
  END IF;

  -- Delete existing depth chart for this team
  DELETE FROM team_depth_chart WHERE team_id = p_team_id;

  -- Insert new entries
  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_entries)
  LOOP
    INSERT INTO team_depth_chart (team_id, position, player_user_id, depth_order)
    VALUES (
      p_team_id,
      v_entry->>'position',
      (v_entry->>'player_user_id')::uuid,
      (v_entry->>'depth_order')::integer
    );
  END LOOP;
END;
$$;

-- ============================================================
-- RPC: save_standard_lineup
-- Atomic replace: delete all existing entries for this team, insert new ones
-- ============================================================
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
    INSERT INTO team_standard_lineups (team_id, batting_order, player_user_id, fielding_position)
    VALUES (
      p_team_id,
      (v_entry->>'batting_order')::integer,
      (v_entry->>'player_user_id')::uuid,
      (v_entry->>'fielding_position')::integer
    );
  END LOOP;
END;
$$;

-- ============================================================
-- RPC: get_team_standard_lineup
-- Returns the standard lineup with player names and jersey numbers
-- ============================================================
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

-- ============================================================
-- TRIGGER: cascade delete from roster_entries
-- When a player is removed from roster, remove from depth chart and standard lineup
-- ============================================================
CREATE OR REPLACE FUNCTION cascade_roster_delete_to_depth_lineup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM team_depth_chart
  WHERE team_id = OLD.team_id AND player_user_id = OLD.player_user_id;

  DELETE FROM team_standard_lineups
  WHERE team_id = OLD.team_id AND player_user_id = OLD.player_user_id;

  RETURN OLD;
END;
$$;

-- Only create trigger if it doesn't already exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_roster_delete_cascade_depth_lineup'
  ) THEN
    CREATE TRIGGER trg_roster_delete_cascade_depth_lineup
    BEFORE DELETE ON roster_entries
    FOR EACH ROW
    EXECUTE FUNCTION cascade_roster_delete_to_depth_lineup();
  END IF;
END;
$$;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
