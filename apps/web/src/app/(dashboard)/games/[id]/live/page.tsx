import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { ArrowLeft } from 'lucide-react';
import { LiveScoreboard } from './live-scoreboard';

export default async function LivePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: gameId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  // Fetch game state
  const { data: gameState, error: stateError } = await supabase.rpc(
    'get_game_state',
    { p_game_id: gameId }
  );

  if (stateError || !gameState) notFound();

  const state = gameState as any;

  return (
    <div>
      <Link
        href={`/games/${gameId}`}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Game
      </Link>

      <LiveScoreboard
        gameId={gameId}
        initialState={state}
      />
    </div>
  );
}
