'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { ArrowLeft } from 'lucide-react';

interface LeagueOption {
  id: string;
  name: string;
}

export default function NewFieldPage() {
  const router = useRouter();
  const [leagues, setLeagues] = useState<LeagueOption[]>([]);
  const [leagueId, setLeagueId] = useState('');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [diamondCount, setDiamondCount] = useState(1);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadLeagues() {
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

      const { data } = await supabase
        .from('leagues')
        .select('id, name')
        .in('id', leagueIds)
        .order('name');

      const leagueList = (data ?? []) as LeagueOption[];
      setLeagues(leagueList);
      if (leagueList.length > 0) {
        setLeagueId(leagueList[0].id);
      }
      setLoading(false);
    }
    loadLeagues();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Field name is required.');
      return;
    }
    if (!leagueId) {
      setError('Please select a league.');
      return;
    }

    setSaving(true);
    setError(null);

    const supabase = createClient();
    const { error: insertError } = await supabase.from('fields').insert({
      league_id: leagueId,
      name: name.trim(),
      address: address.trim() || null,
      diamond_count: diamondCount,
      notes: notes.trim() || null,
    });

    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }

    router.push('/commissioner/fields');
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
          href="/commissioner/fields"
          className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Fields
        </Link>
        <div className="mt-4 rounded-md bg-yellow-50 p-4 text-yellow-700">
          You need to create a league first before adding fields.{' '}
          <Link href="/commissioner/leagues/new" className="font-medium underline">
            Create a league
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Link
        href="/commissioner/fields"
        className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Fields
      </Link>

      <h1 className="mt-4 text-2xl font-bold text-gray-900">Add Field</h1>
      <p className="mt-1 text-gray-600">Add a new field to one of your leagues.</p>

      <form
        onSubmit={handleSubmit}
        className="mt-6 max-w-lg rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
      >
        {error && (
          <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mb-4">
          <label
            htmlFor="league"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            League *
          </label>
          <select
            id="league"
            value={leagueId}
            onChange={(e) => setLeagueId(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {leagues.map((league) => (
              <option key={league.id} value={league.id}>
                {league.name}
              </option>
            ))}
          </select>
        </div>

        <div className="mb-4">
          <label
            htmlFor="name"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Field Name *
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="e.g. Riverside Park Diamond"
            required
          />
        </div>

        <div className="mb-4">
          <label
            htmlFor="address"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Address
          </label>
          <input
            id="address"
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="123 Main St, Springfield, IL"
          />
        </div>

        <div className="mb-4">
          <label
            htmlFor="diamondCount"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Number of Diamonds
          </label>
          <input
            id="diamondCount"
            type="number"
            value={diamondCount}
            onChange={(e) => setDiamondCount(parseInt(e.target.value, 10) || 1)}
            min={1}
            max={20}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="mb-6">
          <label
            htmlFor="notes"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Notes
          </label>
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="Parking info, field conditions, etc."
          />
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
          >
            {saving ? 'Adding...' : 'Add Field'}
          </button>
          <Link
            href="/commissioner/fields"
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
