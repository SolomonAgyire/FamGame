import test from 'node:test';
import assert from 'node:assert/strict';
import { matchStars, coinsForMatch } from '../lib/economy';

test('no correct answers earns zero stars', () => {
  assert.equal(matchStars({ correct: 0, wrong: 5 }), 0);
  assert.equal(matchStars({ correct: 0, wrong: 0 }), 0);
});

test('a flawless run earns three stars regardless of size', () => {
  assert.equal(matchStars({ correct: 1, wrong: 0 }), 3);
  assert.equal(matchStars({ correct: 20, wrong: 0 }), 3);
});

test('seventy percent accuracy or better, with at least one miss, earns two stars', () => {
  assert.equal(matchStars({ correct: 7, wrong: 3 }), 2);
  assert.equal(matchStars({ correct: 14, wrong: 6 }), 2);
});

test('below seventy percent accuracy earns one star, never zero, while something was solved', () => {
  assert.equal(matchStars({ correct: 1, wrong: 3 }), 1);
  assert.equal(matchStars({ correct: 5, wrong: 20 }), 1);
});

test('coins scale with both the star tier and the words solved', () => {
  assert.equal(coinsForMatch(3, 10), 3 * 10 + 10 * 2);
  assert.equal(coinsForMatch(0, 0), 0);
  assert.equal(coinsForMatch(1, 1), 1 * 10 + 1 * 2);
});
