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
