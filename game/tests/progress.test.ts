import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyProgress, dayKey, loadProgress, saveProgress, PROGRESS_KEY } from '../lib/progress';

test('an empty progress record starts at zero with level 1 unlocked', () => {
  const record = emptyProgress();
  assert.equal(record.version, 1);
  assert.equal(record.lifetimePoints, 0);
  assert.equal(record.totalSolved, 0);
  assert.equal(record.totalWrong, 0);
  assert.equal(record.unlockedLevel, 1);
  assert.deepEqual(record.bestByMode, {});
  assert.deepEqual(record.solveCounts, {});
  assert.deepEqual(record.levelProgress, {});
});

test('the day key rolls over at 3am local, not midnight', () => {
  // 2am on the 5th still belongs to the 4th
  assert.equal(dayKey(new Date(2026, 8, 5, 2, 30)), '2026-09-04');
  // 3am on the 5th starts the 5th
  assert.equal(dayKey(new Date(2026, 8, 5, 3, 0)), '2026-09-05');
  assert.equal(dayKey(new Date(2026, 8, 5, 23, 59)), '2026-09-05');
});

test('load returns an empty record when storage is unavailable and never throws', () => {
  // no globalThis.localStorage in the node test environment
  const record = loadProgress();
  assert.equal(record.lifetimePoints, 0);
  assert.doesNotThrow(() => saveProgress(record));
});

test('load round-trips a saved record through a stub storage', () => {
  const store = new Map<string, string>();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
  };
  const record = emptyProgress();
  record.lifetimePoints = 420;
  record.solveCounts['book.john'] = 3;
  saveProgress(record);
  assert.ok(store.get(PROGRESS_KEY));
  assert.equal(loadProgress().lifetimePoints, 420);
  assert.equal(loadProgress().solveCounts['book.john'], 3);
  delete (globalThis as Record<string, unknown>).localStorage;
});

test('a record from an unknown future version is discarded rather than trusted', () => {
  const store = new Map<string, string>([[PROGRESS_KEY, JSON.stringify({ version: 99, lifetimePoints: 5 })]]);
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
  };
  assert.equal(loadProgress().lifetimePoints, 0);
  delete (globalThis as Record<string, unknown>).localStorage;
});

import { recordMatch, masteredCount, MASTERY_THRESHOLD } from '../lib/progress';

test('recording a match accumulates lifetime totals', () => {
  let record = emptyProgress();
  record = recordMatch(record, { mode: 'solo', level: 1, points: 40, solvedIds: ['book.john', 'book.ruth'], wrong: 1 }).record;
  record = recordMatch(record, { mode: 'solo', level: 1, points: 35, solvedIds: ['book.acts'], wrong: 0 }).record;
  assert.equal(record.lifetimePoints, 75);
  assert.equal(record.totalSolved, 3);
  assert.equal(record.totalWrong, 1);
});

test('a personal best is reported the first time and beaten scores are tracked per mode and level', () => {
  let record = emptyProgress();
  const first = recordMatch(record, { mode: 'solo', level: 2, points: 50, solvedIds: ['book.john'], wrong: 0 });
  assert.equal(first.isBest, true);
  assert.equal(first.previousBest, 0);
  const worse = recordMatch(first.record, { mode: 'solo', level: 2, points: 30, solvedIds: ['book.ruth'], wrong: 0 });
  assert.equal(worse.isBest, false);
  assert.equal(worse.previousBest, 50);
  assert.equal(worse.record.bestByMode['solo:2'], 50);
  const better = recordMatch(worse.record, { mode: 'solo', level: 2, points: 80, solvedIds: ['book.acts'], wrong: 0 });
  assert.equal(better.isBest, true);
  assert.equal(better.record.bestByMode['solo:2'], 80);
});

test('bests are kept separately per level', () => {
  let record = emptyProgress();
  record = recordMatch(record, { mode: 'solo', level: 1, points: 90, solvedIds: ['book.john'], wrong: 0 }).record;
  const onLevelNine = recordMatch(record, { mode: 'solo', level: 9, points: 20, solvedIds: ['book.ruth'], wrong: 0 });
  assert.equal(onLevelNine.isBest, true, 'a first score at level 9 is a best even if lower than a level 1 score');
});

test('a word becomes mastered once it has been solved three times', () => {
  let record = emptyProgress();
  for (let i = 0; i < MASTERY_THRESHOLD; i += 1) {
    record = recordMatch(record, { mode: 'solo', level: 1, points: 10, solvedIds: ['book.john'], wrong: 0 }).record;
  }
  assert.equal(record.solveCounts['book.john'], 3);
  assert.equal(masteredCount(record), 1);
});

test('level progress counts only distinct words solved at that level', () => {
  let record = emptyProgress();
  record = recordMatch(record, { mode: 'solo', level: 4, points: 10, solvedIds: ['book.john', 'book.john'], wrong: 0 }).record;
  record = recordMatch(record, { mode: 'solo', level: 4, points: 10, solvedIds: ['book.john', 'book.ruth'], wrong: 0 }).record;
  assert.deepEqual(record.levelProgress['4'].solvedIds.sort(), ['book.john', 'book.ruth']);
});

test('playing records the day and never lets the day list grow without bound', () => {
  let record = emptyProgress();
  for (let day = 1; day <= 70; day += 1) {
    record = recordMatch(record, { mode: 'solo', level: 1, points: 1, solvedIds: ['book.john'], wrong: 0, now: new Date(2026, 0, day, 12) }).record;
  }
  assert.equal(record.daysPlayed.length, 60);
  assert.equal(record.daysPlayed[0], dayKey(new Date(2026, 0, 70, 12)));
});
