import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyProgress, dayKey } from '../lib/progress';
import { applyPlay, streakState, weekStrip, MAX_FREEZES, MILESTONES } from '../lib/streak';

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h);

test('first play starts a streak of one', () => {
  const out = applyPlay(emptyProgress(), at(2026, 9, 1));
  assert.equal(out.record.streak.current, 1);
  assert.equal(out.record.streak.best, 1);
  assert.equal(out.extended, true);
});

test('playing again the same day does not extend the streak', () => {
  const r = applyPlay(emptyProgress(), at(2026, 9, 1)).record;
  const second = applyPlay(r, at(2026, 9, 1, 20));
  assert.equal(second.record.streak.current, 1);
  assert.equal(second.extended, false);
});

test('consecutive days extend the streak and track a best', () => {
  let r = emptyProgress();
  for (let d = 1; d <= 4; d += 1) r = applyPlay(r, at(2026, 9, d)).record;
  assert.equal(r.streak.current, 4);
  assert.equal(r.streak.best, 4);
});

test('a freeze is earned every five days and caps at two', () => {
  let r = emptyProgress();
  for (let d = 1; d <= 5; d += 1) r = applyPlay(r, at(2026, 9, d)).record;
  assert.equal(r.streak.freezes, 1);
  for (let d = 6; d <= 20; d += 1) r = applyPlay(r, at(2026, 9, d)).record;
  assert.equal(r.streak.freezes, MAX_FREEZES);
});

test('missing one day spends a freeze and keeps the streak', () => {
  let r = emptyProgress();
  for (let d = 1; d <= 5; d += 1) r = applyPlay(r, at(2026, 9, d)).record;
  assert.equal(r.streak.freezes, 1);
  const out = applyPlay(r, at(2026, 9, 7)); // skipped the 6th
  assert.equal(out.frozeADay, true);
  assert.equal(out.record.streak.current, 6, 'the streak survives and counts today');
  assert.equal(out.record.streak.freezes, 0);
});

test('missing a day with no freeze breaks the streak back to one', () => {
  const r = applyPlay(emptyProgress(), at(2026, 9, 1)).record;
  const out = applyPlay(r, at(2026, 9, 3));
  assert.equal(out.brokeStreak, true);
  assert.equal(out.record.streak.current, 1);
  assert.equal(out.record.streak.best, 1, 'the best is remembered');
});

test('a milestone fires exactly once at each threshold', () => {
  let r = emptyProgress();
  const hits: number[] = [];
  for (let d = 1; d <= 8; d += 1) {
    const out = applyPlay(r, at(2026, 9, d));
    r = out.record;
    if (out.milestone) hits.push(out.milestone);
  }
  assert.deepEqual(hits, [3, 7]);
  assert.ok(MILESTONES.includes(3));
});

test('a milestone also grants a freeze', () => {
  let r = emptyProgress();
  for (let d = 1; d <= 3; d += 1) r = applyPlay(r, at(2026, 9, d)).record;
  assert.ok(r.streak.freezes >= 1, 'hitting day 3 should hand out a freeze');
});

test('streak state reports whether today is already played and how many days were missed', () => {
  const r = applyPlay(emptyProgress(), at(2026, 9, 1)).record;
  assert.equal(streakState(r, at(2026, 9, 1, 18)).playedToday, true);
  const later = streakState(r, at(2026, 9, 3));
  assert.equal(later.playedToday, false);
  assert.equal(later.daysMissed, 1);
  assert.equal(later.repairable, true, 'within the two-day window');
  assert.equal(streakState(r, at(2026, 9, 10)).repairable, false);
});

test('the week strip is seven days oldest first and marks the days played', () => {
  let r = emptyProgress();
  r = applyPlay(r, at(2026, 9, 10)).record;
  r = applyPlay(r, at(2026, 9, 12)).record;
  const strip = weekStrip(r, at(2026, 9, 12));
  assert.equal(strip.length, 7);
  assert.equal(strip[6].day, dayKey(at(2026, 9, 12)));
  assert.equal(strip[6].played, true);
  assert.equal(strip[4].played, true);  // the 10th
  assert.equal(strip[5].played, false); // the 11th
});
