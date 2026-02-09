-- Phase 6C: Enable Supabase Realtime for live scoreboard
-- Add games and game_events to the supabase_realtime publication
-- so that client-side channel subscriptions receive postgres_changes events.

ALTER PUBLICATION supabase_realtime ADD TABLE games;
ALTER PUBLICATION supabase_realtime ADD TABLE game_events;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
