'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Save, Trash2, ArrowRightLeft, UserPlus, Users } from 'lucide-react';
import {
  POSITIONS,
  POSITION_LIST,
  ROSTER_STATUS_LABELS,
  ROSTER_STATUS_COLORS,
} from '@batters-up/shared';
import type { RosterStatus, RosterEntryWithProfile } from '@batters-up/shared';

interface UnrosteredPlayer {
  user_id: string;
  full_name: string | null;
  email: string;
}

interface RosterTableProps {
  teamId: string;
  roster: RosterEntryWithProfile[];
  canEdit: boolean;
  canManageRoster: boolean;
  leagueTeams: { id: string; name: string }[];
  unrosteredPlayers: UnrosteredPlayer[];
}

interface PendingChange {
  position?: string | null;
  jersey_number?: number | null;
  status?: string;
}

export function RosterTable({
  teamId,
  roster,
  canEdit,
  canManageRoster,
  leagueTeams,
  unrosteredPlayers,
}: RosterTableProps) {
  const router = useRouter();
  const [pendingChanges, setPendingChanges] = useState<
    Map<string, PendingChange>
  >(new Map());
  const [saving, setSaving] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [movingPlayer, setMovingPlayer] = useState<string | null>(null);
  const [moveTargetTeam, setMoveTargetTeam] = useState<string>('');
  const [movingId, setMovingId] = useState<string | null>(null);
  const [addingPlayer, setAddingPlayer] = useState(false);
  const [addPlayerId, setAddPlayerId] = useState('');
  const [addingLoading, setAddingLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  const changeCount = Array.from(pendingChanges.values()).reduce(
    (count, change) => {
      return (
        count +
        (change.position !== undefined ? 1 : 0) +
        (change.jersey_number !== undefined ? 1 : 0) +
        (change.status !== undefined ? 1 : 0)
      );
    },
    0
  );
  const hasChanges = changeCount > 0;

  function handleFieldChange(
    entryId: string,
    field: keyof PendingChange,
    originalValue: any,
    newValue: any
  ) {
    setPendingChanges((prev) => {
      const next = new Map(prev);
      const existing = next.get(entryId) ?? {};

      if (newValue === originalValue) {
        const { [field]: _, ...rest } = existing;
        if (Object.keys(rest).length === 0) {
          next.delete(entryId);
        } else {
          next.set(entryId, rest);
        }
      } else {
        next.set(entryId, { ...existing, [field]: newValue });
      }

      return next;
    });
  }

  function getDisplayValue<T>(
    entryId: string,
    field: keyof PendingChange,
    originalValue: T
  ): T {
    const change = pendingChanges.get(entryId);
    if (change && change[field] !== undefined) {
      return change[field] as T;
    }
    return originalValue;
  }

  function isRowChanged(entryId: string): boolean {
    const change = pendingChanges.get(entryId);
    return (
      change !== undefined &&
      (change.position !== undefined ||
        change.jersey_number !== undefined ||
        change.status !== undefined)
    );
  }

  async function handleSave() {
    if (!hasChanges) return;
    setSaving(true);

    const supabase = createClient();
    const updates = Array.from(pendingChanges.entries())
      .filter(
        ([_, change]) =>
          change.position !== undefined ||
          change.jersey_number !== undefined ||
          change.status !== undefined
      )
      .map(([entryId, change]) => {
        const entry = roster.find((r) => r.roster_entry_id === entryId);
        return supabase.rpc('update_roster_entry', {
          p_entry_id: entryId,
          p_position: change.position === null ? null : (change.position ?? null),
          p_jersey_number:
            change.jersey_number === null ? null : (change.jersey_number ?? null),
          p_status: change.status ?? null,
          p_notes: null,
          p_clear_jersey: change.jersey_number === null,
          p_clear_position: change.position === null,
          p_clear_notes: false,
        });
      });

    const results = await Promise.all(updates);
    const errors = results.filter((r) => r.error);

    if (errors.length > 0) {
      alert(
        `Failed to save ${errors.length} change(s): ${errors.map((e) => e.error?.message).join(', ')}`
      );
    }

    setPendingChanges(new Map());
    setSaving(false);
    router.refresh();
  }

  async function handleRemove(entryId: string) {
    setRemovingId(entryId);
    const supabase = createClient();
    const { error } = await supabase.rpc('remove_from_roster', {
      p_entry_id: entryId,
    });

    if (error) {
      alert(`Failed to remove: ${error.message}`);
    }

    setConfirmingRemove(null);
    setRemovingId(null);
    router.refresh();
  }

  async function handleMove(entryId: string) {
    if (!moveTargetTeam) return;
    setMovingId(entryId);

    const supabase = createClient();
    const { data, error } = await supabase.rpc('manager_move_player', {
      p_entry_id: entryId,
      p_new_team_id: moveTargetTeam,
    });

    if (error) {
      alert(`Failed to move player: ${error.message}`);
    }

    setMovingPlayer(null);
    setMoveTargetTeam('');
    setMovingId(null);
    router.refresh();
  }

  async function handleAddPlayer() {
    if (!addPlayerId) return;
    setAddingLoading(true);

    const supabase = createClient();
    const { error } = await supabase.rpc('add_player_to_roster', {
      p_team_id: teamId,
      p_player_user_id: addPlayerId,
    });

    if (error) {
      alert(`Failed to add player: ${error.message}`);
    }

    setAddPlayerId('');
    setAddingLoading(false);
    setShowAddForm(false);
    router.refresh();
  }

  return (
    <div className="mt-6">
      {/* Action bar */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">
          Roster ({roster.length} player{roster.length !== 1 ? 's' : ''})
        </h2>
        <div className="flex items-center gap-2">
          {canEdit && unrosteredPlayers.length > 0 && (
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <UserPlus className="h-4 w-4" />
              Add Player
            </button>
          )}
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
      </div>

      {/* Add player form */}
      {showAddForm && (
        <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-4">
          <h3 className="text-sm font-medium text-blue-900">
            Add Player to Roster
          </h3>
          <p className="mt-1 text-xs text-blue-700">
            Players must be assigned to this team first (via signup code or
            Members page).
          </p>
          <div className="mt-3 flex items-center gap-3">
            <select
              value={addPlayerId}
              onChange={(e) => setAddPlayerId(e.target.value)}
              className="rounded-md border border-blue-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Select a player...</option>
              {unrosteredPlayers.map((p) => (
                <option key={p.user_id} value={p.user_id}>
                  {p.full_name || p.email}
                </option>
              ))}
            </select>
            <button
              onClick={handleAddPlayer}
              disabled={!addPlayerId || addingLoading}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {addingLoading ? 'Adding...' : 'Add'}
            </button>
            <button
              onClick={() => {
                setShowAddForm(false);
                setAddPlayerId('');
              }}
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Roster table */}
      {roster.length === 0 ? (
        <div className="mt-4 rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
          <Users className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">
            No players on the roster
          </h3>
          <p className="mt-2 text-gray-600">
            {canEdit
              ? 'Add players to the roster to get started.'
              : 'No players have been added to the roster yet.'}
          </p>
        </div>
      ) : (
        <div className="mt-3 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  #
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Player
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Position
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Status
                </th>
                {(canEdit || canManageRoster) && (
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {roster.map((entry) => {
                const displayJersey = getDisplayValue(
                  entry.roster_entry_id,
                  'jersey_number',
                  entry.jersey_number
                );
                const displayPosition = getDisplayValue(
                  entry.roster_entry_id,
                  'position',
                  entry.position
                );
                const displayStatus = getDisplayValue(
                  entry.roster_entry_id,
                  'status',
                  entry.status
                );
                const isChanged = isRowChanged(entry.roster_entry_id);
                const statusColors =
                  ROSTER_STATUS_COLORS[displayStatus as RosterStatus] ??
                  'bg-gray-100 text-gray-800';

                return (
                  <tr
                    key={entry.roster_entry_id}
                    className={isChanged ? 'bg-yellow-50' : undefined}
                  >
                    {/* Jersey Number */}
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      {canEdit ? (
                        <input
                          type="number"
                          min="0"
                          max="99"
                          value={displayJersey ?? ''}
                          onChange={(e) => {
                            const val =
                              e.target.value === ''
                                ? null
                                : parseInt(e.target.value, 10);
                            handleFieldChange(
                              entry.roster_entry_id,
                              'jersey_number',
                              entry.jersey_number,
                              val
                            );
                          }}
                          className={`w-16 rounded-md border px-2 py-1 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                            pendingChanges.get(entry.roster_entry_id)
                              ?.jersey_number !== undefined
                              ? 'border-yellow-400 bg-yellow-50'
                              : 'border-gray-300'
                          }`}
                          placeholder="—"
                        />
                      ) : (
                        <span className="font-mono font-semibold text-gray-900">
                          {displayJersey ?? '—'}
                        </span>
                      )}
                    </td>

                    {/* Player Name */}
                    <td className="whitespace-nowrap px-4 py-3">
                      <Link
                        href={`/team/roster/${entry.roster_entry_id}`}
                        className="text-sm font-medium text-blue-600 hover:text-blue-800"
                      >
                        {entry.full_name || entry.email}
                      </Link>
                      <p className="text-xs text-gray-500">{entry.email}</p>
                    </td>

                    {/* Position */}
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      {canEdit ? (
                        <select
                          value={displayPosition ?? ''}
                          onChange={(e) => {
                            const val = e.target.value === '' ? null : e.target.value;
                            handleFieldChange(
                              entry.roster_entry_id,
                              'position',
                              entry.position,
                              val
                            );
                          }}
                          className={`rounded-md border px-2 py-1 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                            pendingChanges.get(entry.roster_entry_id)
                              ?.position !== undefined
                              ? 'border-yellow-400 bg-yellow-50'
                              : 'border-gray-300'
                          }`}
                        >
                          <option value="">Unassigned</option>
                          {POSITION_LIST.map((pos) => (
                            <option key={pos.key} value={pos.key}>
                              {pos.key} — {pos.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-gray-900">
                          {displayPosition
                            ? `${displayPosition} — ${POSITIONS[displayPosition as keyof typeof POSITIONS] ?? displayPosition}`
                            : '—'}
                        </span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      {canEdit ? (
                        <select
                          value={displayStatus}
                          onChange={(e) =>
                            handleFieldChange(
                              entry.roster_entry_id,
                              'status',
                              entry.status,
                              e.target.value
                            )
                          }
                          className={`rounded-md border px-2 py-1 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                            pendingChanges.get(entry.roster_entry_id)
                              ?.status !== undefined
                              ? 'border-yellow-400 bg-yellow-50'
                              : 'border-gray-300'
                          }`}
                        >
                          {Object.entries(ROSTER_STATUS_LABELS).map(
                            ([val, label]) => (
                              <option key={val} value={val}>
                                {label}
                              </option>
                            )
                          )}
                        </select>
                      ) : (
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusColors}`}
                        >
                          {ROSTER_STATUS_LABELS[
                            displayStatus as RosterStatus
                          ] ?? displayStatus}
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    {(canEdit || canManageRoster) && (
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {/* Move Player (manager/commissioner) */}
                          {canManageRoster &&
                            leagueTeams.length > 0 &&
                            (movingPlayer === entry.roster_entry_id ? (
                              <div className="flex items-center gap-2">
                                <select
                                  value={moveTargetTeam}
                                  onChange={(e) =>
                                    setMoveTargetTeam(e.target.value)
                                  }
                                  className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-900 focus:border-blue-500 focus:outline-none"
                                >
                                  <option value="">Move to...</option>
                                  {leagueTeams.map((t) => (
                                    <option key={t.id} value={t.id}>
                                      {t.name}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  onClick={() =>
                                    handleMove(entry.roster_entry_id)
                                  }
                                  disabled={
                                    !moveTargetTeam ||
                                    movingId === entry.roster_entry_id
                                  }
                                  className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                                >
                                  {movingId === entry.roster_entry_id
                                    ? '...'
                                    : 'Go'}
                                </button>
                                <button
                                  onClick={() => {
                                    setMovingPlayer(null);
                                    setMoveTargetTeam('');
                                  }}
                                  className="rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() =>
                                  setMovingPlayer(entry.roster_entry_id)
                                }
                                className="rounded p-1 text-gray-400 hover:bg-blue-50 hover:text-blue-600"
                                title="Move to another team"
                              >
                                <ArrowRightLeft className="h-4 w-4" />
                              </button>
                            ))}

                          {/* Remove from roster (manager/commissioner) */}
                          {canManageRoster &&
                            (confirmingRemove === entry.roster_entry_id ? (
                              <div className="inline-flex items-center gap-2">
                                <span className="text-xs text-red-600">
                                  Remove?
                                </span>
                                <button
                                  onClick={() =>
                                    handleRemove(entry.roster_entry_id)
                                  }
                                  disabled={
                                    removingId === entry.roster_entry_id
                                  }
                                  className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                                >
                                  {removingId === entry.roster_entry_id
                                    ? '...'
                                    : 'Yes'}
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
                                onClick={() =>
                                  setConfirmingRemove(entry.roster_entry_id)
                                }
                                className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                                title="Remove from roster"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            ))}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
