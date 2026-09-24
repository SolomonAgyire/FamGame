/** Scoring lives here rather than in the component so it can be tested
 * without a DOM, and so solo, Time Attack and online rooms all award
 * points the same way. */

/** Index 0 is level 1 (Studying); index 8 is level 9 (Eternity). */
export const LEVEL_MULTIPLIERS = [1, 1.2, 1.4, 1.6, 1.9, 2.2, 2.5, 2.75, 3] as const;

const NO_HINT_BONUS = 2;
const HINT_COST = 1;
const MAX_SPEED_BONUS = 4;

export type ScoreInput = {
  letterCount: number;
  /** 1..9 */
  level: number;
  /** Correct answers in a row immediately before this one. */
  combo: number;
  hintsUsed: number;
  secondsLeft?: number;
  secondsTotal?: number;
};

/** A two-letter word is worth 4, a twelve-letter word 14. Length is the
 * honest proxy for how hard a scramble is to read. */
export function basePoints(letterCount: number): number {
  return 2 + letterCount;
}

export function scoreSolve(input: ScoreInput): number {
  const multiplier = LEVEL_MULTIPLIERS[Math.min(Math.max(input.level, 1), 9) - 1];
  let points = basePoints(input.letterCount) * multiplier;
  if (input.hintsUsed === 0) points += NO_HINT_BONUS;
  if (input.combo >= 3) points *= 2;
  points -= input.hintsUsed * HINT_COST;
  if (input.secondsTotal && input.secondsTotal > 0 && typeof input.secondsLeft === 'number') {
    const fraction = Math.max(0, Math.min(1, input.secondsLeft / input.secondsTotal));
    points += fraction * MAX_SPEED_BONUS;
  }
  return Math.max(1, Math.round(points));
}
