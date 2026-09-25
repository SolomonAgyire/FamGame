/** The Daily Word: one puzzle a day, the same one for everyone, derived
 * entirely from the date. There is no backend and no sync -- two players
 * comparing share cards are comparing the same word because the date
 * picked it, not because a server said so.
 *
 * The day comes from `dayKey` in `lib/progress.ts`, so the daily rolls at
 * 3am local exactly like the streak does. */

import { makeScramble, PLAYABLE_BANK, seededRandom } from '@/lib/game-engine';
import { dayKey } from '@/lib/progress';
import type { WordEntry } from '@/lib/types';

/** Daily #1. Day numbers count forward from here. */
export const DAILY_EPOCH = '2026-09-25';

const MS_PER_DAY = 86_400_000;
/** The golden ratio spreads a walk over a list about as evenly as anything
 * can, which is what keeps consecutive days from landing on neighbouring
 * words in a bank that is grouped by category and level. */
const GOLDEN = 0.618_033_988_75;

function keyToUtc(key: string): number {
  const [year, month, day] = key.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

function dayNumber(key: string): number {
  return Math.round((keyToUtc(key) - keyToUtc(DAILY_EPOCH)) / MS_PER_DAY);
}

/** A step size coprime to the pool, so repeatedly adding it visits every
 * word before revisiting any. A plain `n % size` over a sorted bank would
 * hand out ADAM, ADIN, AHAB on three consecutive days. */
function strideFor(size: number): number {
  let stride = Math.max(1, Math.floor(size * GOLDEN));
  while (stride > 1 && gcd(stride, size) !== 1) stride -= 1;
  return stride;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** A stable order the walk can rely on. The bank's own order is an
 * authoring convenience and may be re-sorted at any time; the daily must
 * not change underneath a player when it is. */
const ALL_WORDS = [...PLAYABLE_BANK].sort((a, b) => a.id.localeCompare(b.id));
const ETERNITY_WORDS = ALL_WORDS.filter((entry) => entry.level === 9);

/** Pick word `n` of an endless, non-repeating walk over `pool`. Each pass
 * through the pool starts at a fresh hashed offset, so the second cycle is
 * not simply the first one replayed. */
function pick(pool: WordEntry[], n: number, label: string): WordEntry {
  const size = pool.length;
  const cycle = Math.floor(n / size);
  const offset = Math.floor(seededRandom(`${label}:cycle:${cycle}`)() * size);
  const step = (((n % size) + size) % size) * strideFor(size);
  return pool[(step + offset) % size];
}

export type DailyPuzzle = { entryId: string; scramble: string; dayKey: string; number: number };

export function dailyPuzzleFor(date: Date): DailyPuzzle {
  const key = dayKey(date);
  const entry = pick(ALL_WORDS, dayNumber(key), 'wordin-daily');
  return {
    entryId: entry.id,
    scramble: makeScramble(entry.playable, seededRandom(`wordin-daily:${key}:${entry.id}`)),
    dayKey: key,
    number: dayNumber(key) + 1,
  };
}

/** The same idea restricted to Eternity, for players who want the hard one
 * whatever level they have reached. */
export function dailyEternityFor(date: Date): { entryId: string; scramble: string; dayKey: string } {
  const key = dayKey(date);
  const entry = pick(ETERNITY_WORDS, dayNumber(key), 'wordin-eternity');
  return {
    entryId: entry.id,
    scramble: makeScramble(entry.playable, seededRandom(`wordin-eternity:${key}:${entry.id}`)),
    dayKey: key,
  };
}
