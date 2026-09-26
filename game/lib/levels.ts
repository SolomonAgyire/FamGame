import type { ProgressRecord } from '@/lib/progress';
import { LEVEL_NAMES, type Level } from '@/lib/types';

export const ACCURACY_TO_CLEAR = 0.7;

/** A run is longer the further up the journey it is -- ten words at
 * Studying, twenty-five at Eternity. */
export const RUN_LENGTHS: Record<Level, number> = {
  1: 10, 2: 12, 3: 14, 4: 16, 5: 18, 6: 20, 7: 22, 8: 24, 9: 25,
};

/** Distinct words needed to clear a level. This rises FASTER than run
 * length on purpose: if it did not, a longer run at the top would clear the
 * hardest level in fewer attempts than the easiest, and the climb would get
 * shorter as it got harder. */
export const CLEAR_TARGETS: Record<Level, number> = {
  1: 20, 2: 24, 3: 28, 4: 33, 5: 38, 6: 44, 7: 50, 8: 55, 9: 60,
};

/** Kept as an alias of the Studying-level target: some call sites only
 * ever cared about level 1's flat number. Everything that scales with
 * level reads `clearTargetFor` instead. */
export const WORDS_TO_CLEAR = CLEAR_TARGETS[1];

export function runLengthFor(level: Level): number { return RUN_LENGTHS[level]; }
export function clearTargetFor(level: Level): number { return CLEAR_TARGETS[level]; }

export function isLevelCleared(record: ProgressRecord, level: Level): boolean {
  // A level already cleared under the flat rule that predated per-level
  // targets stays cleared, even though the target it would be judged
  // against today has since risen past what it took to clear it then.
  if (record.legacyClears?.[String(level)]) return true;
  const progress = record.levelProgress[String(level)];
  if (!progress) return false;
  if (progress.solvedIds.length < clearTargetFor(level)) return false;
  if (progress.attempts === 0) return false;
  return progress.correct / progress.attempts >= ACCURACY_TO_CLEAR;
}

/** Walk up from level 1. Progression never skips: clearing level 5 while
 * level 2 is unfinished opens nothing. */
export function highestUnlocked(record: ProgressRecord): Level {
  let unlocked: Level = 1;
  for (let level = 1 as Level; level < 9; level = (level + 1) as Level) {
    if (!isLevelCleared(record, level)) break;
    unlocked = (level + 1) as Level;
  }
  return unlocked;
}

export function isUnlocked(record: ProgressRecord, level: Level): boolean {
  return level <= highestUnlocked(record);
}

export function levelStatus(record: ProgressRecord, level: Level) {
  const progress = record.levelProgress[String(level)];
  const solved = progress?.solvedIds.length ?? 0;
  const accuracy = progress && progress.attempts > 0 ? progress.correct / progress.attempts : 0;
  return {
    name: LEVEL_NAMES[level - 1],
    unlocked: isUnlocked(record, level),
    cleared: isLevelCleared(record, level),
    solved,
    needed: clearTargetFor(level),
    accuracy,
  };
}
