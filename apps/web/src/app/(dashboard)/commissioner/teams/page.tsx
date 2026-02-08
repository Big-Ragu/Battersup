import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Users, Plus } from 'lucide-react';

export default async function TeamsPage() {
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

  // Fetch leagues for the filter dropdown and team display
  const { data: leagues } = leagueIds.length > 0
    ? await supabase
        .from('leagues')
        .select('id, name')
        .in('id', leagueIds)
        .order('name')
    : { data: [] };

  // Fetch all teams across commissioner's leagues
  const { data: teams } = leagueIds.length > 0
    ? await supabase
        .from('teams')
        .select('*')
        .in('league_id', leagueIds)
        .order('name')
    : { data: [] };

  // Fetch member counts per team via RPC
  const { data: allMembers } = leagueIds.length > 0
    ? await supabase.rpc('get_league_members', { p_league_ids: leagueIds })
    : { data: [] };

  const teamCounts: Record<string, number> = {};
  for (const m of (allMembers ?? []) as { team_id: string | null; role: string }[]) {
    if (m.team_id && m.role === 'player') {
      teamCounts[m.team_id] = (teamCounts[m.team_id] ?? 0) + 1;
    }
  }

  const leagueMap: Record<string, string> = {};
  leagues?.forEach((l) => {
    leagueMap[l.id] = l.name;
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Teams</h1>
          <p className="mt-1 text-gray-600">Manage teams across your leagues.</p>
        </div>
        <Link
          href="/commissioner/teams/new"
          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Create Team
        </Link>
      </div>

      {!teams || teams.length === 0 ? (
        <div className="mt-8 rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
          <Users className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">
            No teams yet
          </h3>
          <p className="mt-2 text-gray-600">
            {leagueIds.length === 0
              ? 'Create a league first, then add teams.'
              : 'Create your first team to get started.'}
          </p>
          {leagueIds.length > 0 && (
            <Link
              href="/commissioner/teams/new"
              className="mt-4 inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              Create Team
            </Link>
          )}
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {teams.map((team) => (
            <Link
              key={team.id}
              href={`/commissioner/teams/${team.id}`}
              className="block rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  {team.color && (
                    <div
                      className="h-8 w-8 rounded-full border border-gray-200"
                      style={{ backgroundColor: team.color }}
                    />
                  )}
                  <div>
                    <h3 className="font-semibold text-gray-900">{team.name}</h3>
                    <p className="text-sm text-gray-500">
                      {leagueMap[team.league_id] || 'Unknown League'}
                    </p>
                  </div>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                  <Users className="h-3.5 w-3.5" />
                  {teamCounts[team.id] ?? 0} players
                </span>
                <span className="inline-flex items-center gap-1 text-sm font-medium text-blue-600">
                  View
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
