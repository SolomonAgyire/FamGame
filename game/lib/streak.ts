/** Day-streak rules. Everything here is pure: it takes a `ProgressRecord`
 * and a `Date` and hands back a new record, so the whole habit loop can be
 * tested without a DOM, a clock or storage.
 *
 * A "day" is whatever `dayKey` in `lib/progress.ts` says it is -- it rolls
 * at 3am local, and there is deliberately no second date function here.
 * Only day-key arithmetic lives in this file, and it works in UTC on the
 * already-resolved keys so a daylight-saving shift cannot skip a square on
 * the week strip. */

import { dayKey, type ProgressRecord } from '@/lib/progress';

/** Streak lengths that hand out a freeze on their own. */
export const FREEZE_EARNED_EVERY = 5;
/** Nobody banks a fortnight of absence. */
export const MAX_FREEZES = 2;
/** How many days a broken streak stays winnable. */
export const REPAIR_WINDOW_DAYS = 2;
/** The price of winning it back. */
export const REPAIR_PUZZLES = 3;
export const MILESTONES = [3, 7, 30, 100];

/** Day keys kept on the record; `recordMatch` uses the same cap. */
const MAX_DAYS_TRACKED = 60;
const WEEK = 7;
const MS_PER_DAY = 86_400_000;

function keyToUtc(key: string): number {
  const [year, month, day] = key.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

function utcToKey(ms: number): string {
  const date = new Date(ms);
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${date.getUTCFullYear()}-${month}-${day}`;
}

/** Whole days from one day key to another; negative when `to` is earlier. */
function daysBetween(from: string, to: string): number {
  return Math.round((keyToUtc(to) - keyToUtc(from)) / MS_PER_DAY);
}

function shiftDay(key: string, delta: number): string {
  return utcToKey(keyToUtc(key) + delta * MS_PER_DAY);
}

/** How many freezes a streak of `length` has earned in total. A milestone
 * counts as having served its five days, so hitting day 3 hands one over
 * early rather than handing out a second one two days later -- the player
 * is meant to end a normal week holding one freeze, not a stockpile. */
function freezesEarnedBy(length: number): number {
  if (length <= 0) return 0;
  const byPeriod = Math.floor(length / FREEZE_EARNED_EVERY);
  const byMilestone = MILESTONES.filter((milestone) => milestone <= length).length;
  return Math.max(byPeriod, byMilestone);
}

function clampFreezes(value: number): number {
  return Math.max(0, Math.min(MAX_FREEZES, value));
}

function withToday(days: string[], today: string): string[] {
  return [today, ...days.filter((day) => day !== today)].slice(0, MAX_DAYS_TRACKED);
}

export type PlayOutcome = {
  record: ProgressRecord;
  /** The streak grew today. False when today was already counted. */
  extended: boolean;
  /** A gap was paid for out of the freeze bank instead of resetting. */
  frozeADay: boolean;
  brokeStreak: boolean;
  /** The milestone reached exactly today, or null. */
  milestone: number | null;
};

/** Count today towards the streak. Idempotent within a day: a player who
 * finishes five puzzles before lunch has still played one day. */
export function applyPlay(record: ProgressRecord, now: Date): PlayOutcome {
  const today = dayKey(now);
  const { current, best, lastPlayedDay, freezes } = record.streak;

  if (lastPlayedDay === today) {
    return { record, extended: false, frozeADay: false, brokeStreak: false, milestone: null };
  }

  const gap = lastPlayedDay ? daysBetween(lastPlayedDay, today) : 0;
  // A clock that went backwards (a device timezone change, a record copied
  // between machines) would otherwise read as an enormous gap and wipe a
  // real streak. Treat it as the same day and leave the streak alone.
  if (lastPlayedDay && gap <= 0) {
    return { record, extended: false, frozeADay: false, brokeStreak: false, milestone: null };
  }

  const missed = Math.max(0, gap - 1);
  const canFreeze = missed > 0 && missed <= freezes;
  // All or nothing: spending the last freeze on a gap it cannot cover would
  // take the freeze AND the streak.
  const broke = missed > 0 && !canFreeze;

  const nextCurrent = broke ? 1 : current + 1;
  const spent = canFreeze ? missed : 0;
  const earned = Math.max(0, freezesEarnedBy(nextCurrent) - freezesEarnedBy(broke ? 0 : current));
  const milestone = MILESTONES.includes(nextCurrent) ? nextCurrent : null;

  return {
    record: {
      ...record,
      streak: {
        current: nextCurrent,
        best: Math.max(best, nextCurrent),
        lastPlayedDay: today,
        freezes: clampFreezes(freezes - spent + earned),
      },
      // `recordMatch` keeps this list too, and writes the same day key the
      // same way, so a finished match calling both cannot double-count.
      daysPlayed: withToday(record.daysPlayed, today),
    },
    extended: !broke,
    frozeADay: canFreeze,
    brokeStreak: broke,
    milestone,
  };
}

export type StreakState = {
  current: number;
  best: number;
  freezes: number;
  /** Today is already counted -- the flame is safe until tomorrow. */
  playedToday: boolean;
  /** A break here would still be inside the repair window. */
  repairable: boolean;
  /** Days between the last play and today that went unplayed. */
  daysMissed: number;
};

export function streakState(record: ProgressRecord, now: Date): StreakState {
  const today = dayKey(now);
  const { current, best, lastPlayedDay, freezes } = record.streak;
  const gap = lastPlayedDay ? daysBetween(lastPlayedDay, today) : 0;
  const daysMissed = lastPlayedDay ? Math.max(0, gap - 1) : 0;
  return {
    current,
    best,
    freezes,
    playedToday: lastPlayedDay === today,
    repairable: daysMissed > 0 && daysMissed <= REPAIR_WINDOW_DAYS,
    daysMissed,
  };
}

export type WeekDay = { day: string; played: boolean };

/** The last seven days, oldest first, today last. Reads `daysPlayed` and
 * never mutates it. */
export function weekStrip(record: ProgressRecord, now: Date): WeekDay[] {
  const today = dayKey(now);
  const played = new Set(record.daysPlayed);
  return Array.from({ length: WEEK }, (_, index) => {
    const day = shiftDay(today, index - (WEEK - 1));
    return { day, played: played.has(day) };
  });
}
