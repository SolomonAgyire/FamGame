import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyPuzzleFor, dailyEternityFor } from '../lib/daily';
import { PLAYABLE_BANK } from '../lib/game-engine';

const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12);

test('the same date always yields the same puzzle', () => {
  const a = dailyPuzzleFor(at(2026, 10, 1));
  const b = dailyPuzzleFor(at(2026, 10, 1));
  assert.deepEqual(a, b);
});

test('different dates yield different puzzles', () => {
  const a = dailyPuzzleFor(at(2026, 10, 1));
  const b = dailyPuzzleFor(at(2026, 10, 2));
  assert.notEqual(a.entryId, b.entryId);
});

test('the daily puzzle is always a real approved word and never pre-solved', () => {
  for (let d = 1; d <= 60; d += 1) {
    const daily = dailyPuzzleFor(at(2026, 10, d));
    const entry = PLAYABLE_BANK.find((e) => e.id === daily.entryId);
    assert.ok(entry, `day ${d} picked an unknown entry`);
    if (new Set(entry.playable).size > 1) {
      assert.notEqual(daily.scramble, entry.playable, `day ${d} handed out a solved scramble`);
    }
  }
});

test('the puzzle number increments by one per day', () => {
  const a = dailyPuzzleFor(at(2026, 10, 1));
  const b = dailyPuzzleFor(at(2026, 10, 2));
  assert.equal(b.number, a.number + 1);
});

test('the daily Eternity word is always from level 9', () => {
  for (let d = 1; d <= 30; d += 1) {
    const daily = dailyEternityFor(at(2026, 11, d));
    const entry = PLAYABLE_BANK.find((e) => e.id === daily.entryId);
    assert.ok(entry);
    assert.equal(entry.level, 9, 'the daily hard word must come from Eternity');
  }
});

test('a daily run does not repeat a word within a fortnight', () => {
  const ids = Array.from({ length: 14 }, (_, i) => dailyPuzzleFor(at(2026, 10, i + 1)).entryId);
  assert.equal(new Set(ids).size, 14);
});
