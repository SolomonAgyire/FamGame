import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyProgress } from '../lib/progress';
import { isLevelCleared, highestUnlocked, isUnlocked, levelStatus, WORDS_TO_CLEAR, runLengthFor, clearTargetFor, RUN_LENGTHS, CLEAR_TARGETS, starsForLevel, totalStars, ALL_LEVELS } from '../lib/levels';
import type { Level } from '../lib/types';
import { createRecipe, wordsForLevel, getPuzzleEntry, PLAYABLE_BANK } from '../lib/game-engine';

function withLevel(level: Level, solvedCount: number, correct: number, attempts: number) {
  const record = emptyProgress();
  record.levelProgress[String(level)] = {
    solvedIds: Array.from({ length: solvedCount }, (_, i) => `word.${level}.${i}`),
    correct, attempts,
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
    const target = clearTargetFor(level as Level);
    record.levelProgress[String(level)] = {
      solvedIds: Array.from({ length: target }, (_, i) => `w${level}-${i}`),
      correct: target, attempts: target,
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

test('a run gets longer as the journey climbs', () => {
  assert.equal(runLengthFor(1), 10);
  assert.equal(runLengthFor(9), 25);
  for (let level = 2; level <= 9; level += 1) {
    assert.ok(runLengthFor(level as Level) >= runLengthFor((level - 1) as Level),
      `level ${level} runs shorter than level ${level - 1}`);
  }
});

test('clearing a level takes more as the journey climbs', () => {
  assert.equal(clearTargetFor(1), 30);
  assert.ok(clearTargetFor(9) > clearTargetFor(1) * 2);
  for (let level = 2; level <= 9; level += 1) {
    assert.ok(clearTargetFor(level as Level) >= clearTargetFor((level - 1) as Level));
  }
});

test('higher levels take at least as many runs to clear, never fewer', () => {
  let previous = 0;
  for (let level = 1; level <= 9; level += 1) {
    const runs = Math.ceil(clearTargetFor(level as Level) / runLengthFor(level as Level));
    assert.ok(runs >= previous, `level ${level} clears in ${runs} runs, fewer than level ${level - 1}`);
    previous = runs;
  }
});

test('every level has enough approved words to meet its own clear target', () => {
  for (let level = 1; level <= 9; level += 1) {
    const pool = PLAYABLE_BANK.filter((entry) => entry.level === level).length;
    assert.ok(pool >= clearTargetFor(level as Level),
      `level ${level} needs ${clearTargetFor(level as Level)} distinct words but has ${pool}`);
  }
});

test('a run never asks for more words than the level holds', () => {
  for (let level = 1; level <= 9; level += 1) {
    const pool = PLAYABLE_BANK.filter((entry) => entry.level === level).length;
    assert.ok(pool >= runLengthFor(level as Level));
  }
});

test('RUN_LENGTHS and CLEAR_TARGETS cover all nine levels', () => {
  for (let level = 1; level <= 9; level += 1) {
    assert.ok(RUN_LENGTHS[level as Level] > 0);
    assert.ok(CLEAR_TARGETS[level as Level] > 0);
  }
});

test('a level already cleared under the flat twenty-word rule is grandfathered', () => {
  // Level 9's target rose from 20 to 60. A player who cleared it back when
  // twenty was enough must not read as uncleared today just because the
  // target moved -- their progress at the time is what earned it.
  const record = withLevel(9, 20, 20, 22);
  assert.equal(isLevelCleared(record, 9), false, 'twenty no longer clears level 9 on its own merits');
  record.legacyClears['9'] = true;
  assert.equal(isLevelCleared(record, 9), true, 'a grandfathered level stays cleared regardless of the new target');
});

test('a level with no progress rates zero stars', () => {
  assert.equal(starsForLevel(emptyProgress(), 3), 0);
});

test('stars rise toward three as a level nears its clear target, but never reach three before clearing', () => {
  const halfway = withLevel(1, 10, 10, 10); // 10 of 30 needed, all correct
  assert.equal(starsForLevel(halfway, 1), 1);
  const almost = withLevel(1, 25, 25, 25); // 25 of 30
  assert.equal(starsForLevel(almost, 1), 2);
});

test('a cleared level always rates three stars', () => {
  const cleared = withLevel(1, WORDS_TO_CLEAR, 20, 22);
  assert.equal(starsForLevel(cleared, 1), 3);
});

test('total stars sums every level\'s own rating', () => {
  const record = withLevel(1, WORDS_TO_CLEAR, 20, 22); // cleared: 3 stars
  record.levelProgress['2'] = { solvedIds: Array.from({ length: 12 }, (_, i) => `w${i}`), correct: 12, attempts: 12 };
  assert.equal(totalStars(record), 3 + starsForLevel(record, 2));
});

test('ALL_LEVELS lists exactly the nine levels in order', () => {
  assert.deepEqual(ALL_LEVELS, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
});
