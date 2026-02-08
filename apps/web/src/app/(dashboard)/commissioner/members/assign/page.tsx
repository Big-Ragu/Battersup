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

export default function AssignRolePage() {
  const router = useRouter();
  const [leagues, setLeagues] = useState<LeagueOption[]>([]);
  const [allTeams, setAllTeams] = useState<TeamOption[]>([]);
  const [leagueId, setLeagueId] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('player');
  const [teamId, setTeamId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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
    if (!leagueId || !email.trim()) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    const supabase = createClient();
    const { data, error: rpcError } = await supabase.rpc('commissioner_assign_role', {
      p_league_id: leagueId,
      p_user_email: email.trim(),
      p_role: role,
      p_team_id: teamId || null,
    });

    if (rpcError) {
      setError(rpcError.message);
      setSaving(false);
      return;
    }

    const result = data as { league_name: string; role: string };
    setSuccess(
      `Successfully assigned ${role} role in ${result.league_name} to ${email.trim()}.`
    );
    setEmail('');
    setSaving(false);
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
          href="/commissioner/members"
          className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Members
        </Link>
        <div className="mt-4 rounded-md bg-yellow-50 p-4 text-yellow-700">
          You need to create a league first.
        </div>
      </div>
    );
  }

  return (
    <div>
      <Link
        href="/commissioner/members"
        className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Members
      </Link>

      <h1 className="mt-4 text-2xl font-bold text-gray-900">Assign Role</h1>
      <p className="mt-1 text-gray-600">
        Manually assign a role to a registered user by their email address.
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
        {success && (
          <div className="mb-4 rounded-md bg-green-50 p-3 text-sm text-green-700">
            {success}
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
            htmlFor="email"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            User Email *
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="user@example.com"
          />
          <p className="mt-1 text-xs text-gray-500">
            The user must already have a BattersUp account.
          </p>
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

        <div className="mb-6">
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

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
          >
            {saving ? 'Assigning...' : 'Assign Role'}
          </button>
          <Link
            href="/commissioner/members"
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
