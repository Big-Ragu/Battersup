import type { Position } from '../constants/positions';

export type LeagueStatus = 'draft' | 'active' | 'completed';
export type GameStatus = 'scheduled' | 'in_progress' | 'final' | 'cancelled' | 'postponed';
export type RosterStatus = 'active' | 'inactive' | 'injured';
export type InningHalf = 'top' | 'bottom';

export interface RosterEntry {
  id: string;
  team_id: string;
  player_user_id: string;
  position: Position | null;
  jersey_number: number | null;
  status: RosterStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface RosterEntryWithProfile {
  roster_entry_id: string;
  team_id: string;
  team_name: string;
  league_id: string;
  player_user_id: string;
  full_name: string | null;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  position: string | null;
  jersey_number: number | null;
  status: string;
  notes: string | null;
  created_at: string;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface League {
  id: string;
  name: string;
  description: string | null;
  season_year: number;
  status: LeagueStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface Team {
  id: string;
  league_id: string;
  name: string;
  color: string | null;
  logo_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Field {
  id: string;
  league_id: string;
  name: string;
  address: string | null;
  diamond_count: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserRole {
  id: string;
  user_id: string;
  league_id: string;
  team_id: string | null;
  role: 'commissioner' | 'manager' | 'coach' | 'player' | 'parent' | 'fan';
  assigned_at: string;
}

export interface SignupCode {
  id: string;
  league_id: string;
  code: string;
  role: UserRole['role'];
  team_id: string | null;
  max_uses: number | null;
  use_count: number;
  expires_at: string | null;
  created_at: string;
}

export interface Game {
  id: string;
  league_id: string;
  home_team_id: string;
  away_team_id: string;
  field_id: string | null;
  diamond_number: number | null;
  scheduled_at: string;
  status: GameStatus;
  home_score: number;
  away_score: number;
  inning: number | null;
  inning_half: InningHalf | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface GameWithTeams {
  game_id: string;
  league_id: string;
  league_name: string;
  home_team_id: string;
  home_team_name: string;
  home_team_color: string | null;
  away_team_id: string;
  away_team_name: string;
  away_team_color: string | null;
  field_id: string | null;
  field_name: string | null;
  diamond_number: number | null;
  scheduled_at: string;
  status: string;
  home_score: number;
  away_score: number;
  inning: number | null;
  inning_half: string | null;
  notes: string | null;
  created_at: string;
}
