'use client';

import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';

interface PlayerCardProps {
  playerId: string;
  name: string;
  jerseyNumber: number | null;
  position: string | null;
  placedPositions: string[];
  isDraggable: boolean;
}

export function PlayerCard({
  playerId,
  name,
  jerseyNumber,
  position,
  placedPositions,
  isDraggable,
}: PlayerCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: `player-${playerId}`,
      data: { playerId, name, jerseyNumber },
      disabled: !isDraggable,
    });

  const style = transform
    ? {
        transform: CSS.Translate.toString(transform),
        zIndex: isDragging ? 50 : undefined,
      }
    : undefined;

  const isPlaced = placedPositions.length > 0;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
        isDragging
          ? 'border-blue-400 bg-blue-50 opacity-80 shadow-lg'
          : isPlaced
            ? 'border-green-200 bg-green-50 text-green-800'
            : 'border-gray-200 bg-white text-gray-900 hover:border-gray-300'
      } ${isDraggable ? 'cursor-grab active:cursor-grabbing' : 'opacity-50 cursor-default'}`}
      {...(isDraggable ? { ...attributes, ...listeners } : {})}
    >
      {isDraggable && (
        <GripVertical className="h-4 w-4 flex-shrink-0 text-gray-400" />
      )}
      <div className="flex-1 min-w-0">
        <span className="truncate font-medium">{name}</span>
        {jerseyNumber != null && (
          <span className="ml-1 text-gray-500">#{jerseyNumber}</span>
        )}
      </div>
      {/* Show roster position */}
      {position && placedPositions.length === 0 && (
        <span className="flex-shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-600">
          {position}
        </span>
      )}
      {/* Show all placed positions as badges */}
      {placedPositions.length > 0 && (
        <div className="flex flex-shrink-0 gap-0.5">
          {placedPositions.map((pos) => (
            <span
              key={pos}
              className="rounded bg-green-100 px-1 py-0.5 text-[10px] font-medium text-green-700"
            >
              {pos}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
