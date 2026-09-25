'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
import { TileBoard } from '@/components/TileBoard';
import { dailyPuzzleFor } from '@/lib/daily';
import { getEntryById, normalizeAnswer } from '@/lib/game-engine';
import { getProgressServerSnapshot, getProgressSnapshot, recordMatch, saveProgress, subscribeProgress } from '@/lib/progress';
import { applyPlay, streakState, weekStrip } from '@/lib/streak';
import { buildShareText, shareResult } from '@/lib/share';
import { scoreSolve } from '@/lib/scoring';
import { showToast } from '@/lib/toast';
import { playCorrect, playWrong } from '@/lib/audio';
import { LEVEL_NAMES } from '@/lib/types';

/** Four goes at it, then the word is shown. Enough room to think, not so
 * much that the share card stops meaning anything. */
const MAX_GUESSES = 4;
const MAX_HINTS = 2;

const NEVER_CHANGES = () => () => {};

/** True only after hydration. The streak, the week strip and the Daily
 * Word number all depend on today's date, which the server cannot know --
 * rendering them during SSR would guarantee a hydration mismatch. This is
 * `useSyncExternalStore` rather than a mount effect because
 * `react-hooks/set-state-in-effect` is an error in this project, and the
 * store version costs one render instead of two. */
export function useHydrated(): boolean {
  return useSyncExternalStore(NEVER_CHANGES, () => true, () => false);
}

function useProgress() {
  return useSyncExternalStore(subscribeProgress, getProgressSnapshot, getProgressServerSnapshot);
}

/** One `Date` for the life of the screen. Reading the clock again on every
 * render would make the component impure; a tab left open across 3am picks
 * the new day up on its next mount, which is soon enough. */
function useNow(): Date {
  const [now] = useState(() => new Date());
  return now;
}

const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function weekdayInitial(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  return WEEKDAY_INITIALS[new Date(Date.UTC(year, month - 1, date)).getUTCDay()];
}

/** The flame, the freezes held and the last seven days, sitting above the
 * hero title so the first thing on screen is what the player stands to
 * lose. */
export function StreakHeader() {
  const record = useProgress();
  const hydrated = useHydrated();
  const now = useNow();
  const state = streakState(record, now);
  const week = weekStrip(record, now);

  if (!hydrated) return null;

  const live = state.playedToday || state.daysMissed === 0;

  return <section className="streak-header" aria-label="Your streak">
    <div className="streak-row">
      <span className={`streak-flame ${live ? 'live' : 'cold'}`} aria-hidden="true">🔥</span>
      <span className="streak-count">
        <strong>{state.current}</strong>
        <small>day streak</small>
      </span>
      {state.freezes > 0 && <span className="freeze-pill" title="Freezes protect a missed day">
        ❄ {state.freezes}
      </span>}
      {state.best > state.current && <span className="best-pill">Best {state.best}</span>}
    </div>
    <ol className="week-strip" aria-label="The last seven days">
      {week.map((day, index) => <li
        key={day.day}
        className={`week-dot ${day.played ? 'played' : ''} ${index === week.length - 1 ? 'today' : ''}`}
      >
        <i aria-hidden="true" />
        <small>{weekdayInitial(day.day)}</small>
        <span className="sr-only">{day.day} {day.played ? 'played' : 'not played'}</span>
      </li>)}
    </ol>
  </section>;
}

type Note = { headline: string; detail: string; milestone: number | null };

/** One shared puzzle a day. Everybody who opens this on the same date gets
 * the same word, because the date picked it. */
export function DailyWord({ sound, onHome }: { sound: boolean; onHome: () => void }) {
  const record = useProgress();
  const now = useNow();
  const daily = useMemo(() => dailyPuzzleFor(now), [now]);
  const entry = getEntryById(daily.entryId);

  const [placed, setPlaced] = useState<number[]>([]);
  const [hints, setHints] = useState(0);
  const [guesses, setGuesses] = useState(0);
  const [note, setNote] = useState<Note | null>(null);
  const [sharing, setSharing] = useState(false);

  // The record is the source of truth for "done today", so a reload lands
  // back on the result card rather than offering the word a second time.
  const done = record.daily && record.daily.day === daily.dayKey ? record.daily : null;

  if (!entry) return <main className="page-shell"><section className="panel results-panel">
    <div className="celebration">🔒</div>
    <h1 className="page-title">No word today</h1>
    <p className="page-subtitle">The daily puzzle could not be built. Try another mode for now.</p>
    <div className="result-actions"><button className="primary-button" type="button" onClick={onHome}>Home</button></div>
  </section></main>;

  const assembled = placed.map((source) => daily.scramble[source]).join('');
  const levelName = LEVEL_NAMES[entry.level - 1];
  const value = scoreSolve({ letterCount: daily.scramble.length, level: entry.level, combo: 0, hintsUsed: hints });

  const finish = (solved: boolean, totalGuesses: number) => {
    const before = getProgressSnapshot();
    const points = solved ? value : 0;
    // Both halves of the day are recorded together on purpose: `recordMatch`
    // keeps `daysPlayed` (which the week strip reads) and `applyPlay` keeps
    // the streak. Calling only one would let the strip and the flame
    // disagree about the very same day.
    const counted = recordMatch(before, {
      mode: 'daily',
      level: entry.level,
      points,
      solvedIds: solved ? [entry.id] : [],
      wrong: solved ? totalGuesses - 1 : totalGuesses,
      now,
    });
    const play = applyPlay(counted.record, now);
    saveProgress({
      ...play.record,
      daily: { day: daily.dayKey, solved, guesses: totalGuesses, hintsUsed: hints, points },
    });

    const streak = play.record.streak.current;
    setNote({
      headline: play.milestone ? `${play.milestone} days in a row!`
        : play.frozeADay ? 'A freeze covered the day you missed'
        : play.brokeStreak ? 'Your streak restarts at one'
        : play.extended ? `${streak} ${streak === 1 ? 'day' : 'days'} in a row` : 'Already counted today',
      detail: play.brokeStreak
        ? 'Solve three puzzles today to win the old one back.'
        : 'Come back tomorrow to keep it going.',
      milestone: play.milestone,
    });
  };

  const check = () => {
    if (placed.length !== daily.scramble.length) { showToast('Place every letter before checking.'); return; }
    const attempt = guesses + 1;
    setGuesses(attempt);
    if (normalizeAnswer(assembled) === entry.answer) {
      if (sound) playCorrect();
      finish(true, attempt);
      return;
    }
    if (sound) playWrong();
    setPlaced([]);
    if (attempt >= MAX_GUESSES) finish(false, attempt);
    else showToast(`Not quite — ${MAX_GUESSES - attempt} ${MAX_GUESSES - attempt === 1 ? 'try' : 'tries'} left.`);
  };

  const share = async () => {
    if (!done) return;
    setSharing(true);
    const text = buildShareText({
      number: daily.number,
      solved: done.solved,
      guesses: done.guesses,
      hintsUsed: done.hintsUsed,
      streak: record.streak.current,
      level: levelName,
    });
    const result = await shareResult(text);
    setSharing(false);
    showToast(
      result === 'shared' ? 'Shared.'
        : result === 'copied' ? 'Copied — paste it anywhere.'
        : 'Sharing is blocked here. Take a screenshot instead.',
      result === 'failed' ? 'error' : 'info',
    );
  };

  if (done) {
    const state = streakState(record, now);
    return <main className="page-shell"><section className="panel daily-done">
      {note?.milestone && <div className="milestone-banner" role="status">
        <span className="milestone-spark" aria-hidden="true">✦</span>
        <strong>{note.milestone} days in a row</strong>
        <small>A freeze is yours — one missed day is covered.</small>
      </div>}
      <p className="section-kicker">Daily Word #{daily.number} · {levelName}</p>
      <h1 className="page-title">{done.solved ? 'Solved it.' : 'Not today.'}</h1>
      <p className="page-subtitle">The answer was <strong>{entry.display}</strong> — {entry.references[0]}</p>
      <div className="daily-scoreline">
        <div><strong>{done.guesses}</strong><span>{done.guesses === 1 ? 'Guess' : 'Guesses'}</span></div>
        <div><strong>{done.hintsUsed}</strong><span>Hints</span></div>
        <div><strong>{done.points}</strong><span>Points</span></div>
      </div>
      {note && <p className="daily-note"><strong>{note.headline}</strong> {note.detail}</p>}
      <StreakHeader />
      <p className="daily-tomorrow">{state.playedToday ? 'Come back tomorrow for a new word.' : 'A new word is waiting.'}</p>
      <div className="result-actions">
        <button className="primary-button" type="button" disabled={sharing} onClick={share}>Share result <span aria-hidden="true">↗</span></button>
        <button className="text-button" type="button" onClick={onHome}>Home</button>
      </div>
    </section></main>;
  }

  return <main className="game-shell">
    <div className="game-topbar"><div>
      <span>Daily Word #{daily.number}</span>
      <div className="progress"><i style={{ width: `${(guesses / MAX_GUESSES) * 100}%` }} /></div>
    </div><div className="score-strip"><span>{MAX_GUESSES - guesses} left</span></div></div>
    <section className="puzzle-card play-card">
      <div className="card-top">
        <div><p className="puzzle-kicker">Everyone gets this word today · {levelName}</p><h1>Unscramble the answer</h1></div>
        <span className="points-pill">{value} pts</span>
      </div>
      <TileBoard scramble={daily.scramble} placed={placed} setPlaced={setPlaced} />
      {hints > 0 && <div className="hint-box"><span className="hint-icon" aria-hidden="true">💡</span><div className="hint-lines">{entry.hints.slice(0, hints).map((hint) => <p key={hint}>{hint}</p>)}</div></div>}
      <div className="game-actions">
        <button type="button" className="soft-button" onClick={() => setPlaced([])}>↻ Reset</button>
        <button type="button" className="soft-button" disabled={hints >= MAX_HINTS} onClick={() => setHints(Math.min(MAX_HINTS, hints + 1))}>✦ Hint {hints}/{MAX_HINTS}</button>
        <button type="button" className="check-button" onClick={check}>Check answer</button>
        <button type="button" className="text-button" onClick={() => finish(false, Math.max(1, guesses))}>Give up</button>
      </div>
      <button type="button" className="quit-button" onClick={onHome}>Back home</button>
    </section>
  </main>;
}
