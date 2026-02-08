import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ArrowLeft, Pencil, BarChart, Calendar, UserCheck, Users, ClipboardList } from 'lucide-react';
import { RemoveFromTeamButton } from './remove-from-team-button';
import { ManagerPlayerToggle } from './manager-player-toggle';

export default async function TeamDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // Fetch team
  const { data: team } = await supabase
    .from('teams')
    .select('id, name, color, league_id')
    .eq('id', id)
    .single();

  if (!team) notFound();

  // Fetch league name
  const { data: league } = await supabase
    .from('leagues')
    .select('id, name')
    .eq('id', team.league_id)
    .single();

  // Fetch all members of this league via RPC, then filter by team
  const { data: allMembers } = await supabase.rpc('get_league_members', {
    p_league_ids: [team.league_id],
  });

  const membersList = (allMembers ?? []) as {
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

  // Filter to this team's members
  const teamMembers = membersList.filter((m) => m.team_id === team.id);
  const manager = teamMembers.find((m) => m.role === 'manager');
  const coaches = teamMembers.filter((m) => m.role === 'coach');
  const players = teamMembers.filter((m) => m.role === 'player');
  const others = teamMembers.filter(
    (m) => m.role !== 'manager' && m.role !== 'coach' && m.role !== 'player' && m.role !== 'commissioner'
  );
  const managerIsAlsoPlayer = manager
    ? players.some((p) => p.user_id === manager.user_id)
    : false;

  return (
    <div>
      {/* Back link */}
      <Link
        href="/commissioner/teams"
        className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Teams
      </Link>

      {/* Header */}
      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {team.color && (
            <div
              className="h-12 w-12 rounded-full border-2 border-gray-200"
              style={{ backgroundColor: team.color }}
            />
          )}
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{team.name}</h1>
            <p className="text-sm text-gray-500">{league?.name ?? 'Unknown League'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/team/directory/${team.id}`}
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <ClipboardList className="h-4 w-4" />
            View Roster
          </Link>
          <Link
            href={`/commissioner/teams/${team.id}/edit`}
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Pencil className="h-4 w-4" />
            Edit Team
          </Link>
        </div>
      </div>

      {/* Manager */}
      <div className="mt-8">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
          <UserCheck className="h-5 w-5 text-gray-400" />
          Manager
        </h2>
        {manager ? (
          <div className="mt-2 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">{manager.full_name || '—'}</p>
                <p className="text-sm text-gray-500">{manager.email}</p>
                <div className="mt-2">
                  <ManagerPlayerToggle
                    userId={manager.user_id}
                    leagueId={team.league_id}
                    teamId={team.id}
                    isPlayer={managerIsAlsoPlayer}
                  />
                </div>
              </div>
              <RemoveFromTeamButton
                roleId={manager.role_id}
                memberName={manager.full_name || manager.email}
              />
            </div>
          </div>
        ) : (
          <div className="mt-2 rounded-lg border-2 border-dashed border-gray-300 p-4 text-center text-sm text-gray-500">
            No manager assigned. Assign one from the{' '}
            <Link href="/commissioner/members" className="font-medium text-blue-600 hover:text-blue-500">
              Members page
            </Link>.
          </div>
        )}
      </div>

      {/* Coaches */}
      {coaches.length > 0 && (
        <div className="mt-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
            <UserCheck className="h-5 w-5 text-gray-400" />
            Coaches ({coaches.length})
          </h2>
          <div className="mt-2 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Joined</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {coaches.map((coach) => (
                  <tr key={coach.role_id}>
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">{coach.full_name || '—'}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">{coach.email}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">{new Date(coach.assigned_at).toLocaleDateString()}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <RemoveFromTeamButton roleId={coach.role_id} memberName={coach.full_name || coach.email} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Players Roster */}
      <div className="mt-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
          <Users className="h-5 w-5 text-gray-400" />
          Players ({players.length})
        </h2>
        {players.length > 0 ? (
          <div className="mt-2 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Joined</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {players.map((player) => (
                  <tr key={player.role_id}>
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">{player.full_name || '—'}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">{player.email}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">{new Date(player.assigned_at).toLocaleDateString()}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <RemoveFromTeamButton roleId={player.role_id} memberName={player.full_name || player.email} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-2 rounded-lg border-2 border-dashed border-gray-300 p-4 text-center text-sm text-gray-500">
            No players assigned to this team yet. Assign players from the{' '}
            <Link href="/commissioner/members" className="font-medium text-blue-600 hover:text-blue-500">
              Members page
            </Link>.
          </div>
        )}
      </div>

      {/* Stats Placeholder */}
      <div className="mt-8">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
          <BarChart className="h-5 w-5 text-gray-400" />
          Team Stats
        </h2>
        <div className="mt-2 rounded-lg border-2 border-dashed border-gray-300 p-8 text-center">
          <BarChart className="mx-auto h-10 w-10 text-gray-300" />
          <p className="mt-2 text-sm text-gray-500">
            Team stats will appear here once games are played.
          </p>
        </div>
      </div>

      {/* Game History Placeholder */}
      <div className="mt-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
          <Calendar className="h-5 w-5 text-gray-400" />
          Game History
        </h2>
        <div className="mt-2 rounded-lg border-2 border-dashed border-gray-300 p-8 text-center">
          <Calendar className="mx-auto h-10 w-10 text-gray-300" />
          <p className="mt-2 text-sm text-gray-500">
            Game history will appear here once the schedule is created.
          </p>
        </div>
      </div>
    </div>
  );
}
