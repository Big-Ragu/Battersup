import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Trophy, Users, MapPin, Key, Plus } from 'lucide-react';

export default async function CommissionerOverviewPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Get commissioner league IDs
  const { data: commissionerRoles } = await supabase
    .from('user_roles')
    .select('league_id')
    .eq('user_id', user!.id)
    .eq('role', 'commissioner');

  const leagueIds = commissionerRoles?.map((r) => r.league_id) ?? [];

  // Fetch counts in parallel
  const [leaguesRes, teamsRes, fieldsRes, codesRes] = await Promise.all([
    leagueIds.length > 0
      ? supabase.from('leagues').select('id').in('id', leagueIds)
      : Promise.resolve({ data: [] }),
    leagueIds.length > 0
      ? supabase.from('teams').select('id').in('league_id', leagueIds)
      : Promise.resolve({ data: [] }),
    leagueIds.length > 0
      ? supabase.from('fields').select('id').in('league_id', leagueIds)
      : Promise.resolve({ data: [] }),
    leagueIds.length > 0
      ? supabase.from('signup_codes').select('id, expires_at, max_uses, use_count').in('league_id', leagueIds)
      : Promise.resolve({ data: [] }),
  ]);

  const leagueCount = leaguesRes.data?.length ?? 0;
  const teamCount = teamsRes.data?.length ?? 0;
  const fieldCount = fieldsRes.data?.length ?? 0;

  const now = new Date();
  const activeCodes = (codesRes.data ?? []).filter((c) => {
    if (c.expires_at && new Date(c.expires_at) < now) return false;
    if (c.max_uses && c.use_count >= c.max_uses) return false;
    return true;
  }).length;

  const stats = [
    {
      label: 'Leagues',
      count: leagueCount,
      icon: Trophy,
      href: '/commissioner/leagues',
      color: 'text-yellow-600 bg-yellow-50',
    },
    {
      label: 'Teams',
      count: teamCount,
      icon: Users,
      href: '/commissioner/teams',
      color: 'text-blue-600 bg-blue-50',
    },
    {
      label: 'Fields',
      count: fieldCount,
      icon: MapPin,
      href: '/commissioner/fields',
      color: 'text-green-600 bg-green-50',
    },
    {
      label: 'Active Codes',
      count: activeCodes,
      icon: Key,
      href: '/commissioner/codes',
      color: 'text-purple-600 bg-purple-50',
    },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Commissioner Dashboard</h1>
      <p className="mt-1 text-gray-600">
        Manage your leagues, teams, fields, and signup codes.
      </p>

      {/* Stats Grid */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="flex items-center gap-4">
              <div className={`rounded-lg p-3 ${stat.color}`}>
                <stat.icon className="h-6 w-6" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stat.count}</p>
                <p className="text-sm text-gray-500">{stat.label}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900">Quick Actions</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Link
            href="/commissioner/leagues/new"
            className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Plus className="h-5 w-5 text-gray-400" />
            Create League
          </Link>
          <Link
            href="/commissioner/teams/new"
            className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Plus className="h-5 w-5 text-gray-400" />
            Add Team
          </Link>
          <Link
            href="/commissioner/fields/new"
            className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Plus className="h-5 w-5 text-gray-400" />
            Add Field
          </Link>
          <Link
            href="/commissioner/codes/new"
            className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Plus className="h-5 w-5 text-gray-400" />
            Generate Code
          </Link>
        </div>
      </div>
    </div>
  );
}
