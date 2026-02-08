import type { RosterStatus } from '../types/database';

export const ROSTER_STATUS_LABELS: Record<RosterStatus, string> = {
  active: 'Active',
  inactive: 'Inactive',
  injured: 'Injured',
};

export const ROSTER_STATUS_COLORS: Record<RosterStatus, string> = {
  active: 'bg-green-100 text-green-800',
  inactive: 'bg-gray-100 text-gray-800',
  injured: 'bg-red-100 text-red-800',
};
