'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  PLAY_OUTCOME_LABELS,
  PLAY_OUTCOME_COLORS,
} from '@batters-up/shared';
import type { GameEvent, BaseRunners, GameLineupEntry } from '@batters-up/shared';
import { RefreshCw, Wifi, WifiOff } from 'lucide-react';

interface LiveScoreboardProps {
  gameId: string;
  initialState: {
    game: {
      id: string;
      home_team_id: string;
      away_team_id: string;
      home_team_name: string;
      away_team_name: string;
      home_score: number;
      away_score: number;
      status: string;
      inning: number | null;
      inning_half: string | null;
    };
    events: GameEvent[];
    home_lineup: GameLineupEntry[];
    away_lineup: GameLineupEntry[];
    scorekeepers: any[];
  };
}

export function LiveScoreboard({
  gameId,
  initialState,
}: LiveScoreboardProps) {
  const [game, setGame] = useState(initialState.game);
  const [events, setEvents] = useState<GameEvent[]>(initialState.events ?? []);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [refreshing, setRefreshing] = useState(false);
  const [realtimeConnected, setRealtimeConnected] = useState(false);

  const activeEvents = events.filter((e) => !e.is_deleted);
  const lastEvent = activeEvents[activeEvents.length - 1];

  const currentRunners: BaseRunners = lastEvent
    ? lastEvent.runners_after
    : { first: null, second: null, third: null };
  const currentOuts = lastEvent ? lastEvent.outs_after : 0;

  // Build player name lookup from lineups for enriching Realtime payloads
  const playerNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of [
      ...(initialState.home_lineup ?? []),
      ...(initialState.away_lineup ?? []),
    ]) {
      if (entry.player_user_id && entry.player_name) {
        map.set(entry.player_user_id, entry.player_name);
      }
    }
    return map;
  }, [initialState.home_lineup, initialState.away_lineup]);

  // Manual refresh fallback
  const fetchGameState = useCallback(async () => {
    setRefreshing(true);
    const supabase = createClient();
    const { data } = await supabase.rpc('get_game_state', {
      p_game_id: gameId,
    });
    if (data) {
      const state = data as any;
      setGame(state.game);
      setEvents(state.events ?? []);
      setLastRefresh(new Date());
    }
    setRefreshing(false);
  }, [gameId]);

  // Supabase Realtime subscription
  useEffect(() => {
    if (game.status === 'final' || game.status === 'cancelled') return;

    const supabase = createClient();

    const channel = supabase
      .channel(`live-game-${gameId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'games',
          filter: `id=eq.${gameId}`,
        },
        (payload) => {
          const row = payload.new as any;
          setGame((prev) => ({
            ...prev,
            home_score: row.home_score ?? prev.home_score,
            away_score: row.away_score ?? prev.away_score,
            inning: row.inning ?? prev.inning,
            inning_half: row.inning_half ?? prev.inning_half,
            status: row.status ?? prev.status,
          }));
          setLastRefresh(new Date());
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'game_events',
          filter: `game_id=eq.${gameId}`,
        },
        (payload) => {
          const row = payload.new as any;
          const enriched: GameEvent = {
            ...row,
            batter_name: playerNameMap.get(row.batter_user_id) ?? null,
            pitcher_name: playerNameMap.get(row.pitcher_user_id) ?? null,
          };
          setEvents((prev) => {
            // Deduplicate by ID
            if (prev.some((e) => e.id === row.id)) return prev;
            return [...prev, enriched];
          });
          setLastRefresh(new Date());
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'game_events',
          filter: `game_id=eq.${gameId}`,
        },
        (payload) => {
          const updated = payload.new as any;
          setEvents((prev) =>
            prev.map((e) =>
              e.id === updated.id ? { ...e, ...updated } : e
            )
          );
          setLastRefresh(new Date());
        }
      )
      .subscribe((status) => {
        setRealtimeConnected(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [gameId, game.status, playerNameMap]);

  // Build box score — group events by inning
  const maxInning = activeEvents.reduce(
    (max, e) => Math.max(max, e.inning),
    game.inning ?? 1
  );
  const innings = Array.from({ length: maxInning }, (_, i) => i + 1);

  function getInningRuns(inning: number, half: 'top' | 'bottom') {
    return activeEvents
      .filter((e) => e.inning === inning && e.inning_half === half)
      .reduce((sum, e) => sum + e.runs_scored, 0);
  }

  // Get total hits
  const hitOutcomes = ['single', 'double', 'triple', 'home_run'];
  const awayHits = activeEvents.filter(
    (e) =>
      e.inning_half === 'top' && hitOutcomes.includes(e.outcome)
  ).length;
  const homeHits = activeEvents.filter(
    (e) =>
      e.inning_half === 'bottom' && hitOutcomes.includes(e.outcome)
  ).length;

  const awayErrors = activeEvents.filter(
    (e) => e.inning_half === 'bottom' && e.outcome === 'error'
  ).length;
  const homeErrors = activeEvents.filter(
    (e) => e.inning_half === 'top' && e.outcome === 'error'
  ).length;

  // Get latest 5 events for feed
  const recentEvents = [...activeEvents].reverse().slice(0, 5);

  return (
    <div className="mt-6 space-y-6">
      {/* Live indicator + connection status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {game.status === 'in_progress' && (
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
            </span>
          )}
          <span className="text-sm font-medium text-gray-600">
            {game.status === 'in_progress'
              ? 'LIVE'
              : game.status === 'final'
              ? 'FINAL'
              : game.status === 'scheduled'
              ? 'NOT STARTED'
              : game.status.toUpperCase()}
          </span>
          {game.status === 'in_progress' && (
            <span className="flex items-center gap-1 text-xs text-gray-400">
              {realtimeConnected ? (
                <Wifi className="h-3 w-3 text-green-500" />
              ) : (
                <WifiOff className="h-3 w-3 text-red-400" />
              )}
            </span>
          )}
        </div>
        <button
          onClick={fetchGameState}
          disabled={refreshing}
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
        >
          <RefreshCw
            className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`}
          />
          {lastRefresh.toLocaleTimeString()}
        </button>
      </div>

      {/* Score header */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex-1 text-center">
            <p className="text-sm font-medium text-gray-600">
              {game.away_team_name}
            </p>
            <p className="text-4xl font-bold text-gray-900">
              {game.away_score}
            </p>
          </div>
          <div className="mx-6 text-center">
            {game.status === 'in_progress' && game.inning && (
              <div>
                <p className="text-lg font-bold text-gray-700">
                  {game.inning_half === 'top' ? '▲' : '▼'} {game.inning}
                </p>
              </div>
            )}
            {game.status === 'final' && (
              <p className="text-sm font-bold text-gray-500">FINAL</p>
            )}
          </div>
          <div className="flex-1 text-center">
            <p className="text-sm font-medium text-gray-600">
              {game.home_team_name}
            </p>
            <p className="text-4xl font-bold text-gray-900">
              {game.home_score}
            </p>
          </div>
        </div>

        {/* Outs & Runners */}
        {game.status === 'in_progress' && (
          <div className="mt-4 flex items-center justify-center gap-8">
            {/* Outs */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Outs:</span>
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className={`h-3 w-3 rounded-full border-2 ${
                      i < currentOuts
                        ? 'bg-red-500 border-red-500'
                        : 'border-gray-300'
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Mini diamond */}
            <div className="relative w-12 h-12">
              <svg viewBox="0 0 50 50" className="w-full h-full">
                <path
                  d="M25 42 L8 25 L25 8 L42 25 Z"
                  fill="none"
                  stroke="#d1d5db"
                  strokeWidth="1.5"
                />
                <rect
                  x="37"
                  y="21"
                  width="7"
                  height="7"
                  rx="1"
                  fill={currentRunners.first ? '#3b82f6' : '#e5e7eb'}
                />
                <rect
                  x="21.5"
                  y="4"
                  width="7"
                  height="7"
                  rx="1"
                  fill={currentRunners.second ? '#3b82f6' : '#e5e7eb'}
                />
                <rect
                  x="5"
                  y="21"
                  width="7"
                  height="7"
                  rx="1"
                  fill={currentRunners.third ? '#3b82f6' : '#e5e7eb'}
                />
              </svg>
            </div>
          </div>
        )}
      </div>

      {/* Box score table */}
      {activeEvents.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-2 text-left text-gray-600 font-medium w-32">
                  Team
                </th>
                {innings.map((i) => (
                  <th
                    key={i}
                    className="px-3 py-2 text-center text-gray-600 font-medium w-8"
                  >
                    {i}
                  </th>
                ))}
                <th className="px-3 py-2 text-center font-bold text-gray-900 w-10 border-l border-gray-300">
                  R
                </th>
                <th className="px-3 py-2 text-center font-bold text-gray-900 w-10">
                  H
                </th>
                <th className="px-3 py-2 text-center font-bold text-gray-900 w-10">
                  E
                </th>
              </tr>
            </thead>
            <tbody>
              {/* Away team */}
              <tr className="border-b border-gray-100">
                <td className="px-4 py-2 font-medium text-gray-900">
                  {game.away_team_name}
                </td>
                {innings.map((i) => (
                  <td
                    key={i}
                    className="px-3 py-2 text-center text-gray-700"
                  >
                    {getInningRuns(i, 'top') || (
                      <span className="text-gray-300">0</span>
                    )}
                  </td>
                ))}
                <td className="px-3 py-2 text-center font-bold text-gray-900 border-l border-gray-300">
                  {game.away_score}
                </td>
                <td className="px-3 py-2 text-center text-gray-700">
                  {awayHits}
                </td>
                <td className="px-3 py-2 text-center text-gray-700">
                  {awayErrors}
                </td>
              </tr>
              {/* Home team */}
              <tr>
                <td className="px-4 py-2 font-medium text-gray-900">
                  {game.home_team_name}
                </td>
                {innings.map((i) => (
                  <td
                    key={i}
                    className="px-3 py-2 text-center text-gray-700"
                  >
                    {getInningRuns(i, 'bottom') || (
                      <span className="text-gray-300">0</span>
                    )}
                  </td>
                ))}
                <td className="px-3 py-2 text-center font-bold text-gray-900 border-l border-gray-300">
                  {game.home_score}
                </td>
                <td className="px-3 py-2 text-center text-gray-700">
                  {homeHits}
                </td>
                <td className="px-3 py-2 text-center text-gray-700">
                  {homeErrors}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Recent plays */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">
          Recent Plays
        </h3>
        {recentEvents.length === 0 ? (
          <p className="text-sm text-gray-500 italic">
            No plays recorded yet.
          </p>
        ) : (
          <div className="space-y-2">
            {recentEvents.map((event) => (
              <div
                key={event.id}
                className="rounded border border-gray-200 bg-white px-4 py-3 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400">
                    {event.inning_half === 'top' ? '▲' : '▼'}
                    {event.inning}
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
                    <span className="text-sm text-gray-700">
                      {event.batter_name}
                    </span>
                  )}
                </div>
                {event.runs_scored > 0 && (
                  <span className="text-xs font-bold text-green-600">
                    +{event.runs_scored} R
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
