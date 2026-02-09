import type { GameEvent, GameLineupEntry } from '../types/scoring';
import { PLAY_OUTCOME_LABELS } from '../constants/scoring';

// ============================================
// Types
// ============================================

/** Per-player batting line for a single game */
export interface PlayerBattingLine {
  player_user_id: string;
  player_name: string;
  jersey_number: number | null;
  team_id: string;
  ab: number;
  r: number;
  h: number;
  doubles: number;
  triples: number;
  hr: number;
  rbi: number;
  bb: number;
  k: number;
  hbp: number;
  sac: number;
  avg: string;
}

/** Complete box score for one team */
export interface TeamBoxScore {
  team_id: string;
  team_name: string;
  players: PlayerBattingLine[];
  totals: PlayerBattingLine;
}

/** Key play event for the summary highlights */
export interface KeyPlay {
  event: GameEvent;
  description: string;
  type: 'home_run' | 'error' | 'double_play' | 'triple_play' | 'triple';
}

/** Per-pitcher line for a single game */
export interface PlayerPitchingLine {
  player_user_id: string;
  player_name: string;
  jersey_number: number | null;
  team_id: string;
  ip: string;       // Innings pitched formatted as "X.Y" (e.g. "6.2")
  ip_outs: number;  // Raw outs recorded (for totals computation)
  h: number;
  r: number;
  bb: number;
  k: number;
  hr: number;
  hbp: number;
}

/** Complete pitching stats for one team */
export interface TeamPitchingStats {
  team_id: string;
  team_name: string;
  pitchers: PlayerPitchingLine[];
  totals: PlayerPitchingLine;
}

/** Scoring summary entry (who scored in which inning) */
export interface ScoringSummaryEntry {
  inning: number;
  inning_half: 'top' | 'bottom';
  team_name: string;
  runs: number;
  batters: string[];
  description: string;
}

// ============================================
// Helpers
// ============================================

const NON_AB_OUTCOMES = new Set([
  'walk',
  'intentional_walk',
  'hit_by_pitch',
  'sacrifice_fly',
  'sacrifice_bunt',
  'stolen_base',
  'caught_stealing',
  'wild_pitch',
  'passed_ball',
  'balk',
  'picked_off',
  'runner_advance',
  'catcher_interference',
  'other',
]);

const HIT_SET = new Set(['single', 'double', 'triple', 'home_run']);

const KEY_PLAY_TYPES = new Set([
  'home_run',
  'triple',
  'error',
  'double_play',
  'triple_play',
]);

export function isAtBat(outcome: string): boolean {
  return !NON_AB_OUTCOMES.has(outcome);
}

export function isHit(outcome: string): boolean {
  return HIT_SET.has(outcome);
}

// ============================================
// Runs scored computation
// ============================================

export function computeRunsScored(events: GameEvent[]): Map<string, number> {
  const runsMap = new Map<string, number>();
  const active = events.filter((e) => !e.is_deleted);

  for (const event of active) {
    if (event.runs_scored <= 0) continue;

    const before = event.runners_before;
    const after = event.runners_after;
    const bases: Array<'first' | 'second' | 'third'> = [
      'first',
      'second',
      'third',
    ];

    // Find runners who were on base before but are no longer on any base after
    const scorers: string[] = [];
    for (const base of bases) {
      const runnerId = before?.[base];
      if (!runnerId) continue;
      const stillOnBase =
        after?.first === runnerId ||
        after?.second === runnerId ||
        after?.third === runnerId;
      if (!stillOnBase) {
        scorers.push(runnerId);
      }
    }

    // For home runs, the batter also scores
    if (event.outcome === 'home_run' && event.batter_user_id) {
      if (!scorers.includes(event.batter_user_id)) {
        scorers.push(event.batter_user_id);
      }
    }

    // Credit runs (cap at runs_scored to handle edge cases)
    const creditCount = Math.min(scorers.length, event.runs_scored);
    for (let i = 0; i < creditCount; i++) {
      const id = scorers[i];
      runsMap.set(id, (runsMap.get(id) ?? 0) + 1);
    }

    // If we couldn't identify enough scorers, attribute remaining to batter
    if (creditCount < event.runs_scored && event.batter_user_id) {
      const remaining = event.runs_scored - creditCount;
      runsMap.set(
        event.batter_user_id,
        (runsMap.get(event.batter_user_id) ?? 0) + remaining
      );
    }
  }

  return runsMap;
}

// ============================================
// Per-player batting lines
// ============================================

export function computeTeamBattingLines(
  events: GameEvent[],
  homeLineup: GameLineupEntry[],
  awayLineup: GameLineupEntry[],
  teamId: string,
  teamName: string,
  inningHalf: 'top' | 'bottom'
): TeamBoxScore {
  const active = events.filter((e) => !e.is_deleted);
  const teamEvents = active.filter((e) => e.inning_half === inningHalf);
  const lineup = inningHalf === 'bottom' ? homeLineup : awayLineup;

  // Compute runs scored from ALL events (runners can score in either half)
  const runsMap = computeRunsScored(active);

  // Build per-player stats
  const playerMap = new Map<string, PlayerBattingLine>();

  // Initialize from lineup (all players who were ever in the game)
  for (const entry of lineup) {
    if (!playerMap.has(entry.player_user_id)) {
      playerMap.set(entry.player_user_id, {
        player_user_id: entry.player_user_id,
        player_name: entry.player_name ?? 'Unknown',
        jersey_number: entry.jersey_number ?? null,
        team_id: teamId,
        ab: 0,
        r: 0,
        h: 0,
        doubles: 0,
        triples: 0,
        hr: 0,
        rbi: 0,
        bb: 0,
        k: 0,
        hbp: 0,
        sac: 0,
        avg: '.000',
      });
    }
  }

  // Process batting events
  for (const event of teamEvents) {
    if (!event.batter_user_id) continue;
    let line = playerMap.get(event.batter_user_id);
    if (!line) {
      line = {
        player_user_id: event.batter_user_id,
        player_name: event.batter_name ?? 'Unknown',
        jersey_number: null,
        team_id: teamId,
        ab: 0,
        r: 0,
        h: 0,
        doubles: 0,
        triples: 0,
        hr: 0,
        rbi: 0,
        bb: 0,
        k: 0,
        hbp: 0,
        sac: 0,
        avg: '.000',
      };
      playerMap.set(event.batter_user_id, line);
    }

    if (isAtBat(event.outcome)) line.ab++;
    if (isHit(event.outcome)) line.h++;
    if (event.outcome === 'double') line.doubles++;
    if (event.outcome === 'triple') line.triples++;
    if (event.outcome === 'home_run') line.hr++;
    line.rbi += event.runs_scored;
    if (event.outcome === 'walk' || event.outcome === 'intentional_walk')
      line.bb++;
    if (
      event.outcome === 'strikeout_swinging' ||
      event.outcome === 'strikeout_looking'
    )
      line.k++;
    if (event.outcome === 'hit_by_pitch') line.hbp++;
    if (
      event.outcome === 'sacrifice_fly' ||
      event.outcome === 'sacrifice_bunt'
    )
      line.sac++;
  }

  // Apply runs scored (only for players on this team)
  for (const [playerId, runs] of runsMap) {
    const line = playerMap.get(playerId);
    if (line) line.r = runs;
  }

  // Compute AVG
  for (const line of playerMap.values()) {
    line.avg =
      line.ab > 0
        ? (line.h / line.ab).toFixed(3).replace(/^0/, '')
        : '.000';
  }

  // Sort by batting order, filter to players who participated
  const lineupOrder = new Map<string, number>();
  for (const l of lineup) {
    // Use the lowest batting order for each player (first appearance)
    if (!lineupOrder.has(l.player_user_id)) {
      lineupOrder.set(l.player_user_id, l.batting_order);
    }
  }

  const players = [...playerMap.values()]
    .filter(
      (p) =>
        p.ab > 0 || p.bb > 0 || p.hbp > 0 || p.sac > 0 || p.r > 0
    )
    .sort(
      (a, b) =>
        (lineupOrder.get(a.player_user_id) ?? 99) -
        (lineupOrder.get(b.player_user_id) ?? 99)
    );

  // Totals row
  const totals: PlayerBattingLine = {
    player_user_id: 'TOTALS',
    player_name: 'Totals',
    jersey_number: null,
    team_id: teamId,
    ab: players.reduce((s, p) => s + p.ab, 0),
    r: players.reduce((s, p) => s + p.r, 0),
    h: players.reduce((s, p) => s + p.h, 0),
    doubles: players.reduce((s, p) => s + p.doubles, 0),
    triples: players.reduce((s, p) => s + p.triples, 0),
    hr: players.reduce((s, p) => s + p.hr, 0),
    rbi: players.reduce((s, p) => s + p.rbi, 0),
    bb: players.reduce((s, p) => s + p.bb, 0),
    k: players.reduce((s, p) => s + p.k, 0),
    hbp: players.reduce((s, p) => s + p.hbp, 0),
    sac: players.reduce((s, p) => s + p.sac, 0),
    avg: '.000',
  };
  totals.avg =
    totals.ab > 0
      ? (totals.h / totals.ab).toFixed(3).replace(/^0/, '')
      : '.000';

  return { team_id: teamId, team_name: teamName, players, totals };
}

// ============================================
// Per-pitcher pitching lines
// ============================================

/** Format raw outs as IP string: e.g. 9 outs → "3.0", 7 outs → "2.1" */
function formatIP(totalOuts: number): string {
  const fullInnings = Math.floor(totalOuts / 3);
  const remainder = totalOuts % 3;
  return `${fullInnings}.${remainder}`;
}

/** Outcomes that count as a strikeout for the pitcher */
const PITCHER_K_OUTCOMES = new Set(['strikeout_swinging', 'strikeout_looking']);

/** Outcomes that count as a walk for the pitcher */
const PITCHER_BB_OUTCOMES = new Set(['walk', 'intentional_walk']);

/**
 * Compute per-pitcher stats for a team.
 * When inningHalf='top', we're computing pitching stats for the HOME team (they pitch the top half).
 * When inningHalf='bottom', we're computing pitching stats for the AWAY team (they pitch the bottom half).
 */
export function computeTeamPitchingLines(
  events: GameEvent[],
  homeLineup: GameLineupEntry[],
  awayLineup: GameLineupEntry[],
  teamId: string,
  teamName: string,
  inningHalf: 'top' | 'bottom'
): TeamPitchingStats {
  const active = events.filter((e) => !e.is_deleted);
  // The team pitches during the opposite half of what they bat
  const pitchingEvents = active.filter((e) => e.inning_half === inningHalf);
  // Pitchers come from the defensive team's lineup
  const lineup = inningHalf === 'top' ? homeLineup : awayLineup;

  // Build pitcher timeline from lineup entries at position 1, sorted by entry time.
  // Starter has entered_inning=null (treat as 0), substitutes have entered_inning set.
  const pitcherTimeline = lineup
    .filter((l) => l.fielding_position === 1)
    .sort((a, b) => (a.entered_inning ?? 0) - (b.entered_inning ?? 0));

  const pitcherMap = new Map<string, PlayerPitchingLine>();

  // Initialize from lineup — anyone who played pitcher at some point
  for (const entry of pitcherTimeline) {
    if (!pitcherMap.has(entry.player_user_id)) {
      pitcherMap.set(entry.player_user_id, {
        player_user_id: entry.player_user_id,
        player_name: entry.player_name ?? 'Unknown',
        jersey_number: entry.jersey_number ?? null,
        team_id: teamId,
        ip: '0.0',
        ip_outs: 0,
        h: 0,
        r: 0,
        bb: 0,
        k: 0,
        hr: 0,
        hbp: 0,
      });
    }
  }

  // Process events in sequence order with consistent pitcher tracking.
  // We walk through events and maintain a "current pitcher" state:
  //   - When an event has pitcher_user_id set, use it and update current pitcher
  //   - When null, carry forward the last known pitcher
  // This avoids mixed-source attribution where pitcher_user_id and lineup
  // fallback disagree on mid-inning changes.
  const sorted = [...pitchingEvents].sort(
    (a, b) => a.inning - b.inning || a.sequence_number - b.sequence_number
  );

  // Start with the lineup starter (first entry in timeline)
  let currentPitcherId: string | null = pitcherTimeline[0]?.player_user_id ?? null;
  let currentPitcherName: string | null = pitcherTimeline[0]?.player_name ?? null;
  let currentPitcherJersey: number | null = pitcherTimeline[0]?.jersey_number ?? null;

  // Track outs per half-inning to cap at 3 (prevents phantom events after 3 outs)
  const halfInningOuts = new Map<string, number>();

  for (const event of sorted) {
    // Update current pitcher from explicit data on the event
    if (event.pitcher_user_id) {
      currentPitcherId = event.pitcher_user_id;
      currentPitcherName = event.pitcher_name ?? null;
      // Look up jersey from timeline if available
      const timelineEntry = pitcherTimeline.find(
        (p) => p.player_user_id === event.pitcher_user_id
      );
      currentPitcherJersey = timelineEntry?.jersey_number ?? null;
    } else if (pitcherTimeline.length > 0) {
      // No pitcher_user_id — check if the lineup timeline indicates a
      // pitcher change at this inning (e.g. a sub entered this inning
      // but earlier events in this inning still had the old pitcher's ID)
      for (const entry of pitcherTimeline) {
        const entered = entry.entered_inning ?? 0;
        const exited = entry.exited_inning ?? 999;
        if (entered <= event.inning && exited >= event.inning) {
          // Only switch if this entry is later than our current pitcher
          // (i.e. a substitute who entered at or before this inning)
          if (
            entry.player_user_id !== currentPitcherId &&
            entered > (pitcherTimeline.find((p) => p.player_user_id === currentPitcherId)?.entered_inning ?? 0)
          ) {
            currentPitcherId = entry.player_user_id;
            currentPitcherName = entry.player_name ?? 'Unknown';
            currentPitcherJersey = entry.jersey_number ?? null;
          }
        }
      }
    }

    if (!currentPitcherId) continue;

    let line = pitcherMap.get(currentPitcherId);
    if (!line) {
      line = {
        player_user_id: currentPitcherId,
        player_name: currentPitcherName ?? 'Unknown',
        jersey_number: currentPitcherJersey,
        team_id: teamId,
        ip: '0.0',
        ip_outs: 0,
        h: 0,
        r: 0,
        bb: 0,
        k: 0,
        hr: 0,
        hbp: 0,
      };
      pitcherMap.set(currentPitcherId, line);
    }

    // Outs recorded on this play, capped at 3 per half-inning
    const halfKey = `${event.inning}-${event.inning_half}`;
    const priorOuts = halfInningOuts.get(halfKey) ?? 0;
    const rawOuts = Math.max(0, event.outs_after - event.outs_before);
    const cappedOuts = Math.min(rawOuts, Math.max(0, 3 - priorOuts));
    halfInningOuts.set(halfKey, priorOuts + cappedOuts);
    line.ip_outs += cappedOuts;

    if (isHit(event.outcome)) line.h++;
    line.r += event.runs_scored;
    if (PITCHER_BB_OUTCOMES.has(event.outcome)) line.bb++;
    if (PITCHER_K_OUTCOMES.has(event.outcome)) line.k++;
    if (event.outcome === 'home_run') line.hr++;
    if (event.outcome === 'hit_by_pitch') line.hbp++;
  }

  // Format IP and filter to pitchers who actually pitched
  const pitchers = [...pitcherMap.values()]
    .filter((p) => p.ip_outs > 0 || p.h > 0 || p.bb > 0 || p.r > 0 || p.k > 0 || p.hbp > 0)
    .map((p) => ({ ...p, ip: formatIP(p.ip_outs) }));

  // Totals row
  const totals: PlayerPitchingLine = {
    player_user_id: 'TOTALS',
    player_name: 'Totals',
    jersey_number: null,
    team_id: teamId,
    ip: '0.0',
    ip_outs: pitchers.reduce((s, p) => s + p.ip_outs, 0),
    h: pitchers.reduce((s, p) => s + p.h, 0),
    r: pitchers.reduce((s, p) => s + p.r, 0),
    bb: pitchers.reduce((s, p) => s + p.bb, 0),
    k: pitchers.reduce((s, p) => s + p.k, 0),
    hr: pitchers.reduce((s, p) => s + p.hr, 0),
    hbp: pitchers.reduce((s, p) => s + p.hbp, 0),
  };
  totals.ip = formatIP(totals.ip_outs);

  return { team_id: teamId, team_name: teamName, pitchers, totals };
}

// ============================================
// Key plays extraction
// ============================================

function buildKeyPlayDescription(event: GameEvent): string {
  const batter = event.batter_name ?? 'Unknown';
  const halfLabel = event.inning_half === 'top' ? 'Top' : 'Bot';
  const inningStr = `${halfLabel} ${event.inning}`;

  switch (event.outcome) {
    case 'home_run': {
      const rbi = event.runs_scored;
      if (rbi >= 4) return `${batter} hits a grand slam! (${inningStr})`;
      if (rbi === 3)
        return `${batter} hits a 3-run homer (${inningStr})`;
      if (rbi === 2)
        return `${batter} hits a 2-run homer (${inningStr})`;
      return `${batter} hits a solo home run (${inningStr})`;
    }
    case 'triple':
      return `${batter} triples${event.runs_scored > 0 ? `, ${event.runs_scored} RBI` : ''} (${inningStr})`;
    case 'error':
      return `Error on play involving ${batter} (${inningStr})`;
    case 'double_play':
      return `Double play${event.fielding_sequence ? ` (${event.fielding_sequence})` : ''} (${inningStr})`;
    case 'triple_play':
      return `Triple play! (${inningStr})`;
    default:
      return `${PLAY_OUTCOME_LABELS[event.outcome] ?? event.outcome} by ${batter} (${inningStr})`;
  }
}

export function extractKeyPlays(events: GameEvent[]): KeyPlay[] {
  return events
    .filter((e) => !e.is_deleted && KEY_PLAY_TYPES.has(e.outcome))
    .map((event) => ({
      event,
      type: event.outcome as KeyPlay['type'],
      description: buildKeyPlayDescription(event),
    }));
}

// ============================================
// Scoring summary
// ============================================

function ordinalSuffix(n: number): string {
  if (n % 10 === 1 && n !== 11) return 'st';
  if (n % 10 === 2 && n !== 12) return 'nd';
  if (n % 10 === 3 && n !== 13) return 'rd';
  return 'th';
}

export function buildScoringSummary(
  events: GameEvent[],
  homeTeamName: string,
  awayTeamName: string
): ScoringSummaryEntry[] {
  const active = events.filter((e) => !e.is_deleted && e.runs_scored > 0);

  // Group by inning + half
  const grouped = new Map<string, GameEvent[]>();
  for (const event of active) {
    const key = `${event.inning}-${event.inning_half}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(event);
  }

  const entries: ScoringSummaryEntry[] = [];
  for (const [key, inningEvents] of grouped) {
    const [inningStr, half] = key.split('-');
    const inning = Number(inningStr);
    const teamName = half === 'top' ? awayTeamName : homeTeamName;
    const totalRuns = inningEvents.reduce((s, e) => s + e.runs_scored, 0);

    entries.push({
      inning,
      inning_half: half as 'top' | 'bottom',
      team_name: teamName,
      runs: totalRuns,
      batters: inningEvents
        .filter((e) => e.runs_scored > 0)
        .map((e) => e.batter_name ?? 'Unknown'),
      description: `${teamName} scored ${totalRuns} run${totalRuns !== 1 ? 's' : ''} in the ${half === 'top' ? 'top' : 'bottom'} of the ${inning}${ordinalSuffix(inning)}`,
    });
  }

  return entries.sort((a, b) =>
    a.inning !== b.inning
      ? a.inning - b.inning
      : a.inning_half === 'top'
        ? -1
        : 1
  );
}
