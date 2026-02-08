'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { ArrowLeft } from 'lucide-react';

interface LeagueOption {
  id: string;
  name: string;
}

interface TeamOption {
  id: string;
  name: string;
  league_id: string;
}

interface FieldOption {
  id: string;
  name: string;
  league_id: string;
  diamond_count: number;
}

export default function NewGamePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialLeague = searchParams.get('league') ?? '';

  const [leagues, setLeagues] = useState<LeagueOption[]>([]);
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [fields, setFields] = useState<FieldOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [leagueId, setLeagueId] = useState(initialLeague);
  const [homeTeamId, setHomeTeamId] = useState('');
  const [awayTeamId, setAwayTeamId] = useState('');
  const [fieldId, setFieldId] = useState('');
  const [diamondNumber, setDiamondNumber] = useState<number | ''>('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('18:00');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    async function loadData() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      // Get commissioner leagues
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
        .select('id, name, league_id, diamond_count')
        .in('league_id', leagueIds)
        .order('name');

      const ll = (leagueData ?? []) as LeagueOption[];
      setLeagues(ll);
      setTeams((teamData ?? []) as TeamOption[]);
      setFields((fieldData ?? []) as FieldOption[]);

      if (!initialLeague && ll.length > 0) {
        setLeagueId(ll[0].id);
      }

      setLoading(false);
    }
    loadData();
  }, [initialLeague]);

  const filteredTeams = teams.filter((t) => t.league_id === leagueId);
  const filteredFields = fields.filter((f) => f.league_id === leagueId);
  const selectedField = fields.find((f) => f.id === fieldId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!leagueId || !homeTeamId || !awayTeamId || !date || !time) {
      setError('Please fill in all required fields.');
      return;
    }
    if (homeTeamId === awayTeamId) {
      setError('Home and away teams must be different.');
      return;
    }

    setSaving(true);
    setError(null);

    const scheduledAt = new Date(`${date}T${time}`).toISOString();

    const supabase = createClient();
    const { data, error: rpcError } = await supabase.rpc('create_game', {
      p_league_id: leagueId,
      p_home_team_id: homeTeamId,
      p_away_team_id: awayTeamId,
      p_field_id: fieldId || null,
      p_diamond_number: diamondNumber === '' ? null : diamondNumber,
      p_scheduled_at: scheduledAt,
      p_notes: notes.trim() || null,
    });

    if (rpcError) {
      setError(rpcError.message);
      setSaving(false);
      return;
    }

    router.push('/commissioner/schedule');
    router.refresh();
  }

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
          You need to create a league first before scheduling games.
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

      <h1 className="mt-4 text-2xl font-bold text-gray-900">Create Game</h1>
      <p className="mt-1 text-gray-600">Schedule a new game.</p>

      <form
        onSubmit={handleSubmit}
        className="mt-6 max-w-lg rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
      >
        {error && (
          <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* League */}
        <div className="mb-4">
          <label htmlFor="league" className="mb-1 block text-sm font-medium text-gray-700">
            League *
          </label>
          <select
            id="league"
            value={leagueId}
            onChange={(e) => {
              setLeagueId(e.target.value);
              setHomeTeamId('');
              setAwayTeamId('');
              setFieldId('');
            }}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">Select a league</option>
            {leagues.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>

        {/* Home Team */}
        <div className="mb-4">
          <label htmlFor="homeTeam" className="mb-1 block text-sm font-medium text-gray-700">
            Home Team *
          </label>
          <select
            id="homeTeam"
            value={homeTeamId}
            onChange={(e) => setHomeTeamId(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">Select home team</option>
            {filteredTeams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        {/* Away Team */}
        <div className="mb-4">
          <label htmlFor="awayTeam" className="mb-1 block text-sm font-medium text-gray-700">
            Away Team *
          </label>
          <select
            id="awayTeam"
            value={awayTeamId}
            onChange={(e) => setAwayTeamId(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">Select away team</option>
            {filteredTeams
              .filter((t) => t.id !== homeTeamId)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
          </select>
        </div>

        {/* Date */}
        <div className="mb-4">
          <label htmlFor="date" className="mb-1 block text-sm font-medium text-gray-700">
            Date *
          </label>
          <input
            id="date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            required
          />
        </div>

        {/* Time */}
        <div className="mb-4">
          <label htmlFor="time" className="mb-1 block text-sm font-medium text-gray-700">
            Time *
          </label>
          <input
            id="time"
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            required
          />
        </div>

        {/* Field */}
        <div className="mb-4">
          <label htmlFor="field" className="mb-1 block text-sm font-medium text-gray-700">
            Field
          </label>
          <select
            id="field"
            value={fieldId}
            onChange={(e) => {
              setFieldId(e.target.value);
              setDiamondNumber('');
            }}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">No field assigned</option>
            {filteredFields.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name} ({f.diamond_count} diamond{f.diamond_count !== 1 ? 's' : ''})
              </option>
            ))}
          </select>
        </div>

        {/* Diamond Number */}
        {selectedField && selectedField.diamond_count > 1 && (
          <div className="mb-4">
            <label htmlFor="diamond" className="mb-1 block text-sm font-medium text-gray-700">
              Diamond #
            </label>
            <select
              id="diamond"
              value={diamondNumber}
              onChange={(e) =>
                setDiamondNumber(e.target.value === '' ? '' : Number(e.target.value))
              }
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Any</option>
              {Array.from({ length: selectedField.diamond_count }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  Diamond {i + 1}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Notes */}
        <div className="mb-6">
          <label htmlFor="notes" className="mb-1 block text-sm font-medium text-gray-700">
            Notes
          </label>
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="Optional notes about this game..."
          />
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
          >
            {saving ? 'Creating...' : 'Create Game'}
          </button>
          <Link
            href="/commissioner/schedule"
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
