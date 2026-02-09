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
import { Undo2, ChevronRight, X, RefreshCw } from 'lucide-react';
import { ScoringField } from './scoring-field';
import { SubstitutionPanel } from './substitution-panel';

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
    allow_reentry?: boolean;
    innings_per_game?: number;
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

  // Separate active starters, bench, and exited players for BOTH teams
  const allBatting = isTopHalf ? awayLineup : homeLineup;
  const allFielding = isTopHalf ? homeLineup : awayLineup;
  const battingTeamName = isTopHalf ? game.away_team_name : game.home_team_name;
  const battingTeamId = isTopHalf ? game.away_team_id : game.home_team_id;
  const fieldingTeamId = isTopHalf ? game.home_team_id : game.away_team_id;
  const allowReentry = game.allow_reentry ?? false;

  const battingStarters = allBatting
    .filter((l) => l.exited_inning == null && l.fielding_position != null)
    .sort((a, b) => a.batting_order - b.batting_order);
  const battingBench = allBatting.filter((l) => l.exited_inning == null && l.fielding_position == null);
  const battingExited = allBatting.filter((l) => l.exited_inning != null);

  const fieldingStarters = allFielding
    .filter((l) => l.exited_inning == null && l.fielding_position != null)
    .sort((a, b) => a.batting_order - b.batting_order);
  const fieldingBench = allFielding.filter((l) => l.exited_inning == null && l.fielding_position == null);
  const fieldingExited = allFielding.filter((l) => l.exited_inning != null);

  // Current pitcher — fielding team's player at position 1
  const currentPitcher = fieldingStarters.find((l) => l.fielding_position === 1) ?? null;

  // Figure out current runners and outs from the last event in the CURRENT half-inning.
  const lastEventInCurrentHalf =
    lastEvent &&
    lastEvent.inning === currentInning &&
    lastEvent.inning_half === currentHalf;

  const rawRunners: BaseRunners = lastEventInCurrentHalf
    ? lastEvent.runners_after
    : { first: null, second: null, third: null };
  const currentOuts = lastEventInCurrentHalf ? lastEvent.outs_after : 0;

  // Calculate current batter index — count ALL at-bats for this team by inning_half.
  const battingTeamEvents = activeEvents.filter(
    (e) => e.batter_user_id && (isTopHalf ? e.inning_half === 'top' : e.inning_half === 'bottom')
  );
  const currentBatterIndex =
    battingStarters.length > 0
      ? battingTeamEvents.length % battingStarters.length
      : 0;

  const currentBatter = battingStarters[currentBatterIndex];

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
  const [runnersAfter, setRunnersAfter] = useState<BaseRunners>(rawRunners);
  const [balls, setBalls] = useState(0);
  const [strikes, setStrikes] = useState(0);
  const [pitchLog, setPitchLog] = useState<('B' | 'S' | 'F')[]>([]);
  const [dpRunnerOut, setDpRunnerOut] = useState<'first' | 'second' | 'third' | null>(null);
  const [autoRecordCountdown, setAutoRecordCountdown] = useState<number | null>(null);
  const AUTO_RECORD_SECONDS = 5;

  // Substitution state
  const [subMode, setSubMode] = useState<'pinch_hit' | 'pinch_run' | 'pitcher' | null>(null);
  const [subTarget, setSubTarget] = useState<GameLineupEntry | null>(null);

  // Pinch runner overrides: old player ID → new player ID
  const [runnerOverrides, setRunnerOverrides] = useState<Record<string, string>>({});

  // Apply pinch runner overrides on top of event-derived runners
  const currentRunners: BaseRunners = {
    first: (rawRunners.first && runnerOverrides[rawRunners.first]) || rawRunners.first,
    second: (rawRunners.second && runnerOverrides[rawRunners.second]) || rawRunners.second,
    third: (rawRunners.third && runnerOverrides[rawRunners.third]) || rawRunners.third,
  };

  // Reset runner overrides when events change (new play recorded or undo)
  const eventCount = activeEvents.length;
  const prevEventCountRef = useRef(eventCount);
  useEffect(() => {
    if (eventCount !== prevEventCountRef.current) {
      setRunnerOverrides({});
      prevEventCountRef.current = eventCount;
    }
  }, [eventCount]);

  // Common DP fielding sequences by zone (fielding position that fields the ball)
  const DP_SEQUENCES: Record<number, string[]> = {
    1: ['1-6-3', '1-4-3', '1-3', '1-2-3'],
    2: ['2-6-3', '2-4-3', '2-5-3', '2-6', '2-3'],
    3: ['3-6-3', '3-6-1', '3-2-6', '3-6', '3 unas.'],
    4: ['4-6-3', '4-6', '4-3', '4-2-3'],
    5: ['5-4-3', '5-6-3', '5-2-3', '5-4', '5-6', '5-2', '5-3'],
    6: ['6-4-3', '6-2-3', '6-3', '6-4', '6-2'],
    7: ['7-6-3', '7-4-3', '7-2-3'],
    8: ['8-6-3', '8-4-3', '8-2-3'],
    9: ['9-6-3', '9-4-3', '9-2-3', '9-3'],
  };

  // Auto-record timer: start when play detail panel is visible, reset on interaction
  const handleRecordPlayRef = useRef<() => void>(() => {});
  useEffect(() => {
    handleRecordPlayRef.current = handleRecordPlay;
  });

  useEffect(() => {
    if (selectedOutcome && !selectedZone) {
      setAutoRecordCountdown(AUTO_RECORD_SECONDS);
    } else {
      setAutoRecordCountdown(null);
    }
  }, [selectedOutcome, selectedZone]);

  useEffect(() => {
    if (autoRecordCountdown === null || recording) return;
    if (autoRecordCountdown <= 0) {
      handleRecordPlayRef.current();
      return;
    }
    const timer = setTimeout(() => {
      setAutoRecordCountdown((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);
    return () => clearTimeout(timer);
  }, [autoRecordCountdown, recording]);

  function resetAutoTimer() {
    if (autoRecordCountdown !== null) {
      setAutoRecordCountdown(AUTO_RECORD_SECONDS);
    }
  }

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

  function getPitchSequence(): string | null {
    if (pitchLog.length === 0) return null;
    return pitchLog.join('');
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

    const seq = getPitchSequence();
    const eventData = {
      inning: currentInning,
      inning_half: currentHalf,
      batter_user_id: currentBatter?.player_user_id ?? null,
      pitcher_user_id: currentPitcher?.player_user_id ?? null,
      outcome,
      hit_location: null,
      fielding_sequence: null,
      outs_after: autoOuts,
      runs_scored: autoRuns,
      runners_after: autoRunners,
      runner_movements: null,
      pitch_count: pitchLog.length > 0 ? pitchLog.length : countBalls + countStrikes,
      balls: countBalls,
      strikes: countStrikes,
      notes: seq,
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
      setPitchLog([]);
      setDpRunnerOut(null);
      router.refresh();
    }
    setRecording(false);
  }

  function handleBall() {
    setPitchLog((prev) => [...prev, 'B']);
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
    setPitchLog((prev) => [...prev, 'S']);
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

  // Advance all runners by a given number of bases, place batter on his base.
  // Runners that advance past 3rd score.
  function advanceRunners(
    runnerAdvance: number, // how many bases each existing runner advances
    batterBase: number, // where batter ends up: 1=1st, 2=2nd, 3=3rd, 4+=scores
  ): { runners: BaseRunners; runs: number } {
    const batterId = currentBatter?.player_user_id ?? 'batter';
    let runs = 0;
    let newFirst: string | null = null;
    let newSecond: string | null = null;
    let newThird: string | null = null;

    // Advance runner on 3rd
    if (currentRunners.third) {
      const dest = 3 + runnerAdvance;
      if (dest >= 4) runs++;
      else if (dest === 3) newThird = currentRunners.third;
    }
    // Advance runner on 2nd
    if (currentRunners.second) {
      const dest = 2 + runnerAdvance;
      if (dest >= 4) runs++;
      else if (dest === 3) newThird = currentRunners.second;
      else if (dest === 2) newSecond = currentRunners.second;
    }
    // Advance runner on 1st
    if (currentRunners.first) {
      const dest = 1 + runnerAdvance;
      if (dest >= 4) runs++;
      else if (dest === 3) newThird = currentRunners.first;
      else if (dest === 2) newSecond = currentRunners.first;
      else if (dest === 1) newFirst = currentRunners.first;
    }

    // Place batter
    if (batterBase >= 4) {
      runs++;
    } else if (batterBase === 3) {
      newThird = batterId;
    } else if (batterBase === 2) {
      newSecond = batterId;
    } else if (batterBase === 1) {
      newFirst = batterId;
    }

    return { runners: { first: newFirst, second: newSecond, third: newThird }, runs };
  }

  // Compute runs/outs/runners for a given outcome (pure calculation, no state).
  // zone: field position where the ball went (1-6 infield, 7-9 outfield)
  // dpVictim: for double plays, which base's runner is the second out
  function computeOutcomeDefaults(
    outcome: string,
    zone?: number,
    dpVictim?: 'first' | 'second' | 'third',
  ) {
    const isOut = ([...OUT_OUTCOMES] as string[]).includes(outcome);
    const isWalk = ([...WALK_OUTCOMES] as string[]).includes(outcome);
    let outs = currentOuts;
    let runs = 0;
    let runners = currentRunners;

    if (outcome === 'double_play') {
      outs = Math.min(currentOuts + 2, 3);
      // Batter is out + the specified runner (or lead runner by default)
      runners = { ...currentRunners };
      const victim = dpVictim ?? (
        runners.first ? 'first' : runners.second ? 'second' : 'third'
      );
      runners[victim] = null;
    } else if (isOut) {
      const outsToAdd = outcome === 'triple_play' ? 3 : 1;
      outs = Math.min(currentOuts + outsToAdd, 3);
    } else if (outcome === 'home_run') {
      // Everyone scores
      const result = advanceRunners(4, 4);
      runs = result.runs;
      runners = result.runners;
    } else if (outcome === 'triple') {
      // Runners advance 3 bases, batter to 3rd
      const result = advanceRunners(3, 3);
      runs = result.runs;
      runners = result.runners;
    } else if (outcome === 'double') {
      // Runners advance 2 bases, batter to 2nd
      const result = advanceRunners(2, 2);
      runs = result.runs;
      runners = result.runners;
    } else if (outcome === 'single') {
      // Infield (zones 1-6): runners advance 1 base
      // Outfield (zones 7-9): runners advance 2 bases
      const isOutfield = zone != null && zone >= 7;
      const runnerBases = isOutfield ? 2 : 1;
      const result = advanceRunners(runnerBases, 1);
      runs = result.runs;
      runners = result.runners;
    } else if (outcome === 'error' || outcome === 'fielders_choice') {
      // Reach on error / fielder's choice: batter to 1st, runners advance 1 base
      const result = advanceRunners(1, 1);
      runs = result.runs;
      runners = result.runners;
    } else if (outcome === 'sacrifice_fly') {
      // Batter is out, runner on 3rd scores
      outs = Math.min(currentOuts + 1, 3);
      runners = {
        first: currentRunners.first,
        second: currentRunners.second,
        third: null,
      };
      runs = currentRunners.third ? 1 : 0;
    } else if (isWalk) {
      // Walk/IBB/HBP: forced advancement only
      const result = computeWalkRunners();
      runs = result.runs;
      runners = result.runners;
    }

    return { outs, runs, runners };
  }

  // Determine if an outcome should auto-record (no runner choices to make)
  function shouldAutoRecord(outcome: string): boolean {
    // Always deterministic — no runner adjustment needed
    if (outcome === 'home_run') return true;
    if (outcome === 'triple') return true;
    if (([...WALK_OUTCOMES] as string[]).includes(outcome)) return true;

    // Any outcome with empty bases has no runner choices
    const hasRunners = !!(currentRunners.first || currentRunners.second || currentRunners.third);
    if (!hasRunners) return true;

    return false;
  }

  function selectOutcome(outcome: string, zone?: number) {
    setSelectedOutcome(outcome);
    setError(null);

    if (outcome === 'double_play') {
      // Default DP victim: lead runner (closest to scoring)
      const victim: 'first' | 'second' | 'third' =
        currentRunners.first ? 'first' : currentRunners.second ? 'second' : 'third';
      setDpRunnerOut(victim);
      const { outs, runs, runners } = computeOutcomeDefaults(outcome, zone, victim);
      setOutsAfter(outs);
      setRunsScored(runs);
      setRunnersAfter(runners);
    } else {
      setDpRunnerOut(null);
      const { outs, runs, runners } = computeOutcomeDefaults(outcome, zone);
      setOutsAfter(outs);
      setRunsScored(runs);
      setRunnersAfter(runners);
    }
  }

  // Change which runner is out in a double play
  function changeDpRunnerOut(base: 'first' | 'second' | 'third') {
    setDpRunnerOut(base);
    // Rebuild runnersAfter: remove the new victim, keep all others
    const newRunners = { ...currentRunners };
    newRunners[base] = null;
    setRunnersAfter(newRunners);
    setRunsScored(0); // reset — scorekeeper can adjust if a run scores
    resetAutoTimer();
  }

  // Auto-record a play with computed defaults (skips the staged review panel)
  async function autoRecordOutcome(outcome: string, zone?: number) {
    setRecording(true);
    setError(null);
    setSelectedZone(null);

    const { outs, runs, runners } = computeOutcomeDefaults(outcome, zone);
    const supabase = createClient();
    const seq = getPitchSequence();

    const eventData = {
      inning: currentInning,
      inning_half: currentHalf,
      batter_user_id: currentBatter?.player_user_id ?? null,
      pitcher_user_id: currentPitcher?.player_user_id ?? null,
      outcome,
      hit_location: zone || null,
      fielding_sequence: null,
      outs_after: outs,
      runs_scored: runs,
      runners_after: runners,
      runner_movements: null,
      pitch_count: pitchLog.length > 0 ? pitchLog.length : (balls + strikes > 0 ? balls + strikes : null),
      balls: balls > 0 ? balls : null,
      strikes: strikes > 0 ? strikes : null,
      notes: seq,
    };

    const { error: rpcError } = await supabase.rpc('record_play', {
      p_game_id: gameId,
      p_event: eventData,
    });

    if (rpcError) {
      setError(rpcError.message);
    } else {
      setSelectedOutcome('');
      setHitLocation(0);
      setFieldingSequence('');
      setNotes('');
      setRunsScored(0);
      setShowAdvanced(false);
      setBalls(0);
      setStrikes(0);
      setPitchLog([]);
      setDpRunnerOut(null);
      router.refresh();
    }
    setRecording(false);
  }

  // Click an outcome in the field popup → auto-record if unambiguous, else stage for review
  function handlePopupOutcome(outcome: string, zone: number) {
    if (shouldAutoRecord(outcome)) {
      autoRecordOutcome(outcome, zone);
      return;
    }
    setSelectedZone(null); // close popup
    setHitLocation(zone);
    selectOutcome(outcome, zone);
  }

  // Click a DP sequence in the field popup → set outcome + fielding sequence, open review
  function handlePopupDp(sequence: string, zone: number) {
    setSelectedZone(null);
    setHitLocation(zone);
    setFieldingSequence(sequence);
    selectOutcome('double_play', zone);
  }

  // Get runner name from lineups
  function getRunnerName(playerId: string): string {
    const player = [...awayLineup, ...homeLineup].find(
      (l) => l.player_user_id === playerId
    );
    if (!player) return '?';
    const last = player.player_name?.split(' ').pop() ?? '?';
    return player.jersey_number != null ? `${last} #${player.jersey_number}` : last;
  }

  // Determine where a runner ends up based on runnersAfter state
  function getRunnerDest(playerId: string): 'first' | 'second' | 'third' | 'home' {
    if (runnersAfter.first === playerId) return 'first';
    if (runnersAfter.second === playerId) return 'second';
    if (runnersAfter.third === playerId) return 'third';
    return 'home';
  }

  // Adjust a runner's destination and update runs scored
  function adjustRunnerDest(
    playerId: string,
    dest: 'first' | 'second' | 'third' | 'home'
  ) {
    const newRunners = { ...runnersAfter };
    let newRuns = runsScored;
    const wasScoring =
      newRunners.first !== playerId &&
      newRunners.second !== playerId &&
      newRunners.third !== playerId;

    // Remove from current position
    if (newRunners.first === playerId) newRunners.first = null;
    if (newRunners.second === playerId) newRunners.second = null;
    if (newRunners.third === playerId) newRunners.third = null;

    if (dest === 'home') {
      if (!wasScoring) newRuns++;
    } else {
      if (wasScoring) newRuns = Math.max(0, newRuns - 1);
      newRunners[dest] = playerId;
    }

    setRunnersAfter(newRunners);
    setRunsScored(newRuns);
    resetAutoTimer();
  }

  // Record a baserunning event (SB, CS, WP, PB) without ending the at-bat
  async function recordBaserunningEvent(
    outcome: string,
    newRunners: BaseRunners,
    outsChange: number,
    runsChange: number
  ) {
    setRecording(true);
    setError(null);
    const supabase = createClient();
    const newOuts = Math.min(currentOuts + outsChange, 3);

    const eventData = {
      inning: currentInning,
      inning_half: currentHalf,
      batter_user_id: currentBatter?.player_user_id ?? null,
      outcome,
      hit_location: null,
      fielding_sequence: null,
      outs_after: newOuts,
      runs_scored: runsChange,
      runners_after: newRunners,
      runner_movements: null,
      pitch_count: null,
      balls: null,
      strikes: null,
      notes: null,
    };

    const { error: rpcError } = await supabase.rpc('record_play', {
      p_game_id: gameId,
      p_event: eventData,
    });

    if (rpcError) {
      setError(rpcError.message);
    } else {
      // Don't reset balls/strikes — at-bat continues
      router.refresh();
    }
    setRecording(false);
  }

  function handleStolenBase(fromBase: 'first' | 'second' | 'third') {
    const runnerId = currentRunners[fromBase];
    if (!runnerId) return;
    const newRunners = { ...currentRunners };
    newRunners[fromBase] = null;
    let runs = 0;
    if (fromBase === 'third') {
      runs = 1; // steal home
    } else if (fromBase === 'second') {
      newRunners.third = runnerId;
    } else {
      newRunners.second = runnerId;
    }
    recordBaserunningEvent('stolen_base', newRunners, 0, runs);
  }

  function handleCaughtStealing(fromBase: 'first' | 'second' | 'third') {
    const newRunners = { ...currentRunners };
    newRunners[fromBase] = null;
    recordBaserunningEvent('caught_stealing', newRunners, 1, 0);
  }

  function handleWildPitchOrPassedBall(outcome: 'wild_pitch' | 'passed_ball') {
    let runs = 0;
    const newRunners: BaseRunners = { first: null, second: null, third: null };
    if (currentRunners.third) runs++;
    if (currentRunners.second) newRunners.third = currentRunners.second;
    if (currentRunners.first) newRunners.second = currentRunners.first;
    recordBaserunningEvent(outcome, newRunners, 0, runs);
  }

  async function handleRecordPlay() {
    if (!selectedOutcome) {
      setError('Select a play outcome');
      return;
    }

    setRecording(true);
    setError(null);

    const supabase = createClient();
    const seq = getPitchSequence();
    const combinedNotes = [seq, notes].filter(Boolean).join(' | ') || null;

    const eventData = {
      inning: currentInning,
      inning_half: currentHalf,
      batter_user_id: currentBatter?.player_user_id ?? null,
      pitcher_user_id: currentPitcher?.player_user_id ?? null,
      outcome: selectedOutcome,
      hit_location: hitLocation || null,
      fielding_sequence: fieldingSequence || null,
      outs_after: outsAfter,
      runs_scored: runsScored,
      runners_after: runnersAfter,
      runner_movements: null,
      pitch_count: pitchLog.length > 0 ? pitchLog.length : (balls + strikes > 0 ? balls + strikes : null),
      balls: balls > 0 ? balls : null,
      strikes: strikes > 0 ? strikes : null,
      notes: combinedNotes,
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
      setPitchLog([]);
      setDpRunnerOut(null);
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
  const noLineup = battingStarters.length === 0;

  // Zone outcomes for the selected zone — add fielders_choice on infield when runners are on
  // (double_play is handled separately with specific fielding sequence buttons)
  const hasRunners = !!(currentRunners.first || currentRunners.second || currentRunners.third);
  const zoneOutcomes = (() => {
    if (!selectedZone) return [];
    const base = FIELD_ZONE_OPTIONS[selectedZone] ?? [];
    if (!hasRunners || selectedZone > 6) return base;
    if (!base.includes('fielders_choice')) return [...base, 'fielders_choice'];
    return base;
  })();
  // DP sequences for the selected zone (only when runners are on and infield)
  const zoneDpSequences = (selectedZone && hasRunners && selectedZone <= 6)
    ? (DP_SEQUENCES[selectedZone] ?? [])
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
              {gameOver ? 'FINAL' : `${isTopHalf ? '▲' : '▼'} ${currentInning}`}
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
        <div className="mt-4 rounded-lg border-2 border-green-300 bg-green-50 p-6 text-center">
          <p className="text-2xl font-bold text-green-800 tracking-wide">FINAL</p>
          <p className="mt-2 text-lg text-gray-700">
            {game.away_team_name} {game.away_score} &mdash; {game.home_team_name} {game.home_score}
          </p>
          {game.home_score > game.away_score ? (
            <p className="mt-1 text-sm font-medium text-green-700">{game.home_team_name} wins!</p>
          ) : game.away_score > game.home_score ? (
            <p className="mt-1 text-sm font-medium text-green-700">{game.away_team_name} wins!</p>
          ) : null}
        </div>
      ) : (
        <>
          {/* Current batter + pitcher info */}
          <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 uppercase">At Bat</p>
                <div className="flex items-center gap-2">
                  <p className="text-lg font-bold text-gray-900">
                    {currentBatter?.player_name ?? 'Unknown'}
                    {currentBatter?.jersey_number != null && (
                      <span className="ml-1 text-gray-400 text-sm">
                        #{currentBatter.jersey_number}
                      </span>
                    )}
                  </p>
                  {currentBatter && (battingBench.length > 0 || battingStarters.length > 1 || (allowReentry && battingExited.length > 0)) && (
                    <button
                      onClick={() => { setSubMode('pinch_hit'); setSubTarget(currentBatter); }}
                      disabled={recording}
                      className="rounded bg-purple-100 px-2 py-0.5 text-xs font-bold text-purple-700 hover:bg-purple-200 disabled:opacity-50"
                    >
                      PH
                    </button>
                  )}
                </div>
                <p className="text-sm text-gray-500">
                  #{currentBatter?.batting_order ?? '?'} in order &middot;{' '}
                  {FIELD_POSITION_ABBREV[currentBatter?.fielding_position ?? 0] ??
                    'DH'}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500 uppercase">Pitching</p>
                <div className="flex items-center gap-2 justify-end">
                  <p className="text-sm font-semibold text-gray-900">
                    {currentPitcher?.player_name ?? 'Unknown'}
                    {currentPitcher?.jersey_number != null && (
                      <span className="ml-1 text-gray-400 text-xs">
                        #{currentPitcher.jersey_number}
                      </span>
                    )}
                  </p>
                  {currentPitcher && (fieldingBench.length > 0 || fieldingStarters.length > 1 || (allowReentry && fieldingExited.length > 0)) && (
                    <button
                      onClick={() => { setSubMode('pitcher'); setSubTarget(currentPitcher); }}
                      disabled={recording}
                      className="rounded bg-orange-100 px-2 py-0.5 text-xs font-bold text-orange-700 hover:bg-orange-200 disabled:opacity-50"
                    >
                      <RefreshCw className="h-3 w-3 inline mr-0.5" />
                      P
                    </button>
                  )}
                </div>
              </div>
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
                    setPitchLog((prev) => [...prev, 'F']);
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

            {/* Pitch-by-pitch log */}
            {pitchLog.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center justify-center gap-1">
                {pitchLog.map((pitch, i) => (
                  <span
                    key={i}
                    className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white ${
                      pitch === 'B'
                        ? 'bg-green-500'
                        : pitch === 'S'
                          ? 'bg-yellow-500'
                          : 'bg-orange-400'
                    }`}
                  >
                    {pitch}
                  </span>
                ))}
                <span className="ml-1 text-xs text-gray-400">
                  {pitchLog.length} pitch{pitchLog.length !== 1 ? 'es' : ''}
                </span>
              </div>
            )}
          </div>

          {/* Baserunning Actions */}
          {(currentRunners.first || currentRunners.second || currentRunners.third) && (
            <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-3">
                Baserunning
              </p>
              <div className="space-y-2">
                {currentRunners.first && (
                  <div className="flex items-center gap-2">
                    <span className="w-7 text-xs font-bold text-gray-500">1B</span>
                    <span className="text-sm text-gray-900 flex-1 truncate">
                      {getRunnerName(currentRunners.first)}
                    </span>
                    <button
                      onClick={() => {
                        const entry = battingStarters.find((l) => l.player_user_id === currentRunners.first);
                        if (entry) { setSubMode('pinch_run'); setSubTarget(entry); }
                      }}
                      disabled={recording}
                      className="rounded bg-purple-100 px-2 py-1 text-xs font-semibold text-purple-700 hover:bg-purple-200 disabled:opacity-50"
                    >
                      PR
                    </button>
                    <button
                      onClick={() => handleStolenBase('first')}
                      disabled={recording}
                      className="rounded bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-800 hover:bg-blue-200 disabled:opacity-50"
                    >
                      SB 2B
                    </button>
                    <button
                      onClick={() => handleCaughtStealing('first')}
                      disabled={recording}
                      className="rounded bg-red-100 px-2 py-1 text-xs font-semibold text-red-800 hover:bg-red-200 disabled:opacity-50"
                    >
                      CS
                    </button>
                  </div>
                )}
                {currentRunners.second && (
                  <div className="flex items-center gap-2">
                    <span className="w-7 text-xs font-bold text-gray-500">2B</span>
                    <span className="text-sm text-gray-900 flex-1 truncate">
                      {getRunnerName(currentRunners.second)}
                    </span>
                    <button
                      onClick={() => {
                        const entry = battingStarters.find((l) => l.player_user_id === currentRunners.second);
                        if (entry) { setSubMode('pinch_run'); setSubTarget(entry); }
                      }}
                      disabled={recording}
                      className="rounded bg-purple-100 px-2 py-1 text-xs font-semibold text-purple-700 hover:bg-purple-200 disabled:opacity-50"
                    >
                      PR
                    </button>
                    <button
                      onClick={() => handleStolenBase('second')}
                      disabled={recording}
                      className="rounded bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-800 hover:bg-blue-200 disabled:opacity-50"
                    >
                      SB 3B
                    </button>
                    <button
                      onClick={() => handleCaughtStealing('second')}
                      disabled={recording}
                      className="rounded bg-red-100 px-2 py-1 text-xs font-semibold text-red-800 hover:bg-red-200 disabled:opacity-50"
                    >
                      CS
                    </button>
                  </div>
                )}
                {currentRunners.third && (
                  <div className="flex items-center gap-2">
                    <span className="w-7 text-xs font-bold text-gray-500">3B</span>
                    <span className="text-sm text-gray-900 flex-1 truncate">
                      {getRunnerName(currentRunners.third)}
                    </span>
                    <button
                      onClick={() => {
                        const entry = battingStarters.find((l) => l.player_user_id === currentRunners.third);
                        if (entry) { setSubMode('pinch_run'); setSubTarget(entry); }
                      }}
                      disabled={recording}
                      className="rounded bg-purple-100 px-2 py-1 text-xs font-semibold text-purple-700 hover:bg-purple-200 disabled:opacity-50"
                    >
                      PR
                    </button>
                    <button
                      onClick={() => handleStolenBase('third')}
                      disabled={recording}
                      className="rounded bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-800 hover:bg-blue-200 disabled:opacity-50"
                    >
                      SB Home
                    </button>
                    <button
                      onClick={() => handleCaughtStealing('third')}
                      disabled={recording}
                      className="rounded bg-red-100 px-2 py-1 text-xs font-semibold text-red-800 hover:bg-red-200 disabled:opacity-50"
                    >
                      CS
                    </button>
                  </div>
                )}
                {/* Wild Pitch / Passed Ball — advance all runners 1 base */}
                <div className="flex gap-2 pt-1 border-t border-gray-100 mt-2">
                  <button
                    onClick={() => handleWildPitchOrPassedBall('wild_pitch')}
                    disabled={recording}
                    className="rounded bg-yellow-100 px-3 py-1.5 text-xs font-semibold text-yellow-800 hover:bg-yellow-200 disabled:opacity-50"
                  >
                    Wild Pitch
                  </button>
                  <button
                    onClick={() => handleWildPitchOrPassedBall('passed_ball')}
                    disabled={recording}
                    className="rounded bg-yellow-100 px-3 py-1.5 text-xs font-semibold text-yellow-800 hover:bg-yellow-200 disabled:opacity-50"
                  >
                    Passed Ball
                  </button>
                </div>
              </div>
            </div>
          )}

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

                      {/* Double play options with specific fielding sequences */}
                      {zoneDpSequences.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-gray-100">
                          <p className="text-[10px] font-semibold text-gray-400 uppercase mb-1.5">
                            Double Play
                          </p>
                          <div className="grid grid-cols-2 gap-1.5">
                            {zoneDpSequences.map((seq) => (
                              <button
                                key={seq}
                                disabled={recording}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePopupDp(seq, selectedZone!);
                                }}
                                className="rounded-lg bg-red-50 px-2 py-2 text-xs font-bold text-red-800 transition-all hover:bg-red-100 opacity-90 hover:opacity-100 disabled:opacity-50"
                              >
                                {seq}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
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
                  if (shouldAutoRecord(e.target.value)) {
                    autoRecordOutcome(e.target.value);
                  } else {
                    selectOutcome(e.target.value);
                  }
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

          {/* Play detail panel (review runners, adjust, and confirm) */}
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
                  onClick={() => {
                    setShowAdvanced(!showAdvanced);
                    resetAutoTimer();
                  }}
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
                      onClick={() => {
                        setRunsScored(Math.max(0, runsScored - 1));
                        resetAutoTimer();
                      }}
                      className="rounded bg-gray-200 px-2 py-1 text-sm font-bold hover:bg-gray-300"
                    >
                      -
                    </button>
                    <span className="text-lg font-bold w-8 text-center">
                      {runsScored}
                    </span>
                    <button
                      onClick={() => {
                        setRunsScored(runsScored + 1);
                        resetAutoTimer();
                      }}
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
                      onClick={() => {
                        setOutsAfter(Math.max(0, outsAfter - 1));
                        resetAutoTimer();
                      }}
                      className="rounded bg-gray-200 px-2 py-1 text-sm font-bold hover:bg-gray-300"
                    >
                      -
                    </button>
                    <span className="text-lg font-bold w-8 text-center">
                      {outsAfter}
                    </span>
                    <button
                      onClick={() => {
                        setOutsAfter(Math.min(3, outsAfter + 1));
                        resetAutoTimer();
                      }}
                      className="rounded bg-gray-200 px-2 py-1 text-sm font-bold hover:bg-gray-300"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              {/* Double Play configuration */}
              {selectedOutcome === 'double_play' && (currentRunners.first || currentRunners.second || currentRunners.third) && (
                <div className="mt-3 border-t border-blue-200 pt-3">
                  {/* Which runner is out? */}
                  <p className="text-xs font-semibold text-gray-600 uppercase mb-2">
                    Runner out (batter is also out)
                  </p>
                  <div className="space-y-1.5 mb-3">
                    {(['first', 'second', 'third'] as const).map((base) => {
                      const runnerId = currentRunners[base];
                      if (!runnerId) return null;
                      const isVictim = dpRunnerOut === base;
                      const baseLabel = base === 'first' ? '1B' : base === 'second' ? '2B' : '3B';
                      return (
                        <button
                          key={base}
                          onClick={() => changeDpRunnerOut(base)}
                          className={`flex items-center gap-2 w-full rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                            isVictim
                              ? 'bg-red-100 text-red-800 ring-2 ring-red-400'
                              : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                          }`}
                        >
                          <span className="w-7 text-xs font-bold">{baseLabel}</span>
                          <span className="flex-1 text-left truncate">
                            {getRunnerName(runnerId)}
                          </span>
                          {isVictim && (
                            <span className="text-xs font-bold text-red-600">OUT</span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Fielding sequence quick picks */}
                  <p className="text-xs font-semibold text-gray-600 uppercase mb-2">
                    Fielding sequence
                  </p>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {(DP_SEQUENCES[hitLocation] ?? []).map((seq) => (
                      <button
                        key={seq}
                        onClick={() => {
                          setFieldingSequence(seq);
                          resetAutoTimer();
                        }}
                        className={`rounded-md px-2.5 py-1.5 text-xs font-bold transition-colors ${
                          fieldingSequence === seq
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {seq}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    value={fieldingSequence}
                    onChange={(e) => {
                      setFieldingSequence(e.target.value);
                      resetAutoTimer();
                    }}
                    placeholder="e.g. 6-4-3"
                    className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                  />

                  {/* Remaining runners */}
                  {((['first', 'second', 'third'] as const).some(
                    (b) => currentRunners[b] && b !== dpRunnerOut
                  )) && (
                    <div className="mt-3 pt-2 border-t border-blue-100">
                      <p className="text-xs font-semibold text-gray-600 uppercase mb-2">
                        Other runners
                      </p>
                      {(['third', 'second', 'first'] as const).map((base) => {
                        const runnerId = currentRunners[base];
                        if (!runnerId || base === dpRunnerOut) return null;
                        const baseLabel = base === 'first' ? '1B' : base === 'second' ? '2B' : '3B';
                        const destOptions = base === 'third'
                          ? (['third', 'home'] as const)
                          : base === 'second'
                            ? (['second', 'third', 'home'] as const)
                            : (['first', 'second', 'third', 'home'] as const);
                        return (
                          <div key={base} className="flex items-center gap-2 mb-1.5">
                            <span className="w-7 text-xs font-bold text-gray-500">{baseLabel}</span>
                            <span className="text-sm text-gray-900 flex-1 truncate">
                              {getRunnerName(runnerId)}
                            </span>
                            <span className="text-xs text-gray-400 mr-1">&rarr;</span>
                            {destOptions.map((dest) => (
                              <button
                                key={dest}
                                onClick={() => adjustRunnerDest(runnerId, dest)}
                                className={`px-2 py-0.5 text-xs rounded font-medium ${
                                  getRunnerDest(runnerId) === dest
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                }`}
                              >
                                {dest === 'home' ? 'Score' : dest === 'third' ? '3B' : dest === 'second' ? '2B' : '1B'}
                              </button>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Runner Adjustment (skip for home runs and double plays) */}
              {selectedOutcome !== 'home_run' && selectedOutcome !== 'double_play' && (currentRunners.first || currentRunners.second || currentRunners.third) && (
                <div className="mt-3 border-t border-blue-200 pt-3">
                  <p className="text-xs font-semibold text-gray-600 uppercase mb-2">
                    Runner Advancement
                  </p>
                  {/* Runner on 3rd */}
                  {currentRunners.third && (
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="w-7 text-xs font-bold text-gray-500">3B</span>
                      <span className="text-sm text-gray-900 flex-1 truncate">
                        {getRunnerName(currentRunners.third)}
                      </span>
                      <span className="text-xs text-gray-400 mr-1">&rarr;</span>
                      {(['third', 'home'] as const).map((dest) => (
                        <button
                          key={dest}
                          onClick={() => adjustRunnerDest(currentRunners.third!, dest)}
                          className={`px-2 py-0.5 text-xs rounded font-medium ${
                            getRunnerDest(currentRunners.third!) === dest
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          {dest === 'home' ? 'Score' : '3B'}
                        </button>
                      ))}
                    </div>
                  )}
                  {/* Runner on 2nd */}
                  {currentRunners.second && (
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="w-7 text-xs font-bold text-gray-500">2B</span>
                      <span className="text-sm text-gray-900 flex-1 truncate">
                        {getRunnerName(currentRunners.second)}
                      </span>
                      <span className="text-xs text-gray-400 mr-1">&rarr;</span>
                      {(['second', 'third', 'home'] as const).map((dest) => (
                        <button
                          key={dest}
                          onClick={() => adjustRunnerDest(currentRunners.second!, dest)}
                          className={`px-2 py-0.5 text-xs rounded font-medium ${
                            getRunnerDest(currentRunners.second!) === dest
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          {dest === 'home' ? 'Score' : dest === 'third' ? '3B' : '2B'}
                        </button>
                      ))}
                    </div>
                  )}
                  {/* Runner on 1st */}
                  {currentRunners.first && (
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="w-7 text-xs font-bold text-gray-500">1B</span>
                      <span className="text-sm text-gray-900 flex-1 truncate">
                        {getRunnerName(currentRunners.first)}
                      </span>
                      <span className="text-xs text-gray-400 mr-1">&rarr;</span>
                      {(['first', 'second', 'third', 'home'] as const).map((dest) => (
                        <button
                          key={dest}
                          onClick={() => adjustRunnerDest(currentRunners.first!, dest)}
                          className={`px-2 py-0.5 text-xs rounded font-medium ${
                            getRunnerDest(currentRunners.first!) === dest
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          {dest === 'home' ? 'Score' : dest === 'third' ? '3B' : dest === 'second' ? '2B' : '1B'}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

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

              {/* Record play button with auto-accept countdown */}
              <div className="mt-4">
                <button
                  onClick={handleRecordPlay}
                  disabled={recording}
                  className="relative w-full overflow-hidden rounded-md bg-green-600 px-4 py-3 text-sm font-bold text-white hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {/* Countdown progress bar */}
                  {autoRecordCountdown !== null && autoRecordCountdown > 0 && !recording && (
                    <div
                      className="absolute inset-0 bg-green-700/40 origin-left transition-transform duration-1000 ease-linear"
                      style={{
                        transform: `scaleX(${1 - autoRecordCountdown / AUTO_RECORD_SECONDS})`,
                      }}
                    />
                  )}
                  <span className="relative">
                    {recording
                      ? 'Recording...'
                      : autoRecordCountdown !== null && autoRecordCountdown > 0
                        ? `Record Play (${autoRecordCountdown}s)`
                        : 'Record Play'}
                  </span>
                  {!recording && <ChevronRight className="relative h-4 w-4" />}
                </button>
                {autoRecordCountdown !== null && !recording && (
                  <button
                    onClick={() => {
                      setAutoRecordCountdown(null);
                      setSelectedOutcome('');
                    }}
                    className="mt-1.5 w-full text-center text-xs text-gray-500 hover:text-gray-700"
                  >
                    Cancel
                  </button>
                )}
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

      {/* Substitution panel */}
      {subMode && subTarget && (
        <SubstitutionPanel
          gameId={gameId}
          teamId={subMode === 'pitcher' ? fieldingTeamId : battingTeamId}
          currentInning={currentInning}
          starters={subMode === 'pitcher' ? fieldingStarters : battingStarters}
          benchPlayers={subMode === 'pitcher' ? fieldingBench : battingBench}
          exitedPlayers={subMode === 'pitcher' ? fieldingExited : battingExited}
          allowReentry={allowReentry}
          mode={subMode}
          targetPlayer={subTarget}
          onComplete={(incoming) => {
            // For pinch runners, apply local override so bases reflect the new player
            if (subMode === 'pinch_run') {
              setRunnerOverrides((prev) => ({
                ...prev,
                [subTarget.player_user_id]: incoming.player_user_id,
              }));
            }
            setSubMode(null);
            setSubTarget(null);
            router.refresh();
          }}
          onClose={() => { setSubMode(null); setSubTarget(null); }}
        />
      )}
    </div>
  );
}
