-- ============================================
-- MLB Rules Compliance Fixes
-- 1. Add missing play_outcome enum values
-- 2. Add SB/CS columns to player_game_stats
-- 3. Update save_game_stats RPC to handle new columns
-- 4. Update get_team_season_batting to include SB
-- ============================================

-- ============================================
-- 1. Add missing play outcomes
-- ============================================
ALTER TYPE play_outcome ADD VALUE IF NOT EXISTS 'catcher_interference';
ALTER TYPE play_outcome ADD VALUE IF NOT EXISTS 'dropped_third_strike';

-- ============================================
-- 2. Add SB/CS columns to player_game_stats
-- ============================================
ALTER TABLE player_game_stats ADD COLUMN IF NOT EXISTS batting_sb integer NOT NULL DEFAULT 0;
ALTER TABLE player_game_stats ADD COLUMN IF NOT EXISTS batting_cs integer NOT NULL DEFAULT 0;

-- ============================================
-- 3. Update save_game_stats to accept new columns
-- ============================================
CREATE OR REPLACE FUNCTION save_game_stats(p_game_id uuid, p_stats jsonb)
RETURNS void AS $$
DECLARE
  v_game record;
  stat jsonb;
BEGIN
  -- Verify game exists and is final
  SELECT * INTO v_game FROM games WHERE id = p_game_id AND status = 'final';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Game not found or not finalized.';
  END IF;

  -- Verify caller is in the league
  IF NOT EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.league_id = v_game.league_id AND ur.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'You do not have access to this league.';
  END IF;

  -- Delete existing stats for this game (idempotent recompute)
  DELETE FROM player_game_stats WHERE game_id = p_game_id;

  -- Insert new stats
  FOR stat IN SELECT * FROM jsonb_array_elements(p_stats)
  LOOP
    INSERT INTO player_game_stats (
      game_id, team_id, player_user_id,
      batting_ab, batting_r, batting_h, batting_2b, batting_3b, batting_hr,
      batting_rbi, batting_bb, batting_k, batting_hbp, batting_sac,
      batting_sb, batting_cs,
      pitching_ip_outs, pitching_h, pitching_r, pitching_bb, pitching_k,
      pitching_hr, pitching_hbp
    ) VALUES (
      p_game_id,
      (stat->>'team_id')::uuid,
      (stat->>'player_user_id')::uuid,
      COALESCE((stat->>'batting_ab')::int, 0),
      COALESCE((stat->>'batting_r')::int, 0),
      COALESCE((stat->>'batting_h')::int, 0),
      COALESCE((stat->>'batting_2b')::int, 0),
      COALESCE((stat->>'batting_3b')::int, 0),
      COALESCE((stat->>'batting_hr')::int, 0),
      COALESCE((stat->>'batting_rbi')::int, 0),
      COALESCE((stat->>'batting_bb')::int, 0),
      COALESCE((stat->>'batting_k')::int, 0),
      COALESCE((stat->>'batting_hbp')::int, 0),
      COALESCE((stat->>'batting_sac')::int, 0),
      COALESCE((stat->>'batting_sb')::int, 0),
      COALESCE((stat->>'batting_cs')::int, 0),
      COALESCE((stat->>'pitching_ip_outs')::int, 0),
      COALESCE((stat->>'pitching_h')::int, 0),
      COALESCE((stat->>'pitching_r')::int, 0),
      COALESCE((stat->>'pitching_bb')::int, 0),
      COALESCE((stat->>'pitching_k')::int, 0),
      COALESCE((stat->>'pitching_hr')::int, 0),
      COALESCE((stat->>'pitching_hbp')::int, 0)
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 4. Update get_team_season_batting to include SB
-- ============================================
DROP FUNCTION IF EXISTS get_team_season_batting(uuid);
CREATE OR REPLACE FUNCTION get_team_season_batting(p_team_id uuid)
RETURNS TABLE(
  player_user_id uuid,
  player_name text,
  jersey_number integer,
  gp bigint,
  ab bigint,
  r bigint,
  h bigint,
  doubles bigint,
  triples bigint,
  hr bigint,
  rbi bigint,
  bb bigint,
  k bigint,
  hbp bigint,
  sac bigint,
  sb bigint,
  avg numeric
) AS $$
DECLARE
  v_league_id uuid;
BEGIN
  SELECT t.league_id INTO v_league_id
  FROM teams t WHERE t.id = p_team_id;

  IF v_league_id IS NULL THEN
    RAISE EXCEPTION 'Team not found.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.league_id = v_league_id AND ur.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'You do not have access to this league.';
  END IF;

  RETURN QUERY
  SELECT
    pgs.player_user_id,
    COALESCE(p.full_name, 'Unknown')::text AS player_name,
    re.jersey_number,
    COUNT(DISTINCT pgs.game_id)::bigint AS gp,
    SUM(pgs.batting_ab)::bigint AS ab,
    SUM(pgs.batting_r)::bigint AS r,
    SUM(pgs.batting_h)::bigint AS h,
    SUM(pgs.batting_2b)::bigint AS doubles,
    SUM(pgs.batting_3b)::bigint AS triples,
    SUM(pgs.batting_hr)::bigint AS hr,
    SUM(pgs.batting_rbi)::bigint AS rbi,
    SUM(pgs.batting_bb)::bigint AS bb,
    SUM(pgs.batting_k)::bigint AS k,
    SUM(pgs.batting_hbp)::bigint AS hbp,
    SUM(pgs.batting_sac)::bigint AS sac,
    SUM(pgs.batting_sb)::bigint AS sb,
    CASE WHEN SUM(pgs.batting_ab) > 0
      THEN ROUND(SUM(pgs.batting_h)::numeric / SUM(pgs.batting_ab)::numeric, 3)
      ELSE 0.000
    END AS avg
  FROM player_game_stats pgs
  LEFT JOIN profiles p ON p.id = pgs.player_user_id
  LEFT JOIN roster_entries re ON re.player_user_id = pgs.player_user_id AND re.team_id = p_team_id
  WHERE pgs.team_id = p_team_id
    AND (pgs.batting_ab > 0 OR pgs.batting_bb > 0 OR pgs.batting_hbp > 0
         OR pgs.batting_sac > 0 OR pgs.batting_r > 0 OR pgs.batting_sb > 0)
  GROUP BY pgs.player_user_id, p.full_name, re.jersey_number
  ORDER BY avg DESC, h DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
