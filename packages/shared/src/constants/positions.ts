export const POSITIONS = {
  P: 'Pitcher',
  C: 'Catcher',
  '1B': 'First Base',
  '2B': 'Second Base',
  '3B': 'Third Base',
  SS: 'Shortstop',
  LF: 'Left Field',
  CF: 'Center Field',
  RF: 'Right Field',
  DH: 'Designated Hitter',
  UTIL: 'Utility',
} as const;

export type Position = keyof typeof POSITIONS;

export const POSITION_LIST = Object.entries(POSITIONS).map(([key, label]) => ({
  key: key as Position,
  label,
}));

/** Maps position abbreviation to scoring number (1-9) */
export const POSITION_TO_SCORING: Record<string, number> = {
  P: 1,
  C: 2,
  '1B': 3,
  '2B': 4,
  '3B': 5,
  SS: 6,
  LF: 7,
  CF: 8,
  RF: 9,
} as const;

/** Maps scoring number (1-9) to position abbreviation */
export const SCORING_TO_POSITION: Record<number, string> = {
  1: 'P',
  2: 'C',
  3: '1B',
  4: '2B',
  5: '3B',
  6: 'SS',
  7: 'LF',
  8: 'CF',
  9: 'RF',
} as const;

/** The 9 standard field positions (no DH/UTIL) */
export const FIELD_DIAMOND_POSITIONS = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'] as const;

/** SVG coordinates for each position on a 500x500 viewBox */
export const FIELD_POSITION_COORDS: Record<string, { x: number; y: number }> = {
  CF: { x: 250, y: 85 },
  LF: { x: 95, y: 145 },
  RF: { x: 405, y: 145 },
  SS: { x: 190, y: 230 },
  '2B': { x: 310, y: 230 },
  '3B': { x: 125, y: 300 },
  '1B': { x: 375, y: 300 },
  P: { x: 250, y: 310 },
  C: { x: 250, y: 420 },
};
