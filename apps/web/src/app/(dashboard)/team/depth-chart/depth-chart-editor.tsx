'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { createClient } from '@/lib/supabase/client';
import {
  POSITIONS,
  FIELD_POSITION_COORDS,
  FIELD_DIAMOND_POSITIONS,
} from '@batters-up/shared';
import { BaseballFieldSVG } from './baseball-field-svg';
import { PlayerCard } from './player-card';
import { PositionDropZone } from './position-drop-zone';
import { Save, RotateCcw } from 'lucide-react';

interface RosterPlayer {
  player_user_id: string;
  full_name: string | null;
  jersey_number: number | null;
  position: string | null;
  status: string;
}

interface DepthEntry {
  position: string;
  player_user_id: string;
  depth_order: number;
}

interface DepthChartEditorProps {
  teamId: string;
  roster: RosterPlayer[];
  depthChart: DepthEntry[];
  canEdit: boolean;
}

interface PlayerInfo {
  playerId: string;
  name: string;
  jerseyNumber: number | null;
}

// position → ordered array of players (index 0 = starter, 1+ = backups)
type PlacementMap = Record<string, PlayerInfo[]>;

export function DepthChartEditor({
  teamId,
  roster,
  depthChart,
  canEdit,
}: DepthChartEditorProps) {
  const router = useRouter();

  const buildPlacements = useCallback((): PlacementMap => {
    const map: PlacementMap = {};
    // Sort by depth_order so starters come first
    const sorted = [...depthChart].sort((a, b) => a.depth_order - b.depth_order);
    for (const entry of sorted) {
      const player = roster.find(
        (r) => r.player_user_id === entry.player_user_id
      );
      if (player) {
        if (!map[entry.position]) map[entry.position] = [];
        map[entry.position].push({
          playerId: player.player_user_id,
          name: player.full_name || 'Unknown',
          jerseyNumber: player.jersey_number,
        });
      }
    }
    return map;
  }, [depthChart, roster]);

  const [placements, setPlacements] = useState<PlacementMap>(buildPlacements);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // Build set of positions each player is placed at
  const playerPositions: Record<string, string[]> = {};
  for (const [pos, players] of Object.entries(placements)) {
    for (const p of players) {
      if (!playerPositions[p.playerId]) playerPositions[p.playerId] = [];
      playerPositions[p.playerId].push(pos);
    }
  }

  const activePlayer = activeId
    ? roster.find((r) => `player-${r.player_user_id}` === activeId)
    : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over || !canEdit) return;

    const playerId = active.data.current?.playerId as string;
    const playerName = active.data.current?.name as string;
    const jerseyNumber = active.data.current?.jerseyNumber as number | null;
    const targetPosition = over.data.current?.position as string;

    if (!playerId || !targetPosition) return;

    setPlacements((prev) => {
      const next = { ...prev };

      // Check if player is already at this position
      const existing = next[targetPosition] ?? [];
      if (existing.some((p) => p.playerId === playerId)) {
        return prev; // Already there, no change
      }

      // Add player to this position (append as next depth)
      next[targetPosition] = [
        ...existing,
        { playerId, name: playerName, jerseyNumber },
      ];

      return next;
    });
    setSuccess(false);
  }

  function removeFromPosition(position: string, playerId: string) {
    setPlacements((prev) => {
      const next = { ...prev };
      const players = next[position] ?? [];
      next[position] = players.filter((p) => p.playerId !== playerId);
      if (next[position].length === 0) delete next[position];
      return next;
    });
    setSuccess(false);
  }

  function handleReset() {
    setPlacements(buildPlacements());
    setSuccess(false);
    setError(null);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSuccess(false);

    const entries: { position: string; player_user_id: string; depth_order: number }[] = [];
    for (const [position, players] of Object.entries(placements)) {
      players.forEach((player, index) => {
        entries.push({
          position,
          player_user_id: player.playerId,
          depth_order: index + 1,
        });
      });
    }

    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc('save_depth_chart', {
      p_team_id: teamId,
      p_entries: entries,
    });

    if (rpcError) {
      setError(rpcError.message);
    } else {
      setSuccess(true);
      router.refresh();
    }
    setSaving(false);
  }

  // All positions including DH and UTIL
  const allPositions = Object.keys(POSITIONS) as string[];
  const extraPositions = allPositions.filter(
    (p) => !FIELD_DIAMOND_POSITIONS.includes(p as any)
  );

  // Filter roster to active players
  const activePlayers = roster.filter((r) => r.status === 'active');

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
        {/* Roster sidebar */}
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-600">
            Roster ({activePlayers.length})
          </h3>
          <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
            {activePlayers.map((player) => (
              <PlayerCard
                key={player.player_user_id}
                playerId={player.player_user_id}
                name={player.full_name || 'Unknown'}
                jerseyNumber={player.jersey_number}
                position={player.position}
                placedPositions={playerPositions[player.player_user_id] ?? []}
                isDraggable={canEdit}
              />
            ))}
            {activePlayers.length === 0 && (
              <p className="text-sm text-gray-500 italic">
                No active players on roster.
              </p>
            )}
          </div>
        </div>

        {/* Field + extras */}
        <div>
          <div className="relative">
            <BaseballFieldSVG>
              {/* Position drop zones as foreignObject overlays */}
              {FIELD_DIAMOND_POSITIONS.map((pos) => {
                const coords = FIELD_POSITION_COORDS[pos];
                if (!coords) return null;
                const players = placements[pos] ?? [];
                const w = 96;
                const h = 20 + Math.max(1, players.length) * 20 + 8;
                return (
                  <foreignObject
                    key={pos}
                    x={coords.x - w / 2}
                    y={coords.y - h / 2}
                    width={w}
                    height={h}
                    style={{ overflow: 'visible' }}
                  >
                    <PositionDropZone
                      position={pos}
                      label={pos}
                      players={players}
                      canEdit={canEdit}
                      onRemove={(playerId) => removeFromPosition(pos, playerId)}
                    />
                  </foreignObject>
                );
              })}
            </BaseballFieldSVG>
          </div>

          {/* DH / UTIL slots below field */}
          <div className="mt-4 flex gap-4 justify-center">
            {extraPositions.map((pos) => (
              <PositionDropZone
                key={pos}
                position={pos}
                label={POSITIONS[pos as keyof typeof POSITIONS]}
                players={placements[pos] ?? []}
                canEdit={canEdit}
                onRemove={(playerId) => removeFromPosition(pos, playerId)}
              />
            ))}
          </div>

          {/* Actions */}
          {canEdit && (
            <div className="mt-6 flex items-center gap-3">
              <button
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                <Save className="h-4 w-4" />
                {saving ? 'Saving...' : 'Save Depth Chart'}
              </button>
              <button
                onClick={handleReset}
                className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <RotateCcw className="h-4 w-4" />
                Reset
              </button>
              {error && <p className="text-sm text-red-600">{error}</p>}
              {success && (
                <p className="text-sm text-green-600">Depth chart saved!</p>
              )}
            </div>
          )}

          {/* Legend */}
          <div className="mt-4 flex items-center gap-4 text-xs text-gray-500">
            <div className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              Placed on chart
            </div>
            <div className="flex items-center gap-1">
              <span className="inline-block h-4 w-6 rounded border-2 border-dashed border-gray-300" />
              Empty slot
            </div>
            <span>Drag a player to multiple positions for depth</span>
          </div>
        </div>
      </div>

      {/* Drag overlay */}
      <DragOverlay>
        {activePlayer ? (
          <div className="rounded-md border border-blue-400 bg-blue-50 px-3 py-2 text-sm font-medium shadow-lg">
            {activePlayer.full_name || 'Unknown'}
            {activePlayer.jersey_number != null && (
              <span className="ml-1 text-gray-500">
                #{activePlayer.jersey_number}
              </span>
            )}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
