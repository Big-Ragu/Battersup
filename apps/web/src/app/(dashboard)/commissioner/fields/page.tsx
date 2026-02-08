import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { MapPin, Plus, Pencil } from 'lucide-react';

export default async function FieldsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Get leagues where user is commissioner
  const { data: commissionerRoles } = await supabase
    .from('user_roles')
    .select('league_id')
    .eq('user_id', user!.id)
    .eq('role', 'commissioner');

  const leagueIds = commissionerRoles?.map((r) => r.league_id) ?? [];

  // Fetch leagues for display
  const { data: leagues } = leagueIds.length > 0
    ? await supabase
        .from('leagues')
        .select('id, name')
        .in('id', leagueIds)
        .order('name')
    : { data: [] };

  // Fetch all fields
  const { data: fields } = leagueIds.length > 0
    ? await supabase
        .from('fields')
        .select('*')
        .in('league_id', leagueIds)
        .order('name')
    : { data: [] };

  const leagueMap: Record<string, string> = {};
  leagues?.forEach((l) => {
    leagueMap[l.id] = l.name;
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Fields</h1>
          <p className="mt-1 text-gray-600">Manage fields across your leagues.</p>
        </div>
        <Link
          href="/commissioner/fields/new"
          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Add Field
        </Link>
      </div>

      {!fields || fields.length === 0 ? (
        <div className="mt-8 rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
          <MapPin className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">
            No fields yet
          </h3>
          <p className="mt-2 text-gray-600">
            {leagueIds.length === 0
              ? 'Create a league first, then add fields.'
              : 'Add your first field to get started.'}
          </p>
          {leagueIds.length > 0 && (
            <Link
              href="/commissioner/fields/new"
              className="mt-4 inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              Add Field
            </Link>
          )}
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {fields.map((field) => (
            <div
              key={field.id}
              className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
            >
              <h3 className="font-semibold text-gray-900">{field.name}</h3>
              <p className="mt-1 text-sm text-gray-500">
                {leagueMap[field.league_id] || 'Unknown League'}
              </p>
              {field.address && (
                <p className="mt-2 text-sm text-gray-600">{field.address}</p>
              )}
              <div className="mt-3 flex items-center justify-between">
                <span className="text-sm text-gray-500">
                  {field.diamond_count} diamond{field.diamond_count !== 1 ? 's' : ''}
                </span>
                <Link
                  href={`/commissioner/fields/${field.id}/edit`}
                  className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </Link>
              </div>
              {field.notes && (
                <p className="mt-2 text-xs text-gray-400 line-clamp-2">
                  {field.notes}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
