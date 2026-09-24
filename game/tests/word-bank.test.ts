import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVEL_NAMES } from '../lib/types';
import { normalizeAnswer } from '../lib/game-engine';

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
