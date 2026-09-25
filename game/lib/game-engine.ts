import { WORD_BANK } from '@/data/word-bank';
import { LEVEL_NAMES } from '@/lib/types';
import type { Category, DifficultyBand, GameSettings, Level, MatchRecipe, PuzzleRecipe, WordEntry } from '@/lib/types';

const HISTORY_KEY = 'gatherword-match-history-v1';

/** Words cleared for play. Drafts stay out until a human has checked the
 * spelling and reference against the NWT. */
export const PLAYABLE_BANK = WORD_BANK.filter((entry) => entry.status === 'approved');

function hash32(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** A deterministic stream from a string seed. Exported so the Daily Word
 * can derive the same puzzle for everyone from the date alone. */
export function seededRandom(seed: string) {
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

/** Digits are kept so "1 Kings" and "2 Kings" stay distinguishable --
 * they scramble to identical letters otherwise. */
export function normalizeAnswer(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Every approved word at exactly one level. A match is a run at a level,
 * not a sweep of everything below it. */
export function wordsForLevel(level: Level, categories: Category[]) {
  return PLAYABLE_BANK.filter((entry) => entry.level === level && entry.categories.some((category) => categories.includes(category)));
}

export function eligibleWords(settings: GameSettings) {
  return wordsForLevel(settings.maxBand, settings.categories);
}

const CATEGORY_LABELS: Record<Category, string> = {
  book: 'Bible Books', person: 'People', place: 'Places', tribe: 'Tribes', nation: 'Nations',
};

/** Why this combination cannot start a match, or null when it can. Since a
 * match draws from exactly one level, a category set can run out: there is
 * no approved Bible book at Eternity, for instance. An empty pool used to
 * produce a match with no puzzles and a blank screen, so every entry point
 * asks here first. */
export function unplayableReason(settings: GameSettings): string | null {
  if (settings.categories.length === 0) return 'Choose at least one word set.';
  if (eligibleWords(settings).length > 0) return null;
  const sets = settings.categories.map((category) => CATEGORY_LABELS[category]).join(' + ');
  return `No words yet for ${sets} at ${LEVEL_NAMES[settings.maxBand - 1]}. Pick another level, or add a word set.`;
}

/** The next level above `band` that actually has words, or null when the
 * chosen categories run out. Time Attack steps up through the levels and
 * must not step into an empty one. */
export function nextPlayableLevelAbove(band: Level, categories: Category[]): Level | null {
  for (let level = band + 1; level <= 9; level += 1) {
    if (wordsForLevel(level as Level, categories).length > 0) return level as Level;
  }
  return null;
}

/** The level a run should actually start at: `from` if it has words, else
 * the nearest level above it, else the nearest below. Null only when the
 * categories have no approved words at any level at all. */
export function playableLevelFrom(from: Level, categories: Category[]): Level | null {
  if (wordsForLevel(from, categories).length > 0) return from;
  const above = nextPlayableLevelAbove(from, categories);
  if (above) return above;
  for (let level = from - 1; level >= 1; level -= 1) {
    if (wordsForLevel(level as Level, categories).length > 0) return level as Level;
  }
  return null;
}

export type MatchStep = { index: number; finished: boolean; record: boolean };

/** One step of a match's puzzle flow. `finished` is passed in rather than
 * read from a closure because the auto-advance timer fires a callback
 * captured before the match ended -- reading a stale `finished` there is
 * what let the last puzzle record the same match twice. `record` is true
 * exactly once per match. */
export function advanceMatch(state: { index: number; total: number; finished: boolean }): MatchStep {
  if (state.finished) return { index: state.index, finished: true, record: false };
  if (state.index >= state.total - 1) return { index: state.index, finished: true, record: true };
  return { index: state.index + 1, finished: false, record: false };
}

/** A shuffled, freshly-scrambled queue of every word at one band, for a
 * level that should never repeat a word within a run. */
export function buildLevelQueue(band: DifficultyBand, categories: Category[]): PuzzleRecipe[] {
  const random = seededRandom(secureSeed());
  const words = shuffle(wordsForLevel(band, categories), random);
  return words.map((entry) => ({ entryId: entry.id, scramble: makeScramble(entry.playable, random) }));
}

/** A shuffle of the answer that is never the answer itself. Single-letter
 * and all-same-letter words are handed back unchanged because no
 * arrangement of them could differ. */
export function makeScramble(answer: string, random: () => number) {
  if (new Set(answer).size < 2) return answer;
  let scrambled = answer;
  for (let attempt = 0; attempt < 12 && scrambled === answer; attempt += 1) {
    scrambled = shuffle(answer.split(''), random).join('');
  }
  return scrambled === answer ? `${answer.slice(1)}${answer[0]}` : scrambled;
}

export function createRecipe(settings: GameSettings, seed: string): MatchRecipe {
  const random = seededRandom(seed);
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

/** Both sides of the history round-trip are guarded. Reaching
 * `globalThis.localStorage` can itself throw (older Safari private mode,
 * an embedded frame with storage access blocked), and `setItem` throws on
 * a full quota. Not repeating a recent match is a nicety; creating one
 * must never fail, so a blocked store just means no history. */
function readHistory(): string[] {
  try {
    const raw = (globalThis as { localStorage?: Storage }).localStorage?.getItem(HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed as string[] : [];
  } catch {
    return [];
  }
}

function writeHistory(signatures: string[]): void {
  try {
    (globalThis as { localStorage?: Storage }).localStorage?.setItem(HISTORY_KEY, JSON.stringify(signatures));
  } catch {
    /* blocked or full -- the match is already made, so there is nothing to recover */
  }
}

export function createFreshRecipe(settings: GameSettings) {
  const history = readHistory();
  let recipe = createRecipe(settings, secureSeed());
  let attempts = 0;
  while (history.includes(recipe.signature) && attempts < 40) {
    recipe = createRecipe(settings, secureSeed());
    attempts += 1;
  }
  writeHistory([recipe.signature, ...history.filter((value) => value !== recipe.signature)].slice(0, 1000));
  return recipe;
}

export function getEntryById(id: string) {
  return WORD_BANK.find((entry) => entry.id === id);
}

export function getPuzzleEntry(recipe: MatchRecipe, index: number) {
  const puzzle = recipe.puzzles[index];
  return puzzle ? WORD_BANK.find((entry) => entry.id === puzzle.entryId) : undefined;
}
