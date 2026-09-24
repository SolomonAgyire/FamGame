export type Category = 'book' | 'person' | 'place' | 'tribe' | 'nation';
export type Level = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
/** 0 = a household name, 4 = genuinely obscure. Set by hand per word. */
export type Familiarity = 0 | 1 | 2 | 3 | 4;

/** Kept as an alias so existing call sites compile while Phase D migrates
 * them; remove once nothing references it. */
export type DifficultyBand = Level;

export const LEVEL_NAMES = [
  'Studying', 'Publisher', 'Baptized', 'Serving', 'Reaching Out',
  'Maturity', 'Strong Faith', 'New World', 'Eternity',
] as const;

export type PlayMode = 'solo' | 'cooperative' | 'teams';

export type WordEntry = {
  id: string;
  answer: string;
  display: string;
  playable: string;
  categories: Category[];
  level: Level;
  familiarity: Familiarity;
  /** Retained as an alias of `level` during the Phase D migration. */
  band: Level;
  hints: [string, string];
  references: string[];
  verification: 'English NWT naming standard';
  status: 'draft' | 'approved';
};

export type GameSettings = {
  categories: Category[];
  maxBand: Level;
  length: number;
};

export type PuzzleRecipe = {
  entryId: string;
  scramble: string;
};

export type MatchRecipe = {
  seed: string;
  signature: string;
  puzzles: PuzzleRecipe[];
};

export type Team = {
  id: string;
  name: string;
  color: string;
  score: number;
};
