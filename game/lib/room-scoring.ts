/** How an online room pays out a puzzle once more than one person can
 * solve it. `room-service.ts` still computes the base award with
 * `scoreSolve` from `lib/scoring.ts` -- word length, level, hints, all
 * unchanged. This module only decides how that base is shared across
 * finishers, and how long the puzzle stays open for more of them to land. */

/** How long a puzzle stays open for solves to keep counting once the first
 * correct answer lands. Generous enough for a 30-player room's slower
 * typists to still get credit, short enough that a round does not stall. */
export const SOLVE_WINDOW_MS = 12000;

/** First place always takes the full base award. Each place after that
 * decays by the same curve regardless of how many people are in the room --
 * a 3-player room and a 30-player room pay the same shape, just with more
 * people able to reach the tail of it. Halves by roughly the fifth place
 * and floors at 1: solving it correctly is always worth something. */
export function awardForFinishOrder(base: number, position: number, total: number): number {
  void total;
  const decay = Math.pow(0.5, (Math.max(1, position) - 1) / 4);
  return Math.max(1, Math.round(base * decay));
}

/** Whether a solve at `now` still lands inside the scoring window that
 * opened at `firstSolveAt`. Nobody has solved yet when `firstSolveAt` is
 * null, so the puzzle is open by definition. */
export function isWindowOpen(firstSolveAt: number | null, now: number): boolean {
  if (firstSolveAt === null) return true;
  return now - firstSolveAt <= SOLVE_WINDOW_MS;
}
