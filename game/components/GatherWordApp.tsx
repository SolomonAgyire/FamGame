'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { advanceMatch, buildLevelQueue, createFreshRecipe, eligibleWords, getEntryById, getPuzzleEntry, nextPlayableLevelAbove, normalizeAnswer, playableLevelFrom, unplayableReason } from '@/lib/game-engine';
import { duckMusic, playCorrect, playTap, playWrong, startMusic, stopMusic } from '@/lib/audio';
import { showToast, subscribeToasts, type Toast } from '@/lib/toast';
import { InstallPrompt } from '@/components/InstallPrompt';
import type { Category, GameSettings, Level, MatchRecipe, PlayMode, PuzzleRecipe, Team } from '@/lib/types';
import { LEVEL_NAMES } from '@/lib/types';
import { applyLetterHint, HINT_LABELS, hintsFor, type HintKind } from '@/lib/hints';
import { scoreSolve } from '@/lib/scoring';
import { secondsFor, timerModeFor } from '@/lib/timing';
import { saveProgress, recordMatch, masteredCount, subscribeProgress, getProgressSnapshot, getProgressServerSnapshot } from '@/lib/progress';
import { highestUnlocked } from '@/lib/levels';
import { LevelBar } from '@/components/LevelBar';
import { Standings } from '@/components/Standings';
import { shuffledOrder, TileBoard } from '@/components/TileBoard';
import { DailyWord, StreakHeader, useHydrated } from '@/components/DailyWord';
import { dailyPuzzleFor } from '@/lib/daily';

function ToastHost() {
  const [toasts, setToasts] = useState<(Toast & { leaving?: boolean })[]>([]);
  useEffect(() => {
    const unsubscribe = subscribeToasts((toast) => {
      setToasts((current) => [...current, toast]);
      // Mark it "leaving" first so the fade-out animation can play, then
      // actually remove it once that animation has had time to finish.
      window.setTimeout(() => setToasts((current) => current.map((item) => item.id === toast.id ? { ...item, leaving: true } : item)), 2800);
      window.setTimeout(() => setToasts((current) => current.filter((item) => item.id !== toast.id)), 3100);
    });
    return () => { unsubscribe(); };
  }, []);
  if (toasts.length === 0) return null;
  return <div className="toast-stack" role="status" aria-live="polite">
    {toasts.map((toast) => <div key={toast.id} className={`toast toast-${toast.kind} ${toast.leaving ? 'toast-leaving' : ''}`}>{toast.message}</div>)}
  </div>;
}

type EntryMode = 'solo' | 'together' | 'online' | 'timeattack' | 'daily';
type Screen = 'home' | 'setup' | 'online-entry' | 'online-lobby';
type RoomPlayer = {
  id: string; name: string; isHost: boolean; ready: boolean; score: number; joinedAt: number; teamId?: 'sun' | 'olive';
  role: 'player' | 'spectator'; lastSeen: number; left: boolean; sitOutCurrent: boolean;
};
type SolveRecord = { solverId: string; solverName: string; award: number; position: number };
type RoomSnapshot = {
  code: string; status: 'LOBBY' | 'PUZZLE_OPEN' | 'PUZZLE_RESOLVED' | 'RESULTS'; mode: 'individuals' | 'teams' | 'cooperative';
  settings: GameSettings; players: RoomPlayer[]; currentIndex: number; puzzleCount: number; version: number; viewerId: string; viewerHints: number;
  puzzle: null | { id: string; scramble: string; category: Category; band: number; hints: { kind: HintKind; text: string }[]; display?: string; reference?: string };
  resolution: null | { solvers: SolveRecord[]; answeredIds: string[]; revealed: boolean; paused: boolean };
};
type Credentials = { code: string; token: string; playerId: string };

const DEFAULT_SETTINGS: GameSettings = { categories: ['book', 'person', 'place'], maxBand: 1, length: 10 };
const TEAM_COLORS = ['#dd6f57', '#2e7d68', '#bc861a', '#6c6faa'];
// Mirrors `MAX_PLAYERS` in lib/room-service.ts -- kept as a plain constant
// here rather than imported, since that module pulls in Workers-only APIs
// that a client component must not bundle.
const MAX_ROOM_PLAYERS = 30;

function Header({ onHome, sound, setSound }: { onHome: () => void; sound: boolean; setSound: (value: boolean) => void }) {
  return <header className="app-header">
    <button className="brand" type="button" onClick={onHome} aria-label="WordIn home"><span className="brand-mark">W</span><span><strong>WordIn</strong><small>Bible word game</small></span></button>
    <div className="header-actions"><button type="button" className="icon-button" onClick={() => setSound(!sound)} aria-label={`${sound ? 'Turn off' : 'Turn on'} sound`}>{sound ? '♪' : '♪̸'}</button></div>
  </header>;
}

function HomeScreen({ startAs, level, setLevel, blocked, dailyNumber, dailyDone }: { startAs: (mode: EntryMode) => void; level: Level; setLevel: (level: Level) => void; blocked: string | null; dailyNumber: number | null; dailyDone: boolean }) {
  const [expanded, setExpanded] = useState<EntryMode | null>(null);
  const modes = [
    { id: 'solo' as const, title: 'Solo Journey', icon: '🧩', tint: 'sky', detail: 'Play by yourself, at your own pace. The first four levels are untimed.' },
    { id: 'together' as const, title: 'Play Together', icon: '🤝', tint: 'grass', detail: 'Pass one phone around. Solve as a team, or split into teams that take turns claiming each puzzle.' },
    { id: 'online' as const, title: 'Online Room', icon: '🌐', tint: 'violet', detail: 'Everyone joins from their own phone with a six-character code -- great for players in different places.' },
    { id: 'timeattack' as const, title: 'Time Attack', icon: '⚡', tint: 'berry', detail: 'A solo race against the clock. Each level is faster and harder -- chase your high score.' },
  ];
  // Only solo and together play the level chosen here. An online room picks
  // its level in the lobby, and Time Attack starts from the player's
  // progress, so neither is held up by an empty pool on this screen.
  const stopped = Boolean(blocked);
  return <main className="home-shell">
    <section className="home-grid">
      <StreakHeader />
      {/* The Daily Word is the habit, so it sits directly under the streak it
          feeds, above everything else, and is never gated by a level. */}
      <div className="daily-bar">
        <button type="button" onClick={() => startAs('daily')}>
          <span className="mode-icon" aria-hidden="true">☀️</span>
          <strong>Daily Word</strong>
          {dailyNumber !== null && <span className="daily-bar-num">#{dailyNumber}</span>}
          {dailyNumber !== null && !dailyDone && <i className="mode-dot" aria-label="Not played yet" />}
        </button>
      </div>
      <h1 className="hero-title">Unscramble the word</h1>
      <InstallPrompt />
      <SamplePuzzle />
      <LevelBar selected={level} onSelect={setLevel} />
      {stopped && <p className="field-help warn" role="status">{blocked}</p>}
      {/* Each tile starts its mode on tap. A separate Start button below cost
          a row of its own and a second decision for something the tile had
          already said. */}
      <div className="mode-grid">
        {modes.map((item) => {
          const gated = Boolean(blocked) && (item.id === 'solo' || item.id === 'together');
          return <div key={item.id} className={`mode-tile mode-tint-${item.tint} ${expanded === item.id ? 'expanded' : ''}`}>
            <button type="button" disabled={gated} onClick={() => startAs(item.id)} className="mode-tile-main">
              <span className="mode-icon" aria-hidden="true">{item.icon}</span><strong>{item.title}</strong>
              {(item.id === 'solo' || item.id === 'together') && <small className="mode-level">{LEVEL_NAMES[level - 1]}</small>}
            </button>
            <button type="button" className="mode-info-button" aria-label={`More about ${item.title}`} aria-expanded={expanded === item.id} onClick={(event) => { event.stopPropagation(); setExpanded(expanded === item.id ? null : item.id); }}>i</button>
            {expanded === item.id && <p className="mode-detail">{item.detail}</p>}
          </div>;
        })}
      </div>
    </section>
  </main>;
}

function SamplePuzzle() {
  return <div className="sample-wrap"><div className="puzzle-card sample-card">
    <div className="card-top"><div><p className="puzzle-kicker">People</p><h2>Who is hiding here?</h2></div><span className="points-pill">9 pts</span></div>
    <div className="tile-row" aria-label="Scrambled letters H A M A B R A">{'HAMABRA'.split('').map((letter, index) => <span className="letter-tile" key={`${letter}-${index}`}>{letter}</span>)}</div>
    <div className="tile-row answer-row" aria-label="Empty answer slots">{Array.from({ length: 7 }, (_, index) => <span className="answer-slot" key={index} />)}</div>
    <div className="sample-footer"><span>↻ Shuffle</span><small>Tap letters to build the answer</small><span>✦ Hint</span></div>
  </div></div>;
}

function SettingsPanel({ settings, setSettings }: { settings: GameSettings; setSettings: (settings: GameSettings) => void }) {
  const toggleCategory = (category: Category) => {
    const active = settings.categories.includes(category);
    if (active && settings.categories.length === 1) return;
    setSettings({ ...settings, categories: active ? settings.categories.filter((item) => item !== category) : [...settings.categories, category] });
  };
  const pool = eligibleWords(settings).length;
  const blocked = unplayableReason(settings);
  // With an empty pool the length controls would clamp to zero and offer a
  // match with no puzzles; hold them at the minimum instead and let the
  // Start button carry the explanation.
  const cap = Math.max(3, pool);
  return <div className="settings-stack">
    <fieldset><legend>Choose your word set</legend><p className="field-help">Select one or blend several categories.</p><div className="choice-grid three">
      {(['book', 'person', 'place'] as Category[]).map((category) => { const isSelected = settings.categories.includes(category); return <button type="button" key={category} className={`choice-card ${isSelected ? 'selected' : ''}`} onClick={() => toggleCategory(category)} aria-pressed={isSelected}>
        <span>{category === 'book' ? '📖' : category === 'person' ? '👤' : '📍'}</span><strong>{category === 'book' ? 'Bible Books' : category === 'person' ? 'People' : 'Places'}</strong>
      </button>; })}
    </div></fieldset>
    <fieldset><legend>How many puzzles?</legend><div className="length-row">
      {[10, 15].map((value) => <button type="button" key={value} onClick={() => setSettings({ ...settings, length: Math.min(value, cap) })} className={`length-button ${settings.length === value ? 'selected' : ''}`}>{value}</button>)}
      <label className="custom-length"><span>Custom</span><input aria-label="Custom puzzle count" type="number" min="3" max={cap} value={settings.length} onChange={(event) => setSettings({ ...settings, length: Math.min(cap, Math.max(3, Number(event.target.value) || 3)) })} /></label>
    </div><p className={`field-help${blocked ? ' warn' : ''}`}>{blocked ?? `${pool} approved answers at ${LEVEL_NAMES[settings.maxBand - 1]} · no repeats inside a match`}</p></fieldset>
  </div>;
}

function SetupScreen({ entryMode, settings, setSettings, togetherMode, setTogetherMode, teams, setTeams, start, back }: {
  entryMode: EntryMode; settings: GameSettings; setSettings: (settings: GameSettings) => void; togetherMode: PlayMode; setTogetherMode: (mode: PlayMode) => void;
  teams: Team[]; setTeams: (teams: Team[]) => void; start: () => void; back: () => void;
}) {
  const updateTeam = (index: number, name: string) => setTeams(teams.map((team, position) => position === index ? { ...team, name: name.slice(0, 18) } : team));
  return <main className="page-shell"><section className="panel setup-panel"><button className="back-button" type="button" onClick={back}>← Back</button>
    <p className="section-kicker">{entryMode === 'solo' ? 'Solo journey' : 'One-device play'}</p><h1 className="page-title">Build your match</h1><p className="page-subtitle">Choose the set below, and every match will be a fresh mix of words, order, and difficulty.</p>
    {entryMode === 'together' && <fieldset><legend>How are you playing?</legend><div className="choice-grid two">
      <button type="button" className={`wide-choice ${togetherMode === 'cooperative' ? 'selected' : ''}`} onClick={() => setTogetherMode('cooperative')}><span>◎</span><div><strong>Cooperative</strong><small>One score. Solve as a group.</small></div></button>
      <button type="button" className={`wide-choice ${togetherMode === 'teams' ? 'selected' : ''}`} onClick={() => setTogetherMode('teams')}><span>⚑</span><div><strong>Teams</strong><small>Claim puzzles and compete.</small></div></button>
    </div></fieldset>}
    {entryMode === 'together' && togetherMode === 'teams' && <fieldset><legend>Name your teams</legend><div className="team-inputs">
      {teams.map((team, index) => <label key={team.id}><span style={{ background: team.color }} /><input value={team.name} aria-label={`Team ${index + 1} name`} onChange={(event) => updateTeam(index, event.target.value)} /></label>)}
      <div className="mini-actions">{teams.length < 4 && <button type="button" onClick={() => setTeams([...teams, { id: `team-${teams.length + 1}`, name: `Team ${teams.length + 1}`, color: TEAM_COLORS[teams.length], score: 0 }])}>+ Add team</button>}{teams.length > 2 && <button type="button" onClick={() => setTeams(teams.slice(0, -1))}>− Remove</button>}</div>
    </div></fieldset>}
    <SettingsPanel settings={settings} setSettings={setSettings} />
    <button className="primary-button full-button" type="button" disabled={Boolean(unplayableReason(settings))} onClick={start}>Create fresh match</button>
  </section></main>;
}

const CONFETTI_COLORS = ['var(--sun)', 'var(--grass)', 'var(--sky)', 'var(--berry)', 'var(--violet)'];
type ConfettiPiece = { id: number; left: number; delay: number; duration: number; rotate: number; color: string };
// A tiny deterministic PRNG (no Math.random/Date.now) so generating the
// confetti layout is a pure computation React's compiler is happy running
// during render -- it only *looks* random, seeded by the piece index.
function seeded(seed: number): number {
  let t = seed + 0x6d2b79f5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function Confetti({ count = 20 }: { count?: number }) {
  const pieces = useMemo<ConfettiPiece[]>(() => Array.from({ length: count }, (_, index) => ({
    id: index,
    left: seeded(index * 17 + 1) * 100,
    delay: seeded(index * 31 + 2) * 0.18,
    duration: 0.8 + seeded(index * 53 + 3) * 0.5,
    rotate: Math.floor(seeded(index * 71 + 4) * 360),
    color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
  })), [count]);
  return <div className="confetti" aria-hidden="true">
    {pieces.map((piece) => <span key={piece.id} className="confetti-piece" style={{ left: `${piece.left}%`, background: piece.color, animationDelay: `${piece.delay}s`, animationDuration: `${piece.duration}s`, ['--rotate' as string]: `${piece.rotate}deg` }} />)}
  </div>;
}

function LocalGame({ mode, settings: chosenSettings, teams: initialTeams, sound, onHome, onChangeSet }: { mode: PlayMode; settings: GameSettings; teams: Team[]; sound: boolean; onHome: () => void; onChangeSet: () => void }) {
  // Frozen for the life of the match. Finishing one can unlock the next
  // level, which moves the home screen's selection -- but "Play again"
  // has to replay the level that was actually just played.
  const [settings] = useState(chosenSettings);
  const [recipe, setRecipe] = useState<MatchRecipe>(() => createFreshRecipe(settings));
  const [timeLeft, setTimeLeft] = useState(() => secondsForPuzzle(recipe, 0));
  // Whether this player has ever played at this level before. The clock
  // explains itself the first time they meet it and never again; it is
  // read from what they have already done rather than from a new flag.
  const [metLevelBefore] = useState(() => (getProgressSnapshot().levelProgress[String(chosenSettings.maxBand)]?.attempts ?? 0) > 0);
  const [index, setIndex] = useState(0); const [placed, setPlaced] = useState<number[]>([]); const [hints, setHints] = useState(0);
  const [scores, setScores] = useState<Team[]>(() => mode === 'teams' ? initialTeams.map((team) => ({ ...team, score: 0 })) : [{ id: 'group', name: mode === 'solo' ? 'You' : 'Everyone', color: '#2e7d68', score: 0 }]);
  const [claimedBy, setClaimedBy] = useState<string | null>(mode === 'teams' ? null : 'group');
  const [resolved, setResolved] = useState<{ correct: boolean; revealed: boolean; award: number } | null>(null);
  const [correctCount, setCorrectCount] = useState(0); const [wrongCount, setWrongCount] = useState(0); const [finished, setFinished] = useState(false);
  const [celebration, setCelebration] = useState<{ id: number; title: string; subtitle: string } | null>(null);
  const [missPop, setMissPop] = useState<number | null>(null);
  const [wrongStreak, setWrongStreak] = useState(0);
  const [solvedIds, setSolvedIds] = useState<string[]>([]);
  const [revealCount, setRevealCount] = useState(0);
  const [combo, setCombo] = useState(0);
  // The tray's display order. Null means "as the scramble came"; shuffling
  // writes a permutation of the same indexes, so placed tiles never move.
  const [order, setOrder] = useState<number[] | null>(null);
  const [shake, setShake] = useState<number | null>(null);
  const [summary, setSummary] = useState<{ points: number; isBest: boolean; previousBest: number; lifetime: number; mastered: number } | null>(null);
  const [unlocked, setUnlocked] = useState<{ level: Level; name: string } | null>(null);
  const puzzle = recipe.puzzles[index]; const entry = getPuzzleEntry(recipe, index);
  const assembled = puzzle ? placed.map((source) => puzzle.scramble[source]).join('') : '';
  // Declared before the effects below since the auto-advance effect needs
  // to reference `next` -- React's compiler requires that ordering.
  // The last arrangement that was rejected. With the Check button gone,
  // filling the final slot is the commit -- so taking one tile out and
  // putting the very same tile back must not re-submit the same miss.
  const rejectedRef = useRef<string | null>(null);
  const resetPuzzle = () => { setPlaced([]); setHints(0); setResolved(null); setWrongStreak(0); setOrder(null); setShake(null); rejectedRef.current = null; setClaimedBy(mode === 'teams' ? null : 'group'); };
  // Read live rather than from `finished`: the auto-advance timer below
  // runs the `next` it captured when the puzzle resolved, where `finished`
  // is still false. Tapping "See results" on the last puzzle leaves that
  // timer armed, and a stale read would record the whole match a second
  // time -- doubling lifetime points and every solved word's count.
  const finishedRef = useRef(false);
  const next = () => {
    const step = advanceMatch({ index, total: recipe.puzzles.length, finished: finishedRef.current });
    if (step.record) {
      // The results screen prints the winning side's score, so that is the
      // number that gets recorded. Summing every team would store a
      // different quantity from the one shown directly above it.
      const headline = scores.reduce((best, team) => Math.max(best, team.score), 0);
      const before = getProgressSnapshot();
      const wasUnlocked = highestUnlocked(before);
      const outcome = recordMatch(before, {
        mode: mode === 'solo' ? 'solo' : mode,
        level: settings.maxBand,
        points: headline,
        solvedIds,
        // A revealed word is an attempt that was not solved. Leaving it out
        // made the accuracy half of the clear condition impossible to fail.
        wrong: wrongCount + revealCount,
      });
      saveProgress(outcome.record);
      const nowUnlocked = highestUnlocked(outcome.record);
      setUnlocked(nowUnlocked > wasUnlocked ? { level: nowUnlocked, name: LEVEL_NAMES[nowUnlocked - 1] } : null);
      setSummary({
        points: headline,
        isBest: outcome.isBest,
        previousBest: outcome.previousBest,
        lifetime: outcome.record.lifetimePoints,
        mastered: masteredCount(outcome.record),
      });
    }
    if (step.finished) {
      finishedRef.current = true;
      setFinished(true);
      return;
    }
    setIndex(step.index);
    setTimeLeft(secondsForPuzzle(recipe, step.index));
    resetPuzzle();
  };
  useEffect(() => { duckMusic(true); return () => duckMusic(false); }, []);
  useEffect(() => {
    if (!celebration) return;
    const timer = window.setTimeout(() => setCelebration(null), 1600);
    return () => window.clearTimeout(timer);
  }, [celebration]);
  useEffect(() => {
    if (missPop === null) return;
    const timer = window.setTimeout(() => setMissPop(null), 1300);
    return () => window.clearTimeout(timer);
  }, [missPop]);
  // Once resolved -- correct, or revealed after three misses -- move on
  // automatically after a beat. No button needed to keep the pace up.
  useEffect(() => {
    if (!resolved) return;
    const timer = window.setTimeout(next, resolved.correct ? 2200 : 2600);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved]);
  const timerMode = timerModeFor(entry?.band ?? settings.maxBand);
  const secondsTotal = puzzle && entry ? secondsFor(entry.band, puzzle.scramble.length) : 0;
  const currentValue = puzzle && entry ? scoreSolve({
    letterCount: puzzle.scramble.length, level: entry.band, combo, hintsUsed: hints,
    // Only the modes that show a clock can pay for beating it.
    secondsLeft: timerMode === 'none' ? undefined : timeLeft,
    secondsTotal: timerMode === 'none' ? undefined : secondsTotal,
  }) : 0;
  const ladder = entry ? hintsFor(entry) : [];
  const nextHint = ladder[hints];
  // The first rung is spent on the board rather than in the hint box: a
  // letter the player can see in its slot is worth more than a sentence
  // telling them which letter it is.
  const takeHint = () => {
    if (!nextHint || !entry || !puzzle) return;
    if (nextHint.kind === 'letter') setPlaced(applyLetterHint(entry, placed, puzzle.scramble));
    setHints(hints + 1);
  };
  const check = () => {
    if (!entry || !puzzle || resolved) return;
    if (mode === 'teams' && !claimedBy) { showToast('A team needs to claim this puzzle first.'); return; }
    if (placed.length !== puzzle.scramble.length) return;
    const correct = normalizeAnswer(assembled) === entry.answer;
    if (correct) {
      setScores(scores.map((team) => team.id === claimedBy ? { ...team, score: team.score + currentValue } : team));
      setCorrectCount(correctCount + 1);
      setSolvedIds((current) => [...current, entry.id]);
      setCombo(combo + 1);
      setResolved({ correct: true, revealed: false, award: currentValue });
      if (sound) playCorrect();
      const solverName = mode === 'teams' ? scores.find((team) => team.id === claimedBy)?.name : undefined;
      setCelebration({ id: Date.now(), title: 'Beautiful!', subtitle: solverName ? `${solverName} · +${currentValue} points` : `+${currentValue} points` });
    } else {
      setScores(scores.map((team) => team.id === claimedBy ? { ...team, score: Math.max(0, team.score - 1) } : team));
      setWrongCount(wrongCount + 1);
      setCombo(0);
      setMissPop(Date.now());
      setShake(Date.now());
      rejectedRef.current = assembled;
      if (sound) playWrong();
      const nextStreak = wrongStreak + 1;
      setWrongStreak(nextStreak);
      // Three misses in a row on the same word -- reveal it and move on
      // rather than leaving the player stuck.
      if (nextStreak >= 3) { setResolved({ correct: false, revealed: true, award: 0 }); return; }
      if (mode === 'teams') { setClaimedBy(null); setPlaced([]); rejectedRef.current = null; }
    }
  };
  const reveal = () => { setRevealCount(revealCount + 1); setCombo(0); setResolved({ correct: false, revealed: true, award: 0 }); };
  // Only ever called at Strong Faith and above. It counts as a miss, the
  // way Time Attack has always treated a spent clock.
  const ranOut = () => {
    if (!entry || resolved) return;
    setWrongCount(wrongCount + 1);
    setCombo(0);
    setMissPop(Date.now());
    if (sound) playWrong();
    setResolved({ correct: false, revealed: true, award: 0 });
  };
  // Auto-check: the final tile is the commit. A quarter-second beat first,
  // so the player sees the word finished before it is judged -- and so
  // reaching for a button never costs seconds under a timer.
  useEffect(() => {
    if (!puzzle || resolved) return;
    if (placed.length !== puzzle.scramble.length) return;
    if (placed.map((source) => puzzle.scramble[source]).join('') === rejectedRef.current) return;
    const timer = window.setTimeout(check, 250);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placed, resolved, puzzle]);
  // The clock. Levels 1-4 never start one; 5 and 6 run one that costs
  // nothing when it empties; 7 and above count an empty clock as a miss.
  useEffect(() => {
    if (!puzzle || resolved || finished || timerMode === 'none' || timeLeft <= 0) return;
    const timer = window.setTimeout(() => setTimeLeft((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [timeLeft, resolved, finished, puzzle, timerMode]);
  // Separated from the tick above so neither has to resolve a word inline:
  // doing that inside an effect cascades a render before the first paints.
  useEffect(() => {
    if (!puzzle || resolved || finished || timerMode !== 'enforced' || timeLeft > 0) return;
    const strike = window.setTimeout(ranOut, 0);
    return () => window.clearTimeout(strike);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, resolved, finished, puzzle, timerMode]);
  // A level with no approved words in the chosen categories builds a match
  // with no puzzles. Rendering nothing left only the header on screen, with
  // no way back.
  if (!entry || !puzzle) return <main className="page-shell"><section className="panel results-panel">
    <div className="celebration">🔒</div>
    <p className="section-kicker">Nothing to play here</p>
    <h1 className="page-title">This level is empty</h1>
    <p className="page-subtitle">{unplayableReason(settings) ?? 'That match could not be built. Choose a different level or word set.'}</p>
    <div className="result-actions">
      <button className="primary-button" type="button" onClick={onChangeSet}>Change set</button>
      <button className="text-button" type="button" onClick={onHome}>Home</button>
    </div>
  </section></main>;
  const shuffleTray = () => { playTap(); setOrder(shuffledOrder(puzzle.scramble.length)); };
  const undo = () => { if (placed.length === 0) return; playTap(); rejectedRef.current = null; setPlaced(placed.slice(0, -1)); };
  const rematch = () => { finishedRef.current = false; const fresh = createFreshRecipe(settings); setRecipe(fresh); setTimeLeft(secondsForPuzzle(fresh, 0)); setIndex(0); setScores(scores.map((team) => ({ ...team, score: 0 }))); setCorrectCount(0); setWrongCount(0); setRevealCount(0); setFinished(false); resetPuzzle(); setSolvedIds([]); setCombo(0); setSummary(null); setUnlocked(null); };
  if (finished) return <Results mode={mode} scores={scores} correct={correctCount} wrong={wrongCount} total={recipe.puzzles.length} summary={summary} unlocked={unlocked} rematch={rematch} changeSet={onChangeSet} home={onHome} />;
  return <main className="game-shell">
    {celebration && <BigCelebration key={celebration.id} title={celebration.title} subtitle={celebration.subtitle} />}
    {missPop !== null && <MissPopup key={missPop} />}
    <div className="game-topbar"><div><span>Puzzle {index + 1} of {recipe.puzzles.length}</span><div className="progress"><i style={{ width: `${((index + 1) / recipe.puzzles.length) * 100}%` }} /></div></div><div className="score-strip">{scores.map((team) => <span key={team.id}><i style={{ background: team.color }} />{team.name} <strong key={team.score}>{team.score}</strong></span>)}</div></div>
    {mode === 'teams' && !resolved && <div className="claim-panel"><p>{claimedBy ? <><strong>{scores.find((team) => team.id === claimedBy)?.name}</strong> is building</> : 'Who knows it? Claim the puzzle.'}</p><div>{scores.map((team) => <button type="button" key={team.id} disabled={Boolean(claimedBy)} style={{ '--team-color': team.color } as React.CSSProperties} onClick={() => setClaimedBy(team.id)}>{claimedBy === team.id ? 'Building…' : `Claim · ${team.name}`}</button>)}{claimedBy && <button type="button" className="release" onClick={() => { setClaimedBy(null); setPlaced([]); }}>Release</button>}</div></div>}
    <section className="puzzle-card play-card"><div className="card-top"><div><p className="puzzle-kicker">{entry.categories[0]} · {LEVEL_NAMES[entry.band - 1]}</p><h1>{resolved ? entry.display : 'Unscramble the answer'}</h1></div><div className="card-pills">{timerMode !== 'none' && <span className={`points-pill timer-pill ${timerMode === 'enforced' && timeLeft <= Math.ceil(secondsTotal * 0.3) ? 'urgent' : ''} ${timerMode === 'bonus' ? 'bonus' : ''}`}>{timeLeft > 0 ? `${timeLeft}s` : timerMode === 'bonus' ? 'bonus gone' : '0s'}</span>}<span className="points-pill">{currentValue} pts</span></div></div>
      {timerMode === 'bonus' && !metLevelBefore && !resolved && <p className="notice">A clock from here on — but running out costs you nothing. Beat it and it pays a speed bonus.</p>}
      <TileBoard scramble={puzzle.scramble} placed={placed} setPlaced={setPlaced} order={order ?? undefined} shakeKey={shake ?? undefined} locked={Boolean(resolved) || (mode === 'teams' && !claimedBy)} />
      {hints > 0 && !resolved && <div className="hint-box"><span className="hint-icon" aria-hidden="true">💡</span><div className="hint-lines">{ladder.slice(0, hints).map((hint) => <p key={hint.kind}>{hint.text}</p>)}</div></div>}
      {resolved ? <Resolution lead={resolved.revealed ? 'The answer was' : 'Beautiful work!'} word={entry.display} reference={entry.references[0]} award={resolved.award ? `+${resolved.award} points` : 'No points this time'}><button type="button" className="primary-button" onClick={next}>{index === recipe.puzzles.length - 1 ? 'See results' : 'Next puzzle'}</button></Resolution>
      : <div className="game-actions"><button type="button" className="soft-button" onClick={shuffleTray}>↻ Shuffle</button><button type="button" className="soft-button" disabled={placed.length === 0} onClick={undo}>↩ Undo</button><button type="button" className="soft-button" disabled={placed.length === 0} onClick={() => { rejectedRef.current = null; setPlaced([]); }}>✕ Clear</button><button type="button" className="soft-button" disabled={!nextHint} onClick={takeHint}>{nextHint ? `✦ Hint · ${HINT_LABELS[nextHint.kind]}` : '✦ Hints used'}</button><button type="button" className="text-button" onClick={reveal}>Reveal & continue</button></div>}
      <button type="button" className="quit-button" onClick={onHome}>End match</button>
    </section></main>;
}

/** How long puzzle `index` of a match is worth. A flat per-level limit is
 * what made Deuteronomy in fourteen seconds impossible; the clock has to
 * track how much there is to read. Zero means no clock at all. */
function secondsForPuzzle(recipe: MatchRecipe, index: number): number {
  const puzzle = recipe.puzzles[index];
  const entry = getPuzzleEntry(recipe, index);
  return puzzle && entry ? secondsFor(entry.band, puzzle.scramble.length) : 0;
}

const HIGH_SCORE_KEY = 'wordin-timeattack-highscore';

function getHighScore(): number {
  if (typeof window === 'undefined') return 0;
  try { return Number(localStorage.getItem(HIGH_SCORE_KEY)) || 0; } catch { return 0; }
}
function saveHighScore(value: number) {
  try { localStorage.setItem(HIGH_SCORE_KEY, String(value)); } catch { /* storage can be blocked */ }
}

/** The solve moment, shared by every mode. Three staged beats inside
 * 700ms -- the word settling, then the citation, then the award -- rather
 * than three simultaneous fades. The citation is the point of the game and
 * gets its own plaque; the award is a mechanic and sits below it, never
 * joined to it by a middle dot. */
function Resolution({ lead, word, reference, award, children }: { lead: string; word: string; reference?: string; award: string; children?: React.ReactNode }) {
  return <div className="resolution">
    <span className="resolution-lead">{lead}</span>
    <strong className="resolution-word">{word}</strong>
    <i className="resolution-rule" aria-hidden="true" />
    {reference && <p className="scripture"><span className="scripture-mark" aria-hidden="true">✦</span><cite className="scripture-cite">{reference}</cite></p>}
    <p className="resolution-award">{award}</p>
    {children}
  </div>;
}

function BigCelebration({ title, subtitle }: { title: string; subtitle: string }) {
  return <div className="big-celebration" role="status" aria-live="assertive">
    <Confetti count={40} />
    <div className="big-celebration-bubble"><strong>{title}</strong><span>{subtitle}</span></div>
  </div>;
}

/** Center-screen pop for a wrong answer -- appears, sits briefly, vanishes.
 * No confetti, no full-page wash; a lighter, quicker beat than a win. */
function MissPopup() {
  return <div className="miss-popup" role="status" aria-live="assertive">
    <div className="miss-popup-bubble"><span className="miss-emoji" aria-hidden="true">😬</span><strong>Oh no!</strong><span>Try again</span></div>
  </div>;
}

function TimeAttackGame({ categories, sound, onHome }: { categories: Category[]; sound: boolean; onHome: () => void }) {
  // Start where the player is -- but a level with no approved words in the
  // chosen categories would open on an empty board, so slide to the nearest
  // level that has some.
  const startLevel = useMemo(() => playableLevelFrom(highestUnlocked(getProgressSnapshot()), categories) ?? 1, [categories]);
  const [band, setBand] = useState<Level>(startLevel);
  const [queue, setQueue] = useState<PuzzleRecipe[]>(() => buildLevelQueue(startLevel, categories));
  const [placed, setPlaced] = useState<number[]>([]);
  const [order, setOrder] = useState<number[] | null>(null);
  const [score, setScore] = useState(0);
  const [solved, setSolved] = useState(0);
  const [strikes, setStrikes] = useState(0);
  const [timeLeft, setTimeLeft] = useState<number>(() => secondsFor(startLevel, queue[0]?.scramble.length ?? 0));
  const [resolved, setResolved] = useState<{ correct: boolean; gained: number } | null>(null);
  const [combo, setCombo] = useState(0);
  const [finished, setFinished] = useState<'strikes' | 'cleared' | null>(null);
  const [celebration, setCelebration] = useState<{ id: number; title: string; subtitle: string } | null>(null);
  // Read once at mount. Held in state rather than a ref because the
  // results screen renders it, and a ref must not be read during render.
  const [personalBest] = useState(getHighScore);
  const milestoneRef = useRef(0);
  const beatBestRef = useRef(false);
  const savedRef = useRef(false);

  useEffect(() => { duckMusic(true); return () => duckMusic(false); }, []);

  const puzzle = queue[0];
  const entry = puzzle ? getEntryById(puzzle.entryId) : undefined;

  function checkMilestones(newScore: number) {
    if (newScore > personalBest && !beatBestRef.current) {
      beatBestRef.current = true;
      setCelebration({ id: Date.now(), title: 'New High Score!', subtitle: `${newScore} points` });
      return;
    }
    const bracket = Math.floor(newScore / 100);
    if (bracket > milestoneRef.current) {
      milestoneRef.current = bracket;
      setCelebration({ id: Date.now(), title: 'Well done!', subtitle: `${bracket * 100} points` });
    }
  }

  function resolveWord(correct: boolean) {
    if (!puzzle) return;
    if (correct) {
      // The same award solo and online use, with the clock supplying the
      // speed bonus. A flat 5 ignored both word length and the level
      // multiplier -- in the one mode where the level matters most.
      const gained = scoreSolve({
        letterCount: puzzle.scramble.length,
        level: band,
        combo,
        hintsUsed: 0,
        secondsLeft: timerModeFor(band) === 'none' ? undefined : timeLeft,
        secondsTotal: timerModeFor(band) === 'none' ? undefined : secondsFor(band, puzzle.scramble.length),
      });
      const newScore = score + gained;
      setScore(newScore);
      setSolved((value) => value + 1);
      setStrikes(0);
      setCombo(combo + 1);
      setResolved({ correct: true, gained });
      if (sound) playCorrect();
      checkMilestones(newScore);
    } else {
      const nextStrikes = strikes + 1;
      setStrikes(nextStrikes);
      setCombo(0);
      setResolved({ correct: false, gained: 0 });
      if (sound) playWrong();
      if (nextStrikes >= 3) setFinished('strikes');
    }
  }

  function advance() {
    if (finished) return;
    const remaining = queue.slice(1);
    if (remaining.length > 0) {
      setQueue(remaining);
      setPlaced([]);
      setOrder(null);
      setResolved(null);
      setTimeLeft(secondsFor(band, remaining[0].scramble.length));
      return;
    }
    // Skip past any level the chosen categories have no words at -- there
    // is no Bible book at Eternity, and stepping into it blanked the run.
    const nextBand = nextPlayableLevelAbove(band, categories);
    if (nextBand) {
      const nextQueue = buildLevelQueue(nextBand, categories);
      setBand(nextBand);
      setQueue(nextQueue);
      setPlaced([]);
      setOrder(null);
      setResolved(null);
      setStrikes(0);
      setTimeLeft(secondsFor(nextBand, nextQueue[0]?.scramble.length ?? 0));
      showToast(`Leveling up: ${LEVEL_NAMES[nextBand - 1]}!`);
      return;
    }
    setFinished('cleared');
  }


  // Per-word countdown, sized to the word. Below Reaching Out there is no
  // clock at all and a run ends on strikes alone.
  useEffect(() => {
    if (resolved || finished || !entry || timerModeFor(band) === 'none' || timeLeft <= 0) return;
    const timer = window.setTimeout(() => setTimeLeft((value: number) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [timeLeft, resolved, finished, entry, band]);

  // A spent clock is a miss only once it is enforced. At Reaching Out and
  // Maturity it costs the speed bonus and nothing else. The miss is
  // scheduled rather than run inline: resolving a word sets four pieces of
  // state, and doing that synchronously inside an effect cascades a second
  // render before the first has painted.
  useEffect(() => {
    if (resolved || finished || !entry || timerModeFor(band) !== 'enforced' || timeLeft > 0) return;
    const strike = window.setTimeout(() => resolveWord(false), 0);
    return () => window.clearTimeout(strike);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, resolved, finished, entry, band]);

  // Auto-advance shortly after each word resolves -- an arcade mode keeps moving.
  useEffect(() => {
    if (!resolved) return;
    const timer = window.setTimeout(advance, 1100);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved]);

  useEffect(() => {
    if (!celebration) return;
    const timer = window.setTimeout(() => setCelebration(null), 1600);
    return () => window.clearTimeout(timer);
  }, [celebration]);

  // Auto-check: the final tile is the commit. Reaching for a button cost
  // real seconds in the one mode that charges for them.
  useEffect(() => {
    if (resolved || finished || !entry || !puzzle) return;
    if (placed.length !== puzzle.scramble.length) return;
    const timer = window.setTimeout(() => {
      resolveWord(normalizeAnswer(placed.map((source) => puzzle.scramble[source]).join('')) === entry.answer);
    }, 250);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placed, resolved, finished, entry, puzzle]);

  useEffect(() => {
    if (finished && !savedRef.current) {
      savedRef.current = true;
      if (score > personalBest) saveHighScore(score);
    }
  }, [finished, score, personalBest]);

  if (!entry || !puzzle) return <main className="page-shell"><section className="panel results-panel">
    <div className="celebration">🔒</div>
    <p className="section-kicker">Time Attack</p>
    <h1 className="page-title">No words to race</h1>
    <p className="page-subtitle">{unplayableReason({ categories, maxBand: band, length: 1 }) ?? 'Choose a different word set to start a run.'}</p>
    <div className="result-actions"><button className="primary-button" type="button" onClick={onHome}>Home</button></div>
  </section></main>;

  if (finished) {
    const best = Math.max(score, personalBest);
    return <main className="page-shell"><section className="panel results-panel">
      {score >= personalBest && score > 0 && <Confetti key="final" />}
      <div className="celebration">{finished === 'cleared' ? '🏆' : '⏱️'}</div>
      <p className="section-kicker">Time Attack</p>
      <h1 className="page-title">{finished === 'cleared' ? 'Perfect clear!' : 'Run over'}</h1>
      <p className="page-subtitle">{finished === 'cleared' ? 'You cleared every word, every band. That has genuinely never happened before on this device.' : 'Three misses in a row ends the run -- that’s the game.'}</p>
      <div className="result-score"><strong>{score}</strong><span>points</span></div>
      <div className="stat-grid">
        <div><strong>{solved}</strong><span>Solved</span></div>
        <div><strong>{LEVEL_NAMES[band - 1]}</strong><span>Reached</span></div>
        <div><strong>{best}</strong><span>Best score</span></div>
      </div>
      <div className="result-actions">
        <button className="primary-button" type="button" onClick={() => window.location.reload()}>Play again</button>
        <button className="text-button" type="button" onClick={onHome}>Home</button>
      </div>
    </section></main>;
  }

  const timerMode = timerModeFor(band);
  const timeLimit = secondsFor(band, puzzle.scramble.length);
  const urgent = timerMode === 'enforced' && timeLeft <= Math.ceil(timeLimit * 0.3);
  return <main className="game-shell">
    {celebration && <BigCelebration key={celebration.id} title={celebration.title} subtitle={celebration.subtitle} />}
    <div className="game-topbar">
      <div><span>{LEVEL_NAMES[band - 1]} · {solved} solved</span><div className="progress"><i style={{ width: `${timerMode === 'none' ? 100 : (timeLeft / Math.max(1, timeLimit)) * 100}%`, background: urgent ? 'var(--danger)' : undefined }} /></div></div>
      <div className="score-strip"><span>Score <strong key={score}>{score}</strong></span><span>{'❤️'.repeat(3 - strikes)}{'🖤'.repeat(strikes)}</span></div>
    </div>
    <section className="puzzle-card play-card">
      <div className="card-top"><div><p className="puzzle-kicker">{entry.categories[0]} · {LEVEL_NAMES[entry.band - 1]}</p><h1>{resolved ? entry.display : 'Unscramble the answer'}</h1></div><span className={`points-pill timer-pill ${urgent ? 'urgent' : ''} ${timerMode === 'bonus' ? 'bonus' : ''}`}>{timerMode === 'none' ? `${queue.length} left` : timeLeft > 0 ? `${timeLeft}s` : timerMode === 'bonus' ? 'bonus gone' : '0s'}</span></div>
      <TileBoard scramble={puzzle.scramble} placed={placed} setPlaced={setPlaced} order={order ?? undefined} locked={Boolean(resolved)} />
      {resolved && <Resolution lead={resolved.correct ? 'Solved it' : 'Missed it'} word={entry.display} reference={entry.references[0]} award={resolved.correct ? `+${resolved.gained} points` : 'No points'} />}
      {!resolved && <div className="game-actions"><button type="button" className="soft-button" onClick={() => { playTap(); setOrder(shuffledOrder(puzzle.scramble.length)); }}>↻ Shuffle</button><button type="button" className="soft-button" disabled={placed.length === 0} onClick={() => { playTap(); setPlaced(placed.slice(0, -1)); }}>↩ Undo</button><button type="button" className="soft-button" disabled={placed.length === 0} onClick={() => setPlaced([])}>✕ Clear</button></div>}
    </section>
    <button type="button" className="quit-button" onClick={onHome}>End run</button>
  </main>;
}

function Results({ mode, scores, correct, wrong, total, summary, unlocked, rematch, changeSet, home }: {
  mode: PlayMode; scores: Team[]; correct: number; wrong: number; total: number;
  summary: { points: number; isBest: boolean; previousBest: number; lifetime: number; mastered: number } | null;
  unlocked: { level: Level; name: string } | null;
  rematch: () => void; changeSet: () => void; home: () => void;
}) {
  const ranking = [...scores].sort((a, b) => b.score - a.score); const winner = ranking[0];
  return <main className="page-shell"><section className="panel results-panel"><div className="celebration">✦</div><p className="section-kicker">Match complete</p><h1 className="page-title">{mode === 'teams' ? `${winner.name} wins!` : mode === 'solo' ? 'Nicely done!' : 'Wonderful teamwork!'}</h1><p className="page-subtitle">You turned every scramble into a chance to remember.</p>
    {unlocked && <div className="unlock-banner" role="status">
      <span className="unlock-key" aria-hidden="true">🔓</span>
      <strong>{unlocked.name} unlocked</strong>
      <small>A new level is open on your journey.</small>
    </div>}
    <div className="result-score"><strong>{winner.score}</strong><span>points</span></div>
    {summary && <div className="score-compare">
      {summary.isBest
        ? <p className="best-flag">Your best yet at this level — previous best {summary.previousBest}</p>
        : <p className="best-flag quiet">Your best at this level is {summary.previousBest}</p>}
      <div className="lifetime-row">
        <span><strong>{summary.lifetime.toLocaleString()}</strong>Points all time</span>
        <span><strong>{summary.mastered}</strong>Words mastered</span>
      </div>
    </div>}
    {mode === 'teams' && <div className="leaderboard">{ranking.map((team, index) => <div key={team.id}><span>{index + 1}</span><i style={{ background: team.color }} /><strong>{team.name}</strong><b>{team.score}</b></div>)}</div>}
    <div className="stat-grid"><div><strong>{correct}</strong><span>Solved</span></div><div><strong>{wrong}</strong><span>Wrong checks</span></div><div><strong>{Math.round((correct / total) * 100)}%</strong><span>Completion</span></div></div>
    <div className="result-actions"><button className="primary-button" type="button" onClick={rematch}>Play again <span>↻</span></button><button className="secondary-button" type="button" onClick={changeSet}>Change set</button><button className="text-button" type="button" onClick={home}>Home</button></div>
  </section></main>;
}

function OnlineEntry({ onBack, onConnected, initialCode }: { onBack: () => void; onConnected: (credentials: Credentials) => void; initialCode: string }) {
  const [kind, setKind] = useState<'create' | 'join'>(initialCode ? 'join' : 'create'); const [name, setName] = useState(''); const [code, setCode] = useState(initialCode); const [busy, setBusy] = useState(false);
  const submit = async () => { setBusy(true); try { const response = await fetch(kind === 'create' ? '/api/rooms' : `/api/rooms/${code}/join`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(kind === 'create' ? { name, settings: DEFAULT_SETTINGS, mode: 'individuals' } : { name }) }); const data = await response.json() as Credentials & { error?: string }; if (!response.ok) throw new Error(data.error || 'Could not connect.'); onConnected(data); } catch (caught) { showToast(caught instanceof Error ? caught.message : 'Could not connect.', 'error'); } finally { setBusy(false); } };
  return <main className="page-shell"><section className="panel online-entry"><button className="back-button" type="button" onClick={onBack}>← Back</button><p className="section-kicker">Different devices, one game</p><h1 className="page-title">Online room</h1><p className="page-subtitle">The host creates a private six-character code. Everyone else joins from their own device.</p>
    <div className="tabs"><button type="button" className={kind === 'create' ? 'active' : ''} onClick={() => setKind('create')}>Create room</button><button type="button" className={kind === 'join' ? 'active' : ''} onClick={() => setKind('join')}>Join room</button></div>
    <div className="form-stack"><label>Display name<input value={name} maxLength={24} autoComplete="name" placeholder="Your name" onChange={(event) => setName(event.target.value)} /></label>{kind === 'join' && <label>Room code<input className="code-input" value={code} maxLength={6} placeholder="A7K4PQ" autoCapitalize="characters" onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ''))} /></label>}<button type="button" disabled={busy} className="primary-button full-button" onClick={submit}>{busy ? 'Connecting…' : kind === 'create' ? 'Create private room' : 'Join room'}</button></div>
    <div className="privacy-note"><span>⌁</span><p><strong>No account needed.</strong> Room data expires after two hours of inactivity.</p></div>
  </section></main>;
}

function OnlineRoom({ credentials, leave, sound }: { credentials: Credentials; leave: () => void; sound: boolean }) {
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [placed, setPlaced] = useState<number[]>([]); const [order, setOrder] = useState<number[] | null>(null);
  const previousStatus = useRef<RoomSnapshot['status'] | null>(null);
  // `action` below reaches into `socketRef` to decide whether to send over
  // the wire or fall back to the REST endpoint the D1-era room used
  // exclusively. `busyTimer` is a safety net: a socket send has no matching
  // reply to await, so without it a request the server silently dropped
  // would leave `busy` -- and so the board -- locked forever.
  const socketRef = useRef<WebSocket | null>(null);
  const busyTimer = useRef<number | null>(null);
  const applySnapshot = useCallback((data: RoomSnapshot) => {
    setSnapshot((previous) => { if (previous?.currentIndex !== data.currentIndex || previous?.status !== data.status) { setPlaced([]); setOrder(null); } return data; });
  }, []);
  // One effect owns the whole connection lifecycle: dial the socket, retry
  // once with backoff on a close, and fall back to the 1.8-second REST poll
  // this replaced once the socket has failed to open twice -- a phone on a
  // hostile network must still be able to play. Everything it needs is
  // either a dependency below or declared inside it on purpose: splitting
  // it into several `useCallback`s would give three functions that only
  // ever make sense called in this one order.
  useEffect(() => {
    let cancelled = false;
    let socket: WebSocket | null = null;
    let pollTimer: number | null = null;
    let reconnectTimer: number | null = null;
    let openFailures = 0;

    const loadOnce = async () => {
      try {
        const response = await fetch(`/api/rooms/${credentials.code}?playerId=${credentials.playerId}`, { headers: { 'x-room-token': credentials.token } });
        const data = await response.json() as RoomSnapshot & { error?: string };
        if (!response.ok) throw new Error(data.error || 'Could not update the room.');
        if (cancelled) return;
        applySnapshot(data); setError('');
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'Reconnecting…');
      }
    };

    const stopPolling = () => { if (pollTimer !== null) { window.clearInterval(pollTimer); pollTimer = null; } };

    // The permanent fallback once the socket has given up -- same shape as
    // the interval this replaced, right down to only polling while the tab
    // is actually visible.
    const startPolling = () => {
      if (pollTimer !== null || cancelled) return;
      setError((current) => current || 'Reconnecting…');
      void loadOnce();
      pollTimer = window.setInterval(() => { if (document.visibilityState === 'visible') void loadOnce(); }, 1800);
    };

    const connectSocket = () => {
      if (cancelled) return;
      const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${scheme}://${window.location.host}/api/rooms/${credentials.code}/socket?playerId=${encodeURIComponent(credentials.playerId)}&token=${encodeURIComponent(credentials.token)}`);
      socket = ws; socketRef.current = ws;
      ws.onopen = () => { openFailures = 0; stopPolling(); setError(''); };
      ws.onmessage = (event) => {
        if (busyTimer.current !== null) { window.clearTimeout(busyTimer.current); busyTimer.current = null; }
        setBusy(false);
        try {
          const payload = JSON.parse(String(event.data)) as { type: string; snapshot?: RoomSnapshot; message?: string };
          if (payload.type === 'snapshot' && payload.snapshot) { applySnapshot(payload.snapshot); setError(''); }
          else if (payload.type === 'error' && payload.message) showToast(payload.message, 'error');
        } catch { /* not a frame this client understands -- ignore it */ }
      };
      ws.onclose = () => {
        if (cancelled) return;
        socket = null; socketRef.current = null;
        openFailures += 1;
        // Two failed opens and the socket stops trying -- REST, not a third
        // attempt, is what a hostile network gets from here on.
        if (openFailures >= 2) { startPolling(); return; }
        setError('Reconnecting…');
        reconnectTimer = window.setTimeout(connectSocket, 1500);
      };
      ws.onerror = () => ws.close();
    };

    void loadOnce();
    connectSocket();

    return () => {
      cancelled = true;
      stopPolling();
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      if (busyTimer.current !== null) { window.clearTimeout(busyTimer.current); busyTimer.current = null; }
      socket?.close();
      socketRef.current = null;
    };
  }, [credentials.code, credentials.playerId, credentials.token, applySnapshot]);
  useEffect(() => { duckMusic(true); return () => duckMusic(false); }, []);
  useEffect(() => {
    if (sound && snapshot?.status === 'PUZZLE_RESOLVED' && previousStatus.current !== 'PUZZLE_RESOLVED') {
      const solved = snapshot.resolution?.solvers.some((solver) => solver.solverId === snapshot.viewerId);
      if (solved) playCorrect(); else if (snapshot.resolution?.revealed) playWrong();
    }
    previousStatus.current = snapshot?.status ?? null;
  }, [snapshot?.status, snapshot?.resolution, snapshot?.viewerId, sound]);
  const action = async (input: Record<string, unknown>) => {
    setBusy(true); setError('');
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      // No request/response pairing over the socket -- the server answers
      // with a broadcast snapshot (or an error frame), which is what clears
      // `busy` in `ws.onmessage` above. `busyTimer` there is the guard
      // against one that never arrives.
      try {
        socket.send(JSON.stringify({ ...input, playerId: credentials.playerId }));
      } catch {
        setBusy(false); setError('That action did not go through.');
        return;
      }
      if (busyTimer.current !== null) window.clearTimeout(busyTimer.current);
      busyTimer.current = window.setTimeout(() => setBusy(false), 6000);
      return;
    }
    // REST fallback: the moment before the socket first opens, and
    // permanently once it has failed to open twice.
    try {
      const response = await fetch(`/api/rooms/${credentials.code}/action`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-room-token': credentials.token }, body: JSON.stringify({ ...input, playerId: credentials.playerId }) });
      const data = await response.json() as RoomSnapshot & { error?: string };
      if (!response.ok) throw new Error(data.error || 'That action did not work.');
      applySnapshot(data);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'That action did not work.';
      setError(message); showToast(message, 'error');
    } finally {
      setBusy(false);
    }
  };
  // Auto-check once the last tile lands, so a room plays the same way solo
  // and the Daily Word do. The ref holds the exact answer already sent, which
  // stops the effect resubmitting while the request is in flight and stops it
  // re-sending a rejected answer the player has not changed yet.
  const actionRef = useRef(action);
  useEffect(() => { actionRef.current = action; });
  const submittedRef = useRef<string | null>(null);
  const openScramble = snapshot?.status === 'PUZZLE_OPEN' ? snapshot.puzzle?.scramble ?? null : null;
  const pendingAnswer = openScramble && placed.length === openScramble.length
    ? placed.map((source) => openScramble[source]).join('')
    : null;
  useEffect(() => {
    if (!pendingAnswer || busy) return;
    if (submittedRef.current === pendingAnswer) return;
    submittedRef.current = pendingAnswer;
    const timer = window.setTimeout(() => { void actionRef.current({ action: 'check', answer: pendingAnswer }); }, 250);
    return () => window.clearTimeout(timer);
  }, [pendingAnswer, busy]);
  useEffect(() => { submittedRef.current = null; }, [snapshot?.currentIndex, snapshot?.status]);
  if (!snapshot) return <main className="page-shell"><section className="panel loading-panel"><span className="loader" /><h1>Opening room {credentials.code}</h1><p>{error || 'Gathering everyone…'}</p><button type="button" className="text-button" onClick={leave}>Leave</button></section></main>;
  const viewer = snapshot.players.find((player) => player.id === credentials.playerId); const isHost = Boolean(viewer?.isHost);
  if (snapshot.status === 'LOBBY') return <OnlineLobby key={snapshot.version} snapshot={snapshot} viewer={viewer} isHost={isHost} busy={busy} action={action} leave={leave} />;
  if (snapshot.status === 'RESULTS') return <OnlineResults snapshot={snapshot} isHost={isHost} action={action} leave={leave} />;
  const puzzle = snapshot.puzzle;
  // Every host control -- Next puzzle, Host reveal, Leave room -- lives
  // inside the board below, so rendering nothing wedged the whole room
  // until its two-hour TTL. The server refuses to start an empty match
  // now; this is the way out if one ever exists.
  if (!puzzle) return <main className="page-shell"><section className="panel results-panel">
    <div className="celebration">🔒</div>
    <p className="section-kicker">Room {snapshot.code}</p>
    <h1 className="page-title">This match has no puzzles</h1>
    <p className="page-subtitle">{unplayableReason(snapshot.settings) ?? 'The match could not be built. Head back to the lobby and pick another level or word set.'}</p>
    <div className="result-actions">
      {isHost && <button className="primary-button" type="button" disabled={busy} onClick={() => action({ action: 'lobby' })}>Back to lobby</button>}
      <button className="text-button" type="button" onClick={leave}>Leave room</button>
    </div>
  </section></main>;
  // Teams mode still gets a small aggregate strip -- at most four sides,
  // never a scale problem -- above the ranked, per-player Standings below.
  const teamScores = snapshot.mode === 'teams' ? ([['sun', 'Sun Team'], ['olive', 'Olive Team']] as const).map(([id, name]) => ({ id, name, score: snapshot.players.filter((player) => player.teamId === id).reduce((sum, player) => sum + player.score, 0) })) : [];
  // Past the player cap a joiner comes in watching rather than playing, and
  // anyone who joined mid-match sits out the puzzle that was already live
  // when they arrived -- both get a locked board and their own message
  // instead of the usual actions row.
  const spectating = viewer?.role === 'spectator';
  const sittingOut = Boolean(viewer?.sitOutCurrent) && snapshot.status === 'PUZZLE_OPEN';
  const solvers = snapshot.resolution?.solvers ?? [];
  // More than one person can now solve the same puzzle inside the scoring
  // window, so "resolved" no longer means "locked for everyone else" --
  // only this player's own solve, tracked here, locks their board while the
  // room keeps taking answers from whoever else is still typing.
  const viewerSolve = solvers.find((solver) => solver.solverId === snapshot.viewerId);
  const paused = Boolean(snapshot.resolution?.paused);
  const boardLocked = snapshot.status !== 'PUZZLE_OPEN' || busy || spectating || sittingOut || paused || Boolean(viewerSolve);
  const lead = solvers.length === 0 ? 'The answer was'
    : solvers.length === 1 ? `${solvers[0].solverName} solved it!`
    : `${solvers[0].solverName} and ${solvers.length - 1} other${solvers.length > 2 ? 's' : ''} solved it!`;
  const kick = (targetId: string) => { if (window.confirm('Remove this player from the room?')) void action({ action: 'kick', targetId }); };
  return <main className="game-shell"><div className="room-banner"><span>Room <strong>{snapshot.code}</strong></span><span>{error || '● Connected'}</span></div>
    {isHost && <div className="host-controls">
      {snapshot.status === 'PUZZLE_OPEN' && <button type="button" className="soft-button" disabled={busy} onClick={() => action({ action: paused ? 'resume' : 'pause' })}>{paused ? '▶ Resume' : '⏸ Pause'}</button>}
      {snapshot.status === 'PUZZLE_OPEN' && <button type="button" className="soft-button" disabled={busy} onClick={() => action({ action: 'skip' })}>⏭ Skip puzzle</button>}
      <button type="button" className="soft-button" disabled={busy} onClick={() => action({ action: 'end' })}>◼ End match</button>
    </div>}
    {paused && <p className="notice">The host paused this puzzle.</p>}
    <div className="game-topbar"><div><span>Puzzle {snapshot.currentIndex + 1} of {snapshot.puzzleCount}</span><div className="progress"><i style={{ width: `${((snapshot.currentIndex + 1) / snapshot.puzzleCount) * 100}%` }} /></div></div>{snapshot.mode === 'teams' && <div className="score-strip">{teamScores.map((side) => <span key={side.id}>{side.name} <strong key={side.score}>{side.score}</strong></span>)}</div>}</div>
    <Standings players={snapshot.players} viewerId={snapshot.viewerId} answeredIds={snapshot.resolution?.answeredIds ?? []} phase="play" isHost={isHost} onKick={kick} />
    <section className="puzzle-card play-card"><div className="card-top"><div><p className="puzzle-kicker">{puzzle.category} · {LEVEL_NAMES[puzzle.band - 1]}</p><h1>{snapshot.status === 'PUZZLE_RESOLVED' ? puzzle.display : 'Everyone is solving…'}</h1></div><span className="points-pill">{scoreSolve({ letterCount: puzzle.scramble.length, level: puzzle.band, combo: 0, hintsUsed: snapshot.viewerHints })} pts</span></div>
      <TileBoard scramble={puzzle.scramble} placed={placed} setPlaced={setPlaced} order={order ?? undefined} locked={boardLocked} />
      {snapshot.viewerHints > 0 && snapshot.status === 'PUZZLE_OPEN' && !spectating && !sittingOut && <div className="hint-box"><span className="hint-icon" aria-hidden="true">💡</span><div className="hint-lines">{puzzle.hints.slice(0, snapshot.viewerHints).map((hint) => <p key={hint.kind}>{hint.text}</p>)}</div></div>}
      {snapshot.status === 'PUZZLE_RESOLVED' ? <Resolution lead={lead} word={puzzle.display ?? ''} reference={puzzle.reference} award={viewerSolve ? `+${viewerSolve.award} points` : 'No points this time'}>{solvers.length > 0 && <Confetti key={snapshot.currentIndex} />}{isHost ? <button type="button" className="primary-button" onClick={() => action({ action: 'next' })}>Next puzzle</button> : <p>Waiting for the host…</p>}</Resolution>
      : spectating ? <p className="notice">You&rsquo;re watching this room.</p>
      : sittingOut ? <p className="notice">You&rsquo;ll join in on the next puzzle.</p>
      : viewerSolve ? <p className="notice">Nice! +{viewerSolve.award} points — waiting for the round to finish…</p>
      : paused ? null
      : <div className="game-actions"><button className="soft-button" type="button" onClick={() => { playTap(); setOrder(shuffledOrder(puzzle.scramble.length)); }}>↻ Shuffle</button><button className="soft-button" type="button" disabled={placed.length === 0} onClick={() => { playTap(); setPlaced(placed.slice(0, -1)); }}>↩ Undo</button><button className="soft-button" type="button" disabled={placed.length === 0} onClick={() => setPlaced([])}>✕ Clear</button><button className="soft-button" type="button" disabled={snapshot.viewerHints >= puzzle.hints.length || busy} onClick={() => action({ action: 'hint' })}>{puzzle.hints[snapshot.viewerHints] ? `✦ Hint · ${HINT_LABELS[puzzle.hints[snapshot.viewerHints].kind]}` : '✦ Hints used'}</button>{isHost && <button className="text-button" type="button" onClick={() => action({ action: 'reveal' })}>Host reveal</button>}</div>}
      <button type="button" className="quit-button" onClick={leave}>Leave room</button>
    </section></main>;
}

function OnlineLobby({ snapshot, viewer, isHost, busy, action, leave }: { snapshot: RoomSnapshot; viewer?: RoomPlayer; isHost: boolean; busy: boolean; action: (input: Record<string, unknown>) => void; leave: () => void }) {
  const [settings, setSettings] = useState(snapshot.settings); const [mode, setMode] = useState(snapshot.mode); const joinUrl = typeof window !== 'undefined' ? `${window.location.origin}?room=${snapshot.code}` : '';
  // The level picker is deliberately ungated, so a host can land on a
  // level their categories have no words at. Say so here rather than
  // letting them start a match nobody can play.
  const blocked = unplayableReason(settings);
  const copy = async () => { try { await navigator.clipboard.writeText(joinUrl); } catch { /* clipboard can be blocked */ } };
  const seatedCount = snapshot.players.filter((player) => player.role === 'player' && !player.left).length;
  const spectatorCount = snapshot.players.filter((player) => player.role === 'spectator' && !player.left).length;
  return <main className="page-shell"><section className="panel lobby-panel"><div className="lobby-heading"><div><p className="section-kicker">Private room</p><h1 className="room-code">{snapshot.code}</h1><p>Share this code with up to {MAX_ROOM_PLAYERS - 1} more players.</p></div><button type="button" className="secondary-button" onClick={copy}>Copy invite link</button></div>
    <div className="lobby-grid"><div><h2>Players <span>{seatedCount}/{MAX_ROOM_PLAYERS}{spectatorCount > 0 ? ` · ${spectatorCount} watching` : ''}</span></h2><div className="player-list">{snapshot.players.filter((player) => !player.left).map((player) => <div key={player.id}><span className="avatar">{player.name[0]?.toUpperCase()}</span><strong>{player.name}{player.id === viewer?.id ? ' (you)' : ''}</strong>{player.isHost && <small>Host</small>}{player.role === 'spectator' ? <em>Watching</em> : <em className={player.ready ? 'ready' : ''}>{player.ready ? 'Ready' : 'Not ready'}</em>}</div>)}</div>{!isHost && viewer?.role === 'player' && <button type="button" className="primary-button full-button" onClick={() => action({ action: 'ready', ready: !viewer?.ready })}>{viewer?.ready ? 'I’m not ready' : 'I’m ready'}</button>}</div>
      <div className="lobby-settings"><h2>Match setup</h2>{isHost ? <><div className="tabs compact three-tabs"><button className={mode === 'individuals' ? 'active' : ''} onClick={() => setMode('individuals')}>Individuals</button><button className={mode === 'teams' ? 'active' : ''} onClick={() => setMode('teams')}>Teams</button><button className={mode === 'cooperative' ? 'active' : ''} onClick={() => setMode('cooperative')}>Co-op</button></div>
        <fieldset><legend>Which level?</legend><div className="band-grid">
          {LEVEL_NAMES.map((name, index) => <button type="button" key={name}
            onClick={() => setSettings({ ...settings, maxBand: (index + 1) as Level })}
            className={`band-button ${settings.maxBand === index + 1 ? 'selected' : ''}`}>
            <small>Level {index + 1}</small><strong>{name}</strong>
          </button>)}
        </div></fieldset>
        <SettingsPanel settings={settings} setSettings={setSettings} /><button type="button" className="secondary-button full-button" onClick={() => action({ action: 'configure', settings, mode })}>Save settings</button><button type="button" disabled={busy || Boolean(blocked)} className="primary-button full-button" onClick={() => action({ action: 'start' })}>Start match</button></> : <div className="setting-summary"><p><strong>{snapshot.mode === 'individuals' ? 'Individuals' : snapshot.mode === 'teams' ? 'Teams' : 'Cooperative'}</strong></p><p>{snapshot.settings.categories.join(' + ')}</p><p>{LEVEL_NAMES[snapshot.settings.maxBand - 1]} · {snapshot.settings.length} puzzles</p></div>}</div></div>
    <button type="button" className="text-button leave-button" onClick={leave}>Leave room</button>
  </section></main>;
}

function OnlineResults({ snapshot, isHost, action, leave }: { snapshot: RoomSnapshot; isHost: boolean; action: (input: Record<string, unknown>) => void; leave: () => void }) {
  const sides = snapshot.mode === 'teams' ? ([['sun', 'Sun Team'], ['olive', 'Olive Team']] as const).map(([id, name]) => ({ id, name, score: snapshot.players.filter((player) => player.teamId === id).reduce((sum, player) => sum + player.score, 0) })) : snapshot.players.map((player) => ({ id: player.id, name: player.name, score: player.score }));
  const ranking = [...sides].sort((a, b) => b.score - a.score);
  return <main className="page-shell"><section className="panel results-panel"><div className="celebration">✦</div><p className="section-kicker">Room {snapshot.code} · Match complete</p><h1 className="page-title">{snapshot.mode === 'cooperative' ? 'Wonderful teamwork!' : `${ranking[0]?.name} wins!`}</h1>
    {snapshot.mode === 'teams'
      ? <div className="leaderboard">{ranking.map((side, index) => <div key={side.id}><span>{index + 1}</span><span className="avatar">{side.name[0]}</span><strong>{side.name}</strong><b>{side.score}</b></div>)}</div>
      : <Standings players={snapshot.players} viewerId={snapshot.viewerId} answeredIds={[]} phase="results" />}
    <div className="result-actions">{isHost && <><button className="primary-button" type="button" onClick={() => action({ action: 'rematch' })}>Play again <span>↻</span></button><button className="secondary-button" type="button" onClick={() => action({ action: 'lobby' })}>Change set</button></>}<button className="text-button" type="button" onClick={leave}>Leave room</button></div></section></main>;
}

export default function GatherWordApp() {
  const [screen, setScreen] = useState<Screen>('home'); const [entryMode, setEntryMode] = useState<EntryMode>('solo'); const [chosenSettings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS); const [togetherMode, setTogetherMode] = useState<PlayMode>('cooperative');
  // Home opens where the player actually is, the way Time Attack already
  // does. `useSyncExternalStore` keeps this hydration-safe: the server
  // snapshot is an empty record, so both first renders say level 1, and
  // the stored record arrives immediately after.
  const progress = useSyncExternalStore(subscribeProgress, getProgressSnapshot, getProgressServerSnapshot);
  const [pickedLevel, setPickedLevel] = useState<Level | null>(null);
  const level: Level = pickedLevel ?? highestUnlocked(progress);
  // Picking a level on the journey path is what a solo/together match
  // actually plays at -- the band picker used to live in SettingsPanel,
  // but the journey path replaced it. Deriving `maxBand` rather than
  // copying it means the two can never disagree.
  const settings = useMemo<GameSettings>(() => ({ ...chosenSettings, maxBand: level }), [chosenSettings, level]);
  const setLevel = (value: Level) => setPickedLevel(value);
  const [teams, setTeams] = useState<Team[]>([{ id: 'team-1', name: 'Sun Team', color: TEAM_COLORS[0], score: 0 }, { id: 'team-2', name: 'Olive Team', color: TEAM_COLORS[1], score: 0 }]); const [localGameKey, setLocalGameKey] = useState(0); const [localMode, setLocalMode] = useState<PlayMode | null>(null); const [credentials, setCredentials] = useState<Credentials | null>(null); const [sound, setSound] = useState(true);
  const initialCode = useMemo(() => typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('room')?.toUpperCase() || '', []);
  useEffect(() => { const timer = window.setTimeout(() => { const saved = sessionStorage.getItem('gatherword-room'); if (saved) { try { const value = JSON.parse(saved) as Credentials; setCredentials(value); setScreen('online-lobby'); } catch { sessionStorage.removeItem('gatherword-room'); } } else if (initialCode) { setEntryMode('online'); setScreen('online-entry'); } }, 0); return () => window.clearTimeout(timer); }, [initialCode]);
  // Browsers block audio before a user gesture, so the background music
  // starts on the first tap/click anywhere rather than on page load.
  useEffect(() => {
    if (!sound) return;
    const unlock = () => { startMusic(); window.removeEventListener('pointerdown', unlock); };
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, [sound]);
  useEffect(() => { if (!sound) stopMusic(); }, [sound]);
  // Progress lives only in this browser, and some browsers evict storage for
  // sites left unopened for a week -- which would cost a player their level
  // unlocks and lifetime points, not just a streak. Ask to be kept. The API
  // is missing on older browsers and may reject, so nothing depends on it.
  useEffect(() => {
    try { void navigator.storage?.persist?.(); } catch { /* not available; progress is still best-effort */ }
  }, []);
  const [timeAttackActive, setTimeAttackActive] = useState(false);
  const [dailyActive, setDailyActive] = useState(false);
  // Today's number and whether it is done drive the badge on the home tile.
  // Both are date-dependent, so they stay hidden until hydration rather
  // than rendering a server guess the client then contradicts.
  const hydrated = useHydrated();
  const [today] = useState(() => new Date());
  const dailyKey = useMemo(() => dailyPuzzleFor(today), [today]);
  const dailyDone = progress.daily?.day === dailyKey.dayKey;
  const home = () => { setLocalMode(null); setTimeAttackActive(false); setDailyActive(false); setScreen('home'); };
  // Takes the mode explicitly: a tile sets the mode and starts it in one
  // tap, and reading `entryMode` here would still see the previous value.
  const startEntry = (next?: EntryMode) => {
    const target = next ?? entryMode;
    if (target !== entryMode) setEntryMode(target);
    if (target === 'online') setScreen('online-entry');
    else if (target === 'timeattack') setTimeAttackActive(true);
    else if (target === 'daily') setDailyActive(true);
    else setScreen('setup');
  };
  const startLocal = () => { setLocalGameKey((value) => value + 1); setLocalMode(entryMode === 'solo' ? 'solo' : togetherMode); };
  const connect = (value: Credentials) => { setCredentials(value); sessionStorage.setItem('gatherword-room', JSON.stringify(value)); setScreen('online-lobby'); };
  const leave = () => { setCredentials(null); sessionStorage.removeItem('gatherword-room'); history.replaceState({}, '', window.location.pathname); setScreen('online-entry'); };
  return <div className="app"><Header onHome={home} sound={sound} setSound={setSound} />
    {dailyActive ? <DailyWord sound={sound} onHome={home} />
    : timeAttackActive ? <TimeAttackGame key={localGameKey} categories={settings.categories} sound={sound} onHome={home} />
    : localMode ? <LocalGame key={localGameKey} mode={localMode} settings={settings} teams={teams} sound={sound} onHome={home} onChangeSet={() => { setLocalMode(null); setScreen('setup'); }} />
    : screen === 'home' ? <HomeScreen startAs={startEntry} level={level} setLevel={setLevel} blocked={unplayableReason(settings)} dailyNumber={hydrated ? dailyKey.number : null} dailyDone={dailyDone} />
    : screen === 'setup' ? <SetupScreen entryMode={entryMode} settings={settings} setSettings={setSettings} togetherMode={togetherMode} setTogetherMode={setTogetherMode} teams={teams} setTeams={setTeams} start={startLocal} back={home} />
    : screen === 'online-entry' ? <OnlineEntry onBack={home} onConnected={connect} initialCode={initialCode} />
    : credentials ? <OnlineRoom credentials={credentials} leave={leave} sound={sound} /> : null}
    <footer><span>WordIn</span><span>© 2026 SolomonAgyire</span></footer>
    <ToastHost />
  </div>;
}
