-- Team season batting stats RPC
CREATE OR REPLACE FUNCTION get_team_season_batting(p_team_id uuid)
RETURNS TABLE(
  player_user_id uuid,
  player_name text,
  jersey_number integer,
  gp bigint,
  ab bigint,
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
  -- Look up the team's league
  SELECT t.league_id INTO v_league_id
  FROM teams t WHERE t.id = p_team_id;

  IF v_league_id IS NULL THEN
    RAISE EXCEPTION 'Team not found.';
  END IF;

  -- Verify caller is in the league
  IF NOT EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.league_id = v_league_id AND ur.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'You do not have access to this league.';
  END IF;

  RETURN QUERY
  SELECT
    ge.batter_user_id AS player_user_id,
    COALESCE(p.full_name, 'Unknown')::text AS player_name,
    re.jersey_number AS jersey_number,
    COUNT(DISTINCT ge.game_id)::bigint AS gp,
    COUNT(*) FILTER (WHERE ge.outcome NOT IN (
      'walk', 'intentional_walk', 'hit_by_pitch',
      'sacrifice_fly', 'sacrifice_bunt',
      'stolen_base', 'caught_stealing', 'wild_pitch',
      'passed_ball', 'balk', 'picked_off',
      'runner_advance', 'catcher_interference', 'other'
    ))::bigint AS ab,
    COUNT(*) FILTER (WHERE ge.outcome IN ('single', 'double', 'triple', 'home_run'))::bigint AS h,
    COUNT(*) FILTER (WHERE ge.outcome = 'double')::bigint AS doubles,
    COUNT(*) FILTER (WHERE ge.outcome = 'triple')::bigint AS triples,
    COUNT(*) FILTER (WHERE ge.outcome = 'home_run')::bigint AS hr,
    COALESCE(SUM(ge.runs_scored), 0)::bigint AS rbi,
    COUNT(*) FILTER (WHERE ge.outcome IN ('walk', 'intentional_walk'))::bigint AS bb,
    COUNT(*) FILTER (WHERE ge.outcome IN ('strikeout_swinging', 'strikeout_looking'))::bigint AS k,
    COUNT(*) FILTER (WHERE ge.outcome = 'hit_by_pitch')::bigint AS hbp,
    COUNT(*) FILTER (WHERE ge.outcome IN ('sacrifice_fly', 'sacrifice_bunt'))::bigint AS sac,
    CASE
      WHEN COUNT(*) FILTER (WHERE ge.outcome NOT IN (
        'walk', 'intentional_walk', 'hit_by_pitch',
        'sacrifice_fly', 'sacrifice_bunt',
        'stolen_base', 'caught_stealing', 'wild_pitch',
        'passed_ball', 'balk', 'picked_off',
        'runner_advance', 'catcher_interference', 'other'
      )) > 0
      THEN ROUND(
        COUNT(*) FILTER (WHERE ge.outcome IN ('single', 'double', 'triple', 'home_run'))::numeric
        / COUNT(*) FILTER (WHERE ge.outcome NOT IN (
          'walk', 'intentional_walk', 'hit_by_pitch',
          'sacrifice_fly', 'sacrifice_bunt',
          'stolen_base', 'caught_stealing', 'wild_pitch',
          'passed_ball', 'balk', 'picked_off',
          'runner_advance', 'catcher_interference', 'other'
        ))::numeric,
        3
      )
      ELSE 0.000
    END AS avg
  FROM game_events ge
  JOIN games g ON g.id = ge.game_id
  LEFT JOIN profiles p ON p.id = ge.batter_user_id
  LEFT JOIN roster_entries re ON re.player_user_id = ge.batter_user_id AND re.team_id = p_team_id
  WHERE g.status = 'final'
    AND ge.is_deleted = false
    AND ge.batter_user_id IS NOT NULL
    AND (
      (g.home_team_id = p_team_id AND ge.inning_half = 'bottom')
      OR (g.away_team_id = p_team_id AND ge.inning_half = 'top')
    )
  GROUP BY ge.batter_user_id, p.full_name, re.jersey_number
  ORDER BY avg DESC, h DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Team season pitching stats RPC
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
  -- Look up the team's league
  SELECT t.league_id INTO v_league_id
  FROM teams t WHERE t.id = p_team_id;

  IF v_league_id IS NULL THEN
    RAISE EXCEPTION 'Team not found.';
  END IF;

  -- Verify caller is in the league
  IF NOT EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.league_id = v_league_id AND ur.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'You do not have access to this league.';
  END IF;

  RETURN QUERY
  SELECT
    ge.pitcher_user_id AS player_user_id,
    COALESCE(p.full_name, 'Unknown')::text AS player_name,
    re.jersey_number AS jersey_number,
    COUNT(DISTINCT ge.game_id)::bigint AS gp,
    COALESCE(SUM(GREATEST(0, ge.outs_after - ge.outs_before)), 0)::bigint AS ip_outs,
    COUNT(*) FILTER (WHERE ge.outcome IN ('single', 'double', 'triple', 'home_run'))::bigint AS h,
    COALESCE(SUM(ge.runs_scored), 0)::bigint AS r,
    COUNT(*) FILTER (WHERE ge.outcome IN ('walk', 'intentional_walk'))::bigint AS bb,
    COUNT(*) FILTER (WHERE ge.outcome IN ('strikeout_swinging', 'strikeout_looking'))::bigint AS k,
    COUNT(*) FILTER (WHERE ge.outcome = 'home_run')::bigint AS hr,
    COUNT(*) FILTER (WHERE ge.outcome = 'hit_by_pitch')::bigint AS hbp
  FROM game_events ge
  JOIN games g ON g.id = ge.game_id
  LEFT JOIN profiles p ON p.id = ge.pitcher_user_id
  LEFT JOIN roster_entries re ON re.player_user_id = ge.pitcher_user_id AND re.team_id = p_team_id
  WHERE g.status = 'final'
    AND ge.is_deleted = false
    AND ge.pitcher_user_id IS NOT NULL
    AND (
      (g.home_team_id = p_team_id AND ge.inning_half = 'top')
      OR (g.away_team_id = p_team_id AND ge.inning_half = 'bottom')
    )
  GROUP BY ge.pitcher_user_id, p.full_name, re.jersey_number
  ORDER BY ip_outs DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
