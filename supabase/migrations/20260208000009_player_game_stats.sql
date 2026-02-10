-- ============================================
-- PLAYER GAME STATS: Materialized per-player per-game stats
-- Computed by client-side box-score utilities and stored here
-- for reliable season aggregation.
-- ============================================

CREATE TABLE player_game_stats (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  player_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Batting stats
  batting_ab integer NOT NULL DEFAULT 0,
  batting_r integer NOT NULL DEFAULT 0,
  batting_h integer NOT NULL DEFAULT 0,
  batting_2b integer NOT NULL DEFAULT 0,
  batting_3b integer NOT NULL DEFAULT 0,
  batting_hr integer NOT NULL DEFAULT 0,
  batting_rbi integer NOT NULL DEFAULT 0,
  batting_bb integer NOT NULL DEFAULT 0,
  batting_k integer NOT NULL DEFAULT 0,
  batting_hbp integer NOT NULL DEFAULT 0,
  batting_sac integer NOT NULL DEFAULT 0,

  -- Pitching stats
  pitching_ip_outs integer NOT NULL DEFAULT 0,
  pitching_h integer NOT NULL DEFAULT 0,
  pitching_r integer NOT NULL DEFAULT 0,
  pitching_bb integer NOT NULL DEFAULT 0,
  pitching_k integer NOT NULL DEFAULT 0,
  pitching_hr integer NOT NULL DEFAULT 0,
  pitching_hbp integer NOT NULL DEFAULT 0,

  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(game_id, player_user_id)
);

CREATE INDEX idx_player_game_stats_team ON player_game_stats(team_id);
CREATE INDEX idx_player_game_stats_game ON player_game_stats(game_id);

-- ============================================
-- RLS: read-only for league members, writes via SECURITY DEFINER RPC
-- ============================================

ALTER TABLE player_game_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Game stats viewable by league members"
  ON player_game_stats FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM games g
      JOIN user_roles ur ON ur.league_id = g.league_id
      WHERE g.id = player_game_stats.game_id
        AND ur.user_id = auth.uid()
    )
  );

-- ============================================
-- save_game_stats RPC: persists computed box-score data
-- Called from the client after computing stats with box-score utilities
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
-- Replace season stats RPCs to read from player_game_stats
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
    CASE WHEN SUM(pgs.batting_ab) > 0
      THEN ROUND(SUM(pgs.batting_h)::numeric / SUM(pgs.batting_ab)::numeric, 3)
      ELSE 0.000
    END AS avg
  FROM player_game_stats pgs
  LEFT JOIN profiles p ON p.id = pgs.player_user_id
  LEFT JOIN roster_entries re ON re.player_user_id = pgs.player_user_id AND re.team_id = p_team_id
  WHERE pgs.team_id = p_team_id
    AND (pgs.batting_ab > 0 OR pgs.batting_bb > 0 OR pgs.batting_hbp > 0
         OR pgs.batting_sac > 0 OR pgs.batting_r > 0)
  GROUP BY pgs.player_user_id, p.full_name, re.jersey_number
  ORDER BY avg DESC, h DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP FUNCTION IF EXISTS get_team_season_pitching(uuid);
CREATE OR REPLACE FUNCTION get_team_season_pitching(p_team_id uuid)
RETURNS TABLE(
  player_user_id uuid,
  player_name text,
  jersey_number integer,
  gp bigint,
  ip_outs bigint,
  h bigint,
  r bigint,
  bb bigint,
  k bigint,
  hr bigint,
  hbp bigint
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
    SUM(pgs.pitching_ip_outs)::bigint AS ip_outs,
    SUM(pgs.pitching_h)::bigint AS h,
    SUM(pgs.pitching_r)::bigint AS r,
    SUM(pgs.pitching_bb)::bigint AS bb,
    SUM(pgs.pitching_k)::bigint AS k,
    SUM(pgs.pitching_hr)::bigint AS hr,
    SUM(pgs.pitching_hbp)::bigint AS hbp
  FROM player_game_stats pgs
  LEFT JOIN profiles p ON p.id = pgs.player_user_id
  LEFT JOIN roster_entries re ON re.player_user_id = pgs.player_user_id AND re.team_id = p_team_id
  WHERE pgs.team_id = p_team_id
    AND (pgs.pitching_ip_outs > 0 OR pgs.pitching_h > 0 OR pgs.pitching_bb > 0 OR pgs.pitching_k > 0)
  GROUP BY pgs.player_user_id, p.full_name, re.jersey_number
  ORDER BY ip_outs DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
