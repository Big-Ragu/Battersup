import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Calendar, Plus, Wand2, Pencil } from 'lucide-react';
import {
  GAME_STATUS_LABELS,
  GAME_STATUS_COLORS,
} from '@batters-up/shared';
import type { GameStatus } from '@batters-up/shared';

export default async function CommissionerSchedulePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Get commissioner's leagues
  const { data: commissionerRoles } = await supabase
    .from('user_roles')
    .select('league_id')
    .eq('user_id', user!.id)
    .eq('role', 'commissioner');

  const leagueIds = commissionerRoles?.map((r) => r.league_id) ?? [];

  // Fetch league names
  const { data: leagues } =
    leagueIds.length > 0
      ? await supabase
          .from('leagues')
          .select('id, name')
          .in('id', leagueIds)
          .order('name')
      : { data: [] };

  const leagueMap: Record<string, string> = {};
  (leagues ?? []).forEach((l) => {
    leagueMap[l.id] = l.name;
  });

  // Fetch upcoming games across all commissioner leagues
  const now = new Date().toISOString();
  const { data: upcomingGames } =
    leagueIds.length > 0
      ? await supabase
          .from('games')
          .select(
            `id, league_id, scheduled_at, status, home_score, away_score,
             home_team:teams!games_home_team_id_fkey(name, color),
             away_team:teams!games_away_team_id_fkey(name, color),
             field:fields(name)`
          )
          .in('league_id', leagueIds)
          .gte('scheduled_at', now)
          .in('status', ['scheduled', 'in_progress'])
          .order('scheduled_at')
          .limit(20)
      : { data: [] };

  const gamesList = (upcomingGames ?? []) as any[];

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Schedule Builder</h1>
          <p className="mt-1 text-gray-600">
            Create and manage game schedules for your leagues.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/commissioner/schedule/generate"
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Wand2 className="h-4 w-4" />
            Round-Robin
          </Link>
          <Link
            href="/commissioner/schedule/new"
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Add Game
          </Link>
        </div>
      </div>

      {gamesList.length === 0 ? (
        <div className="mt-8 rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
          <Calendar className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">
            No upcoming games
          </h3>
          <p className="mt-2 text-gray-600">
            {leagueIds.length === 0
              ? 'Create a league first to start scheduling.'
              : 'Create your first game or generate a round-robin schedule.'}
          </p>
          {leagueIds.length > 0 && (
            <div className="mt-4 flex justify-center gap-3">
              <Link
                href="/commissioner/schedule/generate"
                className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <Wand2 className="h-4 w-4" />
                Generate Round-Robin
              </Link>
              <Link
                href="/commissioner/schedule/new"
                className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" />
                Add Game
              </Link>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-6">
          <h2 className="text-lg font-semibold text-gray-900">Upcoming Games</h2>
          <div className="mt-3 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Date / Time
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Matchup
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Field
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    League
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Status
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {gamesList.map((game) => {
                  const status = game.status as GameStatus;
                  const statusColor =
                    GAME_STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-800';
                  const statusLabel =
                    GAME_STATUS_LABELS[status] ?? game.status;
                  const date = new Date(game.scheduled_at);
                  const homeName =
                    (game.home_team as any)?.name ?? 'TBD';
                  const awayName =
                    (game.away_team as any)?.name ?? 'TBD';
                  const fieldName =
                    (game.field as any)?.name ?? '—';

                  return (
                    <tr key={game.id}>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900">
                        <div>
                          {date.toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </div>
                        <div className="text-xs text-gray-500">
                          {date.toLocaleTimeString('en-US', {
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm">
                        <span className="font-medium text-gray-900">
                          {homeName}
                        </span>
                        <span className="mx-1 text-gray-400">vs</span>
                        <span className="font-medium text-gray-900">
                          {awayName}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                        {fieldName}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                        {leagueMap[game.league_id] ?? '—'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusColor}`}
                        >
                          {statusLabel}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-sm">
                        <Link
                          href={`/schedule/${game.id}`}
                          className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          View
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
