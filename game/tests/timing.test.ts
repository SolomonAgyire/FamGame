import test from 'node:test';
import assert from 'node:assert/strict';
import { timerModeFor, secondsFor, TIMER_TABLE } from '../lib/timing';
import type { Level } from '../lib/types';

test('levels one to four have no timer', () => {
  for (const level of [1, 2, 3, 4] as Level[]) assert.equal(timerModeFor(level), 'none');
});

test('levels five and six show a timer that costs nothing', () => {
  assert.equal(timerModeFor(5), 'bonus');
  assert.equal(timerModeFor(6), 'bonus');
});

test('levels seven to nine enforce the timer', () => {
  for (const level of [7, 8, 9] as Level[]) assert.equal(timerModeFor(level), 'enforced');
});

test('a longer word always gets more time at the same level', () => {
  assert.ok(secondsFor(7, 11) > secondsFor(7, 5));
  assert.ok(secondsFor(9, 12) > secondsFor(9, 4));
});

test('a harder level always gets less time for the same word', () => {
  for (let level = 6; level <= 9; level += 1) {
    assert.ok(secondsFor(level as Level, 8) < secondsFor((level - 1) as Level, 8),
      `level ${level} should be tighter than level ${level - 1}`);
  }
});

test('the spec table is honoured at its named points', () => {
  assert.equal(secondsFor(5, 11), 45);  // Reaching Out, Deuteronomy
  assert.equal(secondsFor(9, 11), 23);  // Eternity, Deuteronomy
  assert.equal(secondsFor(5, 5), 27);
  assert.equal(secondsFor(9, 5), 13);
});

test('even the hardest short word gets a workable floor', () => {
  assert.ok(secondsFor(9, 2) >= 8, 'a two-letter word at Eternity still needs reading time');
});

test('every level has a table entry', () => {
  for (let level = 1; level <= 9; level += 1) {
    assert.ok(TIMER_TABLE[level as Level], `level ${level} has no timing entry`);
  }
});
