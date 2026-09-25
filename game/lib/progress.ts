/** One versioned record holding everything a player accumulates across
 * sessions. Every read and write goes through this module -- no component
 * touches localStorage directly, so storage being blocked is handled once. */

export const PROGRESS_KEY = 'wordin-progress-v1';

export type LevelProgress = {
  /** Distinct entry ids solved at this level -- drives the clear condition. */
  solvedIds: string[];
  correct: number;
  attempts: number;
};

export type ProgressRecord = {
  version: 1;
  lifetimePoints: number;
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
  streak: { current: number; best: number; lastPlayedDay: string | null; freezes: number };
  /** Day keys played, newest first, capped at 60. */
  daysPlayed: string[];
};

export function emptyProgress(): ProgressRecord {
  return {
    version: 1,
    lifetimePoints: 0,
    totalSolved: 0,
    totalWrong: 0,
    bestByMode: {},
    solveCounts: {},
    levelProgress: {},
    streak: { current: 0, best: 0, lastPlayedDay: null, freezes: 0 },
    daysPlayed: [],
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
  const streak = plainRecord<unknown>(parsed.streak);
  return {
    version: 1,
    lifetimePoints: numberOr(parsed.lifetimePoints, 0),
    totalSolved: numberOr(parsed.totalSolved, 0),
    totalWrong: numberOr(parsed.totalWrong, 0),
    bestByMode: plainRecord<number>(parsed.bestByMode),
    solveCounts: plainRecord<number>(parsed.solveCounts),
    levelProgress,
    streak: {
      current: numberOr(streak.current, base.streak.current),
      best: numberOr(streak.best, base.streak.best),
      lastPlayedDay: typeof streak.lastPlayedDay === 'string' ? streak.lastPlayedDay : null,
      freezes: numberOr(streak.freezes, base.streak.freezes),
    },
    daysPlayed: Array.isArray(parsed.daysPlayed) ? parsed.daysPlayed.filter((day): day is string => typeof day === 'string') : [],
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
  level: number;
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
): { record: ProgressRecord; isBest: boolean; previousBest: number } {
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

  const today = dayKey(result.now ?? new Date());
  next.daysPlayed = [today, ...next.daysPlayed.filter((day) => day !== today)].slice(0, MAX_DAYS_TRACKED);

  return { record: next, isBest, previousBest };
}

export function masteredCount(record: ProgressRecord): number {
  return Object.values(record.solveCounts).filter((count) => count >= MASTERY_THRESHOLD).length;
}
