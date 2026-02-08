'use client';

import { useDroppable } from '@dnd-kit/core';
import { X } from 'lucide-react';

interface PlayerInfo {
  playerId: string;
  name: string;
  jerseyNumber: number | null;
}

interface PositionDropZoneProps {
  position: string;
  label: string;
  players: PlayerInfo[];
  canEdit: boolean;
  onRemove: (playerId: string) => void;
}

export function PositionDropZone({
  position,
  label,
  players,
  canEdit,
  onRemove,
}: PositionDropZoneProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: `position-${position}`,
    data: { position },
    disabled: !canEdit,
  });

  const hasPlayers = players.length > 0;

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col items-center rounded-lg border-2 transition-all ${
        isOver
          ? 'border-blue-400 bg-blue-50/90 scale-105'
          : hasPlayers
            ? 'border-green-300 bg-white/95'
            : 'border-dashed border-gray-300 bg-white/80'
      }`}
      style={{ width: 90, minHeight: 56, padding: '2px 0' }}
    >
      <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
        {label}
      </span>
      {hasPlayers ? (
        <div className="flex flex-col items-center gap-0.5 w-full px-1">
          {players.map((player, idx) => (
            <div
              key={player.playerId}
              className={`flex items-center gap-0.5 w-full justify-center ${
                idx === 0 ? 'text-gray-900' : 'text-gray-500'
              }`}
            >
              {idx > 0 && (
                <span className="text-[8px] text-gray-400 flex-shrink-0">
                  {idx + 1}.
                </span>
              )}
              <span
                className={`truncate text-xs ${idx === 0 ? 'font-medium' : 'font-normal'}`}
                style={{ maxWidth: 52 }}
              >
                {player.name.split(' ').pop()}
              </span>
              {player.jerseyNumber != null && (
                <span className="text-[9px] text-gray-400 flex-shrink-0">
                  #{player.jerseyNumber}
                </span>
              )}
              {canEdit && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(player.playerId);
                  }}
                  className="flex-shrink-0 rounded p-0.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <span className="text-[10px] text-gray-400">
          {canEdit ? 'Drop here' : 'Empty'}
        </span>
      )}
    </div>
  );
}
