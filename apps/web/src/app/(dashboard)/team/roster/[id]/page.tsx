import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { ArrowLeft, Mail, Phone } from 'lucide-react';
import {
  POSITIONS,
  ROSTER_STATUS_LABELS,
  ROSTER_STATUS_COLORS,
} from '@batters-up/shared';
import type { RosterStatus } from '@batters-up/shared';

export default async function PlayerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  // Fetch the roster entry with team and profile info
  const { data: entry } = await supabase
    .from('roster_entries')
    .select('*')
    .eq('id', id)
    .single();

  if (!entry) notFound();

  // Fetch team info
  const { data: team } = await supabase
    .from('teams')
    .select('id, name, color, league_id')
    .eq('id', entry.team_id)
    .single();

  // Fetch player profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', entry.player_user_id)
    .single();

  if (!profile) notFound();

  const status = entry.status as RosterStatus;
  const statusColors = ROSTER_STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-800';
  const positionLabel = entry.position
    ? POSITIONS[entry.position as keyof typeof POSITIONS] ?? entry.position
    : null;

  return (
    <div>
      <Link
        href={`/team/roster${team ? `?team=${team.id}` : ''}`}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Roster
      </Link>

      <div className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        {/* Header */}
        <div className="border-b border-gray-200 bg-gray-50 px-6 py-4">
          <div className="flex items-center gap-4">
            {/* Avatar */}
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-200 text-xl font-bold text-gray-500">
              {profile.full_name
                ? profile.full_name
                    .split(' ')
                    .map((n: string) => n[0])
                    .join('')
                    .toUpperCase()
                    .slice(0, 2)
                : '?'}
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                {profile.full_name || profile.email}
              </h1>
              {team && (
                <div className="mt-0.5 flex items-center gap-2">
                  {team.color && (
                    <div
                      className="h-3 w-3 rounded-full border border-gray-200"
                      style={{ backgroundColor: team.color }}
                    />
                  )}
                  <span className="text-sm text-gray-600">{team.name}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Details */}
        <div className="grid gap-6 px-6 py-6 sm:grid-cols-2">
          {/* Jersey Number */}
          <div>
            <dt className="text-xs font-medium uppercase tracking-wider text-gray-500">
              Jersey Number
            </dt>
            <dd className="mt-1 text-2xl font-bold text-gray-900">
              {entry.jersey_number != null ? `#${entry.jersey_number}` : '—'}
            </dd>
          </div>

          {/* Position */}
          <div>
            <dt className="text-xs font-medium uppercase tracking-wider text-gray-500">
              Position
            </dt>
            <dd className="mt-1 text-lg font-semibold text-gray-900">
              {positionLabel
                ? `${entry.position} — ${positionLabel}`
                : '—'}
            </dd>
          </div>

          {/* Status */}
          <div>
            <dt className="text-xs font-medium uppercase tracking-wider text-gray-500">
              Status
            </dt>
            <dd className="mt-1">
              <span
                className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${statusColors}`}
              >
                {ROSTER_STATUS_LABELS[status] ?? status}
              </span>
            </dd>
          </div>

          {/* Added to Roster */}
          <div>
            <dt className="text-xs font-medium uppercase tracking-wider text-gray-500">
              Added to Roster
            </dt>
            <dd className="mt-1 text-sm text-gray-900">
              {new Date(entry.created_at).toLocaleDateString()}
            </dd>
          </div>

          {/* Contact */}
          <div className="sm:col-span-2">
            <dt className="text-xs font-medium uppercase tracking-wider text-gray-500">
              Contact
            </dt>
            <dd className="mt-2 space-y-1">
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <Mail className="h-4 w-4 text-gray-400" />
                {profile.email}
              </div>
              {profile.phone && (
                <div className="flex items-center gap-2 text-sm text-gray-700">
                  <Phone className="h-4 w-4 text-gray-400" />
                  {profile.phone}
                </div>
              )}
            </dd>
          </div>

          {/* Notes */}
          {entry.notes && (
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium uppercase tracking-wider text-gray-500">
                Notes
              </dt>
              <dd className="mt-1 text-sm text-gray-700">{entry.notes}</dd>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
