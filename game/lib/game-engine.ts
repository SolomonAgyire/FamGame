import { WORD_BANK } from '@/data/word-bank';
import type { Category, DifficultyBand, GameSettings, MatchRecipe, PuzzleRecipe, WordEntry } from '@/lib/types';

const HISTORY_KEY = 'gatherword-match-history-v1';

function hash32(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function rng(seed: string) {
  let state = hash32(seed) || 1;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], random: () => number) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function normalizeAnswer(value: string) {
  return value.toUpperCase().replace(/[^A-Z]/g, '');
}

export function eligibleWords(settings: GameSettings) {
  return WORD_BANK.filter((entry) => entry.band <= settings.maxBand && entry.categories.some((category) => settings.categories.includes(category)));
}

/** Words at exactly one band (not "up to"), for level-by-level modes like
 * Time Attack where each level is a single difficulty tier. */
export function wordsForBand(band: DifficultyBand, categories: Category[]) {
  return WORD_BANK.filter((entry) => entry.band === band && entry.categories.some((category) => categories.includes(category)));
}

/** A shuffled, freshly-scrambled queue of every word at one band, for a
 * level that should never repeat a word within a run. */
export function buildLevelQueue(band: DifficultyBand, categories: Category[]): PuzzleRecipe[] {
  const random = rng(secureSeed());
  const words = shuffle(wordsForBand(band, categories), random);
  return words.map((entry) => ({ entryId: entry.id, scramble: makeScramble(entry.playable, random) }));
}

function makeScramble(answer: string, random: () => number) {
  if (new Set(answer).size < 2) return answer;
  let scrambled = answer;
  for (let attempt = 0; attempt < 12 && scrambled === answer; attempt += 1) {
    scrambled = shuffle(answer.split(''), random).join('');
  }
  return scrambled === answer ? `${answer.slice(1)}${answer[0]}` : scrambled;
}

export function createRecipe(settings: GameSettings, seed: string): MatchRecipe {
  const random = rng(seed);
  const byCategory = settings.categories.map((category) => ({
    category,
    words: shuffle(eligibleWords(settings).filter((entry) => entry.categories.includes(category)), random),
  }));
  const selected: WordEntry[] = [];
  let cursor = 0;
  while (selected.length < settings.length && byCategory.some((group) => group.words.length > 0)) {
    const group = byCategory[cursor % byCategory.length];
    const next = group.words.shift();
    if (next && !selected.some((entry) => entry.id === next.id)) selected.push(next);
    cursor += 1;
    if (cursor > settings.length * byCategory.length * 4) break;
  }
  if (selected.length < settings.length) {
    const remaining = shuffle(eligibleWords(settings).filter((entry) => !selected.some((picked) => picked.id === entry.id)), random);
    selected.push(...remaining.slice(0, settings.length - selected.length));
  }
  const puzzles: PuzzleRecipe[] = shuffle(selected, random).map((entry) => ({ entryId: entry.id, scramble: makeScramble(entry.playable, random) }));
  const signature = hash32(puzzles.map((puzzle) => `${puzzle.entryId}:${puzzle.scramble}`).join('|')).toString(36);
  return { seed, signature, puzzles };
}

function secureSeed() {
  const values = new Uint32Array(4);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => value.toString(36)).join('-');
}

export function createFreshRecipe(settings: GameSettings) {
  let history: string[] = [];
  try { history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { history = []; }
  let recipe = createRecipe(settings, secureSeed());
  let attempts = 0;
  while (history.includes(recipe.signature) && attempts < 40) {
    recipe = createRecipe(settings, secureSeed());
    attempts += 1;
  }
  localStorage.setItem(HISTORY_KEY, JSON.stringify([recipe.signature, ...history.filter((value) => value !== recipe.signature)].slice(0, 1000)));
  return recipe;
}

export function getEntryById(id: string) {
  return WORD_BANK.find((entry) => entry.id === id);
}

export function getPuzzleEntry(recipe: MatchRecipe, index: number) {
  const puzzle = recipe.puzzles[index];
  return puzzle ? WORD_BANK.find((entry) => entry.id === puzzle.entryId) : undefined;
}
