import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import {
  ArrowLeft,
  Users,
  ClipboardList,
  Play,
  Eye,
  UserCheck,
} from 'lucide-react';
import {
  GAME_STATUS_LABELS,
  GAME_STATUS_COLORS,
} from '@batters-up/shared';
import type { GameStatus } from '@batters-up/shared';

export default async function GameHubPage({
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

  // Fetch game with related data
  const { data: game } = await supabase
    .from('games')
    .select(
      `id, league_id, home_team_id, away_team_id, field_id, diamond_number,
       scheduled_at, status, home_score, away_score, inning, inning_half, notes,
       home_team:teams!games_home_team_id_fkey(id, name, color),
       away_team:teams!games_away_team_id_fkey(id, name, color),
       field:fields(id, name),
       league:leagues(id, name)`
    )
    .eq('id', gameId)
    .single();

  if (!game) notFound();

  const homeTeam = game.home_team as any;
  const awayTeam = game.away_team as any;
  const field = game.field as any;

  // Check user permissions
  const { data: userRoles } = await supabase
    .from('user_roles')
    .select('league_id, team_id, role')
    .eq('user_id', user.id);

  const allRoles = userRoles ?? [];
  const isCommissioner = allRoles.some(
    (r) => r.role === 'commissioner' && r.league_id === game.league_id
  );
  const isManager = allRoles.some(
    (r) => r.role === 'manager' && r.league_id === game.league_id
  );
  const canManage = isCommissioner || isManager;

  // Check if user is assigned scorekeeper
  const { data: assignments } = await supabase
    .from('scorekeeper_assignments')
    .select('id, team_id, user_id')
    .eq('game_id', gameId);

  const isScorekeeper = (assignments ?? []).some(
    (a) => a.user_id === user.id
  );

  const status = game.status as GameStatus;
  const statusColor =
    GAME_STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-800';
  const statusLabel = GAME_STATUS_LABELS[status] ?? game.status;
  const showScore = status === 'in_progress' || status === 'final';

  const scheduledDate = new Date(game.scheduled_at);

  return (
    <div>
      <Link
        href="/schedule"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Schedule
      </Link>

      {/* Matchup header */}
      <div className="mt-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span
            className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${statusColor}`}
          >
            {statusLabel}
          </span>
          <span className="text-sm text-gray-500">
            {scheduledDate.toLocaleDateString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            })}{' '}
            {scheduledDate.toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
            })}
            {field && <> &middot; {field.name}</>}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex-1 text-center">
            <div className="flex items-center justify-center gap-2">
              {homeTeam?.color && (
                <div
                  className="h-5 w-5 rounded-full border border-gray-200"
                  style={{ backgroundColor: homeTeam.color }}
                />
              )}
              <h2 className="text-xl font-bold text-gray-900">
                {homeTeam?.name ?? 'TBD'}
              </h2>
            </div>
            <p className="text-xs text-gray-500 uppercase tracking-wider">
              Home
            </p>
            {showScore && (
              <p className="mt-1 text-3xl font-bold text-gray-900">
                {game.home_score}
              </p>
            )}
          </div>
          <div className="mx-4 flex-shrink-0">
            {showScore ? (
              <span className="text-lg font-bold text-gray-400">&mdash;</span>
            ) : (
              <span className="text-lg font-bold text-gray-400">VS</span>
            )}
          </div>
          <div className="flex-1 text-center">
            <div className="flex items-center justify-center gap-2">
              <h2 className="text-xl font-bold text-gray-900">
                {awayTeam?.name ?? 'TBD'}
              </h2>
              {awayTeam?.color && (
                <div
                  className="h-5 w-5 rounded-full border border-gray-200"
                  style={{ backgroundColor: awayTeam.color }}
                />
              )}
            </div>
            <p className="text-xs text-gray-500 uppercase tracking-wider">
              Away
            </p>
            {showScore && (
              <p className="mt-1 text-3xl font-bold text-gray-900">
                {game.away_score}
              </p>
            )}
          </div>
        </div>
        {status === 'in_progress' && game.inning && (
          <p className="mt-2 text-center text-sm text-gray-500">
            {game.inning_half === 'top' ? 'Top' : 'Bottom'} of the{' '}
            {game.inning}
            {game.inning === 1
              ? 'st'
              : game.inning === 2
              ? 'nd'
              : game.inning === 3
              ? 'rd'
              : 'th'}
          </p>
        )}
      </div>

      {/* Action cards */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {/* Scorekeepers */}
        {canManage && (
          <Link
            href={`/games/${gameId}/scorekeepers`}
            className="flex items-center gap-4 rounded-lg border border-gray-200 bg-white p-5 shadow-sm hover:border-blue-300 hover:shadow transition-all"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100">
              <UserCheck className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">
                Assign Scorekeepers
              </h3>
              <p className="text-sm text-gray-500">
                {(assignments ?? []).length}/2 assigned
              </p>
            </div>
          </Link>
        )}

        {/* Lineups */}
        <Link
          href={`/games/${gameId}/lineup`}
          className="flex items-center gap-4 rounded-lg border border-gray-200 bg-white p-5 shadow-sm hover:border-blue-300 hover:shadow transition-all"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
            <ClipboardList className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Lineups</h3>
            <p className="text-sm text-gray-500">
              Set batting order &amp; positions
            </p>
          </div>
        </Link>

        {/* Score Game */}
        {(isScorekeeper || canManage) &&
          (status === 'scheduled' || status === 'in_progress') && (
            <Link
              href={`/games/${gameId}/score`}
              className="flex items-center gap-4 rounded-lg border border-gray-200 bg-white p-5 shadow-sm hover:border-green-300 hover:shadow transition-all"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
                <Play className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Score Game</h3>
                <p className="text-sm text-gray-500">
                  Record plays and manage the game
                </p>
              </div>
            </Link>
          )}

        {/* Watch Live */}
        <Link
          href={`/games/${gameId}/live`}
          className="flex items-center gap-4 rounded-lg border border-gray-200 bg-white p-5 shadow-sm hover:border-orange-300 hover:shadow transition-all"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100">
            <Eye className="h-5 w-5 text-orange-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Live Scoreboard</h3>
            <p className="text-sm text-gray-500">
              Watch scores update in real time
            </p>
          </div>
        </Link>
      </div>

      {/* Game details link */}
      <div className="mt-4">
        <Link
          href={`/schedule/${gameId}`}
          className="text-sm font-medium text-blue-600 hover:text-blue-500"
        >
          View full game details &rarr;
        </Link>
      </div>
    </div>
  );
}
