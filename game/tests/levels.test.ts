import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyProgress } from '../lib/progress';
import { isLevelCleared, highestUnlocked, isUnlocked, levelStatus, WORDS_TO_CLEAR } from '../lib/levels';
import type { Level } from '../lib/types';
import { createRecipe, wordsForLevel, getPuzzleEntry } from '../lib/game-engine';

function withLevel(level: Level, solvedCount: number, correct: number, attempts: number) {
  const record = emptyProgress();
  record.levelProgress[String(level)] = {
    solvedIds: Array.from({ length: solvedCount }, (_, i) => `word.${level}.${i}`),
    correct, attempts, cleared: false,
  };
  return record;
}

test('a fresh player has only level 1 unlocked', () => {
  const record = emptyProgress();
  assert.equal(highestUnlocked(record), 1);
  assert.equal(isUnlocked(record, 1), true);
  assert.equal(isUnlocked(record, 2), false);
  assert.equal(isUnlocked(record, 9), false);
});

test('a level is cleared at twenty distinct words with at least seventy percent accuracy', () => {
  assert.equal(isLevelCleared(withLevel(1, WORDS_TO_CLEAR, 20, 25), 1), true);   // 80%
  assert.equal(isLevelCleared(withLevel(1, WORDS_TO_CLEAR, 20, 40), 1), false);  // 50%
  assert.equal(isLevelCleared(withLevel(1, WORDS_TO_CLEAR - 1, 19, 20), 1), false);
});

test('clearing a level unlocks exactly the next one', () => {
  const record = withLevel(1, WORDS_TO_CLEAR, 20, 22);
  assert.equal(highestUnlocked(record), 2);
  assert.equal(isUnlocked(record, 2), true);
  assert.equal(isUnlocked(record, 3), false);
});

test('unlocks do not skip — clearing level 5 without clearing 2 does not open 6', () => {
  const record = withLevel(5, WORDS_TO_CLEAR, 20, 22);
  assert.equal(highestUnlocked(record), 1, 'level 1 was never cleared, so nothing beyond it opens');
});

test('unlocking stops at level 9', () => {
  const record = emptyProgress();
  for (let level = 1; level <= 9; level += 1) {
    record.levelProgress[String(level)] = {
      solvedIds: Array.from({ length: WORDS_TO_CLEAR }, (_, i) => `w${level}-${i}`),
      correct: 20, attempts: 20, cleared: true,
    };
  }
  assert.equal(highestUnlocked(record), 9);
  assert.equal(isUnlocked(record, 9), true);
});

test('level status reports progress toward the clear condition', () => {
  const status = levelStatus(withLevel(1, 8, 8, 10), 1);
  assert.equal(status.name, 'Studying');
  assert.equal(status.unlocked, true);
  assert.equal(status.cleared, false);
  assert.equal(status.solved, 8);
  assert.equal(status.needed, WORDS_TO_CLEAR);
  assert.equal(status.accuracy, 0.8);
});

test('a level never played reports zero progress without throwing', () => {
  const status = levelStatus(emptyProgress(), 7);
  assert.equal(status.solved, 0);
  assert.equal(status.accuracy, 0);
  assert.equal(status.unlocked, false);
  assert.equal(status.name, 'Strong Faith');
});

test('a match draws only from the chosen level', () => {
  const recipe = createRecipe({ categories: ['book', 'person', 'place'], maxBand: 1, length: 8 }, 'level-seed');
  for (let i = 0; i < recipe.puzzles.length; i += 1) {
    const entry = getPuzzleEntry(recipe, i);
    assert.ok(entry);
    assert.equal(entry.level, 1, `${entry.display} is level ${entry.level}, not the requested level 1`);
  }
});

test('words for a level are all at that level and all approved', () => {
  const words = wordsForLevel(2, ['book', 'person', 'place']);
  assert.ok(words.length > 0);
  for (const word of words) {
    assert.equal(word.level, 2);
    assert.equal(word.status, 'approved');
  }
});
