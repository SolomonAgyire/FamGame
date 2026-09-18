export type Category = 'book' | 'person' | 'place';
export type DifficultyBand = 1 | 2 | 3 | 4;
export type PlayMode = 'solo' | 'cooperative' | 'teams';

export type WordEntry = {
  id: string;
  answer: string;
  display: string;
  playable: string;
  fixedPrefix?: string;
  categories: Category[];
  band: DifficultyBand;
  hints: [string, string];
  references: string[];
  verification: 'English NWT naming standard';
  status: 'approved';
};

export type GameSettings = {
  categories: Category[];
  maxBand: DifficultyBand;
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
