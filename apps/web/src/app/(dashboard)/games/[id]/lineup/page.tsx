import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { ArrowLeft } from 'lucide-react';
import { LineupEditor } from './lineup-editor';

export default async function LineupPage({
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

  const homeTeam = game.home_team as any;
  const awayTeam = game.away_team as any;

  // Check user permissions
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
  const isCoach = allRoles.some(
    (r) =>
      r.role === 'coach' &&
      (r.team_id === game.home_team_id || r.team_id === game.away_team_id)
  );

  // Check if assigned scorekeeper
  const { data: assignments } = await supabase
    .from('scorekeeper_assignments')
    .select('team_id, user_id')
    .eq('game_id', gameId);

  const isScorekeeper = (assignments ?? []).some(
    (a) => a.user_id === user.id
  );

  const canEdit = isCommissioner || isManager || isCoach || isScorekeeper;

  // Determine which teams the user can edit
  const userTeamIds = allRoles
    .filter(
      (r) =>
        (r.role === 'manager' || r.role === 'coach') &&
        (r.team_id === game.home_team_id || r.team_id === game.away_team_id)
    )
    .map((r) => r.team_id);

  const skTeamIds = (assignments ?? [])
    .filter((a) => a.user_id === user.id)
    .map((a) => a.team_id);

  // Commissioners can edit both; others only their team
  const editableTeamIds = isCommissioner
    ? [game.home_team_id, game.away_team_id]
    : [...new Set([...userTeamIds, ...skTeamIds])];

  // Fetch rosters for both teams
  const { data: homeRoster } = await supabase
    .from('roster_entries')
    .select('id, player_user_id, jersey_number, position, status')
    .eq('team_id', game.home_team_id)
    .eq('status', 'active');

  const { data: awayRoster } = await supabase
    .from('roster_entries')
    .select('id, player_user_id, jersey_number, position, status')
    .eq('team_id', game.away_team_id)
    .eq('status', 'active');

  // Get profile names for all roster players
  const allPlayerIds = [
    ...(homeRoster ?? []).map((r) => r.player_user_id),
    ...(awayRoster ?? []).map((r) => r.player_user_id),
  ];

  let playerProfiles: Record<string, string> = {};
  if (allPlayerIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', allPlayerIds);
    playerProfiles = (profiles ?? []).reduce(
      (acc, p) => ({ ...acc, [p.id]: p.full_name }),
      {} as Record<string, string>
    );
  }

  // Fetch existing lineups
  const { data: homeLineup } = await supabase
    .from('game_lineups')
    .select('*')
    .eq('game_id', gameId)
    .eq('team_id', game.home_team_id)
    .is('exited_inning', null)
    .order('batting_order');

  const { data: awayLineup } = await supabase
    .from('game_lineups')
    .select('*')
    .eq('game_id', gameId)
    .eq('team_id', game.away_team_id)
    .is('exited_inning', null)
    .order('batting_order');

  // Fetch standard lineups as defaults when game lineup is empty
  const { data: homeStandardLineup } =
    (homeLineup ?? []).length === 0
      ? await supabase.rpc('get_team_standard_lineup', {
          p_team_id: game.home_team_id,
        })
      : { data: [] };

  const { data: awayStandardLineup } =
    (awayLineup ?? []).length === 0
      ? await supabase.rpc('get_team_standard_lineup', {
          p_team_id: game.away_team_id,
        })
      : { data: [] };

  const homeDefault = ((homeStandardLineup as any[]) ?? []).map((l: any) => ({
    player_user_id: l.player_user_id as string,
    batting_order: l.batting_order as number,
    fielding_position: l.fielding_position as number,
  }));

  const awayDefault = ((awayStandardLineup as any[]) ?? []).map((l: any) => ({
    player_user_id: l.player_user_id as string,
    batting_order: l.batting_order as number,
    fielding_position: l.fielding_position as number,
  }));

  // Build roster data with names
  const buildRoster = (
    roster: typeof homeRoster
  ) =>
    (roster ?? []).map((r) => ({
      player_user_id: r.player_user_id,
      jersey_number: r.jersey_number,
      name: playerProfiles[r.player_user_id] ?? 'Unknown',
      position: r.position,
    }));

  return (
    <div>
      <Link
        href={`/games/${gameId}`}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Game
      </Link>

      <h1 className="mt-6 text-2xl font-bold text-gray-900">Lineups</h1>
      <p className="mt-1 text-gray-600">
        Set batting order and fielding positions for each team.
      </p>

      <div className="mt-6 space-y-8">
        {/* Home team lineup */}
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
          <LineupEditor
            gameId={gameId}
            teamId={game.home_team_id}
            roster={buildRoster(homeRoster)}
            currentLineup={(homeLineup ?? []).map((l) => ({
              player_user_id: l.player_user_id,
              batting_order: l.batting_order,
              fielding_position: l.fielding_position,
            }))}
            defaultLineup={homeDefault}
            canEdit={editableTeamIds.includes(game.home_team_id)}
          />
        </div>

        {/* Away team lineup */}
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
          <LineupEditor
            gameId={gameId}
            teamId={game.away_team_id}
            roster={buildRoster(awayRoster)}
            currentLineup={(awayLineup ?? []).map((l) => ({
              player_user_id: l.player_user_id,
              batting_order: l.batting_order,
              fielding_position: l.fielding_position,
            }))}
            defaultLineup={awayDefault}
            canEdit={editableTeamIds.includes(game.away_team_id)}
          />
        </div>
      </div>
    </div>
  );
}
