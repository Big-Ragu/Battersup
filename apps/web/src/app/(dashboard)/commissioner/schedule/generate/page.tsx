'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import {
  ArrowLeft,
  Wand2,
  Check,
  Plus,
  X,
  AlertTriangle,
  RotateCcw,
  Calendar,
} from 'lucide-react';

interface LeagueOption { id: string; name: string }
interface TeamOption { id: string; name: string; league_id: string }
interface FieldOption { id: string; name: string; league_id: string }

// ── Constants ──

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_HEADERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DAY_PRESETS: { label: string; days: number[] }[] = [
  { label: 'Weekends', days: [0, 6] },
  { label: 'Weekdays', days: [1, 2, 3, 4, 5] },
  { label: 'MWF', days: [1, 3, 5] },
  { label: 'TuTh', days: [2, 4] },
];

const ROUND_OPTIONS = [
  { value: 1, label: '1 — Single round-robin', desc: 'Each team plays every other team once' },
  { value: 2, label: '2 — Double round-robin', desc: 'Each team plays every other team twice (home & away swapped)' },
  { value: 3, label: '3 — Triple round-robin', desc: 'Each team plays every other team three times' },
  { value: 4, label: '4 — Quadruple round-robin', desc: 'Each team plays every other team four times' },
];

// ── Date helpers ──

function toDateKey(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function getMonthGrid(year: number, month: number): (number | null)[] {
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  return cells;
}

function getMonthsInRange(start: string, end: string): { year: number; month: number }[] {
  const [sy, sm] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);
  const months: { year: number; month: number }[] = [];
  let y = sy, m = sm - 1;
  while (y < ey || (y === ey && m <= em - 1)) {
    months.push({ year: y, month: m });
    m++;
    if (m > 11) { m = 0; y++; }
  }
  return months;
}

function getDatesForDow(start: string, end: string, dow: number): string[] {
  const s = new Date(start + 'T12:00:00');
  const e = new Date(end + 'T12:00:00');
  const dates: string[] = [];
  const cur = new Date(s);
  while (cur.getDay() !== dow) cur.setDate(cur.getDate() + 1);
  while (cur <= e) {
    dates.push(toDateKey(cur.getFullYear(), cur.getMonth(), cur.getDate()));
    cur.setDate(cur.getDate() + 7);
  }
  return dates;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return toDateKey(d.getFullYear(), d.getMonth(), d.getDate());
}

// ── Component ──

export default function GenerateSchedulePage() {
  const [leagues, setLeagues] = useState<LeagueOption[]>([]);
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [fields, setFields] = useState<FieldOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const [leagueId, setLeagueId] = useState('');
  const [selectedTeamIds, setSelectedTeamIds] = useState<Set<string>>(new Set());
  const [rounds, setRounds] = useState(1);

  // Date range for calendar
  const [seasonStart, setSeasonStart] = useState('');
  const [seasonEnd, setSeasonEnd] = useState('');
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());

  const [timeSlots, setTimeSlots] = useState<string[]>(['18:00']);
  const [fieldId, setFieldId] = useState('');

  // ── Data loading ──

  useEffect(() => {
    async function loadData() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data: roles } = await supabase
        .from('user_roles')
        .select('league_id')
        .eq('user_id', user.id)
        .eq('role', 'commissioner');

      const leagueIds = roles?.map((r) => r.league_id) ?? [];
      if (leagueIds.length === 0) {
        setLoading(false);
        return;
      }

      const { data: leagueData } = await supabase
        .from('leagues')
        .select('id, name')
        .in('id', leagueIds)
        .order('name');

      const { data: teamData } = await supabase
        .from('teams')
        .select('id, name, league_id')
        .in('league_id', leagueIds)
        .order('name');

      const { data: fieldData } = await supabase
        .from('fields')
        .select('id, name, league_id')
        .in('league_id', leagueIds)
        .order('name');

      const ll = (leagueData ?? []) as LeagueOption[];
      setLeagues(ll);
      setTeams((teamData ?? []) as TeamOption[]);
      setFields((fieldData ?? []) as FieldOption[]);

      if (ll.length > 0) setLeagueId(ll[0].id);
      setLoading(false);
    }
    loadData();
  }, []);

  const filteredTeams = teams.filter((t) => t.league_id === leagueId);
  const filteredFields = fields.filter((f) => f.league_id === leagueId);

  // Auto-select all teams when league changes
  useEffect(() => {
    setSelectedTeamIds(new Set(filteredTeams.map((t) => t.id)));
  }, [leagueId, teams.length]);

  // Auto-set season end (12 weeks) when start changes
  useEffect(() => {
    if (seasonStart && (!seasonEnd || seasonEnd < seasonStart)) {
      setSeasonEnd(addDays(seasonStart, 84));
    }
  }, [seasonStart]);

  // Auto-select Saturdays when date range changes
  useEffect(() => {
    if (seasonStart && seasonEnd && seasonEnd >= seasonStart) {
      const satDates = getDatesForDow(seasonStart, seasonEnd, 6);
      setSelectedDates(new Set(satDates));
    }
  }, [seasonStart, seasonEnd]);

  // ── Calendar data ──

  const rangeValid = seasonStart && seasonEnd && seasonEnd >= seasonStart;
  const months = useMemo(
    () => (rangeValid ? getMonthsInRange(seasonStart, seasonEnd) : []),
    [seasonStart, seasonEnd, rangeValid],
  );
  const rangeTooLong = months.length > 12;
  const showCalendar = rangeValid && !rangeTooLong;

  // ── Team handlers ──

  function toggleTeam(id: string) {
    const next = new Set(selectedTeamIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedTeamIds(next);
  }

  function selectAllTeams() {
    setSelectedTeamIds(new Set(filteredTeams.map((t) => t.id)));
  }

  function deselectAllTeams() {
    setSelectedTeamIds(new Set());
  }

  // ── Date handlers ──

  function toggleDate(key: string) {
    const next = new Set(selectedDates);
    next.has(key) ? next.delete(key) : next.add(key);
    setSelectedDates(next);
  }

  function toggleDow(dow: number) {
    if (!rangeValid) return;
    const dowDates = getDatesForDow(seasonStart, seasonEnd, dow);
    const allSelected = dowDates.length > 0 && dowDates.every((d) => selectedDates.has(d));
    const next = new Set(selectedDates);
    if (allSelected) {
      dowDates.forEach((d) => next.delete(d));
    } else {
      dowDates.forEach((d) => next.add(d));
    }
    setSelectedDates(next);
  }

  function applyDayPreset(days: number[]) {
    if (!rangeValid) return;
    const next = new Set(selectedDates);
    // Clear dates for all days of week first, then add the preset days
    for (let dow = 0; dow <= 6; dow++) {
      getDatesForDow(seasonStart, seasonEnd, dow).forEach((d) => next.delete(d));
    }
    for (const dow of days) {
      getDatesForDow(seasonStart, seasonEnd, dow).forEach((d) => next.add(d));
    }
    setSelectedDates(next);
  }

  function selectAllDates() {
    if (!rangeValid) return;
    const all = new Set<string>();
    const s = new Date(seasonStart + 'T12:00:00');
    const e = new Date(seasonEnd + 'T12:00:00');
    const cur = new Date(s);
    while (cur <= e) {
      all.add(toDateKey(cur.getFullYear(), cur.getMonth(), cur.getDate()));
      cur.setDate(cur.getDate() + 1);
    }
    setSelectedDates(all);
  }

  function clearAllDates() {
    setSelectedDates(new Set());
  }

  // ── Time slot handlers ──

  function addTimeSlot() {
    const last = timeSlots[timeSlots.length - 1];
    const [h, m] = last.split(':').map(Number);
    const newH = Math.min(h + 2, 23);
    const newSlot = `${String(newH).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    if (timeSlots.includes(newSlot)) {
      const altH = Math.min(newH + 1, 23);
      setTimeSlots([...timeSlots, `${String(altH).padStart(2, '0')}:${String(m).padStart(2, '0')}`]);
    } else {
      setTimeSlots([...timeSlots, newSlot]);
    }
  }

  function removeTimeSlot(index: number) {
    if (timeSlots.length <= 1) return;
    setTimeSlots(timeSlots.filter((_, i) => i !== index));
  }

  function updateTimeSlot(index: number, value: string) {
    const next = [...timeSlots];
    next[index] = value;
    setTimeSlots(next);
  }

  function getSortedTimeSlots() {
    return [...timeSlots].sort();
  }

  const hasDuplicateSlots = new Set(timeSlots).size !== timeSlots.length;

  // ── Preview calculations ──

  const numTeams = selectedTeamIds.size;
  const gamesPerRound = numTeams >= 2 ? (numTeams * (numTeams - 1)) / 2 : 0;
  const totalGames = gamesPerRound * rounds;
  const gamesPerTeam = numTeams >= 2 ? (numTeams - 1) * rounds : 0;
  const slotsPerDate = timeSlots.length;
  const datesNeeded = totalGames > 0 ? Math.ceil(totalGames / slotsPerDate) : 0;
  const datesSelected = selectedDates.size;
  const totalSlots = datesSelected * slotsPerDate;
  const hasEnoughDates = totalSlots >= totalGames;

  // Sorted date array for RPC
  const sortedDates = useMemo(
    () => Array.from(selectedDates).sort(),
    [selectedDates],
  );

  // ── Form handlers ──

  function resetForm() {
    setSuccess(null);
    setError(null);
    setShowConfirm(false);
    setSeasonStart('');
    setSeasonEnd('');
    setSelectedDates(new Set());
    setRounds(1);
    setTimeSlots(['18:00']);
    setFieldId('');
    setSelectedTeamIds(new Set(filteredTeams.map((t) => t.id)));
  }

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!leagueId) { setError('Please select a league.'); return; }
    if (selectedTeamIds.size < 2) { setError('Please select at least 2 teams.'); return; }
    if (selectedDates.size === 0) { setError('Please select at least one game date on the calendar.'); return; }
    if (hasDuplicateSlots) { setError('Please remove duplicate time slots.'); return; }
    if (!hasEnoughDates && totalGames > 0) {
      setError(
        `Not enough dates selected. You need at least ${datesNeeded} date${datesNeeded !== 1 ? 's' : ''} ` +
        `with ${slotsPerDate} slot${slotsPerDate !== 1 ? 's' : ''} each to fit ${totalGames} games. ` +
        `Currently ${datesSelected} date${datesSelected !== 1 ? 's' : ''} selected.`
      );
      return;
    }

    setError(null);
    setShowConfirm(true);
  }

  async function handleConfirmGenerate() {
    setGenerating(true);
    setError(null);
    setSuccess(null);
    setShowConfirm(false);

    const supabase = createClient();
    const { data, error: rpcError } = await supabase.rpc(
      'generate_round_robin',
      {
        p_league_id: leagueId,
        p_team_ids: Array.from(selectedTeamIds),
        p_game_dates: sortedDates,
        p_time_slots: getSortedTimeSlots(),
        p_field_id: fieldId || null,
        p_rounds: rounds,
      } as any,
    );

    if (rpcError) {
      setError(rpcError.message);
      setGenerating(false);
      return;
    }

    const result = data as any;
    setSuccess(
      `Successfully created ${result.games_created} game${result.games_created !== 1 ? 's' : ''}!`
    );
    setGenerating(false);
  }

  // ── Render ──

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (leagues.length === 0) {
    return (
      <div>
        <Link
          href="/commissioner/schedule"
          className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Schedule Builder
        </Link>
        <div className="mt-4 rounded-md bg-yellow-50 p-4 text-yellow-700">
          You need to create a league with teams first.
        </div>
      </div>
    );
  }

  return (
    <div>
      <Link
        href="/commissioner/schedule"
        className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Schedule Builder
      </Link>

      <h1 className="mt-4 text-2xl font-bold text-gray-900">
        Generate Round-Robin Schedule
      </h1>
      <p className="mt-1 text-gray-600">
        Automatically create a balanced schedule where every team plays every other team.
      </p>

      {success && (
        <div className="mt-4 rounded-md bg-green-50 p-4">
          <div className="flex items-center gap-2">
            <Check className="h-5 w-5 text-green-600" />
            <p className="text-sm font-medium text-green-800">{success}</p>
          </div>
          <div className="mt-3 flex gap-3">
            <Link href="/schedule" className="text-sm font-medium text-green-700 underline hover:text-green-800">
              View Schedule
            </Link>
            <Link href="/commissioner/schedule" className="text-sm font-medium text-green-700 underline hover:text-green-800">
              Schedule Builder
            </Link>
            <button
              type="button"
              onClick={resetForm}
              className="inline-flex items-center gap-1 text-sm font-medium text-green-700 underline hover:text-green-800"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Generate Another
            </button>
          </div>
        </div>
      )}

      <form
        onSubmit={handleFormSubmit}
        className="mt-6 max-w-2xl rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
      >
        {error && (
          <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}

        {/* League */}
        <div className="mb-4">
          <label htmlFor="league" className="mb-1 block text-sm font-medium text-gray-700">
            League *
          </label>
          <select
            id="league"
            value={leagueId}
            onChange={(e) => { setLeagueId(e.target.value); setFieldId(''); }}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {leagues.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>

        {/* Teams */}
        <div className="mb-4">
          <div className="mb-1 flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">
              Teams * ({selectedTeamIds.size} of {filteredTeams.length} selected)
            </label>
            <div className="flex gap-2">
              <button type="button" onClick={selectAllTeams} className="text-xs text-blue-600 hover:text-blue-700">
                Select All
              </button>
              <button type="button" onClick={deselectAllTeams} className="text-xs text-gray-500 hover:text-gray-700">
                None
              </button>
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto rounded-md border border-gray-300 p-2">
            {filteredTeams.length === 0 ? (
              <p className="text-sm text-gray-500 p-2">No teams in this league.</p>
            ) : (
              filteredTeams.map((team) => (
                <label
                  key={team.id}
                  className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedTeamIds.has(team.id)}
                    onChange={() => toggleTeam(team.id)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-900">{team.name}</span>
                </label>
              ))
            )}
          </div>
          {numTeams >= 2 && (
            <p className="mt-1 text-xs text-gray-500">
              {numTeams} teams — {gamesPerRound} games per round
            </p>
          )}
        </div>

        {/* Rounds */}
        <div className="mb-4">
          <label htmlFor="rounds" className="mb-1 block text-sm font-medium text-gray-700">
            Number of Rounds *
          </label>
          <select
            id="rounds"
            value={rounds}
            onChange={(e) => setRounds(Number(e.target.value))}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {ROUND_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500">
            {ROUND_OPTIONS.find((o) => o.value === rounds)?.desc}
            {numTeams >= 2 && <> — {gamesPerTeam} games per team</>}
          </p>
        </div>

        {/* Season date range */}
        <div className="mb-4 grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="seasonStart" className="mb-1 block text-sm font-medium text-gray-700">
              Season Start *
            </label>
            <input
              id="seasonStart"
              type="date"
              value={seasonStart}
              onChange={(e) => setSeasonStart(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="seasonEnd" className="mb-1 block text-sm font-medium text-gray-700">
              Season End *
            </label>
            <input
              id="seasonEnd"
              type="date"
              value={seasonEnd}
              min={seasonStart || undefined}
              onChange={(e) => setSeasonEnd(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Calendar date picker */}
        {rangeTooLong && (
          <div className="mb-4 rounded-md bg-yellow-50 p-3 text-sm text-yellow-700">
            Date range cannot exceed 12 months. Please shorten the range.
          </div>
        )}

        {showCalendar && (
          <div className="mb-4">
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">
                Game Dates ({datesSelected} selected)
              </label>
              <div className="flex gap-2">
                <button type="button" onClick={selectAllDates} className="text-xs text-blue-600 hover:text-blue-700">
                  Select All
                </button>
                <button type="button" onClick={clearAllDates} className="text-xs text-gray-500 hover:text-gray-700">
                  Clear
                </button>
              </div>
            </div>

            {/* Quick-select: toggle all of a day-of-week */}
            <div className="flex flex-wrap gap-1.5 mb-1.5">
              {DAY_LABELS.map((label, dow) => {
                const dowDates = getDatesForDow(seasonStart, seasonEnd, dow);
                const allSelected = dowDates.length > 0 && dowDates.every((d) => selectedDates.has(d));
                const someSelected = !allSelected && dowDates.some((d) => selectedDates.has(d));
                return (
                  <button
                    key={dow}
                    type="button"
                    onClick={() => toggleDow(dow)}
                    className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                      allSelected
                        ? 'bg-blue-600 text-white'
                        : someSelected
                        ? 'bg-blue-200 text-blue-800'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {label}
                    <span className="ml-1 opacity-70">{dowDates.length}</span>
                  </button>
                );
              })}
            </div>

            {/* Presets */}
            <div className="flex flex-wrap gap-1.5 mb-3">
              {DAY_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => applyDayPreset(preset.days)}
                  className="rounded-full px-2.5 py-0.5 text-xs font-medium bg-gray-50 text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Month grids */}
            <div className="max-h-96 overflow-y-auto rounded-md border border-gray-200 bg-gray-50 p-3">
              <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
                {months.map(({ year, month }) => {
                  const cells = getMonthGrid(year, month);
                  return (
                    <div key={`${year}-${month}`}>
                      <p className="mb-1 text-center text-xs font-semibold text-gray-700">
                        {MONTH_NAMES[month]} {year}
                      </p>
                      <div className="grid grid-cols-7 gap-0 text-center">
                        {DAY_HEADERS.map((h, i) => (
                          <div key={i} className="py-0.5 text-[10px] text-gray-400 font-medium">
                            {h}
                          </div>
                        ))}
                        {cells.map((day, i) => {
                          if (day === null) return <div key={`e-${i}`} />;
                          const key = toDateKey(year, month, day);
                          const inRange = key >= seasonStart && key <= seasonEnd;
                          const selected = selectedDates.has(key);
                          return (
                            <button
                              key={key}
                              type="button"
                              disabled={!inRange}
                              onClick={() => toggleDate(key)}
                              className={`mx-auto h-7 w-7 rounded text-[11px] font-medium transition-colors ${
                                !inRange
                                  ? 'text-gray-300 cursor-default'
                                  : selected
                                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                                  : 'text-gray-700 hover:bg-white hover:shadow-sm'
                              }`}
                            >
                              {day}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <p className="mt-1.5 text-xs text-gray-500">
              Click dates to select/deselect. Use the day buttons above for quick patterns.
            </p>

            {numTeams >= 2 && totalGames > 0 && !hasEnoughDates && datesSelected > 0 && (
              <p className="mt-1 text-xs text-amber-600">
                Need at least {datesNeeded} dates to fit {totalGames} games
                ({slotsPerDate} slot{slotsPerDate !== 1 ? 's' : ''}/day).
                Currently {datesSelected} selected.
              </p>
            )}
          </div>
        )}

        {/* Time Slots */}
        <div className="mb-4">
          <div className="mb-1 flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">
              Time Slots ({timeSlots.length} per game day)
            </label>
            <button
              type="button"
              onClick={addTimeSlot}
              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
            >
              <Plus className="h-3 w-3" />
              Add Slot
            </button>
          </div>
          <div className="space-y-2">
            {timeSlots.map((slot, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  type="time"
                  value={slot}
                  onChange={(e) => updateTimeSlot(idx, e.target.value)}
                  className="rounded-md border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <span className="text-xs text-gray-500">Game {idx + 1}</span>
                {timeSlots.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeTimeSlot(idx)}
                    className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
          {hasDuplicateSlots && (
            <p className="mt-1 text-xs text-amber-600">
              Duplicate time slots detected — please use unique times.
            </p>
          )}
          <p className="mt-1 text-xs text-gray-500">
            Multiple time slots allow multiple games per day on the same field. Slots are auto-sorted chronologically.
          </p>
        </div>

        {/* Field */}
        <div className="mb-6">
          <label htmlFor="field" className="mb-1 block text-sm font-medium text-gray-700">
            Default Field
          </label>
          <select
            id="field"
            value={fieldId}
            onChange={(e) => setFieldId(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">No default field</option>
            {filteredFields.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500">
            Optional. Assigns all generated games to this field.
          </p>
        </div>

        {/* Preview */}
        {numTeams >= 2 && (
          <div className="mb-6 rounded-md bg-blue-50 p-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-blue-600" />
              <h4 className="text-sm font-semibold text-blue-800">Schedule Preview</h4>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm text-blue-700">
              <div>
                <span className="text-blue-500">Teams</span>
                <p className="font-medium">{numTeams}</p>
              </div>
              <div>
                <span className="text-blue-500">Rounds</span>
                <p className="font-medium">{rounds}</p>
              </div>
              <div>
                <span className="text-blue-500">Total games</span>
                <p className="font-medium">{totalGames}</p>
              </div>
              <div>
                <span className="text-blue-500">Games per team</span>
                <p className="font-medium">{gamesPerTeam}</p>
              </div>
              <div>
                <span className="text-blue-500">Slots per date</span>
                <p className="font-medium">{slotsPerDate}</p>
              </div>
              <div>
                <span className="text-blue-500">Dates needed</span>
                <p className="font-medium">{datesNeeded}</p>
              </div>
            </div>
            {datesSelected > 0 && (
              <div className="mt-3 border-t border-blue-200 pt-3 text-sm text-blue-700">
                <p>
                  <span className="text-blue-500">Dates selected:</span>{' '}
                  <span className="font-medium">{datesSelected}</span>
                  {hasEnoughDates ? (
                    <span className="ml-2 text-green-600">
                      ({totalSlots} slots available for {totalGames} games)
                    </span>
                  ) : (
                    <span className="ml-2 text-amber-600">
                      (need {datesNeeded - datesSelected} more)
                    </span>
                  )}
                </p>
                {sortedDates.length > 0 && (
                  <p className="mt-1">
                    <span className="text-blue-500">First game:</span>{' '}
                    {new Date(sortedDates[0] + 'T12:00:00').toLocaleDateString('en-US', {
                      weekday: 'short', month: 'short', day: 'numeric',
                    })}
                    {' — '}
                    <span className="text-blue-500">Last game:</span>{' '}
                    {new Date(sortedDates[sortedDates.length - 1] + 'T12:00:00').toLocaleDateString('en-US', {
                      weekday: 'short', month: 'short', day: 'numeric',
                    })}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Confirmation dialog */}
        {showConfirm && (
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
              <div>
                <p className="text-sm font-medium text-amber-800">
                  Ready to generate {totalGames} game{totalGames !== 1 ? 's' : ''}?
                </p>
                <p className="mt-1 text-xs text-amber-700">
                  This will create {totalGames} games across {datesSelected} date{datesSelected !== 1 ? 's' : ''}.
                  {' '}This action cannot be easily undone.
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={handleConfirmGenerate}
                    disabled={generating}
                    className="inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                  >
                    <Wand2 className="h-3.5 w-3.5" />
                    {generating ? 'Generating...' : 'Yes, Generate'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowConfirm(false)}
                    disabled={generating}
                    className="rounded-md border border-amber-300 px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {!showConfirm && (
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={generating || !!success}
              className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
            >
              <Wand2 className="h-4 w-4" />
              {generating ? 'Generating...' : 'Generate Schedule'}
            </button>
            <Link
              href="/commissioner/schedule"
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </Link>
          </div>
        )}
      </form>
    </div>
  );
}
