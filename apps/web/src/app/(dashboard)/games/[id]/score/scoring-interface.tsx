'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  FIELD_POSITIONS,
  FIELD_POSITION_ABBREV,
  FIELD_POSITION_COORDS,
  FIELD_ZONE_OPTIONS,
  PLAY_OUTCOME_LABELS,
  PLAY_OUTCOME_COLORS,
  HIT_OUTCOMES,
  OUT_OUTCOMES,
  WALK_OUTCOMES,
  BASERUNNING_OUTCOMES,
  SCORING_TO_POSITION,
} from '@batters-up/shared';
import type { BaseRunners, GameEvent, GameLineupEntry } from '@batters-up/shared';
import { Undo2, ChevronRight, X } from 'lucide-react';
import { ScoringField } from './scoring-field';

interface ScoringInterfaceProps {
  gameId: string;
  game: {
    id: string;
    league_id: string;
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
  homeLineup: GameLineupEntry[];
  awayLineup: GameLineupEntry[];
  events: GameEvent[];
  scorekeepers: { id: string; team_id: string; user_id: string }[];
  userId: string;
  userTeamId: string | null;
}

export function ScoringInterface({
  gameId,
  game,
  homeLineup,
  awayLineup,
  events,
  scorekeepers,
  userId,
  userTeamId,
}: ScoringInterfaceProps) {
  const router = useRouter();

  // Compute current game state from events
  const activeEvents = events.filter((e) => !e.is_deleted);
  const lastEvent = activeEvents[activeEvents.length - 1];

  const currentInning = game.inning ?? 1;
  const currentHalf = (game.inning_half as 'top' | 'bottom') ?? 'top';
  const isTopHalf = currentHalf === 'top';

  // The batting team for current half
  const battingLineup = isTopHalf ? awayLineup : homeLineup;
  const battingTeamName = isTopHalf
    ? game.away_team_name
    : game.home_team_name;

  // Figure out current runners and outs from last event
  const currentRunners: BaseRunners = lastEvent
    ? lastEvent.runners_after
    : { first: null, second: null, third: null };
  const currentOuts = lastEvent ? lastEvent.outs_after : 0;

  // Calculate current batter index
  const battingTeamEvents = activeEvents.filter(
    (e) =>
      e.batter_user_id &&
      battingLineup.some((l) => l.player_user_id === e.batter_user_id)
  );
  const currentBatterIndex =
    battingLineup.length > 0
      ? battingTeamEvents.length % battingLineup.length
      : 0;

  const currentBatter = battingLineup[currentBatterIndex];

  // State for recording a play
  const [selectedZone, setSelectedZone] = useState<number | null>(null);
  const [selectedOutcome, setSelectedOutcome] = useState<string>('');
  const [hitLocation, setHitLocation] = useState<number>(0);
  const [fieldingSequence, setFieldingSequence] = useState('');
  const [notes, setNotes] = useState('');
  const [runsScored, setRunsScored] = useState(0);
  const [outsAfter, setOutsAfter] = useState(currentOuts);
  const [recording, setRecording] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [runnersAfter, setRunnersAfter] = useState<BaseRunners>(currentRunners);
  const [balls, setBalls] = useState(0);
  const [strikes, setStrikes] = useState(0);

  // Auto-refresh every 5s so both scorekeepers see each other's plays live
  const recordingRef = useRef(false);
  recordingRef.current = recording;
  useEffect(() => {
    if (game.status !== 'in_progress') return;
    const interval = setInterval(() => {
      if (!recordingRef.current) {
        router.refresh();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [game.status, router]);

  function handleZoneClick(zone: number) {
    setSelectedZone(zone);
    setHitLocation(zone);
    setSelectedOutcome('');
    setError(null);
  }

  function clearZone() {
    setSelectedZone(null);
    setSelectedOutcome('');
    setHitLocation(0);
  }

  // Compute forced runner advancement for a walk
  function computeWalkRunners(): { runners: BaseRunners; runs: number } {
    const batterId = currentBatter?.player_user_id ?? 'batter';
    let runs = 0;

    // Forced advancement: runners only move if there's a continuous chain from first
    if (currentRunners.first) {
      if (currentRunners.second) {
        if (currentRunners.third) {
          // Bases loaded: everyone advances, runner on third scores
          runs = 1;
          return {
            runners: {
              first: batterId,
              second: currentRunners.first,
              third: currentRunners.second,
            },
            runs,
          };
        }
        // First & second occupied: both advance
        return {
          runners: {
            first: batterId,
            second: currentRunners.first,
            third: currentRunners.second,
          },
          runs: 0,
        };
      }
      // Only first occupied: first advances to second
      return {
        runners: {
          first: batterId,
          second: currentRunners.first,
          third: currentRunners.third,
        },
        runs: 0,
      };
    }
    // First is empty: batter goes to first, no one else moves
    return {
      runners: {
        first: batterId,
        second: currentRunners.second,
        third: currentRunners.third,
      },
      runs: 0,
    };
  }

  // Auto-record a walk (4 balls) or strikeout (3 strikes)
  async function autoRecordPlay(
    outcome: string,
    autoOuts: number,
    autoRuns: number,
    autoRunners: BaseRunners,
    countBalls: number,
    countStrikes: number,
  ) {
    setRecording(true);
    setError(null);

    const supabase = createClient();

    const eventData = {
      inning: currentInning,
      inning_half: currentHalf,
      batter_user_id: currentBatter?.player_user_id ?? null,
      outcome,
      hit_location: null,
      fielding_sequence: null,
      outs_after: autoOuts,
      runs_scored: autoRuns,
      runners_after: autoRunners,
      runner_movements: null,
      pitch_count: countBalls + countStrikes,
      balls: countBalls,
      strikes: countStrikes,
      notes: null,
    };

    const { error: rpcError } = await supabase.rpc('record_play', {
      p_game_id: gameId,
      p_event: eventData,
    });

    if (rpcError) {
      setError(rpcError.message);
    } else {
      // Reset everything
      setSelectedZone(null);
      setSelectedOutcome('');
      setHitLocation(0);
      setFieldingSequence('');
      setNotes('');
      setRunsScored(0);
      setShowAdvanced(false);
      setBalls(0);
      setStrikes(0);
      router.refresh();
    }
    setRecording(false);
  }

  function handleBall() {
    const newBalls = balls + 1;
    if (newBalls >= 4) {
      // Walk: batter to first, forced runners advance
      const { runners, runs } = computeWalkRunners();
      autoRecordPlay('walk', currentOuts, runs, runners, 4, strikes);
    } else {
      setBalls(newBalls);
    }
  }

  function handleStrike() {
    const newStrikes = strikes + 1;
    if (newStrikes >= 3) {
      // Strikeout
      const newOuts = Math.min(currentOuts + 1, 3);
      autoRecordPlay(
        'strikeout_swinging',
        newOuts,
        0,
        currentRunners,
        balls,
        3,
      );
    } else {
      setStrikes(newStrikes);
    }
  }

  // Compute runs/outs/runners for a given outcome (pure calculation, no state)
  function computeOutcomeDefaults(outcome: string) {
    const isOut = ([...OUT_OUTCOMES] as string[]).includes(outcome);
    let outs = currentOuts;
    let runs = 0;
    let runners = currentRunners;

    if (isOut) {
      const outsToAdd =
        outcome === 'double_play' ? 2 : outcome === 'triple_play' ? 3 : 1;
      outs = Math.min(currentOuts + outsToAdd, 3);
    } else if (outcome === 'home_run') {
      const runnersOn = [
        currentRunners.first,
        currentRunners.second,
        currentRunners.third,
      ].filter(Boolean).length;
      runs = runnersOn + 1;
      runners = { first: null, second: null, third: null };
    }

    return { outs, runs, runners };
  }

  function selectOutcome(outcome: string) {
    setSelectedOutcome(outcome);
    setError(null);

    const { outs, runs, runners } = computeOutcomeDefaults(outcome);
    setOutsAfter(outs);
    setRunsScored(runs);
    if (outcome === 'home_run') {
      setRunnersAfter(runners);
    }
  }

  // Click an outcome in the field popup → auto-record immediately
  async function handlePopupOutcome(outcome: string, zone: number) {
    const { outs, runs, runners } = computeOutcomeDefaults(outcome);

    setRecording(true);
    setError(null);

    const supabase = createClient();

    const eventData = {
      inning: currentInning,
      inning_half: currentHalf,
      batter_user_id: currentBatter?.player_user_id ?? null,
      outcome,
      hit_location: zone,
      fielding_sequence: null,
      outs_after: outs,
      runs_scored: runs,
      runners_after: runners,
      runner_movements: null,
      pitch_count: balls + strikes > 0 ? balls + strikes : null,
      balls: balls > 0 ? balls : null,
      strikes: strikes > 0 ? strikes : null,
      notes: null,
    };

    const { error: rpcError } = await supabase.rpc('record_play', {
      p_game_id: gameId,
      p_event: eventData,
    });

    if (rpcError) {
      setError(rpcError.message);
    } else {
      setSelectedZone(null);
      setSelectedOutcome('');
      setHitLocation(0);
      setFieldingSequence('');
      setNotes('');
      setRunsScored(0);
      setShowAdvanced(false);
      setBalls(0);
      setStrikes(0);
      router.refresh();
    }
    setRecording(false);
  }

  async function handleRecordPlay() {
    if (!selectedOutcome) {
      setError('Select a play outcome');
      return;
    }

    setRecording(true);
    setError(null);

    const supabase = createClient();

    const eventData = {
      inning: currentInning,
      inning_half: currentHalf,
      batter_user_id: currentBatter?.player_user_id ?? null,
      outcome: selectedOutcome,
      hit_location: hitLocation || null,
      fielding_sequence: fieldingSequence || null,
      outs_after: outsAfter,
      runs_scored: runsScored,
      runners_after: runnersAfter,
      runner_movements: null,
      pitch_count: balls + strikes > 0 ? balls + strikes : null,
      balls: balls > 0 ? balls : null,
      strikes: strikes > 0 ? strikes : null,
      notes: notes || null,
    };

    const { error: rpcError } = await supabase.rpc('record_play', {
      p_game_id: gameId,
      p_event: eventData,
    });

    if (rpcError) {
      setError(rpcError.message);
    } else {
      // Reset form
      setSelectedZone(null);
      setSelectedOutcome('');
      setHitLocation(0);
      setFieldingSequence('');
      setNotes('');
      setRunsScored(0);
      setShowAdvanced(false);
      setBalls(0);
      setStrikes(0);
      router.refresh();
    }
    setRecording(false);
  }

  async function handleUndo() {
    setUndoing(true);
    setError(null);

    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc('undo_last_play', {
      p_game_id: gameId,
    });

    if (rpcError) {
      setError(rpcError.message);
    } else {
      router.refresh();
    }
    setUndoing(false);
  }

  const gameNotStarted = game.status === 'scheduled';
  const gameOver = game.status === 'final' || game.status === 'cancelled';
  const noLineup = battingLineup.length === 0;

  // Zone outcomes for the selected zone
  const zoneOutcomes = selectedZone
    ? FIELD_ZONE_OPTIONS[selectedZone] ?? []
    : [];
  const zoneName = selectedZone ? FIELD_POSITIONS[selectedZone] : '';
  const zoneAbbrev = selectedZone ? FIELD_POSITION_ABBREV[selectedZone] : '';

  return (
    <div className="mt-6">
      {/* Game state bar */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          {/* Score */}
          <div className="flex items-center gap-6">
            <div className="text-center">
              <p className="text-xs text-gray-500 uppercase">
                {game.away_team_name}
              </p>
              <p className="text-2xl font-bold text-gray-900">
                {game.away_score}
              </p>
            </div>
            <span className="text-gray-300">&mdash;</span>
            <div className="text-center">
              <p className="text-xs text-gray-500 uppercase">
                {game.home_team_name}
              </p>
              <p className="text-2xl font-bold text-gray-900">
                {game.home_score}
              </p>
            </div>
          </div>

          {/* Inning */}
          <div className="text-center">
            <p className="text-xs text-gray-500 uppercase">Inning</p>
            <p className="text-lg font-bold text-gray-900">
              {isTopHalf ? '▲' : '▼'} {currentInning}
            </p>
          </div>

          {/* Outs */}
          <div className="text-center">
            <p className="text-xs text-gray-500 uppercase">Outs</p>
            <div className="flex gap-1 justify-center mt-1">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className={`h-4 w-4 rounded-full border-2 ${
                    i < currentOuts
                      ? 'bg-red-500 border-red-500'
                      : 'border-gray-300'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Base runner diamond */}
        <div className="mt-4 flex justify-center">
          <div className="relative w-32 h-32">
            <svg viewBox="0 0 100 100" className="w-full h-full">
              <path
                d="M50 85 L15 50 L50 15 L85 50 Z"
                fill="none"
                stroke="#d1d5db"
                strokeWidth="2"
              />
              <rect
                x="45"
                y="80"
                width="10"
                height="10"
                fill="#9ca3af"
                className="opacity-50"
              />
              <rect
                x="78"
                y="44"
                width="12"
                height="12"
                rx="2"
                fill={currentRunners.first ? '#3b82f6' : '#e5e7eb'}
                stroke={currentRunners.first ? '#2563eb' : '#d1d5db'}
                strokeWidth="2"
              />
              <rect
                x="44"
                y="9"
                width="12"
                height="12"
                rx="2"
                fill={currentRunners.second ? '#3b82f6' : '#e5e7eb'}
                stroke={currentRunners.second ? '#2563eb' : '#d1d5db'}
                strokeWidth="2"
              />
              <rect
                x="9"
                y="44"
                width="12"
                height="12"
                rx="2"
                fill={currentRunners.third ? '#3b82f6' : '#e5e7eb'}
                stroke={currentRunners.third ? '#2563eb' : '#d1d5db'}
                strokeWidth="2"
              />
            </svg>
          </div>
        </div>
      </div>

      {/* Current at-bat */}
      {noLineup ? (
        <div className="mt-4 rounded-lg border-2 border-dashed border-yellow-300 bg-yellow-50 p-4 text-center">
          <p className="text-yellow-800 font-medium">
            No lineup set for {battingTeamName}
          </p>
          <a
            href={`/games/${gameId}/lineup`}
            className="mt-1 text-sm text-blue-600 hover:text-blue-500"
          >
            Set lineup first &rarr;
          </a>
        </div>
      ) : gameOver ? (
        <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4 text-center">
          <p className="text-gray-600 font-medium">Game is over</p>
        </div>
      ) : (
        <>
          {/* Current batter info */}
          <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 uppercase">At Bat</p>
                <p className="text-lg font-bold text-gray-900">
                  {currentBatter?.player_name ?? 'Unknown'}
                  {currentBatter?.jersey_number != null && (
                    <span className="ml-1 text-gray-400 text-sm">
                      #{currentBatter.jersey_number}
                    </span>
                  )}
                </p>
                <p className="text-sm text-gray-500">
                  #{currentBatter?.batting_order ?? '?'} in order &middot;{' '}
                  {FIELD_POSITION_ABBREV[currentBatter?.fielding_position ?? 0] ??
                    'DH'}
                </p>
              </div>
              <p className="text-sm text-gray-500">{battingTeamName}</p>
            </div>
          </div>

          {/* Ball / Strike count */}
          <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-center gap-8">
              {/* Balls */}
              <div className="text-center">
                <p className="text-xs text-gray-500 uppercase mb-2">Balls</p>
                <div className="flex items-center gap-2 mb-2 justify-center">
                  {[0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className={`h-5 w-5 rounded-full border-2 ${
                        i < balls
                          ? 'bg-green-500 border-green-500'
                          : 'border-gray-300'
                      }`}
                    />
                  ))}
                </div>
                <button
                  onClick={handleBall}
                  disabled={recording}
                  className="rounded-lg bg-green-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  Ball
                </button>
              </div>

              {/* Strikes */}
              <div className="text-center">
                <p className="text-xs text-gray-500 uppercase mb-2">Strikes</p>
                <div className="flex items-center gap-2 mb-2 justify-center">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className={`h-5 w-5 rounded-full border-2 ${
                        i < strikes
                          ? 'bg-yellow-500 border-yellow-500'
                          : 'border-gray-300'
                      }`}
                    />
                  ))}
                </div>
                <button
                  onClick={handleStrike}
                  disabled={recording}
                  className="rounded-lg bg-yellow-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-yellow-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  Strike
                </button>
              </div>

              {/* Foul button (strike that can't go past 2) */}
              <div className="text-center">
                <p className="text-xs text-gray-500 uppercase mb-2">&nbsp;</p>
                <div className="h-5 mb-2" />
                <button
                  onClick={() => {
                    if (strikes < 2) setStrikes(strikes + 1);
                  }}
                  disabled={recording}
                  className="rounded-lg bg-orange-400 px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-500 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  Foul
                </button>
              </div>
            </div>

            {/* Count display */}
            {(balls > 0 || strikes > 0) && (
              <p className="mt-3 text-center text-sm text-gray-500">
                Count: <span className="font-bold text-gray-900">{balls}-{strikes}</span>
              </p>
            )}
          </div>

          {/* Clickable baseball field with popup overlay */}
          <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <div className="relative overflow-visible">
              <ScoringField
                selectedZone={selectedZone}
                onZoneClick={handleZoneClick}
              />

              {/* Popup at the clicked zone */}
              {selectedZone && (() => {
                const abbrev = SCORING_TO_POSITION[selectedZone];
                const coords = FIELD_POSITION_COORDS[abbrev];
                if (!coords) return null;

                const leftPct = (coords.x / 500) * 100;
                const topPct = (coords.y / 500) * 100;
                // Show popup below zones in top half of field, above zones in bottom half
                const showBelow = topPct < 55;

                return (
                  <div
                    className="absolute z-20 w-56"
                    style={{
                      left: `${leftPct}%`,
                      top: showBelow ? `${topPct + 7}%` : undefined,
                      bottom: showBelow ? undefined : `${100 - topPct + 7}%`,
                      transform: 'translateX(-50%)',
                    }}
                  >
                    <div className="rounded-xl bg-white shadow-xl border border-gray-200 p-3">
                      {/* Header */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1.5">
                          <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-blue-600 text-white text-[10px] font-bold">
                            {zoneAbbrev}
                          </span>
                          <span className="text-xs font-semibold text-gray-900">
                            {zoneName}
                          </span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            clearZone();
                          }}
                          className="rounded-full p-0.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {/* Outcome buttons — auto-records on click */}
                      <div className="grid grid-cols-2 gap-1.5">
                        {zoneOutcomes.map((outcome) => {
                          const colorClasses =
                            PLAY_OUTCOME_COLORS[outcome] ?? 'bg-gray-100 text-gray-800';
                          return (
                            <button
                              key={outcome}
                              disabled={recording}
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePopupOutcome(outcome, selectedZone!);
                              }}
                              className={`rounded-lg px-2 py-2 text-xs font-semibold transition-all ${colorClasses} hover:opacity-100 opacity-90 disabled:opacity-50`}
                            >
                              {PLAY_OUTCOME_LABELS[outcome] ?? outcome}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    {/* Arrow pointer */}
                    <div
                      className={`absolute left-1/2 -translate-x-1/2 w-3 h-3 bg-white border-gray-200 rotate-45 ${
                        showBelow
                          ? '-top-1.5 border-l border-t'
                          : '-bottom-1.5 border-r border-b'
                      }`}
                    />
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Fallback: All outcomes dropdown (for walks, HBP, baserunning, etc.) */}
          <div className="mt-4">
            <label className="text-sm font-medium text-gray-700">
              All outcomes (no field zone)
            </label>
            <select
              value={selectedZone ? '' : selectedOutcome}
              onChange={(e) => {
                if (e.target.value) {
                  setSelectedZone(null);
                  setHitLocation(0);
                  selectOutcome(e.target.value);
                }
              }}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Select outcome...</option>
              <optgroup label="Hits">
                {HIT_OUTCOMES.map((o) => (
                  <option key={o} value={o}>
                    {PLAY_OUTCOME_LABELS[o]}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Outs">
                {OUT_OUTCOMES.map((o) => (
                  <option key={o} value={o}>
                    {PLAY_OUTCOME_LABELS[o]}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Walks">
                {WALK_OUTCOMES.map((o) => (
                  <option key={o} value={o}>
                    {PLAY_OUTCOME_LABELS[o]}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Baserunning">
                {BASERUNNING_OUTCOMES.map((o) => (
                  <option key={o} value={o}>
                    {PLAY_OUTCOME_LABELS[o]}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Other">
                <option value="error">{PLAY_OUTCOME_LABELS.error}</option>
                <option value="fielders_choice">
                  {PLAY_OUTCOME_LABELS.fielders_choice}
                </option>
                <option value="sacrifice_fly">
                  {PLAY_OUTCOME_LABELS.sacrifice_fly}
                </option>
                <option value="sacrifice_bunt">
                  {PLAY_OUTCOME_LABELS.sacrifice_bunt}
                </option>
                <option value="other">{PLAY_OUTCOME_LABELS.other}</option>
              </optgroup>
            </select>
          </div>

          {/* Fallback outcome detail (when using dropdown without field zone) */}
          {!selectedZone && selectedOutcome && (
            <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
              <div className="flex items-center justify-between mb-3">
                <span
                  className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${
                    PLAY_OUTCOME_COLORS[selectedOutcome] ??
                    'bg-gray-100 text-gray-800'
                  }`}
                >
                  {PLAY_OUTCOME_LABELS[selectedOutcome] ?? selectedOutcome}
                </span>
                <button
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="text-xs text-blue-600 hover:text-blue-500"
                >
                  {showAdvanced ? 'Hide details' : 'Show details'}
                </button>
              </div>

              {/* Runs & Outs adjusters */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-600">
                    Runs scored
                  </label>
                  <div className="flex items-center gap-2 mt-1">
                    <button
                      onClick={() =>
                        setRunsScored(Math.max(0, runsScored - 1))
                      }
                      className="rounded bg-gray-200 px-2 py-1 text-sm font-bold hover:bg-gray-300"
                    >
                      -
                    </button>
                    <span className="text-lg font-bold w-8 text-center">
                      {runsScored}
                    </span>
                    <button
                      onClick={() => setRunsScored(runsScored + 1)}
                      className="rounded bg-gray-200 px-2 py-1 text-sm font-bold hover:bg-gray-300"
                    >
                      +
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">
                    Outs after play
                  </label>
                  <div className="flex items-center gap-2 mt-1">
                    <button
                      onClick={() =>
                        setOutsAfter(Math.max(0, outsAfter - 1))
                      }
                      className="rounded bg-gray-200 px-2 py-1 text-sm font-bold hover:bg-gray-300"
                    >
                      -
                    </button>
                    <span className="text-lg font-bold w-8 text-center">
                      {outsAfter}
                    </span>
                    <button
                      onClick={() =>
                        setOutsAfter(Math.min(3, outsAfter + 1))
                      }
                      className="rounded bg-gray-200 px-2 py-1 text-sm font-bold hover:bg-gray-300"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              {showAdvanced && (
                <div className="mt-4 space-y-3">
                  <div>
                    <label className="text-xs font-medium text-gray-600">
                      Hit location (field position)
                    </label>
                    <select
                      value={hitLocation}
                      onChange={(e) =>
                        setHitLocation(parseInt(e.target.value))
                      }
                      className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                    >
                      <option value={0}>None</option>
                      {Object.entries(FIELD_POSITION_ABBREV).map(
                        ([num, abbrev]) => (
                          <option key={num} value={num}>
                            {num} - {abbrev}
                          </option>
                        )
                      )}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">
                      Fielding sequence (e.g. 6-3)
                    </label>
                    <input
                      type="text"
                      value={fieldingSequence}
                      onChange={(e) => setFieldingSequence(e.target.value)}
                      placeholder="6-3"
                      className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">
                      Notes
                    </label>
                    <input
                      type="text"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Optional notes..."
                      className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                    />
                  </div>
                </div>
              )}

              {/* Record play button */}
              <div className="mt-4">
                <button
                  onClick={handleRecordPlay}
                  disabled={recording}
                  className="w-full rounded-md bg-green-600 px-4 py-3 text-sm font-bold text-white hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {recording ? (
                    'Recording...'
                  ) : (
                    <>
                      Record Play <ChevronRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Undo button */}
          {activeEvents.length > 0 && (
            <button
              onClick={handleUndo}
              disabled={undoing}
              className="mt-4 flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <Undo2 className="h-4 w-4" />
              {undoing ? 'Undoing...' : 'Undo Last Play'}
            </button>
          )}

          {error && (
            <p className="mt-2 text-sm text-red-600">{error}</p>
          )}
        </>
      )}
    </div>
  );
}
