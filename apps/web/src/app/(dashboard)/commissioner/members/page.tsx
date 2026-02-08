import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Plus } from 'lucide-react';
import { MembersTable } from './members-table';

export default async function MembersPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // Get leagues where current user is commissioner
  const { data: commRoles } = await supabase
    .from('user_roles')
    .select('league_id')
    .eq('user_id', user.id)
    .eq('role', 'commissioner');

  const leagueIds = commRoles?.map((r) => r.league_id) ?? [];

  if (leagueIds.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Members</h1>
        <div className="mt-4 rounded-md bg-yellow-50 p-4 text-yellow-700">
          You need to create a league first.{' '}
          <Link href="/commissioner/leagues/new" className="font-medium underline">
            Create a league
          </Link>
        </div>
      </div>
    );
  }

  // Fetch teams for all commissioner leagues
  const { data: allTeams } = await supabase
    .from('teams')
    .select('id, name, league_id')
    .in('league_id', leagueIds)
    .order('name');

  // Group teams by league for the dropdowns
  const teamsByLeague = new Map<string, { id: string; name: string }[]>();
  for (const t of allTeams ?? []) {
    if (!teamsByLeague.has(t.league_id)) {
      teamsByLeague.set(t.league_id, []);
    }
    teamsByLeague.get(t.league_id)!.push({ id: t.id, name: t.name });
  }

  // Use an RPC to get members for commissioner's leagues
  const { data: members } = await supabase.rpc('get_league_members', {
    p_league_ids: leagueIds,
  });

  const membersList = (members ?? []) as {
    role_id: string;
    user_id: string;
    league_id: string;
    league_name: string;
    team_id: string | null;
    team_name: string | null;
    role: string;
    full_name: string;
    email: string;
    assigned_at: string;
  }[];

  // Group by league
  const byLeague = new Map<string, { name: string; members: typeof membersList }>();
  for (const m of membersList) {
    if (!byLeague.has(m.league_id)) {
      byLeague.set(m.league_id, { name: m.league_name, members: [] });
    }
    byLeague.get(m.league_id)!.members.push(m);
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Members</h1>
          <p className="mt-1 text-gray-600">
            Manage members across your leagues.
          </p>
        </div>
        <Link
          href="/commissioner/members/assign"
          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Assign Role
        </Link>
      </div>

      {Array.from(byLeague.entries()).map(([leagueId, { name, members: leagueMembers }]) => (
        <MembersTable
          key={leagueId}
          leagueId={leagueId}
          leagueName={name}
          members={leagueMembers}
          teams={teamsByLeague.get(leagueId) ?? []}
          currentUserId={user.id}
        />
      ))}

      {byLeague.size === 0 && (
        <div className="mt-8 rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
          <h3 className="text-lg font-medium text-gray-900">No members yet</h3>
          <p className="mt-2 text-gray-600">
            Share signup codes with people to invite them to your league, or assign
            roles manually.
          </p>
        </div>
      )}
    </div>
  );
}
