import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { ArrowLeft, Users } from 'lucide-react';
import {
  POSITIONS,
  ROSTER_STATUS_LABELS,
  ROSTER_STATUS_COLORS,
} from '@batters-up/shared';
import type { RosterStatus } from '@batters-up/shared';
import { RosterTable } from '../../roster/roster-table';

export default async function TeamDirectoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: teamId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  // Fetch team info
  const { data: team } = await supabase
    .from('teams')
    .select('id, name, color, league_id')
    .eq('id', teamId)
    .single();

  if (!team) notFound();

  // Fetch league name
  const { data: league } = await supabase
    .from('leagues')
    .select('id, name')
    .eq('id', team.league_id)
    .single();

  // Fetch user's roles to determine permissions
  const { data: userRoles } = await supabase
    .from('user_roles')
    .select('id, league_id, team_id, role')
    .eq('user_id', user.id);

  const allRoles = userRoles ?? [];
  const isCoach = allRoles.some(
    (r) => r.role === 'coach' && r.team_id === teamId
  );
  const isManager = allRoles.some(
    (r) => r.role === 'manager' && r.league_id === team.league_id
  );
  const isCommissioner = allRoles.some(
    (r) => r.role === 'commissioner' && r.league_id === team.league_id
  );
  const canEdit = isCoach || isManager || isCommissioner;
  const canManageRoster = isManager || isCommissioner;

  // Fetch roster via RPC
  const { data: roster, error } = await supabase.rpc('get_team_roster', {
    p_team_id: teamId,
  });

  if (error) {
    return (
      <div>
        <Link
          href="/team/directory"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Directory
        </Link>
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-red-800">
            You don&apos;t have access to view this team&apos;s roster.
          </p>
        </div>
      </div>
    );
  }

  const rosterData = ((roster as any[]) ?? []).map((r: any) => ({
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
  }));

  // For managers/commissioners: fetch other teams in the league (for move-player)
  const { data: leagueTeams } = canManageRoster
    ? await supabase
        .from('teams')
        .select('id, name')
        .eq('league_id', team.league_id)
        .neq('id', teamId)
        .order('name')
    : { data: [] };

  // For coaches/managers/commissioners: fetch unrostered players
  let unrosteredPlayers: { user_id: string; full_name: string | null; email: string }[] = [];
  if (canEdit) {
    const rosterPlayerIds = new Set(rosterData.map((r) => r.player_user_id));
    const { data: allMembers } = await supabase.rpc('get_league_members', {
      p_league_ids: [team.league_id],
    });
    unrosteredPlayers = ((allMembers as any[]) ?? [])
      .filter(
        (m: any) =>
          m.team_id === teamId &&
          m.role === 'player' &&
          !rosterPlayerIds.has(m.user_id)
      )
      .map((p: any) => ({
        user_id: p.user_id,
        full_name: p.full_name,
        email: p.email,
      }));
  }

  return (
    <div>
      <Link
        href="/team/directory"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Directory
      </Link>

      <div className="mt-6 flex items-center gap-3">
        {team.color && (
          <div
            className="h-10 w-10 rounded-full border border-gray-200"
            style={{ backgroundColor: team.color }}
          />
        )}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{team.name}</h1>
          {league && <p className="text-sm text-gray-600">{league.name}</p>}
        </div>
      </div>

      {canEdit ? (
        /* Full interactive roster for coaches/managers/commissioners */
        <RosterTable
          teamId={teamId}
          roster={rosterData}
          canEdit={canEdit}
          canManageRoster={canManageRoster}
          leagueTeams={leagueTeams ?? []}
          unrosteredPlayers={unrosteredPlayers}
        />
      ) : (
        /* Read-only roster for players/fans */
        <>
          {rosterData.length === 0 ? (
            <div className="mt-8 rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
              <Users className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-4 text-lg font-medium text-gray-900">
                No players on the roster
              </h3>
              <p className="mt-2 text-gray-600">
                This team hasn&apos;t added any players to their roster yet.
              </p>
            </div>
          ) : (
            <div className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      #
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Player
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Position
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {rosterData.map((entry) => {
                    const status = entry.status as RosterStatus;
                    const statusColors =
                      ROSTER_STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-800';
                    const positionLabel = entry.position
                      ? POSITIONS[entry.position as keyof typeof POSITIONS] ??
                        entry.position
                      : null;

                    return (
                      <tr key={entry.roster_entry_id}>
                        <td className="whitespace-nowrap px-4 py-3 text-sm">
                          <span className="font-mono font-semibold text-gray-900">
                            {entry.jersey_number ?? '—'}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <p className="text-sm font-medium text-gray-900">
                            {entry.full_name || entry.email}
                          </p>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900">
                          {positionLabel
                            ? `${entry.position} — ${positionLabel}`
                            : '—'}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusColors}`}
                          >
                            {ROSTER_STATUS_LABELS[status] ?? entry.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
