import type { ProgressRecord } from '@/lib/progress';
import { LEVEL_NAMES, type Level } from '@/lib/types';

/** Clearing a level means solving twenty DISTINCT words at it, accurately.
 * Requiring the whole level would repeat the Time Attack grind that made
 * the hardest content unreachable. */
export const WORDS_TO_CLEAR = 20;
export const ACCURACY_TO_CLEAR = 0.7;

export function isLevelCleared(record: ProgressRecord, level: Level): boolean {
  const progress = record.levelProgress[String(level)];
  if (!progress) return false;
  if (progress.solvedIds.length < WORDS_TO_CLEAR) return false;
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
    needed: WORDS_TO_CLEAR,
    accuracy,
  };
}
