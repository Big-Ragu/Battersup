import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { ClipboardList } from 'lucide-react';
import { StandardLineupEditor } from './standard-lineup-editor';

export default async function StandardLineupPage({
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

  // Fetch user roles
  const { data: userRoles } = await supabase
    .from('user_roles')
    .select('id, league_id, team_id, role')
    .eq('user_id', user.id);

  const allRoles = userRoles ?? [];
  const teamRoles = allRoles.filter((r) => r.team_id !== null);

  if (teamRoles.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Standard Lineup</h1>
        <div className="mt-8 rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
          <ClipboardList className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">
            Not assigned to a team
          </h3>
          <p className="mt-2 text-gray-600">
            You haven&apos;t been assigned to any team yet.
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

  const activeTeamId = selectedTeamId || teamRoles[0].team_id!;

  // Permissions
  const rolesOnTeam = teamRoles.filter((r) => r.team_id === activeTeamId);
  const isCoach = rolesOnTeam.some((r) => r.role === 'coach');
  const isManagerOfThisTeam = rolesOnTeam.some((r) => r.role === 'manager');
  const isCommissioner = allRoles.some((r) => r.role === 'commissioner');
  const canEdit = isCoach || isManagerOfThisTeam || isCommissioner;

  // Fetch team info
  const { data: team } = await supabase
    .from('teams')
    .select('id, name, color, league_id')
    .eq('id', activeTeamId)
    .single();

  // Fetch roster via RPC
  const { data: roster } = await supabase.rpc('get_team_roster', {
    p_team_id: activeTeamId,
  });

  // Fetch existing standard lineup
  const { data: standardLineup } = await supabase.rpc(
    'get_team_standard_lineup',
    { p_team_id: activeTeamId }
  );

  // Fetch depth chart starters for "Load from Depth Chart" button
  const { data: depthChart } = await supabase
    .from('team_depth_chart')
    .select('position, player_user_id, depth_order')
    .eq('team_id', activeTeamId)
    .eq('depth_order', 1)
    .order('position');

  // Team picker
  const uniqueTeamIds = [...new Set(teamRoles.map((r) => r.team_id!))];
  const { data: userTeamDetails } =
    uniqueTeamIds.length > 0
      ? await supabase
          .from('teams')
          .select('id, name')
          .in('id', uniqueTeamIds)
          .order('name')
      : { data: [] };

  const rosterData = ((roster as any[]) ?? [])
    .filter((r: any) => r.status === 'active')
    .map((r: any) => ({
      player_user_id: r.player_user_id,
      full_name: r.full_name,
      jersey_number: r.jersey_number,
      position: r.position,
    }));

  const lineupData = ((standardLineup as any[]) ?? []).map((l: any) => ({
    batting_order: l.batting_order,
    player_user_id: l.player_user_id,
    fielding_position: l.fielding_position,
    full_name: l.full_name,
    jersey_number: l.jersey_number,
  }));

  // Map depth chart starters to position numbers
  const depthStarters = ((depthChart as any[]) ?? []).map((d: any) => ({
    position: d.position as string,
    player_user_id: d.player_user_id as string,
  }));

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Standard Lineup</h1>
          <p className="mt-1 text-gray-600">
            Set the default batting order and fielding positions. This will
            pre-populate game lineups.
          </p>
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

      {/* Team picker */}
      {(userTeamDetails ?? []).length > 1 && (
        <div className="mt-4 flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700">Team:</span>
          <div className="flex gap-2">
            {(userTeamDetails ?? []).map((t) => (
              <Link
                key={t.id}
                href={`/team/lineup?team=${t.id}`}
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

      <StandardLineupEditor
        teamId={activeTeamId}
        roster={rosterData}
        currentLineup={lineupData}
        depthStarters={depthStarters}
        canEdit={canEdit}
      />
    </div>
  );
}
