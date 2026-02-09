'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { League } from '@batters-up/shared';
import { ArrowLeft } from 'lucide-react';

export default function EditLeaguePage() {
  const router = useRouter();
  const params = useParams();
  const leagueId = params.id as string;

  const [league, setLeague] = useState<League | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [seasonYear, setSeasonYear] = useState(new Date().getFullYear());
  const [status, setStatus] = useState<'draft' | 'active' | 'completed'>('draft');
  const [allowReentry, setAllowReentry] = useState(false);
  const [inningsPerGame, setInningsPerGame] = useState(9);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    async function loadLeague() {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('leagues')
        .select('*')
        .eq('id', leagueId)
        .single();

      if (error || !data) {
        setMessage({ type: 'error', text: 'League not found.' });
        setLoading(false);
        return;
      }

      const leagueData = data as League;
      setLeague(leagueData);
      setName(leagueData.name);
      setDescription(leagueData.description || '');
      setSeasonYear(leagueData.season_year);
      setStatus(leagueData.status);
      setAllowReentry(leagueData.allow_reentry ?? false);
      setInningsPerGame(leagueData.innings_per_game ?? 9);
      setLoading(false);
    }
    loadLeague();
  }, [leagueId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setMessage({ type: 'error', text: 'League name is required.' });
      return;
    }

    setSaving(true);
    setMessage(null);

    const supabase = createClient();
    const { error } = await supabase
      .from('leagues')
      .update({
        name: name.trim(),
        description: description.trim() || null,
        season_year: seasonYear,
        status,
        allow_reentry: allowReentry,
        innings_per_game: inningsPerGame,
      })
      .eq('id', leagueId);

    if (error) {
      setMessage({ type: 'error', text: error.message });
    } else {
      setMessage({ type: 'success', text: 'League updated successfully.' });
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Loading league...</div>
      </div>
    );
  }

  if (!league) {
    return (
      <div>
        <Link
          href="/commissioner/leagues"
          className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Leagues
        </Link>
        <div className="mt-4 rounded-md bg-red-50 p-4 text-red-700">
          League not found.
        </div>
      </div>
    );
  }

  return (
    <div>
      <Link
        href="/commissioner/leagues"
        className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Leagues
      </Link>

      <h1 className="mt-4 text-2xl font-bold text-gray-900">Edit League</h1>
      <p className="mt-1 text-gray-600">Update league details.</p>

      <form
        onSubmit={handleSubmit}
        className="mt-6 max-w-lg rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
      >
        {message && (
          <div
            className={`mb-4 rounded-md p-3 text-sm ${
              message.type === 'success'
                ? 'bg-green-50 text-green-700'
                : 'bg-red-50 text-red-700'
            }`}
          >
            {message.text}
          </div>
        )}

        <div className="mb-4">
          <label
            htmlFor="name"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            League Name *
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            required
          />
        </div>

        <div className="mb-4">
          <label
            htmlFor="description"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Description
          </label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="mb-4">
          <label
            htmlFor="seasonYear"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Season Year
          </label>
          <input
            id="seasonYear"
            type="number"
            value={seasonYear}
            onChange={(e) => setSeasonYear(parseInt(e.target.value, 10))}
            min={2020}
            max={2099}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="mb-4">
          <label
            htmlFor="status"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Status
          </label>
          <select
            id="status"
            value={status}
            onChange={(e) =>
              setStatus(e.target.value as 'draft' | 'active' | 'completed')
            }
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
          </select>
        </div>

        <div className="mb-4">
          <label
            htmlFor="inningsPerGame"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Innings per Game
          </label>
          <input
            id="inningsPerGame"
            type="number"
            value={inningsPerGame}
            onChange={(e) => setInningsPerGame(parseInt(e.target.value, 10) || 9)}
            min={1}
            max={15}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <p className="mt-1 text-xs text-gray-500">
            Standard baseball is 9 innings. Youth leagues commonly play 6 or 7.
          </p>
        </div>

        <div className="mb-6">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={allowReentry}
              onChange={(e) => setAllowReentry(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <div>
              <span className="text-sm font-medium text-gray-700">
                Allow free re-entry
              </span>
              <p className="text-xs text-gray-500">
                Players can re-enter the game after being replaced (common in rec and youth leagues).
              </p>
            </div>
          </label>
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          <Link
            href="/commissioner/leagues"
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
