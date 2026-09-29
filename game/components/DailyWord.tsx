'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
import { shuffledOrder, TileBoard } from '@/components/TileBoard';
import { dailyPuzzleFor } from '@/lib/daily';
import { getEntryById, normalizeAnswer } from '@/lib/game-engine';
import { dayKey, getProgressServerSnapshot, getProgressSnapshot, recordMatch, saveProgress, subscribeProgress } from '@/lib/progress';
import { applyPlay, repairableStreak, repairStreak, REPAIR_PUZZLES, streakState, weekStrip } from '@/lib/streak';
import { buildShareText, shareResult } from '@/lib/share';
import { applyLetterHint, HINT_LABELS, hintsFor } from '@/lib/hints';
import { scoreSolve } from '@/lib/scoring';
import { showToast } from '@/lib/toast';
import { playCorrect, playShuffle, playWrong } from '@/lib/audio';
import { LEVEL_NAMES } from '@/lib/types';
import { ScoreFlight } from '@/components/ScoreFlight';
import { GameCharacter } from '@/components/GameCharacter';
import { GameTool, MissionHud } from '@/components/GameChrome';
import { Results } from '@/components/Results';
import { matchStars } from '@/lib/economy';

/** Four goes at it, then the word is shown. Enough room to think, not so
 * much that the share card stops meaning anything. */
const MAX_GUESSES = 4;
/** Three rungs, same ladder as every other mode: a letter, then where in
 * the Bible it sits, then the citation. */
const MAX_HINTS = 3;

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
  const winnable = repairableStreak(record, now);
  const solvedToday = record.solvesToday.day === dayKey(now) ? record.solvesToday.count : 0;

  if (!hydrated) return null;

  const live = state.playedToday || state.daysMissed === 0;

  const winBack = () => {
    const outcome = repairStreak(getProgressSnapshot(), now, solvedToday);
    if (!outcome.repaired) {
      showToast(`Solve ${REPAIR_PUZZLES} puzzles today to win it back.`);
      return;
    }
    saveProgress(outcome.record);
    showToast(`Your ${winnable}-day streak is back.`);
  };

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
    {winnable !== null && <button
      type="button"
      className="repair-banner"
      disabled={solvedToday < REPAIR_PUZZLES}
      onClick={winBack}
    >
      <strong>{solvedToday >= REPAIR_PUZZLES
        ? `Win back your ${winnable}-day streak`
        : `Solve ${REPAIR_PUZZLES} puzzles to win back your ${winnable}-day streak`}</strong>
      <small>{Math.min(solvedToday, REPAIR_PUZZLES)} of {REPAIR_PUZZLES} solved today</small>
      <span className="repair-meter" aria-hidden="true">
        <i style={{ width: `${Math.min(100, (solvedToday / REPAIR_PUZZLES) * 100)}%` }} />
      </span>
    </button>}
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
  const [order, setOrder] = useState<number[] | null>(null);
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
  const ladder = hintsFor(entry);
  const nextHint = hints < MAX_HINTS ? ladder[hints] : undefined;
  const takeHint = () => {
    if (!nextHint) return;
    if (nextHint.kind === 'letter') setPlaced(applyLetterHint(entry, placed, daily.scramble));
    setHints(hints + 1);
  };
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
    const stars = matchStars({ correct: done.solved ? 1 : 0, wrong: done.solved ? done.guesses - 1 : done.guesses });
    return <Results
      character="mira"
      stars={stars}
      subtitle={`Daily #${daily.number} · ${levelName}`}
      title={done.solved ? 'Solved it.' : 'Not today.'}
      banner={note?.milestone ? <div className="milestone-banner" role="status">
        <span className="milestone-spark" aria-hidden="true">✦</span>
        <strong>{note.milestone} days in a row</strong>
        <small>A freeze is yours — one missed day is covered.</small>
      </div> : undefined}
      headline={{ value: done.points, label: 'points' }}
      coinsEarned={undefined}
      scripture={entry.references[0]}
      extra={<>
        <p className="page-subtitle daily-answer">The answer was <strong>{entry.display}</strong> — {entry.references[0]}</p>
        <div className="daily-scoreline">
          <div><strong>{done.guesses}</strong><span>{done.guesses === 1 ? 'Guess' : 'Guesses'}</span></div>
          <div><strong>{done.hintsUsed}</strong><span>Hints</span></div>
          <div><strong>{done.points}</strong><span>Points</span><ScoreFlight score={done.points} initialScore={note ? 0 : done.points} /></div>
        </div>
        {note && <p className="daily-note"><strong>{note.headline}</strong> {note.detail}</p>}
        <StreakHeader />
        <p className="daily-tomorrow">{state.playedToday ? 'Come back tomorrow for a new word.' : 'A new word is waiting.'}</p>
      </>}
      stats={[]}
      primaryLabel={sharing ? '…' : 'Share result ↗'}
      onPrimary={share}
      onHome={onHome}
    />;
  }

  return <main className="game-shell">
    <MissionHud character={<GameCharacter character="mira" mood={guesses > 0 ? 'oops' : 'think'} size="small" />} mission={`Daily #${daily.number}`} progress={(guesses / MAX_GUESSES) * 100} score={<><span aria-hidden="true">♥</span><strong>{MAX_GUESSES - guesses}</strong></>} />
    <section className="puzzle-card play-card">
      <div className="card-top">
        <div><p className="puzzle-kicker">{levelName}</p><h1>Build the word</h1></div>
        <span className="points-pill">{value}</span>
      </div>
      <TileBoard scramble={daily.scramble} placed={placed} setPlaced={setPlaced} order={order ?? undefined} />
      {hints > 0 && <div className="hint-box"><span className="hint-icon" aria-hidden="true">💡</span><div className="hint-lines">{ladder.slice(0, hints).map((hint) => <p key={hint.kind}>{hint.text}</p>)}</div></div>}
      <div className="game-actions tool-dock">
        <GameTool icon="💡" label={nextHint ? HINT_LABELS[nextHint.kind] : 'Hints used'} count={Math.max(0, MAX_HINTS - hints)} disabled={!nextHint} onClick={takeHint} tone="gold" />
        <GameTool icon="↻" label="Shuffle" onClick={() => { playShuffle(); setOrder(shuffledOrder(daily.scramble.length)); }} />
        <GameTool icon="🔨" label="Clear" disabled={placed.length === 0} onClick={() => setPlaced([])} tone="coral" />
        <button type="button" className="check-button" onClick={check}>Check answer</button>
        <GameTool icon="🧭" label="Give up" onClick={() => finish(false, Math.max(1, guesses))} tone="violet" />
      </div>
      <button type="button" className="quit-button" onClick={onHome}>Back home</button>
    </section>
  </main>;
}
