/** Shared post-match star formula. Every mode translates its own result
 * shape into {correct, wrong} before calling this, so a "3-star clear"
 * means the same thing everywhere instead of five different tiers. */
export type MatchStarsInput = { correct: number; wrong: number };

export function matchStars({ correct, wrong }: MatchStarsInput): number {
  if (correct === 0) return 0;
  if (wrong === 0) return 3;
  if (correct / (correct + wrong) >= 0.7) return 2;
  return 1;
}

const COINS_PER_STAR = 10;
const COINS_PER_WORD = 2;

/** Coins earned for one completed match: a flat rate per word solved,
 * plus a bonus scaled to how well it went. */
export function coinsForMatch(stars: number, wordsSolved: number): number {
  return stars * COINS_PER_STAR + wordsSolved * COINS_PER_WORD;
}
