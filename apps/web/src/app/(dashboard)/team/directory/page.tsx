import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Building, Users } from 'lucide-react';

export default async function TeamDirectoryPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  // Get user's leagues
  const { data: userRoles } = await supabase
    .from('user_roles')
    .select('league_id')
    .eq('user_id', user.id);

  const leagueIds = [
    ...new Set((userRoles ?? []).map((r) => r.league_id)),
  ];

  // Fetch leagues
  const { data: leagues } =
    leagueIds.length > 0
      ? await supabase
          .from('leagues')
          .select('id, name')
          .in('id', leagueIds)
          .order('name')
      : { data: [] };

  // Fetch all teams in those leagues
  const { data: teams } =
    leagueIds.length > 0
      ? await supabase
          .from('teams')
          .select('*')
          .in('league_id', leagueIds)
          .order('name')
      : { data: [] };

  // Count roster entries per team
  const { data: rosterCounts } =
    leagueIds.length > 0
      ? await supabase
          .from('roster_entries')
          .select('team_id')
          .in(
            'team_id',
            (teams ?? []).map((t) => t.id)
          )
      : { data: [] };

  const countMap: Record<string, number> = {};
  for (const r of rosterCounts ?? []) {
    countMap[r.team_id] = (countMap[r.team_id] ?? 0) + 1;
  }

  const leagueMap: Record<string, string> = {};
  (leagues ?? []).forEach((l) => {
    leagueMap[l.id] = l.name;
  });

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Team Directory</h1>
        <p className="mt-1 text-gray-600">
          All teams in your league{leagueIds.length > 1 ? 's' : ''}.
        </p>
      </div>

      {!teams || teams.length === 0 ? (
        <div className="mt-8 rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
          <Building className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">
            No teams found
          </h3>
          <p className="mt-2 text-gray-600">
            {leagueIds.length === 0
              ? 'Join a league to see teams.'
              : 'No teams have been created in your league yet.'}
          </p>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {teams.map((team) => (
            <Link
              key={team.id}
              href={`/team/directory/${team.id}`}
              className="block rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
            >
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
              <div className="mt-4 flex items-center justify-between">
                <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                  <Users className="h-3.5 w-3.5" />
                  {countMap[team.id] ?? 0} on roster
                </span>
                <span className="text-sm font-medium text-blue-600">
                  View Roster
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
