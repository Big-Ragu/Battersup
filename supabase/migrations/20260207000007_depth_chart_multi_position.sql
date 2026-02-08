-- Allow players to be placed at multiple positions on the depth chart
-- Drop the unique constraint on (team_id, player_user_id) so a player
-- can appear at more than one position.

ALTER TABLE team_depth_chart DROP CONSTRAINT IF EXISTS team_depth_chart_team_id_player_user_id_key;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
