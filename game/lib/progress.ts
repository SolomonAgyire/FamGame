/** One versioned record holding everything a player accumulates across
 * sessions. Every read and write goes through this module -- no component
 * touches localStorage directly, so storage being blocked is handled once. */

export const PROGRESS_KEY = 'wordin-progress-v1';

export type LevelProgress = {
  /** Distinct entry ids solved at this level -- drives the clear condition. */
  solvedIds: string[];
  correct: number;
  attempts: number;
  cleared: boolean;
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
  /** Highest level the player may enter. 1..9 */
  unlockedLevel: number;
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
    unlockedLevel: 1,
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

export function loadProgress(): ProgressRecord {
  const store = storage();
  if (!store) return emptyProgress();
  try {
    const raw = store.getItem(PROGRESS_KEY);
    if (!raw) return emptyProgress();
    const parsed = JSON.parse(raw) as Partial<ProgressRecord>;
    // A record written by a newer build may have a shape this build cannot
    // reason about. Starting fresh is safer than half-reading it.
    if (parsed.version !== 1) return emptyProgress();
    return { ...emptyProgress(), ...parsed, streak: { ...emptyProgress().streak, ...(parsed.streak ?? {}) } };
  } catch {
    return emptyProgress();
  }
}

export function saveProgress(record: ProgressRecord): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(PROGRESS_KEY, JSON.stringify(record));
  } catch {
    /* quota or private mode -- the game keeps working without persistence */
  }
}
