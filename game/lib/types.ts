export type Category = 'book' | 'person' | 'place' | 'tribe' | 'nation';
export type Level = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
/** 0 = a household name, 4 = genuinely obscure. Set by hand per word. */
export type Familiarity = 0 | 1 | 2 | 3 | 4;

/** A hand-authored word-bank row: display spelling, its NWT reference
 * in `Book chapter:verse` form, and how familiar the name is. */
export type SourceRow = [display: string, reference: string, familiarity: Familiarity];

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

/** A room is mixed-ability by nature -- a grandparent and a child on one
 * screen -- so a single pinned level is wrong for both at once. `'mixed'`
 * spreads the match across all nine levels on a rising curve instead;
 * a `Level` pins the room to exactly that one, the same as solo. */
export type RoomDifficulty = 'mixed' | Level;

/** What an online room's host actually configures. Carries `difficulty`
 * rather than `GameSettings`'s `maxBand`, because "Mixed" is not a level
 * at all -- see `RoomDifficulty`. */
export type RoomSettings = {
  categories: Category[];
  difficulty: RoomDifficulty;
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
