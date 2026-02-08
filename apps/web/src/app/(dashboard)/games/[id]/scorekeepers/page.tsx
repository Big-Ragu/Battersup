import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { ArrowLeft } from 'lucide-react';
import { AssignmentForm } from './assignment-form';

export default async function ScorekeepersPage({
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

  // Fetch game
  const { data: game } = await supabase
    .from('games')
    .select(
      `id, league_id, home_team_id, away_team_id, status,
       home_team:teams!games_home_team_id_fkey(id, name, color),
       away_team:teams!games_away_team_id_fkey(id, name, color)`
    )
    .eq('id', gameId)
    .single();

  if (!game) notFound();

  // Check permissions — must be manager or commissioner
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

  if (!isCommissioner && !isManager) {
    redirect(`/games/${gameId}`);
  }

  // Fetch current assignments with profile names
  const { data: assignments } = await supabase
    .from('scorekeeper_assignments')
    .select('id, team_id, user_id')
    .eq('game_id', gameId);

  // Fetch all league roles with profiles and team names
  const { data: leagueRoles } = await supabase
    .from('user_roles')
    .select('user_id, team_id, role, teams(name)')
    .eq('league_id', game.league_id);

  // Get unique user IDs from league roles
  const roleUserIds = [
    ...new Set((leagueRoles ?? []).map((r) => r.user_id)),
  ];

  // Fetch profiles for all of them
  let profileMap: Record<string, string> = {};
  if (roleUserIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', roleUserIds);
    profileMap = (profiles ?? []).reduce(
      (acc, p) => ({ ...acc, [p.id]: p.full_name ?? 'Unknown' }),
      {} as Record<string, string>
    );
  }

  const homeTeam = game.home_team as any;
  const awayTeam = game.away_team as any;

  const homeAssignment = (assignments ?? []).find(
    (a) => a.team_id === game.home_team_id
  );
  const awayAssignment = (assignments ?? []).find(
    (a) => a.team_id === game.away_team_id
  );

  // Build grouped member lists per team
  // For each team card: show that team's members first, then other league members
  function buildGroupedMembers(teamId: string) {
    const seen = new Set<string>();
    const teamMembers: { user_id: string; full_name: string; role: string; group: string }[] = [];
    const otherMembers: { user_id: string; full_name: string; role: string; group: string }[] = [];

    for (const r of leagueRoles ?? []) {
      if (seen.has(r.user_id + r.role)) continue;
      seen.add(r.user_id + r.role);

      const name = profileMap[r.user_id] ?? 'Unknown';
      const teamName = (r.teams as any)?.name ?? '';

      if (r.team_id === teamId) {
        teamMembers.push({
          user_id: r.user_id,
          full_name: name,
          role: r.role,
          group: 'team',
        });
      } else {
        otherMembers.push({
          user_id: r.user_id,
          full_name: name,
          role: r.role,
          group: teamName || 'League',
        });
      }
    }

    // Deduplicate by user_id (keep first occurrence per group)
    const dedupedTeam: typeof teamMembers = [];
    const dedupedOther: typeof otherMembers = [];
    const seenTeamUsers = new Set<string>();
    const seenOtherUsers = new Set<string>();

    for (const m of teamMembers) {
      if (!seenTeamUsers.has(m.user_id)) {
        seenTeamUsers.add(m.user_id);
        dedupedTeam.push(m);
      }
    }

    for (const m of otherMembers) {
      if (!seenOtherUsers.has(m.user_id) && !seenTeamUsers.has(m.user_id)) {
        seenOtherUsers.add(m.user_id);
        dedupedOther.push(m);
      }
    }

    return { teamMembers: dedupedTeam, otherMembers: dedupedOther };
  }

  const homeGrouped = buildGroupedMembers(game.home_team_id);
  const awayGrouped = buildGroupedMembers(game.away_team_id);

  return (
    <div>
      <Link
        href={`/games/${gameId}`}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Game
      </Link>

      <h1 className="mt-6 text-2xl font-bold text-gray-900">
        Assign Scorekeepers
      </h1>
      <p className="mt-1 text-gray-600">
        Assign one scorekeeper per team. They will record plays during the game.
      </p>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        {/* Home team */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            {homeTeam?.color && (
              <div
                className="h-4 w-4 rounded-full border border-gray-200"
                style={{ backgroundColor: homeTeam.color }}
              />
            )}
            <h2 className="text-lg font-semibold text-gray-900">
              {homeTeam?.name} (Home)
            </h2>
          </div>
          <AssignmentForm
            gameId={gameId}
            teamId={game.home_team_id}
            teamName={homeTeam?.name ?? 'Home'}
            currentUserId={homeAssignment?.user_id ?? null}
            currentUserName={
              homeAssignment
                ? profileMap[homeAssignment.user_id] ?? 'Unknown'
                : null
            }
            teamMembers={homeGrouped.teamMembers}
            otherMembers={homeGrouped.otherMembers}
          />
        </div>

        {/* Away team */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            {awayTeam?.color && (
              <div
                className="h-4 w-4 rounded-full border border-gray-200"
                style={{ backgroundColor: awayTeam.color }}
              />
            )}
            <h2 className="text-lg font-semibold text-gray-900">
              {awayTeam?.name} (Away)
            </h2>
          </div>
          <AssignmentForm
            gameId={gameId}
            teamId={game.away_team_id}
            teamName={awayTeam?.name ?? 'Away'}
            currentUserId={awayAssignment?.user_id ?? null}
            currentUserName={
              awayAssignment
                ? profileMap[awayAssignment.user_id] ?? 'Unknown'
                : null
            }
            teamMembers={awayGrouped.teamMembers}
            otherMembers={awayGrouped.otherMembers}
          />
        </div>
      </div>
    </div>
  );
}
