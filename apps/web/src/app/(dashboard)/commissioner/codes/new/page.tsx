'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { ArrowLeft } from 'lucide-react';
import type { Role } from '@batters-up/shared';

interface LeagueOption {
  id: string;
  name: string;
}

interface TeamOption {
  id: string;
  name: string;
  league_id: string;
}

const ASSIGNABLE_ROLES: { value: Role; label: string }[] = [
  { value: 'manager', label: 'Manager' },
  { value: 'coach', label: 'Coach' },
  { value: 'player', label: 'Player' },
  { value: 'parent', label: 'Parent' },
  { value: 'fan', label: 'Fan' },
];

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'BU-';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export default function NewCodePage() {
  const router = useRouter();
  const [leagues, setLeagues] = useState<LeagueOption[]>([]);
  const [allTeams, setAllTeams] = useState<TeamOption[]>([]);
  const [leagueId, setLeagueId] = useState('');
  const [role, setRole] = useState<Role>('player');
  const [teamId, setTeamId] = useState('');
  const [maxUses, setMaxUses] = useState<number | ''>('');
  const [expiresInDays, setExpiresInDays] = useState<number | ''>('');
  const [code, setCode] = useState(generateCode());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

      const [leaguesRes, teamsRes] = await Promise.all([
        supabase
          .from('leagues')
          .select('id, name')
          .in('id', leagueIds)
          .order('name'),
        supabase
          .from('teams')
          .select('id, name, league_id')
          .in('league_id', leagueIds)
          .order('name'),
      ]);

      const leagueList = (leaguesRes.data ?? []) as LeagueOption[];
      setLeagues(leagueList);
      setAllTeams((teamsRes.data ?? []) as TeamOption[]);

      if (leagueList.length > 0) {
        setLeagueId(leagueList[0].id);
      }
      setLoading(false);
    }
    loadData();
  }, []);

  const filteredTeams = allTeams.filter((t) => t.league_id === leagueId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!leagueId) {
      setError('Please select a league.');
      return;
    }

    setSaving(true);
    setError(null);

    let expiresAt: string | null = null;
    if (expiresInDays && expiresInDays > 0) {
      const date = new Date();
      date.setDate(date.getDate() + expiresInDays);
      expiresAt = date.toISOString();
    }

    const supabase = createClient();
    const { error: insertError } = await supabase.from('signup_codes').insert({
      league_id: leagueId,
      code,
      role,
      team_id: teamId || null,
      max_uses: maxUses || null,
      expires_at: expiresAt,
    });

    if (insertError) {
      // If code already exists, regenerate
      if (insertError.message.includes('unique') || insertError.message.includes('duplicate')) {
        setCode(generateCode());
        setError('Code already exists. A new code has been generated. Try again.');
      } else {
        setError(insertError.message);
      }
      setSaving(false);
      return;
    }

    router.push('/commissioner/codes');
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
          href="/commissioner/codes"
          className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Codes
        </Link>
        <div className="mt-4 rounded-md bg-yellow-50 p-4 text-yellow-700">
          You need to create a league first before generating codes.{' '}
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
        href="/commissioner/codes"
        className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Codes
      </Link>

      <h1 className="mt-4 text-2xl font-bold text-gray-900">Generate Signup Code</h1>
      <p className="mt-1 text-gray-600">
        Create a code that users can use to join your league with a specific role.
      </p>

      <form
        onSubmit={handleSubmit}
        className="mt-6 max-w-lg rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
      >
        {error && (
          <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Generated Code Display */}
        <div className="mb-6 rounded-md bg-gray-50 p-4 text-center">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
            Generated Code
          </p>
          <p className="mt-1 font-mono text-2xl font-bold text-gray-900">
            {code}
          </p>
          <button
            type="button"
            onClick={() => setCode(generateCode())}
            className="mt-2 text-xs text-blue-600 hover:text-blue-700"
          >
            Regenerate
          </button>
        </div>

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
            onChange={(e) => {
              setLeagueId(e.target.value);
              setTeamId('');
            }}
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
            htmlFor="role"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Role *
          </label>
          <select
            id="role"
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {ASSIGNABLE_ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        <div className="mb-4">
          <label
            htmlFor="team"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Team (optional)
          </label>
          <select
            id="team"
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">No specific team</option>
            {filteredTeams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </div>

        <div className="mb-4">
          <label
            htmlFor="maxUses"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Max Uses (optional)
          </label>
          <input
            id="maxUses"
            type="number"
            value={maxUses}
            onChange={(e) =>
              setMaxUses(e.target.value ? parseInt(e.target.value, 10) : '')
            }
            min={1}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="Unlimited"
          />
        </div>

        <div className="mb-6">
          <label
            htmlFor="expiresInDays"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Expires In (days, optional)
          </label>
          <input
            id="expiresInDays"
            type="number"
            value={expiresInDays}
            onChange={(e) =>
              setExpiresInDays(
                e.target.value ? parseInt(e.target.value, 10) : ''
              )
            }
            min={1}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="Never expires"
          />
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
          >
            {saving ? 'Creating...' : 'Create Code'}
          </button>
          <Link
            href="/commissioner/codes"
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
