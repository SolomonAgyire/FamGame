/** One versioned record holding everything a player accumulates across
 * sessions. Every read and write goes through this module -- no component
 * touches localStorage directly, so storage being blocked is handled once. */

import type { Level } from '@/lib/types';
import { isLevelCleared } from '@/lib/levels';
import { coinsForMatch, matchStars } from '@/lib/economy';

export const PROGRESS_KEY = 'wordin-progress-v1';

export type LevelProgress = {
  /** Distinct entry ids solved at this level -- drives the clear condition. */
  solvedIds: string[];
  correct: number;
  attempts: number;
};

/** What the player did on one Daily Word. Stored so the day cannot be
 * replayed for a second streak day, and so the share card survives a
 * reload. It never holds the answer. */
export type DailyResult = { day: string; solved: boolean; guesses: number; hintsUsed: number; points: number };

export type ProgressRecord = {
  version: 1;
  lifetimePoints: number;
  /** Earned automatically on every completed solo/together/Daily match --
   * see `recordMatch`. Time Attack and online rooms keep their own
   * separate scoring and never touch this. */
  coins: number;
  /** A rare bonus: one gem the first time a level's clear condition
   * becomes true, never again after. */
  gems: number;
  /** Levels that have already paid their one gem. `isLevelCleared` is not
   * a one-way ratchet -- its accuracy term can fall back below 70% on a
   * bad replay and rise again later -- so awarding on every false-to-true
   * transition could pay the same level's gem more than once. This is
   * the ledger that makes "once, ever" actually hold. */
  gemLevels: Record<string, true>;
  totalSolved: number;
  totalWrong: number;
  /** Keyed "mode:level", e.g. "solo:3" -> best score seen for that pairing. */
  bestByMode: Record<string, number>;
  /** entryId -> how many times it has been solved. Drives mastery. */
  solveCounts: Record<string, number>;
  /** Nothing here says which levels are unlocked or cleared: `lib/levels.ts`
   * derives both from `levelProgress`, so a stored flag could only ever
   * drift out of agreement with the truth. */
  levelProgress: Record<string, LevelProgress>;
  /** Levels that already satisfied the flat twenty-word clear rule that
   * predated Phase G's per-level clear targets. Set once, the first time a
   * record written before that change is loaded (see `migrate()`), from
   * whichever levels `levelProgress` already qualified at that moment --
   * never recomputed afterward. Without this, a level cleared under the
   * old rule could read as uncleared once its target rose past what was
   * required when it was actually cleared, silently re-locking progress
   * nobody lost. Read by `isLevelCleared` in `lib/levels.ts`. */
  legacyClears: Record<string, true>;
  streak: {
    current: number;
    best: number;
    lastPlayedDay: string | null;
    freezes: number;
    /** The streak that a gap just cost, kept so it can be won back.
     * `onDay` is the last day the streak actually stood -- the day BEFORE
     * the gap -- because the size of the gap is what decides whether the
     * repair window has closed, and the break day alone cannot say. */
    brokenStreak: { value: number; onDay: string } | null;
  };
  /** Day keys played, newest first, capped at 60. */
  daysPlayed: string[];
  /** Distinct words solved today, reset by the first match of a new day.
   * It is what a streak repair is bought with. */
  solvesToday: { day: string; count: number };
  /** The most recent Daily Word result, or null before the first one. */
  daily: DailyResult | null;
};

export function emptyProgress(): ProgressRecord {
  return {
    version: 1,
    lifetimePoints: 0,
    coins: 0,
    gems: 0,
    gemLevels: {},
    totalSolved: 0,
    totalWrong: 0,
    bestByMode: {},
    solveCounts: {},
    levelProgress: {},
    legacyClears: {},
    streak: { current: 0, best: 0, lastPlayedDay: null, freezes: 0, brokenStreak: null },
    daysPlayed: [],
    solvesToday: { day: '', count: 0 },
    daily: null,
  };
}

/** The play day rolls at 3am local time. Someone finishing a puzzle at
 * 1am has not started a new day -- losing a streak to that would feel
 * arbitrary and punishing. */
export function dayKey(date: Date): string {
  const shifted = new Date(date.getTime());
  shifted.setHours(shifted.getHours() - 3);
  const year = shifted.getFullYear();
  const month = String(shifted.getMonth() + 1).padStart(2, '0');
  const day = String(shifted.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function storage(): Storage | null {
  try {
    const candidate = (globalThis as { localStorage?: Storage }).localStorage;
    return candidate ?? null;
  } catch {
    return null;
  }
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function plainRecord<T>(value: unknown): Record<string, T> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, T> : {};
}

/** The clear rule every level used before Phase G's targets scaled per
 * level: twenty distinct words at seventy percent accuracy, flat. Kept
 * only so `migrate()` can recognise, on first load, whether a stored
 * record predates that change and snapshot what it had already cleared
 * under it -- see `legacyClears` on `ProgressRecord`. */
const LEGACY_WORDS_TO_CLEAR = 20;
const LEGACY_ACCURACY_TO_CLEAR = 0.7;

/** Copies a stored `version: 1` record field by field. Earlier builds also
 * wrote `unlockedLevel` and a per-level `cleared` flag; both were derived
 * elsewhere and are simply dropped here, so an old record still loads and
 * is rewritten without them. Anything malformed falls back to its empty
 * value rather than reaching `levelStatus` and throwing. */
function migrate(parsed: Record<string, unknown>): ProgressRecord {
  const base = emptyProgress();
  const levelProgress: Record<string, LevelProgress> = {};
  for (const [key, value] of Object.entries(plainRecord<unknown>(parsed.levelProgress))) {
    const entry = plainRecord<unknown>(value);
    levelProgress[key] = {
      solvedIds: Array.isArray(entry.solvedIds) ? entry.solvedIds.filter((id): id is string => typeof id === 'string') : [],
      correct: numberOr(entry.correct, 0),
      attempts: numberOr(entry.attempts, 0),
    };
  }
  // A record already written under the scaled targets carries this field
  // (`emptyProgress()` sets it, even if empty) -- keep it exactly.
  // A record from before that change has no such key at all: this is the
  // one moment its already-cleared levels can be told apart from the
  // targets that will judge them from now on, so snapshot them here.
  const rawLegacy = parsed.legacyClears;
  const legacyClears: Record<string, true> = {};
  if (rawLegacy && typeof rawLegacy === 'object' && !Array.isArray(rawLegacy)) {
    for (const [key, value] of Object.entries(rawLegacy as Record<string, unknown>)) {
      if (value === true) legacyClears[key] = true;
    }
  } else {
    for (const [key, progress] of Object.entries(levelProgress)) {
      const accurate = progress.attempts > 0 && progress.correct / progress.attempts >= LEGACY_ACCURACY_TO_CLEAR;
      if (progress.solvedIds.length >= LEGACY_WORDS_TO_CLEAR && accurate) legacyClears[key] = true;
    }
  }
  const gemLevels: Record<string, true> = {};
  for (const [key, value] of Object.entries(plainRecord<unknown>(parsed.gemLevels))) {
    if (value === true) gemLevels[key] = true;
  }
  const streak = plainRecord<unknown>(parsed.streak);
  // Fields are listed one by one rather than spread, so a stored record
  // cannot smuggle in a key this build does not understand. The cost is
  // that a field added here and forgotten below is dropped on every load.
  const daily = plainRecord<unknown>(parsed.daily);
  const broken = plainRecord<unknown>(streak.brokenStreak);
  const solves = plainRecord<unknown>(parsed.solvesToday);
  return {
    version: 1,
    lifetimePoints: numberOr(parsed.lifetimePoints, 0),
    coins: numberOr(parsed.coins, 0),
    gems: numberOr(parsed.gems, 0),
    gemLevels,
    totalSolved: numberOr(parsed.totalSolved, 0),
    totalWrong: numberOr(parsed.totalWrong, 0),
    bestByMode: plainRecord<number>(parsed.bestByMode),
    solveCounts: plainRecord<number>(parsed.solveCounts),
    levelProgress,
    legacyClears,
    streak: {
      current: numberOr(streak.current, base.streak.current),
      best: numberOr(streak.best, base.streak.best),
      lastPlayedDay: typeof streak.lastPlayedDay === 'string' ? streak.lastPlayedDay : null,
      freezes: numberOr(streak.freezes, base.streak.freezes),
      brokenStreak: typeof broken.onDay === 'string' && typeof broken.value === 'number' && Number.isFinite(broken.value)
        ? { value: broken.value, onDay: broken.onDay }
        : null,
    },
    daysPlayed: Array.isArray(parsed.daysPlayed) ? parsed.daysPlayed.filter((day): day is string => typeof day === 'string') : [],
    solvesToday: typeof solves.day === 'string' ? { day: solves.day, count: numberOr(solves.count, 0) } : base.solvesToday,
    daily: typeof daily.day === 'string' ? {
      day: daily.day,
      solved: daily.solved === true,
      guesses: numberOr(daily.guesses, 0),
      hintsUsed: numberOr(daily.hintsUsed, 0),
      points: numberOr(daily.points, 0),
    } : null,
  };
}

export function loadProgress(): ProgressRecord {
  const store = storage();
  if (!store) return emptyProgress();
  try {
    const raw = store.getItem(PROGRESS_KEY);
    if (!raw) return emptyProgress();
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return emptyProgress();
    // A record written by a newer build may have a shape this build cannot
    // reason about. Starting fresh is safer than half-reading it.
    if ((parsed as { version?: unknown }).version !== 1) return emptyProgress();
    return migrate(parsed as Record<string, unknown>);
  } catch {
    return emptyProgress();
  }
}

export function saveProgress(record: ProgressRecord): void {
  cached = record;
  for (const listener of listeners) listener();
  const store = storage();
  if (!store) return;
  try {
    store.setItem(PROGRESS_KEY, JSON.stringify(record));
  } catch {
    /* quota or private mode -- the game keeps working without persistence */
  }
}

/* --- Reading progress from a component ---------------------------------
 * `useSyncExternalStore` needs three things: a subscription, a client
 * snapshot with a stable identity between renders, and a server snapshot.
 * The server snapshot is one frozen empty record, so the server render and
 * the first client render always agree and hydration stays clean; React
 * then re-renders with the stored record. Reading storage in a mount
 * effect and calling setState would do the same job with an extra render,
 * and trips `react-hooks/set-state-in-effect`. */

const SERVER_SNAPSHOT: ProgressRecord = emptyProgress();
let cached: ProgressRecord | null = null;
const listeners = new Set<() => void>();

export function subscribeProgress(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getProgressSnapshot(): ProgressRecord {
  if (!cached) cached = loadProgress();
  return cached;
}

export function getProgressServerSnapshot(): ProgressRecord {
  return SERVER_SNAPSHOT;
}

export const MASTERY_THRESHOLD = 3;
const MAX_DAYS_TRACKED = 60;

export type MatchResult = {
  mode: string;
  /** 1..9 */
  level: Level;
  points: number;
  /** Entry ids solved in this match. Duplicates are tolerated and collapsed. */
  solvedIds: string[];
  wrong: number;
  /** Injectable for tests; defaults to now. */
  now?: Date;
};

export function recordMatch(
  record: ProgressRecord,
  result: MatchResult,
): { record: ProgressRecord; isBest: boolean; previousBest: number; coinsEarned: number; gemEarned: boolean } {
  const next: ProgressRecord = {
    ...record,
    bestByMode: { ...record.bestByMode },
    solveCounts: { ...record.solveCounts },
    levelProgress: { ...record.levelProgress },
    daysPlayed: [...record.daysPlayed],
  };

  const distinct = [...new Set(result.solvedIds)];

  next.lifetimePoints += result.points;
  next.totalSolved += distinct.length;
  next.totalWrong += result.wrong;

  // Bests are per mode AND per level -- a first run at Eternity is a
  // personal best even if it scores under a long run at Studying.
  const bestKey = `${result.mode}:${result.level}`;
  const previousBest = next.bestByMode[bestKey] ?? 0;
  const isBest = result.points > previousBest;
  if (isBest) next.bestByMode[bestKey] = result.points;

  for (const id of distinct) {
    next.solveCounts[id] = (next.solveCounts[id] ?? 0) + 1;
  }

  const levelKey = String(result.level);
  const existing = next.levelProgress[levelKey] ?? { solvedIds: [], correct: 0, attempts: 0 };
  next.levelProgress[levelKey] = {
    ...existing,
    solvedIds: [...new Set([...existing.solvedIds, ...distinct])],
    correct: existing.correct + distinct.length,
    attempts: existing.attempts + distinct.length + result.wrong,
  };

  // Coins are a flat reward for a completed match; a gem is rarer, paid
  // once per level, the first time it's cleared. `gemLevels` is checked
  // rather than a clear/unclear transition, because `isLevelCleared`'s
  // accuracy term can fall back below 70% on a bad replay and rise again
  // later -- a transition-based check would pay the same level twice.
  const stars = matchStars({ correct: distinct.length, wrong: result.wrong });
  const coinsEarned = coinsForMatch(stars, distinct.length);
  next.coins += coinsEarned;
  next.gemLevels = { ...next.gemLevels };
  const levelAlreadyPaid = Boolean(next.gemLevels[levelKey]);
  const gemEarned = !levelAlreadyPaid && isLevelCleared(next, result.level);
  if (gemEarned) {
    next.gems += 1;
    next.gemLevels[levelKey] = true;
  }

  const today = dayKey(result.now ?? new Date());
  next.daysPlayed = [today, ...next.daysPlayed.filter((day) => day !== today)].slice(0, MAX_DAYS_TRACKED);
  // Yesterday's count is not carried over -- a repair has to be paid for
  // with today's solving.
  next.solvesToday = {
    day: today,
    count: (record.solvesToday.day === today ? record.solvesToday.count : 0) + distinct.length,
  };

  return { record: next, isBest, previousBest, coinsEarned, gemEarned };
}

export function masteredCount(record: ProgressRecord): number {
  return Object.values(record.solveCounts).filter((count) => count >= MASTERY_THRESHOLD).length;
}
