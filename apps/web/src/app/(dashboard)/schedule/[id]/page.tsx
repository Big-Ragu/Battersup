import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { ArrowLeft, MapPin, Calendar } from 'lucide-react';
import {
  GAME_STATUS_LABELS,
  GAME_STATUS_COLORS,
} from '@batters-up/shared';
import type { GameStatus } from '@batters-up/shared';
import { GameActions } from './game-actions';

export default async function GameDetailPage({
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
  const league = game.league as any;

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
  const isCoach = allRoles.some(
    (r) =>
      r.role === 'coach' &&
      (r.team_id === game.home_team_id || r.team_id === game.away_team_id)
  );
  const canManage = isCommissioner || isManager;
  const canScore = canManage || isCoach;

  const status = game.status as GameStatus;
  const statusColor =
    GAME_STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-800';
  const statusLabel =
    GAME_STATUS_LABELS[status] ?? game.status;
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

      {/* Status badge */}
      <div className="mt-6 flex items-center gap-3">
        <span
          className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${statusColor}`}
        >
          {statusLabel}
        </span>
        {status === 'in_progress' && game.inning && (
          <span className="text-sm text-gray-500">
            {game.inning_half === 'top' ? 'Top' : 'Bot'} {game.inning}
          </span>
        )}
      </div>

      {/* Matchup */}
      <div className="mt-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          {/* Home team */}
          <div className="flex-1 text-center">
            <div className="flex items-center justify-center gap-2">
              {homeTeam?.color && (
                <div
                  className="h-6 w-6 rounded-full border border-gray-200"
                  style={{ backgroundColor: homeTeam.color }}
                />
              )}
              <h2 className="text-xl font-bold text-gray-900">
                {homeTeam?.name ?? 'TBD'}
              </h2>
            </div>
            <p className="mt-1 text-xs text-gray-500 uppercase tracking-wider">
              Home
            </p>
            {showScore && (
              <p className="mt-2 text-4xl font-bold text-gray-900">
                {game.home_score}
              </p>
            )}
          </div>

          {/* VS divider */}
          <div className="mx-4 flex-shrink-0">
            {showScore ? (
              <span className="text-lg font-bold text-gray-400">—</span>
            ) : (
              <span className="text-lg font-bold text-gray-400">VS</span>
            )}
          </div>

          {/* Away team */}
          <div className="flex-1 text-center">
            <div className="flex items-center justify-center gap-2">
              <h2 className="text-xl font-bold text-gray-900">
                {awayTeam?.name ?? 'TBD'}
              </h2>
              {awayTeam?.color && (
                <div
                  className="h-6 w-6 rounded-full border border-gray-200"
                  style={{ backgroundColor: awayTeam.color }}
                />
              )}
            </div>
            <p className="mt-1 text-xs text-gray-500 uppercase tracking-wider">
              Away
            </p>
            {showScore && (
              <p className="mt-2 text-4xl font-bold text-gray-900">
                {game.away_score}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Game details */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Calendar className="h-4 w-4" />
            Date & Time
          </div>
          <p className="mt-1 font-medium text-gray-900">
            {scheduledDate.toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
          <p className="text-sm text-gray-600">
            {scheduledDate.toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
            })}
          </p>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <MapPin className="h-4 w-4" />
            Location
          </div>
          <p className="mt-1 font-medium text-gray-900">
            {field?.name ?? 'No field assigned'}
          </p>
          {game.diamond_number && (
            <p className="text-sm text-gray-600">
              Diamond #{game.diamond_number}
            </p>
          )}
        </div>
      </div>

      {/* League info */}
      {league && (
        <p className="mt-4 text-sm text-gray-500">
          League: <span className="font-medium">{league.name}</span>
        </p>
      )}

      {/* Notes */}
      {game.notes && (
        <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
          <h3 className="text-sm font-medium text-gray-700">Notes</h3>
          <p className="mt-1 text-sm text-gray-600">{game.notes}</p>
        </div>
      )}

      {/* Actions */}
      {canScore && (
        <GameActions
          gameId={game.id}
          status={game.status}
          homeScore={game.home_score}
          awayScore={game.away_score}
          canManage={canManage}
          canScore={canScore}
        />
      )}
    </div>
  );
}
