'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  FIELD_POSITIONS,
  FIELD_POSITION_ABBREV,
  FIELD_POSITION_COORDS,
  POSITION_TO_SCORING,
  SCORING_TO_POSITION,
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

/* ── Live field preview ── */

function LiveFieldPreview({
  lineup,
  roster,
}: {
  lineup: LineupSlot[];
  roster: RosterPlayer[];
}) {
  // Build a map: position abbrev → player info
  const positionFills: Record<
    string,
    { name: string; jersey: number | null; order: number }
  > = {};
  for (const slot of lineup) {
    if (slot.fielding_position > 0 && slot.player_user_id) {
      const abbrev = FIELD_POSITION_ABBREV[slot.fielding_position];
      if (!abbrev) continue;
      const player = roster.find(
        (r) => r.player_user_id === slot.player_user_id
      );
      positionFills[abbrev] = {
        name: player?.full_name?.split(' ').pop() ?? '?',
        jersey: player?.jersey_number ?? null,
        order: slot.batting_order,
      };
    }
  }

  const filledCount = Object.keys(positionFills).length;

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-4 py-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">
            Defensive Alignment
          </h3>
          <span
            className={`text-xs font-medium ${
              filledCount === 9
                ? 'text-green-600'
                : 'text-amber-600'
            }`}
          >
            {filledCount}/9
          </span>
        </div>
      </div>
      <div className="p-3">
        <svg
          viewBox="0 0 500 480"
          className="mx-auto w-full max-w-[340px]"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Outfield grass */}
          <path
            d="M 250 460 L 10 200 Q 10 10 250 10 Q 490 10 490 200 Z"
            fill="#4ade80"
            stroke="#22c55e"
            strokeWidth="2"
          />
          {/* Infield dirt */}
          <path
            d="M 250 420 L 120 290 L 250 200 L 380 290 Z"
            fill="#d4a574"
            stroke="#b8956a"
            strokeWidth="1.5"
          />
          {/* Base paths */}
          <line x1="250" y1="400" x2="370" y2="290" stroke="white" strokeWidth="2" />
          <line x1="370" y1="290" x2="250" y2="200" stroke="white" strokeWidth="2" />
          <line x1="250" y1="200" x2="130" y2="290" stroke="white" strokeWidth="2" />
          <line x1="130" y1="290" x2="250" y2="400" stroke="white" strokeWidth="2" />
          {/* Home plate */}
          <polygon
            points="250,405 243,400 243,395 257,395 257,400"
            fill="white"
            stroke="#666"
            strokeWidth="0.5"
          />
          {/* Bases */}
          <rect x="364" y="284" width="12" height="12" fill="white" stroke="#666" strokeWidth="0.5" transform="rotate(45 370 290)" />
          <rect x="244" y="194" width="12" height="12" fill="white" stroke="#666" strokeWidth="0.5" transform="rotate(45 250 200)" />
          <rect x="124" y="284" width="12" height="12" fill="white" stroke="#666" strokeWidth="0.5" transform="rotate(45 130 290)" />
          {/* Pitcher's mound */}
          <circle cx="250" cy="305" r="8" fill="#d4a574" stroke="#b8956a" strokeWidth="1" />
          <rect x="246" y="303" width="8" height="2" fill="white" />
          {/* Foul lines */}
          <line x1="250" y1="405" x2="10" y2="200" stroke="white" strokeWidth="1.5" strokeDasharray="4 4" />
          <line x1="250" y1="405" x2="490" y2="200" stroke="white" strokeWidth="1.5" strokeDasharray="4 4" />

          {/* Position pills */}
          {Object.entries(FIELD_POSITION_COORDS).map(([pos, coords]) => {
            const fill = positionFills[pos];
            const isFilled = !!fill;
            return (
              <g key={pos}>
                <rect
                  x={coords.x - 40}
                  y={coords.y - 16}
                  width={80}
                  height={isFilled ? 44 : 32}
                  rx={6}
                  fill={isFilled ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.5)'}
                  stroke={isFilled ? '#3b82f6' : 'rgba(255,255,255,0.4)'}
                  strokeWidth={isFilled ? 1.5 : 1}
                />
                {/* Position label */}
                <text
                  x={coords.x}
                  y={coords.y - 2}
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight="700"
                  fill="#6b7280"
                >
                  {pos}
                </text>
                {isFilled ? (
                  <>
                    <text
                      x={coords.x}
                      y={coords.y + 13}
                      textAnchor="middle"
                      fontSize="12"
                      fontWeight="600"
                      fill="#111827"
                    >
                      {fill.name}
                      {fill.jersey != null ? ` #${fill.jersey}` : ''}
                    </text>
                    <text
                      x={coords.x}
                      y={coords.y + 25}
                      textAnchor="middle"
                      fontSize="9"
                      fontWeight="500"
                      fill="#3b82f6"
                    >
                      Batting {fill.order}
                    </text>
                  </>
                ) : (
                  <text
                    x={coords.x}
                    y={coords.y + 11}
                    textAnchor="middle"
                    fontSize="10"
                    fill="#9ca3af"
                  >
                    —
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

/* ── Sortable lineup row (lineup card style) ── */

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
    <tr
      ref={setNodeRef}
      style={style}
      className={
        isDragging
          ? 'bg-blue-50'
          : isStarter
            ? index % 2 === 0
              ? 'bg-white'
              : 'bg-gray-50/60'
            : 'bg-amber-50/40'
      }
    >
      {/* Drag handle */}
      <td className="w-8 pl-2">
        <button
          className="cursor-grab touch-none text-gray-300 hover:text-gray-500 active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
      </td>
      {/* Order */}
      <td className="w-10 py-2 text-center">
        <span
          className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
            isStarter
              ? 'bg-blue-600 text-white'
              : 'bg-gray-300 text-gray-600'
          }`}
        >
          {index + 1}
        </span>
      </td>
      {/* Player */}
      <td className="py-2 pr-2">
        <select
          value={slot.player_user_id}
          onChange={(e) => onUpdatePlayer(index, e.target.value)}
          className="w-full rounded border border-gray-200 bg-transparent px-2 py-1 text-sm font-medium text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">—</option>
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
      </td>
      {/* Jersey */}
      <td className="w-14 py-2 text-center text-sm text-gray-500">
        {player?.jersey_number != null ? `#${player.jersey_number}` : ''}
      </td>
      {/* Position */}
      <td className="w-20 py-2 pr-2">
        {isStarter ? (
          <select
            value={slot.fielding_position}
            onChange={(e) =>
              onUpdatePosition(index, parseInt(e.target.value))
            }
            className="w-full rounded border border-gray-200 bg-transparent px-1 py-1 text-center text-sm font-semibold text-blue-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value={0}>—</option>
            {Object.entries(FIELD_POSITIONS).map(([num]) => {
              const n = Number(num);
              const isUsed =
                usedPositions.includes(n) &&
                slot.fielding_position !== n;
              return (
                <option key={num} value={num} disabled={isUsed}>
                  {FIELD_POSITION_ABBREV[n]}
                  {isUsed ? ' ×' : ''}
                </option>
              );
            })}
          </select>
        ) : (
          <span className="block text-center text-xs italic text-gray-400">
            BN
          </span>
        )}
      </td>
      {/* Remove */}
      <td className="w-8 pr-2">
        {canRemove && (
          <button
            onClick={() => onRemove(index)}
            className="rounded p-0.5 text-gray-300 hover:bg-red-50 hover:text-red-500"
            title="Remove"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </td>
    </tr>
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
    <tr
      className={
        isStarter
          ? index % 2 === 0
            ? 'bg-white'
            : 'bg-gray-50/60'
          : 'bg-amber-50/40'
      }
    >
      <td className="w-10 py-2 text-center">
        <span
          className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
            isStarter
              ? 'bg-blue-600 text-white'
              : 'bg-gray-300 text-gray-600'
          }`}
        >
          {index + 1}
        </span>
      </td>
      <td className="py-2 pr-2 text-sm font-medium text-gray-900">
        {name}
      </td>
      <td className="w-14 py-2 text-center text-sm text-gray-500">
        {jersey != null ? `#${jersey}` : ''}
      </td>
      <td className="w-16 py-2 pr-2 text-center text-sm font-semibold text-blue-700">
        {isStarter && slot.fielding_position > 0
          ? FIELD_POSITION_ABBREV[slot.fielding_position]
          : isStarter
            ? '—'
            : ''}
        {!isStarter && (
          <span className="text-xs italic font-normal text-gray-400">BN</span>
        )}
      </td>
    </tr>
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
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Lineup card */}
        <div className="overflow-hidden rounded-xl border border-gray-300 shadow-sm">
          <div className="bg-gradient-to-b from-blue-700 to-blue-800 px-5 py-3">
            <h3 className="text-center text-sm font-bold uppercase tracking-widest text-white">
              Starting Lineup
            </h3>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-100 text-xs uppercase tracking-wider text-gray-500">
                <th className="w-10 py-1.5 text-center">No.</th>
                <th className="py-1.5 pl-2 text-left">Player</th>
                <th className="w-14 py-1.5 text-center">#</th>
                <th className="w-16 py-1.5 pr-2 text-center">Pos</th>
              </tr>
            </thead>
            <tbody>
              {roStarters.map((slot, i) => (
                <ReadOnlyRow
                  key={slot.batting_order}
                  slot={slot}
                  index={i}
                  roster={roster}
                  isStarter
                />
              ))}
              {roBench.length > 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="bg-gray-200 py-1.5 text-center text-xs font-bold uppercase tracking-wider text-gray-600"
                  >
                    Bench
                  </td>
                </tr>
              )}
              {roBench.map((slot, i) => (
                <ReadOnlyRow
                  key={slot.batting_order}
                  slot={slot}
                  index={9 + i}
                  roster={roster}
                  isStarter={false}
                />
              ))}
            </tbody>
          </table>
          <div className="border-t border-gray-200 bg-gray-100 px-5 py-1.5">
            <p className="text-center text-[10px] uppercase tracking-wider text-gray-500">
              {fieldingCount}/9 positions assigned
            </p>
          </div>
        </div>

        {/* Field preview */}
        <LiveFieldPreview lineup={lineup} roster={roster} />
      </div>
    );
  }

  /* ── Editable view ── */

  const sortableIds = lineup.map((_, i) => `slot-${i}`);

  return (
    <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[1fr_380px]">
      {/* Lineup card */}
      <div>
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
            <div className="overflow-hidden rounded-xl border border-gray-300 shadow-sm">
              {/* Card header */}
              <div className="bg-gradient-to-b from-blue-700 to-blue-800 px-5 py-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold uppercase tracking-widest text-white">
                    Starting Lineup
                  </h3>
                  <span className="text-xs text-blue-200">
                    {lineup.length} batter{lineup.length !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>

              {/* Table */}
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-100 text-xs uppercase tracking-wider text-gray-500">
                    <th className="w-8"></th>
                    <th className="w-10 py-1.5 text-center">No.</th>
                    <th className="py-1.5 pl-2 text-left">Player</th>
                    <th className="w-14 py-1.5 text-center">#</th>
                    <th className="w-20 py-1.5 text-center">Pos</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {/* Starters */}
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
                  {/* Bench divider */}
                  <tr>
                    <td
                      colSpan={6}
                      className="bg-gray-200 py-1.5 text-center text-xs font-bold uppercase tracking-wider text-gray-600"
                    >
                      Bench
                    </td>
                  </tr>
                  {/* Bench */}
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
                    <tr>
                      <td
                        colSpan={6}
                        className="bg-amber-50/40 py-3 text-center text-xs italic text-gray-400"
                      >
                        Drag a starter here or add a batter below
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              {/* Card footer */}
              <div className="border-t border-gray-200 bg-gray-100 px-5 py-1.5">
                <p className="text-center text-[10px] uppercase tracking-wider text-gray-500">
                  Drag rows to reorder batting order
                </p>
              </div>
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

      {/* Live field preview — sticks to the side */}
      <div className="xl:sticky xl:top-6 xl:self-start">
        <LiveFieldPreview lineup={lineup} roster={roster} />
      </div>
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
    <div className="flex items-center gap-3 rounded-lg border border-blue-400 bg-blue-50 px-4 py-2 shadow-xl">
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
        {index + 1}
      </span>
      <span className="text-sm font-medium text-gray-900">
        {player?.full_name ?? (slot.player_user_id ? 'Player' : 'Empty')}
      </span>
      {player?.jersey_number != null && (
        <span className="text-xs text-gray-500">#{player.jersey_number}</span>
      )}
      {slot.fielding_position > 0 && (
        <span className="ml-auto text-xs font-semibold text-blue-700">
          {FIELD_POSITION_ABBREV[slot.fielding_position]}
        </span>
      )}
    </div>
  );
}
