'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Calendar, List, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  GAME_STATUS_LABELS,
  GAME_STATUS_COLORS,
} from '@batters-up/shared';
import type { GameStatus } from '@batters-up/shared';

interface GameData {
  game_id: string;
  league_id: string;
  league_name: string;
  home_team_id: string;
  home_team_name: string;
  home_team_color: string | null;
  away_team_id: string;
  away_team_name: string;
  away_team_color: string | null;
  field_id: string | null;
  field_name: string | null;
  diamond_number: number | null;
  scheduled_at: string;
  status: string;
  home_score: number;
  away_score: number;
  inning: number | null;
  inning_half: string | null;
  notes: string | null;
  created_at: string;
}

interface ScheduleViewProps {
  games: GameData[];
  currentMonth: string;
  leagueId: string;
  canManage: boolean;
  userTeamIds: string[];
  view: 'list' | 'calendar';
  gameMonths: string[];
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatFullDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function getDateKey(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function ScheduleView({
  games,
  currentMonth,
  leagueId,
  canManage,
  userTeamIds,
  view,
  gameMonths,
}: ScheduleViewProps) {
  const router = useRouter();
  const [teamFilter, setTeamFilter] = useState<string>('all');
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // Filter games by team
  const filteredGames = teamFilter === 'all'
    ? games
    : games.filter(
        (g) => g.home_team_id === teamFilter || g.away_team_id === teamFilter
      );

  // Get unique teams for filter
  const teamSet = new Map<string, { id: string; name: string }>();
  games.forEach((g) => {
    teamSet.set(g.home_team_id, { id: g.home_team_id, name: g.home_team_name });
    teamSet.set(g.away_team_id, { id: g.away_team_id, name: g.away_team_name });
  });
  const teams = Array.from(teamSet.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  // Month navigation — only months that have games
  const [year, month] = currentMonth.split('-').map(Number);
  const currentIdx = gameMonths.indexOf(currentMonth);
  const hasPrev = currentIdx > 0;
  const hasNext = currentIdx < gameMonths.length - 1;

  function prevMonth() {
    if (!hasPrev) return;
    router.push(`/schedule?league=${leagueId}&view=${view}&month=${gameMonths[currentIdx - 1]}`);
  }

  function nextMonth() {
    if (!hasNext) return;
    router.push(`/schedule?league=${leagueId}&view=${view}&month=${gameMonths[currentIdx + 1]}`);
  }

  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
  });

  return (
    <div className="mt-6">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {/* View toggle */}
        <div className="inline-flex rounded-md border border-gray-300">
          <Link
            href={`/schedule?league=${leagueId}&view=list&month=${currentMonth}`}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium ${
              view === 'list'
                ? 'bg-blue-50 text-blue-700'
                : 'text-gray-700 hover:bg-gray-50'
            } rounded-l-md`}
          >
            <List className="h-4 w-4" />
            List
          </Link>
          <Link
            href={`/schedule?league=${leagueId}&view=calendar&month=${currentMonth}`}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium ${
              view === 'calendar'
                ? 'bg-blue-50 text-blue-700'
                : 'text-gray-700 hover:bg-gray-50'
            } rounded-r-md border-l border-gray-300`}
          >
            <Calendar className="h-4 w-4" />
            Calendar
          </Link>
        </div>

        {/* Team filter */}
        {teams.length > 0 && (
          <select
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700"
          >
            <option value="all">All Teams</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}

        {/* Month navigation — only months with games */}
        {gameMonths.length > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={prevMonth}
              disabled={!hasPrev}
              className={`rounded-md p-1.5 ${
                hasPrev
                  ? 'text-gray-500 hover:bg-gray-100'
                  : 'text-gray-300 cursor-not-allowed'
              }`}
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <span className="min-w-[140px] text-center text-sm font-medium text-gray-900">
              {monthLabel}
            </span>
            <button
              onClick={nextMonth}
              disabled={!hasNext}
              className={`rounded-md p-1.5 ${
                hasNext
                  ? 'text-gray-500 hover:bg-gray-100'
                  : 'text-gray-300 cursor-not-allowed'
              }`}
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        )}
      </div>

      {view === 'list' ? (
        <ListView
          games={filteredGames}
          userTeamIds={userTeamIds}
        />
      ) : (
        <CalendarView
          games={filteredGames}
          userTeamIds={userTeamIds}
          year={year}
          month={month}
          selectedDay={selectedDay}
          onSelectDay={setSelectedDay}
        />
      )}
    </div>
  );
}

/* ===== LIST VIEW ===== */

function ListView({
  games,
  userTeamIds,
}: {
  games: GameData[];
  userTeamIds: string[];
}) {
  if (games.length === 0) {
    return (
      <div className="mt-8 rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
        <Calendar className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-4 text-lg font-medium text-gray-900">
          No games scheduled
        </h3>
        <p className="mt-2 text-gray-600">
          No games found for the selected period.
        </p>
      </div>
    );
  }

  // Group by date
  const grouped = new Map<string, GameData[]>();
  games.forEach((g) => {
    const key = getDateKey(g.scheduled_at);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(g);
  });

  return (
    <div className="mt-4 space-y-6">
      {Array.from(grouped.entries()).map(([dateKey, dayGames]) => (
        <div key={dateKey}>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
            {formatFullDate(dayGames[0].scheduled_at)}
          </h3>
          <div className="mt-2 space-y-2">
            {dayGames.map((game) => (
              <GameCard
                key={game.game_id}
                game={game}
                userTeamIds={userTeamIds}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ===== GAME CARD ===== */

function GameCard({
  game,
  userTeamIds,
}: {
  game: GameData;
  userTeamIds: string[];
}) {
  const isUserGame =
    userTeamIds.includes(game.home_team_id) ||
    userTeamIds.includes(game.away_team_id);
  const status = game.status as GameStatus;
  const statusColor =
    GAME_STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-800';
  const statusLabel =
    GAME_STATUS_LABELS[status] ?? game.status;
  const showScore = status === 'in_progress' || status === 'final';

  return (
    <Link
      href={`/schedule/${game.game_id}`}
      className={`block rounded-lg border p-4 transition-shadow hover:shadow-md ${
        isUserGame
          ? 'border-blue-200 bg-blue-50/50'
          : 'border-gray-200 bg-white'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* Time */}
          <span className="w-20 text-sm font-medium text-gray-500">
            {formatTime(game.scheduled_at)}
          </span>

          {/* Matchup */}
          <div className="flex items-center gap-2">
            {game.home_team_color && (
              <div
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: game.home_team_color }}
              />
            )}
            <span className="text-sm font-semibold text-gray-900">
              {game.home_team_name}
            </span>

            {showScore ? (
              <span className="mx-1 text-sm font-bold text-gray-900">
                {game.home_score} - {game.away_score}
              </span>
            ) : (
              <span className="mx-1 text-xs text-gray-400">vs</span>
            )}

            <span className="text-sm font-semibold text-gray-900">
              {game.away_team_name}
            </span>
            {game.away_team_color && (
              <div
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: game.away_team_color }}
              />
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Field */}
          {game.field_name && (
            <span className="text-xs text-gray-500">
              {game.field_name}
              {game.diamond_number ? ` #${game.diamond_number}` : ''}
            </span>
          )}

          {/* Status badge */}
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusColor}`}
          >
            {statusLabel}
          </span>
        </div>
      </div>
    </Link>
  );
}

/* ===== CALENDAR VIEW ===== */

function CalendarView({
  games,
  userTeamIds,
  year,
  month,
  selectedDay,
  onSelectDay,
}: {
  games: GameData[];
  userTeamIds: string[];
  year: number;
  month: number;
  selectedDay: string | null;
  onSelectDay: (day: string | null) => void;
}) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDayOfWeek = new Date(year, month - 1, 1).getDay();

  // Build game count per day
  const gamesByDay = new Map<string, GameData[]>();
  games.forEach((g) => {
    const key = getDateKey(g.scheduled_at);
    if (!gamesByDay.has(key)) gamesByDay.set(key, []);
    gamesByDay.get(key)!.push(g);
  });

  const today = new Date();
  const todayKey = getDateKey(today.toISOString());

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Build calendar grid
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const selectedGames = selectedDay ? gamesByDay.get(selectedDay) ?? [] : [];

  return (
    <div className="mt-4">
      {/* Calendar grid */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="grid grid-cols-7">
          {dayNames.map((name) => (
            <div
              key={name}
              className="border-b border-gray-200 bg-gray-50 px-2 py-2 text-center text-xs font-medium text-gray-500"
            >
              {name}
            </div>
          ))}
          {cells.map((day, idx) => {
            if (day === null) {
              return (
                <div
                  key={`empty-${idx}`}
                  className="h-20 border-b border-r border-gray-100 bg-gray-50/50"
                />
              );
            }

            const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayGames = gamesByDay.get(dateKey) ?? [];
            const isToday = dateKey === todayKey;
            const isSelected = dateKey === selectedDay;
            const hasUserGame = dayGames.some(
              (g) =>
                userTeamIds.includes(g.home_team_id) ||
                userTeamIds.includes(g.away_team_id)
            );

            return (
              <button
                key={dateKey}
                onClick={() => onSelectDay(isSelected ? null : dateKey)}
                className={`h-20 border-b border-r border-gray-100 px-2 py-1 text-left transition-colors hover:bg-blue-50 ${
                  isSelected ? 'bg-blue-50 ring-2 ring-inset ring-blue-500' : ''
                }`}
              >
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                    isToday
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-700'
                  }`}
                >
                  {day}
                </span>
                {dayGames.length > 0 && (
                  <div className="mt-1 flex items-center gap-1">
                    <div
                      className={`h-2 w-2 rounded-full ${
                        hasUserGame ? 'bg-blue-500' : 'bg-gray-400'
                      }`}
                    />
                    <span className="text-xs text-gray-500">
                      {dayGames.length} game{dayGames.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected day games */}
      {selectedDay && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
            {formatFullDate(selectedDay + 'T12:00:00')}
          </h3>
          {selectedGames.length === 0 ? (
            <p className="mt-2 text-sm text-gray-500">No games on this day.</p>
          ) : (
            <div className="mt-2 space-y-2">
              {selectedGames.map((game) => (
                <GameCard
                  key={game.game_id}
                  game={game}
                  userTeamIds={userTeamIds}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
