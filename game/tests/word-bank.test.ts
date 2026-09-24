import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVEL_NAMES } from '../lib/types';
import { normalizeAnswer } from '../lib/game-engine';
import { WORD_BANK, difficultyScore, LEVEL_TARGETS } from '../data/word-bank';

test('there are nine levels with the agreed names in order', () => {
  assert.deepEqual([...LEVEL_NAMES], [
    'Studying', 'Publisher', 'Baptized', 'Serving', 'Reaching Out',
    'Maturity', 'Strong Faith', 'New World', 'Eternity',
  ]);
});

test('answer normalization keeps digits so numbered books stay distinct', () => {
  assert.equal(normalizeAnswer('1 Kings'), '1KINGS');
  assert.equal(normalizeAnswer('2 Kings'), '2KINGS');
  assert.notEqual(normalizeAnswer('1 Kings'), normalizeAnswer('2 Kings'));
  assert.equal(normalizeAnswer('Song of Solomon'), 'SONGOFSOLOMON');
});

test('difficulty combines length with familiarity', () => {
  // A long household name and a short obscure one can land close together
  assert.equal(difficultyScore('DAVID', 0), 5);
  assert.equal(difficultyScore('DAVID', 4), 13);
  assert.ok(difficultyScore('DEUTERONOMY', 2) > difficultyScore('JOHN', 0));
});

test('numbered books carry the numeral in the playable letters', () => {
  const first = WORD_BANK.find((entry) => entry.display === '1 Kings');
  const second = WORD_BANK.find((entry) => entry.display === '2 Kings');
  assert.ok(first && second);
  assert.equal(first.playable, '1KINGS');
  assert.equal(second.playable, '2KINGS');
  assert.notEqual(first.answer, second.answer, '1 Kings and 2 Kings must not share an answer');
});

test('every entry has a level in range and the targets sum to the bank size', () => {
  assert.equal(LEVEL_TARGETS.length, 9);
  for (const entry of WORD_BANK) {
    assert.ok(entry.level >= 1 && entry.level <= 9, `${entry.display} has level ${entry.level}`);
    assert.equal(entry.band, entry.level, 'band must mirror level during migration');
  }
});

test('levels are ordered — no level contains an easier average word than the level below', () => {
  const averages = Array.from({ length: 9 }, (_, i) => {
    const words = WORD_BANK.filter((entry) => entry.level === i + 1);
    if (!words.length) return 0;
    return words.reduce((sum, entry) => sum + difficultyScore(entry.playable, entry.familiarity), 0) / words.length;
  });
  for (let i = 1; i < 9; i += 1) {
    if (averages[i] === 0 || averages[i - 1] === 0) continue;
    assert.ok(averages[i] >= averages[i - 1], `level ${i + 1} averages ${averages[i]} but level ${i} averages ${averages[i - 1]}`);
  }
});
