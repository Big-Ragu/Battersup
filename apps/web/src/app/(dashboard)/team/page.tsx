import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Users } from 'lucide-react';
import {
  RosterOverviewCard,
  DepthChartOverviewCard,
  LineupOverviewCard,
  ScheduleOutlookCard,
  StandingsCard,
  BattingStatsCard,
  PitchingStatsCard,
} from './overview-cards';

export default async function TeamOverviewPage({
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
        <h1 className="text-2xl font-bold text-gray-900">Team Overview</h1>
        <div className="mt-8 rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
          <Users className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">
            Not assigned to a team
          </h3>
          <p className="mt-2 text-gray-600">
            You haven&apos;t been assigned to any team yet. Ask your
            commissioner or use a signup code to join a team.
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

  // Fetch team info first (need league_id for other queries)
  const { data: team } = await supabase
    .from('teams')
    .select('id, name, color, league_id')
    .eq('id', activeTeamId)
    .single();

  if (!team) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Team Overview</h1>
        <p className="mt-4 text-gray-600">Team not found.</p>
      </div>
    );
  }

  // Parallel data fetches
  const now = new Date();
  const thirtyDaysOut = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const [rosterResult, depthChartResult, lineupResult, scheduleResult, standingsResult] =
    await Promise.all([
      supabase.rpc('get_team_roster', { p_team_id: activeTeamId }),
      supabase
        .from('team_depth_chart')
        .select('position, player_user_id, depth_order')
        .eq('team_id', activeTeamId)
        .order('position')
        .order('depth_order'),
      supabase.rpc('get_team_standard_lineup', { p_team_id: activeTeamId }),
      supabase.rpc('get_league_schedule', {
        p_league_id: team.league_id,
        p_from_date: now.toISOString(),
        p_to_date: thirtyDaysOut.toISOString(),
      }),
      supabase.rpc('get_league_standings', { p_league_id: team.league_id }),
    ]);

  // Season stats RPCs — wrapped in try-catch so the page still renders
  // if the migration hasn't been run yet
  let battingResult: { data: any } = { data: null };
  let pitchingResult: { data: any } = { data: null };
  try {
    [battingResult, pitchingResult] = await Promise.all([
      supabase.rpc('get_team_season_batting', { p_team_id: activeTeamId }),
      supabase.rpc('get_team_season_pitching', { p_team_id: activeTeamId }),
    ]);
  } catch {
    // RPCs may not exist yet — show empty cards
  }

  const roster = ((rosterResult.data as any[]) ?? []).map((r: any) => ({
    roster_entry_id: r.roster_entry_id,
    player_user_id: r.player_user_id,
    full_name: r.full_name,
    jersey_number: r.jersey_number,
    position: r.position,
    status: r.status,
  }));

  const depthEntries = ((depthChartResult.data as any[]) ?? []).map(
    (d: any) => ({
      position: d.position,
      player_user_id: d.player_user_id,
      depth_order: d.depth_order,
    })
  );

  const lineup = ((lineupResult.data as any[]) ?? []).map((l: any) => ({
    batting_order: l.batting_order,
    player_user_id: l.player_user_id,
    fielding_position: l.fielding_position,
  }));

  // Filter schedule to games involving this team, take first 5
  const allGames = (scheduleResult.data as any[]) ?? [];
  const teamGames = allGames
    .filter(
      (g: any) =>
        g.home_team_id === activeTeamId || g.away_team_id === activeTeamId
    )
    .sort(
      (a: any, b: any) =>
        new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
    )
    .slice(0, 5)
    .map((g: any) => ({
      game_id: g.game_id,
      home_team_id: g.home_team_id,
      home_team_name: g.home_team_name,
      away_team_id: g.away_team_id,
      away_team_name: g.away_team_name,
      scheduled_at: g.scheduled_at,
      status: g.status,
      home_score: g.home_score,
      away_score: g.away_score,
      field_name: g.field_name,
    }));

  const standings = ((standingsResult.data as any[]) ?? []).map((s: any) => ({
    team_id: s.team_id,
    team_name: s.team_name,
    team_color: s.team_color,
    wins: s.wins,
    losses: s.losses,
    ties: s.ties,
    win_pct: s.win_pct,
    games_back: s.games_back,
  }));

  const battingStats = ((battingResult.data as any[]) ?? []).map((b: any) => ({
    player_user_id: b.player_user_id,
    player_name: b.player_name,
    jersey_number: b.jersey_number,
    gp: b.gp,
    ab: b.ab,
    r: b.r,
    h: b.h,
    doubles: b.doubles,
    triples: b.triples,
    hr: b.hr,
    rbi: b.rbi,
    bb: b.bb,
    k: b.k,
    hbp: b.hbp,
    sac: b.sac,
    sb: b.sb ?? 0,
    avg: b.avg,
  }));

  const pitchingStats = ((pitchingResult.data as any[]) ?? []).map((p: any) => ({
    player_user_id: p.player_user_id,
    player_name: p.player_name,
    jersey_number: p.jersey_number,
    gp: p.gp,
    ip_outs: p.ip_outs,
    h: p.h,
    r: p.r,
    bb: p.bb,
    k: p.k,
    hr: p.hr,
    hbp: p.hbp,
  }));

  // Build roster lookup for depth chart & lineup cards
  const rosterLookup: Record<
    string,
    { full_name: string; jersey_number: number | null }
  > = {};
  for (const p of roster) {
    rosterLookup[p.player_user_id] = {
      full_name: p.full_name,
      jersey_number: p.jersey_number,
    };
  }

  // Get unique teams for the team picker
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
          <h1 className="text-2xl font-bold text-gray-900">Team Overview</h1>
          <div className="mt-1 flex items-center gap-2">
            {team.color && (
              <div
                className="h-4 w-4 rounded-full border border-gray-200"
                style={{ backgroundColor: team.color }}
              />
            )}
            <p className="text-gray-600">{team.name}</p>
          </div>
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
                href={`/team?team=${t.id}`}
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

      {/* Dashboard grid */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="lg:col-span-2">
          <RosterOverviewCard roster={roster} />
        </div>

        <div className="lg:col-span-2">
          <BattingStatsCard stats={battingStats} />
        </div>

        <div className="lg:col-span-2">
          <PitchingStatsCard stats={pitchingStats} />
        </div>

        <DepthChartOverviewCard
          entries={depthEntries}
          rosterLookup={rosterLookup}
        />

        <LineupOverviewCard lineup={lineup} rosterLookup={rosterLookup} />

        <ScheduleOutlookCard games={teamGames} teamId={activeTeamId} />

        <StandingsCard standings={standings} teamId={activeTeamId} />
      </div>
    </div>
  );
}
