import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShareText } from '../lib/share';

test('a solved result names the puzzle number and the streak', () => {
  const text = buildShareText({ number: 142, solved: true, guesses: 1, hintsUsed: 0, streak: 6 });
  assert.match(text, /WordIn #142/);
  assert.match(text, /6/);
  assert.ok(text.includes('🟩'));
});

test('hints show as yellow and misses as grey', () => {
  const text = buildShareText({ number: 5, solved: true, guesses: 2, hintsUsed: 1, streak: 1 });
  assert.ok(text.includes('🟨'), 'a hint should show');
  assert.ok(text.includes('⬜'), 'a wrong guess should show');
});

test('a failed result is marked and never claims a solve', () => {
  const text = buildShareText({ number: 9, solved: false, guesses: 3, hintsUsed: 2, streak: 0 });
  assert.match(text, /X/);
  assert.ok(!text.includes('🟩'));
});

test('the share text never leaks the answer', () => {
  const text = buildShareText({ number: 1, solved: true, guesses: 1, hintsUsed: 0, streak: 1, level: 'Eternity' });
  assert.ok(!/[A-Z]{3,}/.test(text.replace(/WORDIN/gi, '')), 'no long uppercase run that could be a word');
});
