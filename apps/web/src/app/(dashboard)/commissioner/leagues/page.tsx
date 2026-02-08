import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Trophy, Plus, Pencil } from 'lucide-react';

export default async function LeaguesPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Get leagues where user is commissioner
  const { data: commissionerRoles } = await supabase
    .from('user_roles')
    .select('league_id')
    .eq('user_id', user!.id)
    .eq('role', 'commissioner');

  const leagueIds = commissionerRoles?.map((r) => r.league_id) ?? [];

  const { data: leagues } = leagueIds.length > 0
    ? await supabase
        .from('leagues')
        .select('*')
        .in('id', leagueIds)
        .order('created_at', { ascending: false })
    : { data: [] };

  // Get team counts per league
  const { data: teams } = leagueIds.length > 0
    ? await supabase
        .from('teams')
        .select('league_id')
        .in('league_id', leagueIds)
    : { data: [] };

  const teamCounts: Record<string, number> = {};
  teams?.forEach((t) => {
    teamCounts[t.league_id] = (teamCounts[t.league_id] || 0) + 1;
  });

  const statusColors: Record<string, string> = {
    draft: 'bg-yellow-100 text-yellow-800',
    active: 'bg-green-100 text-green-800',
    completed: 'bg-gray-100 text-gray-800',
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leagues</h1>
          <p className="mt-1 text-gray-600">Manage your leagues.</p>
        </div>
        <Link
          href="/commissioner/leagues/new"
          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Create League
        </Link>
      </div>

      {!leagues || leagues.length === 0 ? (
        <div className="mt-8 rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
          <Trophy className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">
            No leagues yet
          </h3>
          <p className="mt-2 text-gray-600">
            Create your first league to get started.
          </p>
          <Link
            href="/commissioner/leagues/new"
            className="mt-4 inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Create League
          </Link>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {leagues.map((league) => (
            <div
              key={league.id}
              className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">{league.name}</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    {league.season_year} Season
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[league.status] || 'bg-gray-100 text-gray-800'}`}
                >
                  {league.status}
                </span>
              </div>
              {league.description && (
                <p className="mt-2 text-sm text-gray-600 line-clamp-2">
                  {league.description}
                </p>
              )}
              <div className="mt-4 flex items-center justify-between">
                <span className="text-sm text-gray-500">
                  {teamCounts[league.id] || 0} team(s)
                </span>
                <Link
                  href={`/commissioner/leagues/${league.id}/edit`}
                  className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
