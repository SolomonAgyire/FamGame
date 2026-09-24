import test from 'node:test';
import assert from 'node:assert/strict';
import { basePoints, scoreSolve, LEVEL_MULTIPLIERS } from '../lib/scoring';

test('base points scale with word length', () => {
  assert.equal(basePoints(2), 4);   // "Ai"
  assert.equal(basePoints(5), 7);   // "David"
  assert.equal(basePoints(12), 14); // "Ecclesiastes"
});

test('there is one multiplier per level, rising from 1 to 3', () => {
  assert.equal(LEVEL_MULTIPLIERS.length, 9);
  assert.equal(LEVEL_MULTIPLIERS[0], 1);
  assert.equal(LEVEL_MULTIPLIERS[8], 3);
  for (let i = 1; i < LEVEL_MULTIPLIERS.length; i += 1) {
    assert.ok(LEVEL_MULTIPLIERS[i] >= LEVEL_MULTIPLIERS[i - 1], `level ${i + 1} must not pay less than level ${i}`);
  }
});

test('a harder level pays more for the same word', () => {
  const easy = scoreSolve({ letterCount: 7, level: 1, combo: 0, hintsUsed: 0 });
  const hard = scoreSolve({ letterCount: 7, level: 9, combo: 0, hintsUsed: 0 });
  assert.ok(hard > easy * 2, `expected level 9 to pay far more than level 1, got ${easy} vs ${hard}`);
});

test('a combo of three or more doubles the award', () => {
  const plain = scoreSolve({ letterCount: 6, level: 1, combo: 0, hintsUsed: 0 });
  const combo = scoreSolve({ letterCount: 6, level: 1, combo: 3, hintsUsed: 0 });
  assert.equal(combo, plain * 2);
});

test('each hint costs a point and a clean solve earns a bonus', () => {
  const clean = scoreSolve({ letterCount: 6, level: 1, combo: 0, hintsUsed: 0 });
  const hinted = scoreSolve({ letterCount: 6, level: 1, combo: 0, hintsUsed: 2 });
  assert.equal(clean - hinted, 4); // +2 no-hint bonus lost, plus 2 points of hint cost
});

test('an award is never below one point however many hints were taken', () => {
  assert.ok(scoreSolve({ letterCount: 2, level: 1, combo: 0, hintsUsed: 3 }) >= 1);
});

test('solving with time to spare pays a speed bonus', () => {
  const slow = scoreSolve({ letterCount: 6, level: 7, combo: 0, hintsUsed: 0, secondsLeft: 0, secondsTotal: 20 });
  const fast = scoreSolve({ letterCount: 6, level: 7, combo: 0, hintsUsed: 0, secondsLeft: 20, secondsTotal: 20 });
  assert.ok(fast > slow);
});
