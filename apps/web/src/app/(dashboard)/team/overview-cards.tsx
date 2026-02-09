import Link from 'next/link';
import {
  Users,
  ClipboardCheck,
  ClipboardList,
  Calendar,
  BarChart3,
} from 'lucide-react';
import {
  POSITIONS,
  ROSTER_STATUS_LABELS,
  ROSTER_STATUS_COLORS,
  GAME_STATUS_LABELS,
  GAME_STATUS_COLORS,
  FIELD_POSITION_COORDS,
} from '@batters-up/shared';
import type { RosterStatus, GameStatus } from '@batters-up/shared';

/* ─── Shared card shell ─── */

function OverviewCard({
  title,
  icon: Icon,
  href,
  linkLabel = 'View All',
  children,
  className = '',
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  linkLabel?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-lg border border-gray-200 bg-white shadow-sm ${className}`}
    >
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-gray-500" />
          <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        </div>
        <Link
          href={href}
          className="text-xs font-medium text-blue-600 hover:text-blue-800"
        >
          {linkLabel} &rarr;
        </Link>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

/* ─── Roster Card ─── */

interface RosterPlayer {
  roster_entry_id: string;
  player_user_id: string;
  full_name: string;
  jersey_number: number | null;
  position: string | null;
  status: string;
}

export function RosterOverviewCard({ roster }: { roster: RosterPlayer[] }) {
  return (
    <OverviewCard
      title={`Roster (${roster.length})`}
      icon={Users}
      href="/team/roster"
      linkLabel="Full Roster"
    >
      {roster.length === 0 ? (
        <p className="text-sm text-gray-500 italic">
          No players on the roster yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
                <th className="pb-2 pr-3 font-medium">#</th>
                <th className="pb-2 pr-3 font-medium">Name</th>
                <th className="pb-2 pr-3 font-medium">Pos</th>
                <th className="pb-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((p) => (
                <tr key={p.roster_entry_id} className="border-b border-gray-50">
                  <td className="py-1.5 pr-3 text-gray-600">
                    {p.jersey_number ?? '—'}
                  </td>
                  <td className="py-1.5 pr-3 font-medium text-gray-900">
                    {p.full_name}
                  </td>
                  <td className="py-1.5 pr-3 text-gray-600">
                    {p.position ?? '—'}
                  </td>
                  <td className="py-1.5">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        ROSTER_STATUS_COLORS[p.status as RosterStatus] ??
                        'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {ROSTER_STATUS_LABELS[p.status as RosterStatus] ??
                        p.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </OverviewCard>
  );
}

/* ─── Depth Chart Card (mini field) ─── */

interface DepthChartEntry {
  position: string;
  player_user_id: string;
  depth_order: number;
}

const PLAYER_ROW_HEIGHT = 14;
const HEADER_HEIGHT = 16;
const PILL_PADDING = 6;
const PILL_WIDTH = 80;

function MiniFieldSVG({
  entries,
  rosterLookup,
}: {
  entries: DepthChartEntry[];
  rosterLookup: Record<string, { full_name: string; jersey_number: number | null }>;
}) {
  // Group entries by position, sorted by depth_order
  const positionMap: Record<string, DepthChartEntry[]> = {};
  for (const e of entries) {
    if (!positionMap[e.position]) positionMap[e.position] = [];
    positionMap[e.position].push(e);
  }
  for (const pos of Object.keys(positionMap)) {
    positionMap[pos].sort((a, b) => a.depth_order - b.depth_order);
  }

  return (
    <svg
      viewBox="0 0 500 480"
      className="mx-auto w-full max-w-[360px]"
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

      {/* First base */}
      <rect x="364" y="284" width="12" height="12" fill="white" stroke="#666" strokeWidth="0.5" transform="rotate(45 370 290)" />
      {/* Second base */}
      <rect x="244" y="194" width="12" height="12" fill="white" stroke="#666" strokeWidth="0.5" transform="rotate(45 250 200)" />
      {/* Third base */}
      <rect x="124" y="284" width="12" height="12" fill="white" stroke="#666" strokeWidth="0.5" transform="rotate(45 130 290)" />

      {/* Pitcher's mound */}
      <circle cx="250" cy="305" r="8" fill="#d4a574" stroke="#b8956a" strokeWidth="1" />
      <rect x="246" y="303" width="8" height="2" fill="white" />

      {/* Foul lines */}
      <line x1="250" y1="405" x2="10" y2="200" stroke="white" strokeWidth="1.5" strokeDasharray="4 4" />
      <line x1="250" y1="405" x2="490" y2="200" stroke="white" strokeWidth="1.5" strokeDasharray="4 4" />

      {/* Position pills on the field */}
      {Object.entries(FIELD_POSITION_COORDS).map(([pos, coords]) => {
        const players = positionMap[pos] ?? [];
        const count = players.length;
        const pillHeight =
          HEADER_HEIGHT + Math.max(count, 1) * PLAYER_ROW_HEIGHT + PILL_PADDING;
        const pillTop = coords.y - HEADER_HEIGHT - 2;

        return (
          <g key={pos}>
            {/* Background pill — scales to player count */}
            <rect
              x={coords.x - PILL_WIDTH / 2}
              y={pillTop}
              width={PILL_WIDTH}
              height={pillHeight}
              rx={6}
              fill={count > 0 ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.6)'}
              stroke={count > 0 ? '#22c55e' : 'rgba(255,255,255,0.4)'}
              strokeWidth={count > 0 ? 1.5 : 1}
            />
            {/* Position abbreviation */}
            <text
              x={coords.x}
              y={pillTop + 12}
              textAnchor="middle"
              fontSize="10"
              fontWeight="700"
              fill="#6b7280"
            >
              {pos}
            </text>
            {/* Player names */}
            {count === 0 ? (
              <text
                x={coords.x}
                y={pillTop + 12 + PLAYER_ROW_HEIGHT}
                textAnchor="middle"
                fontSize="10"
                fill="#9ca3af"
              >
                —
              </text>
            ) : (
              players.map((entry, idx) => {
                const player = rosterLookup[entry.player_user_id];
                const isStarter = idx === 0;
                const label = player
                  ? `${player.full_name.split(' ').pop()}${player.jersey_number != null ? ` #${player.jersey_number}` : ''}`
                  : '?';
                return (
                  <text
                    key={entry.player_user_id}
                    x={coords.x}
                    y={pillTop + HEADER_HEIGHT + (idx + 1) * PLAYER_ROW_HEIGHT}
                    textAnchor="middle"
                    fontSize="11"
                    fontWeight="500"
                    fill="#111827"
                  >
                    {label}
                  </text>
                );
              })
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function DepthChartOverviewCard({
  entries,
  rosterLookup,
}: {
  entries: DepthChartEntry[];
  rosterLookup: Record<string, { full_name: string; jersey_number: number | null }>;
}) {
  return (
    <OverviewCard
      title="Depth Chart"
      icon={ClipboardCheck}
      href="/team/depth-chart"
      linkLabel="Edit"
    >
      {entries.length === 0 ? (
        <p className="text-sm text-gray-500 italic">
          Depth chart has not been set up.
        </p>
      ) : (
        <MiniFieldSVG entries={entries} rosterLookup={rosterLookup} />
      )}
    </OverviewCard>
  );
}

/* ─── Lineup Card ─── */

interface LineupEntry {
  batting_order: number;
  player_user_id: string;
  fielding_position: string | null;
}

export function LineupOverviewCard({
  lineup,
  rosterLookup,
}: {
  lineup: LineupEntry[];
  rosterLookup: Record<string, { full_name: string; jersey_number: number | null }>;
}) {
  const sorted = [...lineup].sort((a, b) => a.batting_order - b.batting_order);
  const starters = sorted.filter((l) => l.batting_order <= 9);
  const bench = sorted.filter((l) => l.batting_order > 9);

  return (
    <OverviewCard
      title="Standard Lineup"
      icon={ClipboardList}
      href="/team/lineup"
      linkLabel="Edit"
    >
      {lineup.length === 0 ? (
        <p className="text-sm text-gray-500 italic">
          Standard lineup has not been set.
        </p>
      ) : (
        <div className="space-y-1">
          {starters.map((entry) => {
            const player = rosterLookup[entry.player_user_id];
            return (
              <div
                key={entry.batting_order}
                className="flex items-center gap-2 text-sm"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                  {entry.batting_order}
                </span>
                <span className="font-medium text-gray-900 truncate">
                  {player?.full_name ?? 'Unknown'}
                </span>
                {player?.jersey_number != null && (
                  <span className="text-xs text-gray-500">
                    #{player.jersey_number}
                  </span>
                )}
                {entry.fielding_position && (
                  <span className="ml-auto text-xs text-gray-500">
                    {entry.fielding_position}
                  </span>
                )}
              </div>
            );
          })}
          {bench.length > 0 && (
            <p className="pt-1 text-xs text-gray-500">
              + {bench.length} on bench
            </p>
          )}
        </div>
      )}
    </OverviewCard>
  );
}

/* ─── Schedule Outlook Card ─── */

interface GameData {
  game_id: string;
  home_team_id: string;
  home_team_name: string;
  away_team_id: string;
  away_team_name: string;
  scheduled_at: string;
  status: string;
  home_score: number;
  away_score: number;
  field_name: string | null;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function ScheduleOutlookCard({
  games,
  teamId,
}: {
  games: GameData[];
  teamId: string;
}) {
  return (
    <OverviewCard
      title="Upcoming Games"
      icon={Calendar}
      href="/schedule"
      linkLabel="Full Schedule"
    >
      {games.length === 0 ? (
        <p className="text-sm text-gray-500 italic">
          No upcoming games scheduled.
        </p>
      ) : (
        <div className="space-y-3">
          {games.map((g) => {
            const isHome = g.home_team_id === teamId;
            const opponent = isHome ? g.away_team_name : g.home_team_name;
            const prefix = isHome ? 'vs' : '@';
            return (
              <Link
                key={g.game_id}
                href={`/games/${g.game_id}`}
                className="flex items-center justify-between rounded-md border border-gray-100 px-3 py-2 hover:bg-gray-50 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {prefix} {opponent}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatDate(g.scheduled_at)} &middot; {formatTime(g.scheduled_at)}
                    {g.field_name && ` &middot; ${g.field_name}`}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    GAME_STATUS_COLORS[g.status as GameStatus] ??
                    'bg-gray-100 text-gray-800'
                  }`}
                >
                  {GAME_STATUS_LABELS[g.status as GameStatus] ?? g.status}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </OverviewCard>
  );
}

/* ─── Standings Card ─── */

interface StandingRow {
  team_id: string;
  team_name: string;
  team_color: string | null;
  wins: number;
  losses: number;
  ties: number;
  win_pct: number;
  games_back: number;
}

export function StandingsCard({
  standings,
  teamId,
}: {
  standings: StandingRow[];
  teamId: string;
}) {
  return (
    <OverviewCard
      title="League Standings"
      icon={BarChart3}
      href="/standings"
      linkLabel="View All"
    >
      {standings.length === 0 ? (
        <p className="text-sm text-gray-500 italic">
          No games have been finalized yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
                <th className="pb-2 pr-2 font-medium">Team</th>
                <th className="pb-2 pr-2 font-medium text-center">W</th>
                <th className="pb-2 pr-2 font-medium text-center">L</th>
                <th className="pb-2 pr-2 font-medium text-center">PCT</th>
                <th className="pb-2 font-medium text-center">GB</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((s) => (
                <tr
                  key={s.team_id}
                  className={`border-b border-gray-50 ${
                    s.team_id === teamId ? 'bg-blue-50' : ''
                  }`}
                >
                  <td className="py-1.5 pr-2">
                    <div className="flex items-center gap-1.5">
                      {s.team_color && (
                        <div
                          className="h-2.5 w-2.5 rounded-full border border-gray-200"
                          style={{ backgroundColor: s.team_color }}
                        />
                      )}
                      <span
                        className={`font-medium ${
                          s.team_id === teamId
                            ? 'text-blue-900'
                            : 'text-gray-900'
                        }`}
                      >
                        {s.team_name}
                      </span>
                    </div>
                  </td>
                  <td className="py-1.5 pr-2 text-center text-gray-700">
                    {s.wins}
                  </td>
                  <td className="py-1.5 pr-2 text-center text-gray-700">
                    {s.losses}
                  </td>
                  <td className="py-1.5 pr-2 text-center text-gray-700">
                    {Number(s.win_pct).toFixed(3)}
                  </td>
                  <td className="py-1.5 text-center text-gray-700">
                    {s.games_back === 0 ? '—' : s.games_back}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </OverviewCard>
  );
}
