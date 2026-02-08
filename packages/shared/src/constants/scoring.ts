// Field position numbers → labels
export const FIELD_POSITIONS: Record<number, string> = {
  1: 'Pitcher',
  2: 'Catcher',
  3: 'First Base',
  4: 'Second Base',
  5: 'Third Base',
  6: 'Shortstop',
  7: 'Left Field',
  8: 'Center Field',
  9: 'Right Field',
};

export const FIELD_POSITION_ABBREV: Record<number, string> = {
  1: 'P',
  2: 'C',
  3: '1B',
  4: '2B',
  5: '3B',
  6: 'SS',
  7: 'LF',
  8: 'CF',
  9: 'RF',
};

// Play outcomes grouped by category
export const HIT_OUTCOMES = [
  'single',
  'double',
  'triple',
  'home_run',
] as const;

export const OUT_OUTCOMES = [
  'groundout',
  'flyout',
  'lineout',
  'pop_out',
  'strikeout_swinging',
  'strikeout_looking',
  'double_play',
  'triple_play',
] as const;

export const WALK_OUTCOMES = [
  'walk',
  'intentional_walk',
  'hit_by_pitch',
] as const;

export const OTHER_OUTCOMES = [
  'error',
  'fielders_choice',
  'sacrifice_fly',
  'sacrifice_bunt',
] as const;

export const BASERUNNING_OUTCOMES = [
  'stolen_base',
  'caught_stealing',
  'wild_pitch',
  'passed_ball',
  'balk',
  'picked_off',
  'runner_advance',
] as const;

// Display labels for outcomes
export const PLAY_OUTCOME_LABELS: Record<string, string> = {
  single: '1B Single',
  double: '2B Double',
  triple: '3B Triple',
  home_run: 'HR Home Run',
  groundout: 'Groundout',
  flyout: 'Flyout',
  lineout: 'Lineout',
  pop_out: 'Pop Out',
  strikeout_swinging: 'K Strikeout',
  strikeout_looking: 'Ꝁ Called Strike 3',
  walk: 'BB Walk',
  intentional_walk: 'IBB',
  hit_by_pitch: 'HBP',
  error: 'Error',
  fielders_choice: "Fielder's Choice",
  sacrifice_fly: 'Sac Fly',
  sacrifice_bunt: 'Sac Bunt',
  double_play: 'Double Play',
  triple_play: 'Triple Play',
  stolen_base: 'SB Stolen Base',
  caught_stealing: 'CS',
  wild_pitch: 'WP',
  passed_ball: 'PB',
  balk: 'Balk',
  picked_off: 'Picked Off',
  runner_advance: 'Runner Advance',
  other: 'Other',
};

// Colors for outcome badges (Tailwind classes)
export const PLAY_OUTCOME_COLORS: Record<string, string> = {
  single: 'bg-green-100 text-green-800',
  double: 'bg-green-200 text-green-900',
  triple: 'bg-emerald-200 text-emerald-900',
  home_run: 'bg-emerald-300 text-emerald-900',
  groundout: 'bg-red-100 text-red-800',
  flyout: 'bg-red-100 text-red-800',
  lineout: 'bg-red-100 text-red-800',
  pop_out: 'bg-red-100 text-red-800',
  strikeout_swinging: 'bg-red-200 text-red-900',
  strikeout_looking: 'bg-red-200 text-red-900',
  walk: 'bg-blue-100 text-blue-800',
  intentional_walk: 'bg-blue-100 text-blue-800',
  hit_by_pitch: 'bg-yellow-100 text-yellow-800',
  error: 'bg-orange-100 text-orange-800',
  double_play: 'bg-red-300 text-red-900',
  triple_play: 'bg-red-300 text-red-900',
  sacrifice_fly: 'bg-gray-100 text-gray-800',
  sacrifice_bunt: 'bg-gray-100 text-gray-800',
  fielders_choice: 'bg-orange-100 text-orange-800',
  stolen_base: 'bg-blue-100 text-blue-800',
  caught_stealing: 'bg-red-100 text-red-800',
  wild_pitch: 'bg-yellow-100 text-yellow-800',
  passed_ball: 'bg-yellow-100 text-yellow-800',
  balk: 'bg-yellow-100 text-yellow-800',
  picked_off: 'bg-red-100 text-red-800',
  runner_advance: 'bg-blue-100 text-blue-800',
  other: 'bg-gray-100 text-gray-800',
};

// Context-aware options per field zone (used in 6B for SVG)
export const FIELD_ZONE_OPTIONS: Record<number, string[]> = {
  1: ['groundout', 'lineout', 'sacrifice_bunt', 'balk', 'error'],
  2: [
    'strikeout_swinging',
    'strikeout_looking',
    'walk',
    'hit_by_pitch',
    'passed_ball',
    'wild_pitch',
    'pop_out',
    'error',
  ],
  3: ['groundout', 'single', 'double', 'error', 'lineout'],
  4: ['groundout', 'single', 'double', 'error', 'lineout'],
  5: ['groundout', 'single', 'double', 'error', 'lineout'],
  6: [
    'groundout',
    'single',
    'double',
    'error',
    'lineout',
    'fielders_choice',
  ],
  7: [
    'flyout',
    'single',
    'double',
    'triple',
    'home_run',
    'error',
    'sacrifice_fly',
  ],
  8: [
    'flyout',
    'single',
    'double',
    'triple',
    'home_run',
    'error',
    'sacrifice_fly',
  ],
  9: [
    'flyout',
    'single',
    'double',
    'triple',
    'home_run',
    'error',
    'sacrifice_fly',
  ],
};

// Consensus status labels/colors
export const CONSENSUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  agreed: 'Agreed',
  disputed: 'Disputed',
  flagged: 'Flagged',
  resolved: 'Resolved',
};

export const CONSENSUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  agreed: 'bg-green-100 text-green-800',
  disputed: 'bg-orange-100 text-orange-800',
  flagged: 'bg-red-100 text-red-800',
  resolved: 'bg-blue-100 text-blue-800',
};
