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
