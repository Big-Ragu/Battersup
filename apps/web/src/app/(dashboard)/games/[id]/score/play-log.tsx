'use client';

import {
  PLAY_OUTCOME_LABELS,
  PLAY_OUTCOME_COLORS,
  CONSENSUS_LABELS,
  CONSENSUS_COLORS,
} from '@batters-up/shared';
import type { GameEvent } from '@batters-up/shared';

interface PlayLogProps {
  events: GameEvent[];
}

export function PlayLog({ events }: PlayLogProps) {
  const activeEvents = events.filter((e) => !e.is_deleted);

  if (activeEvents.length === 0) {
    return (
      <p className="text-sm text-gray-500 italic">
        No plays recorded yet.
      </p>
    );
  }

  // Group events by inning/half
  const grouped: Record<string, GameEvent[]> = {};
  for (const event of activeEvents) {
    const key = `${event.inning}-${event.inning_half}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(event);
  }

  return (
    <div className="space-y-6">
      {Object.entries(grouped).map(([key, inningEvents]) => {
        const [inning, half] = key.split('-');
        const halfLabel = half === 'top' ? 'Top' : 'Bottom';

        return (
          <div key={key}>
            <h3 className="text-sm font-semibold text-gray-600 mb-2">
              {halfLabel} of the {inning}
              {Number(inning) === 1
                ? 'st'
                : Number(inning) === 2
                ? 'nd'
                : Number(inning) === 3
                ? 'rd'
                : 'th'}
            </h3>
            <div className="space-y-2">
              {inningEvents.map((event) => (
                <div
                  key={event.id}
                  className="rounded border border-gray-200 bg-white px-4 py-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-400 font-mono w-6">
                        #{event.sequence_number}
                      </span>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          PLAY_OUTCOME_COLORS[event.outcome] ??
                          'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {PLAY_OUTCOME_LABELS[event.outcome] ?? event.outcome}
                      </span>
                      {event.batter_name && (
                        <span className="text-sm text-gray-900">
                          {event.batter_name}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {event.runs_scored > 0 && (
                        <span className="text-xs font-bold text-green-600">
                          +{event.runs_scored} R
                        </span>
                      )}
                      {event.fielding_sequence && (
                        <span className="text-xs text-gray-400">
                          {event.fielding_sequence}
                        </span>
                      )}
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          CONSENSUS_COLORS[event.consensus] ??
                          'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {CONSENSUS_LABELS[event.consensus] ?? event.consensus}
                      </span>
                    </div>
                  </div>
                  {event.notes && (
                    <p className="mt-1 text-xs text-gray-500 ml-9">
                      {event.notes}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
