import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import type { Role } from '@batters-up/shared';
import { ROLE_LABELS } from '@batters-up/shared';

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user!.id)
    .single();

  const { data: userRoles, error: rolesError } = await supabase
    .from('user_roles')
    .select('role, league_id, team_id')
    .eq('user_id', user!.id);

  const roles: Role[] = userRoles
    ? [...new Set(userRoles.map((ur) => ur.role as Role))]
    : [];

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">
        Welcome, {profile?.full_name || 'there'}!
      </h1>
      <p className="mt-1 text-gray-600">
        Here&apos;s your BattersUp dashboard.
      </p>

      {roles.length === 0 ? (
        <div className="mt-8 rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
          <h3 className="text-lg font-medium text-gray-900">
            No league membership yet
          </h3>
          <p className="mt-2 text-gray-600">
            Ask your league commissioner for a signup code to join a league, or
            create your own league as a commissioner.
          </p>
          <div className="mt-4 flex justify-center gap-3">
            <Link
              href="/join"
              className="inline-flex rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Join a League
            </Link>
            <Link
              href="/commissioner/leagues/new"
              className="inline-flex rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Create a League
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {roles.map((role) => (
              <div
                key={role}
                className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
              >
                <h3 className="font-semibold text-gray-900">
                  {ROLE_LABELS[role]}
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  You are registered as a {role} in{' '}
                  {userRoles?.filter((ur) => ur.role === role).length} league(s)
                </p>
              </div>
            ))}
          </div>
          <div className="mt-4">
            <Link
              href="/join"
              className="text-sm font-medium text-blue-600 hover:text-blue-500"
            >
              Join another league
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
