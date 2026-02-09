export interface ScorekeeperAssignment {
  id: string;
  game_id: string;
  team_id: string;
  user_id: string;
  assigned_by: string;
  created_at: string;
}

export interface GameLineupEntry {
  id: string;
  game_id: string;
  team_id: string;
  player_user_id: string;
  batting_order: number;
  fielding_position: number | null;
  is_substitute: boolean;
  entered_inning: number | null;
  exited_inning: number | null;
  // Joined fields
  player_name?: string;
  jersey_number?: number | null;
}

export interface BaseRunners {
  first: string | null;
  second: string | null;
  third: string | null;
}

export interface RunnerMovement {
  runner_id: string;
  from_base: 'home' | 'first' | 'second' | 'third';
  to_base: 'first' | 'second' | 'third' | 'home' | 'out';
  scored: boolean;
  out: boolean;
}

export interface GameEvent {
  id: string;
  game_id: string;
  inning: number;
  inning_half: 'top' | 'bottom';
  sequence_number: number;
  batter_user_id: string | null;
  pitcher_user_id: string | null;
  outcome: string;
  hit_location: number | null;
  fielding_sequence: string | null;
  outs_before: number;
  outs_after: number;
  runs_scored: number;
  runners_before: BaseRunners;
  runners_after: BaseRunners;
  runner_movements: RunnerMovement[] | null;
  pitch_count_at_event: number | null;
  balls: number | null;
  strikes: number | null;
  recorded_by: string | null;
  partner_outcome: string | null;
  partner_recorded_by: string | null;
  consensus: string;
  video_timestamp_seconds: number | null;
  notes: string | null;
  is_deleted: boolean;
  created_at: string;
  // Joined fields
  batter_name?: string;
  pitcher_name?: string;
}

export interface GameState {
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
    scheduled_at: string;
    field_name: string | null;
  };
  home_lineup: GameLineupEntry[];
  away_lineup: GameLineupEntry[];
  events: GameEvent[];
  scorekeepers: ScorekeeperAssignment[];
  current_batter_index: { home: number; away: number };
}
