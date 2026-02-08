'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  FIELD_POSITIONS,
  FIELD_POSITION_ABBREV,
  POSITION_TO_SCORING,
} from '@batters-up/shared';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  GripVertical,
  Save,
  Download,
  UserPlus,
  Users,
  X,
} from 'lucide-react';

/* ── Types ── */

interface RosterPlayer {
  player_user_id: string;
  full_name: string | null;
  jersey_number: number | null;
  position: string | null;
}

interface LineupSlot {
  batting_order: number;
  player_user_id: string;
  fielding_position: number;
  full_name?: string | null;
  jersey_number?: number | null;
}

interface DepthStarter {
  position: string;
  player_user_id: string;
}

interface StandardLineupEditorProps {
  teamId: string;
  roster: RosterPlayer[];
  currentLineup: LineupSlot[];
  depthStarters: DepthStarter[];
  canEdit: boolean;
}

/* ── Sortable lineup row ── */

function SortableLineupRow({
  slot,
  index,
  roster,
  usedPlayerIds,
  usedPositions,
  onUpdatePlayer,
  onUpdatePosition,
  onRemove,
  isStarter,
  canRemove,
}: {
  slot: LineupSlot;
  index: number;
  roster: RosterPlayer[];
  usedPlayerIds: string[];
  usedPositions: number[];
  onUpdatePlayer: (index: number, playerId: string) => void;
  onUpdatePosition: (index: number, position: number) => void;
  onRemove: (index: number) => void;
  isStarter: boolean;
  canRemove: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `slot-${index}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.5 : 1,
  };

  const player = roster.find(
    (r) => r.player_user_id === slot.player_user_id
  );

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${
        isDragging
          ? 'border-blue-400 bg-blue-50 shadow-lg'
          : isStarter
            ? 'border-gray-200 bg-white'
            : 'border-dashed border-gray-300 bg-gray-50/80'
      }`}
    >
      {/* Drag handle */}
      <button
        className="flex-shrink-0 cursor-grab touch-none text-gray-400 hover:text-gray-600 active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      {/* Batting order number */}
      <div
        className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${
          isStarter
            ? 'bg-blue-600 text-white'
            : 'bg-gray-200 text-gray-600'
        }`}
      >
        {index + 1}
      </div>

      {/* Player select */}
      <select
        value={slot.player_user_id}
        onChange={(e) => onUpdatePlayer(index, e.target.value)}
        className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1 text-sm font-medium text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
      >
        <option value="">Select player...</option>
        {roster.map((p) => {
          const isUsed =
            usedPlayerIds.includes(p.player_user_id) &&
            slot.player_user_id !== p.player_user_id;
          return (
            <option
              key={p.player_user_id}
              value={p.player_user_id}
              disabled={isUsed}
            >
              {p.full_name ?? 'Unknown'}
              {p.jersey_number != null ? ` #${p.jersey_number}` : ''}
              {isUsed ? ' (in lineup)' : ''}
            </option>
          );
        })}
      </select>

      {/* Position select — only for starters */}
      {isStarter ? (
        <select
          value={slot.fielding_position}
          onChange={(e) =>
            onUpdatePosition(index, parseInt(e.target.value))
          }
          className="w-28 flex-shrink-0 rounded border border-gray-300 px-2 py-1 text-sm font-medium text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        >
          <option value={0}>—</option>
          {Object.entries(FIELD_POSITIONS).map(([num, label]) => {
            const n = Number(num);
            const isUsed =
              usedPositions.includes(n) &&
              slot.fielding_position !== n;
            return (
              <option key={num} value={num} disabled={isUsed}>
                {FIELD_POSITION_ABBREV[n]}
                {isUsed ? ' (taken)' : ''}
              </option>
            );
          })}
        </select>
      ) : (
        <span className="w-28 flex-shrink-0 text-center text-xs italic text-gray-400">
          Bench
        </span>
      )}

      {/* Remove button */}
      {canRemove && (
        <button
          onClick={() => onRemove(index)}
          className="flex-shrink-0 rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
          title="Remove from lineup"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/* ── Read-only lineup row ── */

function ReadOnlyRow({
  slot,
  index,
  roster,
  isStarter,
}: {
  slot: LineupSlot;
  index: number;
  roster: RosterPlayer[];
  isStarter: boolean;
}) {
  const player = roster.find(
    (r) => r.player_user_id === slot.player_user_id
  );
  const name = player?.full_name ?? slot.full_name ?? '—';
  const jersey = player?.jersey_number ?? slot.jersey_number;

  return (
    <div
      className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${
        isStarter
          ? 'border-gray-200 bg-white'
          : 'border-dashed border-gray-300 bg-gray-50/80'
      }`}
    >
      <div
        className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${
          isStarter
            ? 'bg-blue-600 text-white'
            : 'bg-gray-200 text-gray-600'
        }`}
      >
        {index + 1}
      </div>
      <div className="flex-1 min-w-0 text-sm">
        <span className="font-medium text-gray-900">{name}</span>
        {jersey != null && (
          <span className="ml-1 text-gray-400">#{jersey}</span>
        )}
      </div>
      {isStarter ? (
        <span className="w-10 flex-shrink-0 text-center text-xs font-semibold text-blue-700">
          {slot.fielding_position > 0
            ? FIELD_POSITION_ABBREV[slot.fielding_position]
            : '—'}
        </span>
      ) : (
        <span className="w-10 flex-shrink-0 text-center text-[10px] italic text-gray-400">
          Bench
        </span>
      )}
    </div>
  );
}

/* ── Main editor ── */

export function StandardLineupEditor({
  teamId,
  roster,
  currentLineup,
  depthStarters,
  canEdit,
}: StandardLineupEditorProps) {
  const router = useRouter();

  const initialSlots =
    currentLineup.length > 0
      ? currentLineup.sort((a, b) => a.batting_order - b.batting_order)
      : makeEmptyLineup(Math.max(9, roster.length));

  const [lineup, setLineup] = useState<LineupSlot[]>(initialSlots);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const starters = lineup.slice(0, 9);
  const bench = lineup.slice(9);

  const usedPlayerIds = lineup
    .map((s) => s.player_user_id)
    .filter(Boolean);
  const usedPositions = lineup
    .map((s) => s.fielding_position)
    .filter((p) => p > 0);
  const fieldingCount = usedPositions.length;

  /* ── Handlers ── */

  function updatePlayer(index: number, playerId: string) {
    setLineup((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], player_user_id: playerId };
      return next;
    });
    setSuccess(false);
  }

  function updatePosition(index: number, position: number) {
    setLineup((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], fielding_position: position };
      return next;
    });
    setSuccess(false);
  }

  function addSlot() {
    setLineup((prev) => [
      ...prev,
      {
        batting_order: prev.length + 1,
        player_user_id: '',
        fielding_position: 0,
      },
    ]);
  }

  function removeSlot(index: number) {
    setLineup((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.map((s, i) => ({ ...s, batting_order: i + 1 }));
    });
    setSuccess(false);
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!over || active.id === over.id) return;

    const oldIdx = lineup.findIndex(
      (_, i) => `slot-${i}` === active.id
    );
    const newIdx = lineup.findIndex(
      (_, i) => `slot-${i}` === over.id
    );

    if (oldIdx === -1 || newIdx === -1) return;

    setLineup((prev) => {
      const moved = arrayMove(prev, oldIdx, newIdx);
      // Recompute batting orders + clear fielding position when moving to/from bench
      return moved.map((s, i) => ({
        ...s,
        batting_order: i + 1,
        fielding_position: i < 9 ? s.fielding_position : 0,
      }));
    });
    setSuccess(false);
  }

  function loadFromDepthChart() {
    if (depthStarters.length === 0) return;
    const newLineup: LineupSlot[] = makeEmptyLineup(
      Math.max(9, roster.length)
    );
    const fieldStarters = depthStarters.filter(
      (d) => POSITION_TO_SCORING[d.position] !== undefined
    );
    fieldStarters.forEach((starter, idx) => {
      if (idx < newLineup.length) {
        newLineup[idx] = {
          batting_order: idx + 1,
          player_user_id: starter.player_user_id,
          fielding_position: POSITION_TO_SCORING[starter.position],
        };
      }
    });
    const assignedIds = new Set(
      fieldStarters.map((s) => s.player_user_id)
    );
    const remaining = roster.filter(
      (r) => !assignedIds.has(r.player_user_id)
    );
    let slotIdx = fieldStarters.length;
    for (const player of remaining) {
      if (slotIdx < newLineup.length) {
        newLineup[slotIdx] = {
          batting_order: slotIdx + 1,
          player_user_id: player.player_user_id,
          fielding_position: 0,
        };
        slotIdx++;
      }
    }
    setLineup(newLineup);
    setSuccess(false);
    setError(null);
  }

  function fillEntireRoster() {
    const newLineup: LineupSlot[] = roster.map((p, i) => {
      const existing = lineup.find(
        (s) => s.player_user_id === p.player_user_id
      );
      return {
        batting_order: i + 1,
        player_user_id: p.player_user_id,
        fielding_position: existing?.fielding_position ?? 0,
      };
    });
    setLineup(newLineup);
    setSuccess(false);
    setError(null);
  }

  async function handleSave() {
    const filledSlots = lineup.filter((s) => s.player_user_id);
    if (filledSlots.length !== lineup.length) {
      setError('Every batting slot must have a player assigned');
      return;
    }
    const playerIds = filledSlots.map((s) => s.player_user_id);
    if (new Set(playerIds).size !== playerIds.length) {
      setError('Each player can only appear once in the lineup');
      return;
    }
    const fieldingSlots = filledSlots.filter(
      (s) => s.fielding_position > 0
    );
    if (fieldingSlots.length !== 9) {
      setError(
        `Exactly 9 players must have fielding positions (currently ${fieldingSlots.length})`
      );
      return;
    }
    const positions = fieldingSlots.map((s) => s.fielding_position);
    if (new Set(positions).size !== positions.length) {
      setError('Each fielding position can only be used once');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(false);

    const supabase = createClient();
    const lineupData = lineup.map((s, i) => ({
      player_user_id: s.player_user_id,
      batting_order: i + 1,
      fielding_position: s.fielding_position,
    }));

    const { error: rpcError } = await supabase.rpc(
      'save_standard_lineup',
      { p_team_id: teamId, p_lineup: lineupData }
    );

    if (rpcError) {
      setError(rpcError.message);
    } else {
      setSuccess(true);
      router.refresh();
    }
    setSaving(false);
  }

  /* ── Read-only view ── */

  if (!canEdit) {
    if (currentLineup.length === 0) {
      return (
        <div className="mt-8 rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
          <p className="text-gray-500 italic">
            Standard lineup has not been set yet.
          </p>
        </div>
      );
    }

    const roStarters = lineup.slice(0, 9);
    const roBench = lineup.slice(9);

    return (
      <div className="mt-6 mx-auto max-w-lg">
        {/* Card header */}
        <div className="rounded-t-xl border border-b-0 border-gray-300 bg-gradient-to-b from-blue-700 to-blue-800 px-5 py-3">
          <h3 className="text-center text-sm font-bold uppercase tracking-widest text-white">
            Starting Lineup
          </h3>
        </div>

        {/* Starters */}
        <div className="space-y-1 border-x border-gray-300 bg-gray-50 p-3">
          {roStarters.map((slot, i) => (
            <ReadOnlyRow
              key={slot.batting_order}
              slot={slot}
              index={i}
              roster={roster}
              isStarter
            />
          ))}
        </div>

        {/* Bench section */}
        {roBench.length > 0 && (
          <>
            <div className="border-x border-t border-gray-300 bg-gray-200 px-5 py-2">
              <h3 className="text-center text-xs font-bold uppercase tracking-wider text-gray-600">
                Bench
              </h3>
            </div>
            <div className="space-y-1 border-x border-gray-300 bg-gray-100 p-3">
              {roBench.map((slot, i) => (
                <ReadOnlyRow
                  key={slot.batting_order}
                  slot={slot}
                  index={9 + i}
                  roster={roster}
                  isStarter={false}
                />
              ))}
            </div>
          </>
        )}

        {/* Card footer */}
        <div className="rounded-b-xl border border-t-0 border-gray-300 bg-gradient-to-b from-gray-100 to-gray-200 px-5 py-2">
          <p className="text-center text-[10px] uppercase tracking-wider text-gray-500">
            {fieldingCount}/9 positions assigned
          </p>
        </div>
      </div>
    );
  }

  /* ── Editable view ── */

  const sortableIds = lineup.map((_, i) => `slot-${i}`);

  return (
    <div className="mt-6 mx-auto max-w-lg">
      {/* Status bar */}
      <div className="mb-3 flex items-center justify-between text-sm">
        <span className="text-gray-600">
          {lineup.length} batter{lineup.length !== 1 ? 's' : ''}
        </span>
        <span
          className={
            fieldingCount === 9 ? 'text-green-600 font-medium' : 'text-amber-600'
          }
        >
          {fieldingCount}/9 fielding
        </span>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={sortableIds}
          strategy={verticalListSortingStrategy}
        >
          {/* Card header */}
          <div className="rounded-t-xl border border-b-0 border-gray-300 bg-gradient-to-b from-blue-700 to-blue-800 px-5 py-3">
            <h3 className="text-center text-sm font-bold uppercase tracking-widest text-white">
              Starting Lineup
            </h3>
          </div>

          {/* Starters (1-9) */}
          <div className="space-y-1.5 border-x border-gray-300 bg-gray-50 p-3">
            {starters.map((slot, i) => (
              <SortableLineupRow
                key={`slot-${i}`}
                slot={slot}
                index={i}
                roster={roster}
                usedPlayerIds={usedPlayerIds}
                usedPositions={usedPositions}
                onUpdatePlayer={updatePlayer}
                onUpdatePosition={updatePosition}
                onRemove={removeSlot}
                isStarter
                canRemove={false}
              />
            ))}
          </div>

          {/* Bench header */}
          <div className="border-x border-t border-gray-300 bg-gray-200 px-5 py-2">
            <h3 className="text-center text-xs font-bold uppercase tracking-wider text-gray-600">
              Bench
            </h3>
          </div>

          {/* Bench slots */}
          <div className="min-h-[48px] space-y-1.5 border-x border-gray-300 bg-gray-100 p-3">
            {bench.length > 0 ? (
              bench.map((slot, i) => (
                <SortableLineupRow
                  key={`slot-${9 + i}`}
                  slot={slot}
                  index={9 + i}
                  roster={roster}
                  usedPlayerIds={usedPlayerIds}
                  usedPositions={usedPositions}
                  onUpdatePlayer={updatePlayer}
                  onUpdatePosition={updatePosition}
                  onRemove={removeSlot}
                  isStarter={false}
                  canRemove
                />
              ))
            ) : (
              <p className="py-2 text-center text-xs italic text-gray-400">
                Drag a starter here or add a batter below
              </p>
            )}
          </div>

          {/* Card footer */}
          <div className="rounded-b-xl border border-t-0 border-gray-300 bg-gradient-to-b from-gray-100 to-gray-200 px-5 py-2">
            <p className="text-center text-[10px] uppercase tracking-wider text-gray-500">
              Drag to reorder batting order
            </p>
          </div>
        </SortableContext>

        {/* Drag overlay */}
        <DragOverlay>
          {activeId != null ? (
            <DragOverlayCard
              slot={
                lineup[
                  lineup.findIndex(
                    (_, i) => `slot-${i}` === activeId
                  )
                ]
              }
              index={lineup.findIndex(
                (_, i) => `slot-${i}` === activeId
              )}
              roster={roster}
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Actions */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          <Save className="h-4 w-4" />
          {saving ? 'Saving...' : 'Save Lineup'}
        </button>
        <button
          onClick={addSlot}
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <UserPlus className="h-4 w-4" />
          Add Batter
        </button>
        {roster.length > 0 && lineup.length < roster.length && (
          <button
            onClick={fillEntireRoster}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Users className="h-4 w-4" />
            Fill Roster
          </button>
        )}
        {depthStarters.length > 0 && (
          <button
            onClick={loadFromDepthChart}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Download className="h-4 w-4" />
            From Depth Chart
          </button>
        )}
      </div>

      {/* Feedback */}
      {error && (
        <p className="mt-3 text-sm text-red-600">{error}</p>
      )}
      {success && (
        <p className="mt-3 text-sm text-green-600">
          Standard lineup saved!
        </p>
      )}
    </div>
  );
}

/* ── Helpers ── */

function makeEmptyLineup(count: number): LineupSlot[] {
  return Array.from({ length: count }, (_, i) => ({
    batting_order: i + 1,
    player_user_id: '',
    fielding_position: 0,
  }));
}

function DragOverlayCard({
  slot,
  index,
  roster,
}: {
  slot: LineupSlot;
  index: number;
  roster: RosterPlayer[];
}) {
  const player = roster.find(
    (r) => r.player_user_id === slot.player_user_id
  );
  return (
    <div className="flex items-center gap-2 rounded-lg border border-blue-400 bg-blue-50 px-3 py-2 shadow-xl">
      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
        {index + 1}
      </div>
      <span className="text-sm font-medium text-gray-900">
        {player?.full_name ?? slot.player_user_id ? 'Player' : 'Empty'}
      </span>
      {slot.fielding_position > 0 && (
        <span className="ml-auto text-xs font-semibold text-blue-700">
          {FIELD_POSITION_ABBREV[slot.fielding_position]}
        </span>
      )}
    </div>
  );
}
