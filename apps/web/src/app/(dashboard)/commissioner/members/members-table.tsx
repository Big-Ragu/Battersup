'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Trash2, Save } from 'lucide-react';

interface TeamOption {
  id: string;
  name: string;
}

interface Member {
  role_id: string;
  user_id: string;
  league_id: string;
  league_name: string;
  team_id: string | null;
  team_name: string | null;
  role: string;
  full_name: string;
  email: string;
  assigned_at: string;
}

interface PendingChange {
  team_id?: string;
  role?: string;
}

const ASSIGNABLE_ROLES = [
  { value: 'manager', label: 'Manager' },
  { value: 'coach', label: 'Coach' },
  { value: 'player', label: 'Player' },
  { value: 'parent', label: 'Parent' },
  { value: 'fan', label: 'Fan' },
];

interface MembersTableProps {
  leagueId: string;
  leagueName: string;
  members: Member[];
  teams: TeamOption[];
  currentUserId: string;
}

export function MembersTable({
  leagueId,
  leagueName,
  members,
  teams,
  currentUserId,
}: MembersTableProps) {
  const router = useRouter();

  // Track pending changes per roleId: { team_id?, role? }
  const [pendingChanges, setPendingChanges] = useState<Map<string, PendingChange>>(new Map());
  const [saving, setSaving] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const changeCount = Array.from(pendingChanges.values()).reduce((count, change) => {
    return count + (change.team_id !== undefined ? 1 : 0) + (change.role !== undefined ? 1 : 0);
  }, 0);
  const hasChanges = changeCount > 0;

  function handleFieldChange(
    roleId: string,
    field: 'team_id' | 'role',
    originalValue: string,
    newValue: string,
  ) {
    setPendingChanges((prev) => {
      const next = new Map(prev);
      const existing = next.get(roleId) ?? {};

      if (newValue === originalValue) {
        // Revert this field
        const { [field]: _, ...rest } = existing;
        if (Object.keys(rest).length === 0) {
          next.delete(roleId);
        } else {
          next.set(roleId, rest);
        }
      } else {
        next.set(roleId, { ...existing, [field]: newValue });
      }

      return next;
    });
  }

  function getDisplayValue(roleId: string, field: 'team_id' | 'role', originalValue: string): string {
    const change = pendingChanges.get(roleId);
    if (change && change[field] !== undefined) {
      return change[field]!;
    }
    return originalValue;
  }

  function isRowChanged(roleId: string): boolean {
    const change = pendingChanges.get(roleId);
    return change !== undefined && (change.team_id !== undefined || change.role !== undefined);
  }

  async function handleSave() {
    if (!hasChanges) return;
    setSaving(true);

    const supabase = createClient();
    const updates = Array.from(pendingChanges.entries())
      .filter(([_, change]) => change.team_id !== undefined || change.role !== undefined)
      .map(([roleId, change]) =>
        supabase.rpc('commissioner_update_user_role', {
          p_role_id: roleId,
          p_team_id: change.team_id && change.team_id !== '' ? change.team_id : null,
          p_role: change.role ?? null,
          p_clear_team: change.team_id === '',
        })
      );

    const results = await Promise.all(updates);
    const errors = results.filter((r) => r.error);

    if (errors.length > 0) {
      alert(`Failed to save ${errors.length} change(s). Please try again.`);
    }

    setPendingChanges(new Map());
    setSaving(false);
    router.refresh();
  }

  async function handleRemove(roleId: string) {
    setRemovingId(roleId);
    const supabase = createClient();
    const { error } = await supabase.rpc('commissioner_delete_user_role', {
      p_role_id: roleId,
    });

    if (error) {
      alert(`Failed to remove member: ${error.message}`);
    }

    setConfirmingRemove(null);
    setRemovingId(null);
    router.refresh();
  }

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">{leagueName}</h2>
        {hasChanges && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Saving...' : `Save Changes (${changeCount})`}
          </button>
        )}
      </div>
      <div className="mt-2 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Name
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Email
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Role
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Team
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Joined
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {members.map((member) => {
              const displayTeamId = getDisplayValue(member.role_id, 'team_id', member.team_id ?? '');
              const displayRole = getDisplayValue(member.role_id, 'role', member.role);
              const isChanged = isRowChanged(member.role_id);
              const isSelf = member.user_id === currentUserId;
              const isCommissioner = member.role === 'commissioner';

              return (
                <tr key={member.role_id} className={isChanged ? 'bg-yellow-50' : undefined}>
                  <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">
                    {member.full_name || '—'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                    {member.email}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm">
                    {isCommissioner ? (
                      <span className="capitalize text-gray-900">Commissioner</span>
                    ) : (
                      <select
                        value={displayRole}
                        onChange={(e) =>
                          handleFieldChange(member.role_id, 'role', member.role, e.target.value)
                        }
                        className={`rounded-md border px-2 py-1 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                          pendingChanges.get(member.role_id)?.role !== undefined
                            ? 'border-yellow-400 bg-yellow-50'
                            : 'border-gray-300'
                        }`}
                      >
                        {ASSIGNABLE_ROLES.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm">
                    {isCommissioner ? (
                      <span className="text-gray-500">—</span>
                    ) : (
                      <select
                        value={displayTeamId}
                        onChange={(e) =>
                          handleFieldChange(member.role_id, 'team_id', member.team_id ?? '', e.target.value)
                        }
                        className={`rounded-md border px-2 py-1 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                          pendingChanges.get(member.role_id)?.team_id !== undefined
                            ? 'border-yellow-400 bg-yellow-50'
                            : 'border-gray-300'
                        }`}
                      >
                        <option value="">Unassigned</option>
                        {teams.map((team) => (
                          <option key={team.id} value={team.id}>
                            {team.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                    {new Date(member.assigned_at).toLocaleDateString()}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {!isSelf && !isCommissioner && (
                      <>
                        {confirmingRemove === member.role_id ? (
                          <div className="inline-flex items-center gap-2">
                            <span className="text-xs text-red-600">Remove?</span>
                            <button
                              onClick={() => handleRemove(member.role_id)}
                              disabled={removingId === member.role_id}
                              className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                            >
                              {removingId === member.role_id ? '...' : 'Yes'}
                            </button>
                            <button
                              onClick={() => setConfirmingRemove(null)}
                              className="rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmingRemove(member.role_id)}
                            className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                            title="Remove member"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
            {members.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-gray-500">
                  No members yet. Share a signup code or assign roles manually.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
