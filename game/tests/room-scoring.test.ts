import test from 'node:test';
import assert from 'node:assert/strict';
import { awardForFinishOrder, isWindowOpen, SOLVE_WINDOW_MS } from '../lib/room-scoring';

test('first place takes the full award', () => {
  assert.equal(awardForFinishOrder(20, 1, 10), 20);
});

test('later finishers earn less but never nothing', () => {
  const first = awardForFinishOrder(20, 1, 10);
  const fifth = awardForFinishOrder(20, 5, 10);
  const last = awardForFinishOrder(20, 10, 10);
  assert.ok(first > fifth && fifth > last);
  assert.ok(last >= 1, 'solving it correctly is always worth something');
});

test('the curve is the same shape whatever the room size', () => {
  assert.equal(awardForFinishOrder(20, 1, 2), awardForFinishOrder(20, 1, 30));
});

test('a solo solver in a big room still gets full marks', () => {
  assert.equal(awardForFinishOrder(15, 1, 30), 15);
});

test('the window opens on the first solve and closes after twelve seconds', () => {
  assert.equal(isWindowOpen(null, 1000), true, 'nobody has solved yet, the puzzle is open');
  assert.equal(isWindowOpen(1000, 1000 + SOLVE_WINDOW_MS - 1), true);
  assert.equal(isWindowOpen(1000, 1000 + SOLVE_WINDOW_MS + 1), false);
});
