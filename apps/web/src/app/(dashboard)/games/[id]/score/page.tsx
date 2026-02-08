import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { ArrowLeft } from 'lucide-react';
import { ScoringInterface } from './scoring-interface';
import { PlayLog } from './play-log';

export default async function ScorePage({
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

  // Fetch game state via RPC
  const { data: gameState, error: stateError } = await supabase.rpc(
    'get_game_state',
    { p_game_id: gameId }
  );

  if (stateError || !gameState) notFound();

  const state = gameState as any;

  // Check permissions — must be assigned scorekeeper or manager/commissioner
  const { data: userRoles } = await supabase
    .from('user_roles')
    .select('league_id, team_id, role')
    .eq('user_id', user.id);

  const allRoles = userRoles ?? [];
  const isCommissioner = allRoles.some(
    (r) => r.role === 'commissioner' && r.league_id === state.game.league_id
  );
  const isManager = allRoles.some(
    (r) => r.role === 'manager' && r.league_id === state.game.league_id
  );
  const isScorekeeper = (state.scorekeepers ?? []).some(
    (a: any) => a.user_id === user.id
  );

  if (!isScorekeeper && !isCommissioner && !isManager) {
    redirect(`/games/${gameId}`);
  }

  // Find which team the scorekeeper is for
  const userAssignment = (state.scorekeepers ?? []).find(
    (a: any) => a.user_id === user.id
  );

  return (
    <div>
      <Link
        href={`/games/${gameId}`}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Game
      </Link>

      <ScoringInterface
        gameId={gameId}
        game={state.game}
        homeLineup={state.home_lineup ?? []}
        awayLineup={state.away_lineup ?? []}
        events={state.events ?? []}
        scorekeepers={state.scorekeepers ?? []}
        userId={user.id}
        userTeamId={userAssignment?.team_id ?? null}
      />

      <div className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Play Log</h2>
        <PlayLog events={state.events ?? []} />
      </div>
    </div>
  );
}
