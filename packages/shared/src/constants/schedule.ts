import type { GameStatus } from '../types/database';

export const GAME_STATUS_LABELS: Record<GameStatus, string> = {
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  final: 'Final',
  cancelled: 'Cancelled',
  postponed: 'Postponed',
};

export const GAME_STATUS_COLORS: Record<GameStatus, string> = {
  scheduled: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-green-100 text-green-800',
  final: 'bg-gray-100 text-gray-800',
  cancelled: 'bg-red-100 text-red-800',
  postponed: 'bg-yellow-100 text-yellow-800',
};
