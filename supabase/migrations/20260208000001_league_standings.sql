-- League standings RPC: computes W/L/T/PCT/GB from finalized games
CREATE OR REPLACE FUNCTION get_league_standings(p_league_id uuid)
RETURNS TABLE(
  team_id uuid,
  team_name text,
  team_color text,
  wins bigint,
  losses bigint,
  ties bigint,
  win_pct numeric,
  games_back numeric
) AS $$
BEGIN
  -- Verify caller is in the league
  IF NOT EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.league_id = p_league_id AND ur.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'You do not have access to this league.';
  END IF;

  RETURN QUERY
  WITH team_records AS (
    SELECT
      t.id AS team_id,
      t.name::text AS team_name,
      t.color::text AS team_color,
      COALESCE(SUM(CASE
        WHEN (g.home_team_id = t.id AND g.home_score > g.away_score)
          OR (g.away_team_id = t.id AND g.away_score > g.home_score)
        THEN 1 ELSE 0
      END), 0)::bigint AS wins,
      COALESCE(SUM(CASE
        WHEN (g.home_team_id = t.id AND g.home_score < g.away_score)
          OR (g.away_team_id = t.id AND g.away_score < g.home_score)
        THEN 1 ELSE 0
      END), 0)::bigint AS losses,
      COALESCE(SUM(CASE
        WHEN g.id IS NOT NULL AND g.home_score = g.away_score
        THEN 1 ELSE 0
      END), 0)::bigint AS ties
    FROM teams t
    LEFT JOIN games g ON g.league_id = p_league_id
      AND g.status = 'final'
      AND (g.home_team_id = t.id OR g.away_team_id = t.id)
    WHERE t.league_id = p_league_id
    GROUP BY t.id, t.name, t.color
  ),
  with_pct AS (
    SELECT
      tr.*,
      CASE WHEN (tr.wins + tr.losses) > 0
        THEN ROUND(tr.wins::numeric / (tr.wins + tr.losses), 3)
        ELSE 0.000
      END AS win_pct
    FROM team_records tr
  ),
  with_gb AS (
    SELECT
      wp.*,
      CASE WHEN (SELECT MAX(w2.wins - w2.losses) FROM with_pct w2) = (wp.wins - wp.losses)
        THEN 0::numeric
        ELSE ROUND(((SELECT MAX(w2.wins - w2.losses) FROM with_pct w2) - (wp.wins - wp.losses))::numeric / 2, 1)
      END AS games_back
    FROM with_pct wp
  )
  SELECT wg.team_id, wg.team_name, wg.team_color, wg.wins, wg.losses, wg.ties, wg.win_pct, wg.games_back
  FROM with_gb wg
  ORDER BY wg.win_pct DESC, wg.wins DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
