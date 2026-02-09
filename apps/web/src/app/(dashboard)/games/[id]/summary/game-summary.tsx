'use client';

import { useMemo } from 'react';
import {
  computeTeamBattingLines,
  computeTeamPitchingLines,
  extractKeyPlays,
  buildScoringSummary,
  PLAY_OUTCOME_COLORS,
} from '@batters-up/shared';
import type {
  GameEvent,
  GameLineupEntry,
  TeamBoxScore,
  TeamPitchingStats,
  PlayerBattingLine,
  PlayerPitchingLine,
  KeyPlay,
} from '@batters-up/shared';

interface GameSummaryProps {
  gameId: string;
  state: {
    game: {
      id: string;
      home_team_id: string;
      away_team_id: string;
      home_team_name: string;
      away_team_name: string;
      home_team_color?: string;
      away_team_color?: string;
      home_score: number;
      away_score: number;
      status: string;
      inning: number | null;
      inning_half: string | null;
      scheduled_at: string;
      field_name: string | null;
    };
    events: GameEvent[];
    home_lineup: GameLineupEntry[];
    away_lineup: GameLineupEntry[];
  };
}

function BattingTable({
  boxScore,
  teamColor,
}: {
  boxScore: TeamBoxScore;
  teamColor?: string;
}) {
  const statCols: { key: keyof PlayerBattingLine; label: string }[] = [
    { key: 'ab', label: 'AB' },
    { key: 'r', label: 'R' },
    { key: 'h', label: 'H' },
    { key: 'doubles', label: '2B' },
    { key: 'triples', label: '3B' },
    { key: 'hr', label: 'HR' },
    { key: 'rbi', label: 'RBI' },
    { key: 'bb', label: 'BB' },
    { key: 'k', label: 'K' },
    { key: 'avg', label: 'AVG' },
  ];

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-x-auto">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 bg-gray-50">
        {teamColor && (
          <div
            className="h-4 w-4 rounded-full border border-gray-200"
            style={{ backgroundColor: teamColor }}
          />
        )}
        <h3 className="text-sm font-semibold text-gray-900">
          {boxScore.team_name} Batting
        </h3>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="px-4 py-2 text-left text-gray-600 font-medium">
              Player
            </th>
            {statCols.map((col) => (
              <th
                key={col.key}
                className="px-2 py-2 text-center text-gray-600 font-medium w-10"
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {boxScore.players.map((player) => (
            <tr
              key={player.player_user_id}
              className="border-b border-gray-50 hover:bg-gray-50"
            >
              <td className="px-4 py-2 font-medium text-gray-900">
                {player.player_name}
                {player.jersey_number != null && (
                  <span className="ml-1 text-xs text-gray-400">
                    #{player.jersey_number}
                  </span>
                )}
              </td>
              {statCols.map((col) => (
                <td
                  key={col.key}
                  className="px-2 py-2 text-center text-gray-700 tabular-nums"
                >
                  {player[col.key]}
                </td>
              ))}
            </tr>
          ))}
          {/* Totals row */}
          <tr className="border-t-2 border-gray-300 bg-gray-50 font-bold">
            <td className="px-4 py-2 text-gray-900">Totals</td>
            {statCols.map((col) => (
              <td
                key={col.key}
                className="px-2 py-2 text-center text-gray-900 tabular-nums"
              >
                {boxScore.totals[col.key]}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function PitchingTable({
  pitchingStats,
  teamColor,
}: {
  pitchingStats: TeamPitchingStats;
  teamColor?: string;
}) {
  const statCols: { key: keyof PlayerPitchingLine; label: string }[] = [
    { key: 'ip', label: 'IP' },
    { key: 'h', label: 'H' },
    { key: 'r', label: 'R' },
    { key: 'bb', label: 'BB' },
    { key: 'k', label: 'K' },
    { key: 'hr', label: 'HR' },
    { key: 'hbp', label: 'HBP' },
  ];

  if (pitchingStats.pitchers.length === 0) return null;

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-x-auto">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 bg-gray-50">
        {teamColor && (
          <div
            className="h-4 w-4 rounded-full border border-gray-200"
            style={{ backgroundColor: teamColor }}
          />
        )}
        <h3 className="text-sm font-semibold text-gray-900">
          {pitchingStats.team_name} Pitching
        </h3>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="px-4 py-2 text-left text-gray-600 font-medium">
              Pitcher
            </th>
            {statCols.map((col) => (
              <th
                key={col.key}
                className="px-2 py-2 text-center text-gray-600 font-medium w-10"
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {pitchingStats.pitchers.map((pitcher) => (
            <tr
              key={pitcher.player_user_id}
              className="border-b border-gray-50 hover:bg-gray-50"
            >
              <td className="px-4 py-2 font-medium text-gray-900">
                {pitcher.player_name}
                {pitcher.jersey_number != null && (
                  <span className="ml-1 text-xs text-gray-400">
                    #{pitcher.jersey_number}
                  </span>
                )}
              </td>
              {statCols.map((col) => (
                <td
                  key={col.key}
                  className="px-2 py-2 text-center text-gray-700 tabular-nums"
                >
                  {pitcher[col.key]}
                </td>
              ))}
            </tr>
          ))}
          {/* Totals row */}
          <tr className="border-t-2 border-gray-300 bg-gray-50 font-bold">
            <td className="px-4 py-2 text-gray-900">Totals</td>
            {statCols.map((col) => (
              <td
                key={col.key}
                className="px-2 py-2 text-center text-gray-900 tabular-nums"
              >
                {pitchingStats.totals[col.key]}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function GameSummary({ gameId, state }: GameSummaryProps) {
  const { game, events, home_lineup, away_lineup } = state;
  const activeEvents = useMemo(
    () => (events ?? []).filter((e: GameEvent) => !e.is_deleted),
    [events]
  );

  // Compute box scores
  const awayBoxScore = useMemo(
    () =>
      computeTeamBattingLines(
        activeEvents,
        home_lineup ?? [],
        away_lineup ?? [],
        game.away_team_id,
        game.away_team_name,
        'top'
      ),
    [activeEvents, home_lineup, away_lineup, game.away_team_id, game.away_team_name]
  );

  const homeBoxScore = useMemo(
    () =>
      computeTeamBattingLines(
        activeEvents,
        home_lineup ?? [],
        away_lineup ?? [],
        game.home_team_id,
        game.home_team_name,
        'bottom'
      ),
    [activeEvents, home_lineup, away_lineup, game.home_team_id, game.home_team_name]
  );

  // Compute pitching stats
  // Away team pitches the bottom half (home team bats)
  const awayPitching = useMemo(
    () =>
      computeTeamPitchingLines(
        activeEvents,
        home_lineup ?? [],
        away_lineup ?? [],
        game.away_team_id,
        game.away_team_name,
        'bottom'
      ),
    [activeEvents, home_lineup, away_lineup, game.away_team_id, game.away_team_name]
  );

  // Home team pitches the top half (away team bats)
  const homePitching = useMemo(
    () =>
      computeTeamPitchingLines(
        activeEvents,
        home_lineup ?? [],
        away_lineup ?? [],
        game.home_team_id,
        game.home_team_name,
        'top'
      ),
    [activeEvents, home_lineup, away_lineup, game.home_team_id, game.home_team_name]
  );

  const keyPlays = useMemo(() => extractKeyPlays(activeEvents), [activeEvents]);

  const scoringSummary = useMemo(
    () =>
      buildScoringSummary(activeEvents, game.home_team_name, game.away_team_name),
    [activeEvents, game.home_team_name, game.away_team_name]
  );

  // Line score
  const maxInning = activeEvents.reduce(
    (max: number, e: GameEvent) => Math.max(max, e.inning),
    game.inning ?? 1
  );
  const innings = Array.from({ length: maxInning }, (_, i) => i + 1);

  function getInningRuns(inning: number, half: 'top' | 'bottom') {
    return activeEvents
      .filter((e: GameEvent) => e.inning === inning && e.inning_half === half)
      .reduce((sum: number, e: GameEvent) => sum + e.runs_scored, 0);
  }

  const hitOutcomes = ['single', 'double', 'triple', 'home_run'];
  const awayHits = activeEvents.filter(
    (e: GameEvent) => e.inning_half === 'top' && hitOutcomes.includes(e.outcome)
  ).length;
  const homeHits = activeEvents.filter(
    (e: GameEvent) => e.inning_half === 'bottom' && hitOutcomes.includes(e.outcome)
  ).length;
  const awayErrors = activeEvents.filter(
    (e: GameEvent) => e.inning_half === 'bottom' && e.outcome === 'error'
  ).length;
  const homeErrors = activeEvents.filter(
    (e: GameEvent) => e.inning_half === 'top' && e.outcome === 'error'
  ).length;

  const scheduledDate = game.scheduled_at ? new Date(game.scheduled_at) : null;
  const winner =
    game.home_score > game.away_score
      ? game.home_team_name
      : game.away_score > game.home_score
      ? game.away_team_name
      : null;

  return (
    <div className="mt-6 space-y-6">
      {/* Final Score Header */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-center gap-2 mb-4">
          <span className="inline-flex rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-800 uppercase tracking-wider">
            Final
          </span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex-1 text-center">
            <div className="flex items-center justify-center gap-2">
              {game.away_team_color && (
                <div
                  className="h-5 w-5 rounded-full border border-gray-200"
                  style={{ backgroundColor: game.away_team_color }}
                />
              )}
              <p className="text-lg font-semibold text-gray-900">
                {game.away_team_name}
              </p>
            </div>
            <p className="text-4xl font-bold text-gray-900 mt-1">
              {game.away_score}
            </p>
          </div>
          <div className="mx-6 text-center">
            <p className="text-xl font-bold text-gray-300">&mdash;</p>
          </div>
          <div className="flex-1 text-center">
            <div className="flex items-center justify-center gap-2">
              <p className="text-lg font-semibold text-gray-900">
                {game.home_team_name}
              </p>
              {game.home_team_color && (
                <div
                  className="h-5 w-5 rounded-full border border-gray-200"
                  style={{ backgroundColor: game.home_team_color }}
                />
              )}
            </div>
            <p className="text-4xl font-bold text-gray-900 mt-1">
              {game.home_score}
            </p>
          </div>
        </div>
        {winner && (
          <p className="mt-3 text-center text-sm font-medium text-green-700">
            {winner} wins!
          </p>
        )}
        {scheduledDate && (
          <p className="mt-2 text-center text-xs text-gray-500">
            {scheduledDate.toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}
            {game.field_name && <> &middot; {game.field_name}</>}
          </p>
        )}
      </div>

      {/* Line Score */}
      {activeEvents.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-x-auto">
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
            <h3 className="text-sm font-semibold text-gray-900">Line Score</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
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
              <tr className="border-b border-gray-100">
                <td className="px-4 py-2 font-medium text-gray-900">
                  {game.away_team_name}
                </td>
                {innings.map((i) => {
                  const runs = getInningRuns(i, 'top');
                  return (
                    <td key={i} className="px-3 py-2 text-center text-gray-700">
                      {runs || <span className="text-gray-300">0</span>}
                    </td>
                  );
                })}
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
              <tr>
                <td className="px-4 py-2 font-medium text-gray-900">
                  {game.home_team_name}
                </td>
                {innings.map((i) => {
                  const runs = getInningRuns(i, 'bottom');
                  return (
                    <td key={i} className="px-3 py-2 text-center text-gray-700">
                      {runs || <span className="text-gray-300">0</span>}
                    </td>
                  );
                })}
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

      {/* Away Team Batting */}
      <BattingTable
        boxScore={awayBoxScore}
        teamColor={game.away_team_color}
      />

      {/* Home Team Batting */}
      <BattingTable
        boxScore={homeBoxScore}
        teamColor={game.home_team_color}
      />

      {/* Away Team Pitching */}
      <PitchingTable
        pitchingStats={awayPitching}
        teamColor={game.away_team_color}
      />

      {/* Home Team Pitching */}
      <PitchingTable
        pitchingStats={homePitching}
        teamColor={game.home_team_color}
      />

      {/* Key Plays */}
      {keyPlays.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
            <h3 className="text-sm font-semibold text-gray-900">Key Plays</h3>
          </div>
          <div className="divide-y divide-gray-100">
            {keyPlays.map((kp) => (
              <div
                key={kp.event.id}
                className="px-4 py-3 flex items-center gap-3"
              >
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                    PLAY_OUTCOME_COLORS[kp.event.outcome] ??
                    'bg-gray-100 text-gray-800'
                  }`}
                >
                  {kp.type === 'home_run'
                    ? 'HR'
                    : kp.type === 'triple'
                    ? '3B'
                    : kp.type === 'double_play'
                    ? 'DP'
                    : kp.type === 'triple_play'
                    ? 'TP'
                    : 'E'}
                </span>
                <span className="text-sm text-gray-700">{kp.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Scoring Summary */}
      {scoringSummary.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
            <h3 className="text-sm font-semibold text-gray-900">
              Scoring Summary
            </h3>
          </div>
          <div className="divide-y divide-gray-100">
            {scoringSummary.map((entry, idx) => (
              <div key={idx} className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">
                      {entry.inning_half === 'top' ? '▲' : '▼'} {entry.inning}
                    </span>
                    <span className="text-sm font-medium text-gray-900">
                      {entry.team_name}
                    </span>
                  </div>
                  <span className="text-sm font-bold text-green-600">
                    +{entry.runs}{' '}
                    {entry.runs === 1 ? 'run' : 'runs'}
                  </span>
                </div>
                {entry.batters.length > 0 && (
                  <p className="mt-1 text-xs text-gray-500">
                    RBI: {entry.batters.join(', ')}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
