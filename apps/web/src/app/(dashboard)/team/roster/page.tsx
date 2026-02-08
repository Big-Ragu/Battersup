import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Users } from 'lucide-react';
import { RosterTable } from './roster-table';

export default async function TeamRosterPage({
  searchParams,
}: {
  searchParams: Promise<{ team?: string }>;
}) {
  const { team: selectedTeamId } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  // Fetch all user_roles for this user
  const { data: userRoles } = await supabase
    .from('user_roles')
    .select('id, league_id, team_id, role')
    .eq('user_id', user.id);

  const allRoles = userRoles ?? [];
  const teamRoles = allRoles.filter((r) => r.team_id !== null);

  // If user has no team assignments, show empty state
  if (teamRoles.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Team Roster</h1>
        <div className="mt-8 rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
          <Users className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">
            Not assigned to a team
          </h3>
          <p className="mt-2 text-gray-600">
            You haven&apos;t been assigned to any team yet. Ask your commissioner or
            use a signup code to join a team.
          </p>
          <Link
            href="/join"
            className="mt-4 inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Join League
          </Link>
        </div>
      </div>
    );
  }

  // Determine which team to display
  const activeTeamId = selectedTeamId || teamRoles[0].team_id!;

  // Determine permissions based on user's roles
  const rolesOnTeam = teamRoles.filter((r) => r.team_id === activeTeamId);
  const isCoach = rolesOnTeam.some((r) => r.role === 'coach');
  const isManager = allRoles.some((r) => r.role === 'manager');
  const isCommissioner = allRoles.some((r) => r.role === 'commissioner');
  const canEdit = isCoach || isManager || isCommissioner;
  const canManageRoster = isManager || isCommissioner;

  // Fetch roster via RPC
  const { data: roster } = await supabase.rpc('get_team_roster', {
    p_team_id: activeTeamId,
  });

  // Fetch team info
  const { data: team } = await supabase
    .from('teams')
    .select('id, name, color, league_id')
    .eq('id', activeTeamId)
    .single();

  // Fetch all teams in this league (for team picker and move-player dropdown)
  const { data: leagueTeams } = team
    ? await supabase
        .from('teams')
        .select('id, name')
        .eq('league_id', team.league_id)
        .order('name')
    : { data: [] };

  // Fetch unrostered players — players with user_role on this team but no roster_entry
  const rosterPlayerIds = new Set(
    ((roster as any[]) ?? []).map((r: any) => r.player_user_id)
  );

  // Get all league members for this team who are players
  const { data: allMembers } = team
    ? await supabase.rpc('get_league_members', {
        p_league_ids: [team.league_id],
      })
    : { data: [] };

  // Commissioners can see all members; filter to team players not yet on roster
  const teamPlayers = ((allMembers as any[]) ?? []).filter(
    (m: any) =>
      m.team_id === activeTeamId &&
      m.role === 'player' &&
      !rosterPlayerIds.has(m.user_id)
  );

  // Get unique teams for the team picker
  const userTeams = teamRoles.map((r) => ({
    id: r.team_id!,
    name: '', // we'll fill from leagueTeams
  }));

  // For multi-team users, fetch team names
  const uniqueTeamIds = [...new Set(teamRoles.map((r) => r.team_id!))];
  const { data: userTeamDetails } =
    uniqueTeamIds.length > 0
      ? await supabase
          .from('teams')
          .select('id, name')
          .in('id', uniqueTeamIds)
          .order('name')
      : { data: [] };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Team Roster</h1>
          {team && (
            <div className="mt-1 flex items-center gap-2">
              {team.color && (
                <div
                  className="h-4 w-4 rounded-full border border-gray-200"
                  style={{ backgroundColor: team.color }}
                />
              )}
              <p className="text-gray-600">{team.name}</p>
            </div>
          )}
        </div>
      </div>

      {/* Team picker for multi-team users */}
      {(userTeamDetails ?? []).length > 1 && (
        <div className="mt-4 flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700">Team:</span>
          <div className="flex gap-2">
            {(userTeamDetails ?? []).map((t) => (
              <Link
                key={t.id}
                href={`/team/roster?team=${t.id}`}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  t.id === activeTeamId
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {t.name}
              </Link>
            ))}
          </div>
        </div>
      )}

      <RosterTable
        teamId={activeTeamId}
        roster={((roster as any[]) ?? []).map((r: any) => ({
          roster_entry_id: r.roster_entry_id,
          team_id: r.team_id,
          team_name: r.team_name,
          league_id: r.league_id,
          player_user_id: r.player_user_id,
          full_name: r.full_name,
          email: r.email,
          phone: r.phone,
          avatar_url: r.avatar_url,
          position: r.position,
          jersey_number: r.jersey_number,
          status: r.status,
          notes: r.notes,
          created_at: r.created_at,
        }))}
        canEdit={canEdit}
        canManageRoster={canManageRoster}
        leagueTeams={(leagueTeams ?? []).filter((t) => t.id !== activeTeamId)}
        unrosteredPlayers={teamPlayers.map((p: any) => ({
          user_id: p.user_id,
          full_name: p.full_name,
          email: p.email,
        }))}
      />
    </div>
  );
}
