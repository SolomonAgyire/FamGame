import type { Level } from '@/lib/types';

/** seconds = ceil(base + perLetter x letters). A flat per-level timer is what
 * made an eleven-letter word at the top level unplayable; time has to track
 * how much there is to read. Levels 1-4 are untimed and carry an entry only
 * so the table is total. */
export const TIMER_TABLE: Record<Level, { base: number; perLetter: number }> = {
  1: { base: 0, perLetter: 0 },
  2: { base: 0, perLetter: 0 },
  3: { base: 0, perLetter: 0 },
  4: { base: 0, perLetter: 0 },
  5: { base: 12, perLetter: 3.0 },
  6: { base: 10, perLetter: 2.6 },
  7: { base: 8, perLetter: 2.2 },
  8: { base: 6, perLetter: 1.9 },
  9: { base: 5, perLetter: 1.6 },
};

/** Even a two-character answer needs long enough to read the board, find
 * the tiles and tap them. Below this the clock is measuring reflexes
 * rather than recall. */
const FLOOR_SECONDS = 8;

export type TimerMode = 'none' | 'bonus' | 'enforced';

/** The timer arrives as a reward before it becomes a threat: at Reaching Out
 * and Maturity, running out costs nothing and beating it pays a bonus. */
export function timerModeFor(level: Level): TimerMode {
  if (level <= 4) return 'none';
  if (level <= 6) return 'bonus';
  return 'enforced';
}

/** 0 means "no clock at all" -- callers treat it as the absence of a timer
 * rather than as no time left. */
export function secondsFor(level: Level, letterCount: number): number {
  const row = TIMER_TABLE[level];
  if (row.base === 0 && row.perLetter === 0) return 0;
  return Math.max(FLOOR_SECONDS, Math.ceil(row.base + row.perLetter * letterCount));
}
