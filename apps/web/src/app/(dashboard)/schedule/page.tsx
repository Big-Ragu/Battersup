import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Calendar, Plus } from 'lucide-react';
import { ScheduleView } from './schedule-view';

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ league?: string; view?: string; month?: string }>;
}) {
  const { league: leagueParam, view: viewParam, month: monthParam } =
    await searchParams;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  // Get user's leagues
  const { data: userRoles } = await supabase
    .from('user_roles')
    .select('league_id, team_id, role')
    .eq('user_id', user.id);

  const allRoles = userRoles ?? [];
  const leagueIds = [...new Set(allRoles.map((r) => r.league_id))];

  if (leagueIds.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Schedule</h1>
        <div className="mt-8 rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
          <Calendar className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">
            No leagues found
          </h3>
          <p className="mt-2 text-gray-600">
            Join a league to see the schedule.
          </p>
        </div>
      </div>
    );
  }

  // Fetch league names
  const { data: leagues } = await supabase
    .from('leagues')
    .select('id, name')
    .in('id', leagueIds)
    .order('name');

  const leagueList = leagues ?? [];
  const selectedLeagueId = leagueParam && leagueIds.includes(leagueParam)
    ? leagueParam
    : leagueList[0]?.id;

  if (!selectedLeagueId) redirect('/dashboard');

  // Determine current month for calendar
  const now = new Date();
  const currentMonth = monthParam || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [year, month] = currentMonth.split('-').map(Number);

  // Calculate date range for the month (with some padding for calendar view)
  const fromDate = new Date(year, month - 1, 1);
  fromDate.setDate(fromDate.getDate() - 7); // 1 week before month start
  const toDate = new Date(year, month, 0);
  toDate.setDate(toDate.getDate() + 7); // 1 week after month end

  // Fetch schedule
  const { data: schedule, error } = await supabase.rpc('get_league_schedule', {
    p_league_id: selectedLeagueId,
    p_from_date: fromDate.toISOString(),
    p_to_date: toDate.toISOString(),
  });

  const games = ((schedule as any[]) ?? []).map((g: any) => ({
    game_id: g.game_id,
    league_id: g.league_id,
    league_name: g.league_name,
    home_team_id: g.home_team_id,
    home_team_name: g.home_team_name,
    home_team_color: g.home_team_color,
    away_team_id: g.away_team_id,
    away_team_name: g.away_team_name,
    away_team_color: g.away_team_color,
    field_id: g.field_id,
    field_name: g.field_name,
    diamond_number: g.diamond_number,
    scheduled_at: g.scheduled_at,
    status: g.status,
    home_score: g.home_score,
    away_score: g.away_score,
    inning: g.inning,
    inning_half: g.inning_half,
    notes: g.notes,
    created_at: g.created_at,
  }));

  // Determine permissions
  const isCommissioner = allRoles.some(
    (r) => r.role === 'commissioner' && r.league_id === selectedLeagueId
  );
  const isManager = allRoles.some(
    (r) => r.role === 'manager' && r.league_id === selectedLeagueId
  );
  const canManage = isCommissioner || isManager;

  // Get user's team IDs in this league
  const userTeamIds = allRoles
    .filter((r) => r.league_id === selectedLeagueId && r.team_id)
    .map((r) => r.team_id!);

  const view = viewParam === 'calendar' ? 'calendar' : 'list';

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Schedule</h1>
          <p className="mt-1 text-gray-600">
            {leagueList.find((l) => l.id === selectedLeagueId)?.name ?? 'League'} schedule
          </p>
        </div>
        {canManage && (
          <Link
            href={`/commissioner/schedule/new?league=${selectedLeagueId}`}
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Add Game
          </Link>
        )}
      </div>

      {/* League picker */}
      {leagueList.length > 1 && (
        <div className="mt-4 flex gap-2">
          {leagueList.map((league) => (
            <Link
              key={league.id}
              href={`/schedule?league=${league.id}&view=${view}&month=${currentMonth}`}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                league.id === selectedLeagueId
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {league.name}
            </Link>
          ))}
        </div>
      )}

      {error ? (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-red-800">
            Failed to load schedule. Please try again.
          </p>
        </div>
      ) : (
        <ScheduleView
          games={games}
          currentMonth={currentMonth}
          leagueId={selectedLeagueId}
          canManage={canManage}
          userTeamIds={userTeamIds}
          view={view}
        />
      )}
    </div>
  );
}
