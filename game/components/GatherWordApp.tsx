'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildLevelQueue, createFreshRecipe, eligibleWords, getEntryById, getPuzzleEntry, normalizeAnswer } from '@/lib/game-engine';
import { duckMusic, playCorrect, playTap, playWrong, startMusic, stopMusic } from '@/lib/audio';
import { showToast, subscribeToasts, type Toast } from '@/lib/toast';
import type { Category, DifficultyBand, GameSettings, MatchRecipe, PlayMode, PuzzleRecipe, Team } from '@/lib/types';

function ToastHost() {
  const [toasts, setToasts] = useState<(Toast & { leaving?: boolean })[]>([]);
  useEffect(() => subscribeToasts((toast) => {
    setToasts((current) => [...current, toast]);
    // Mark it "leaving" first so the fade-out animation can play, then
    // actually remove it once that animation has had time to finish.
    window.setTimeout(() => setToasts((current) => current.map((item) => item.id === toast.id ? { ...item, leaving: true } : item)), 2800);
    window.setTimeout(() => setToasts((current) => current.filter((item) => item.id !== toast.id)), 3100);
  }), []);
  if (toasts.length === 0) return null;
  return <div className="toast-stack" role="status" aria-live="polite">
    {toasts.map((toast) => <div key={toast.id} className={`toast toast-${toast.kind} ${toast.leaving ? 'toast-leaving' : ''}`}>{toast.message}</div>)}
  </div>;
}

type EntryMode = 'solo' | 'together' | 'online' | 'timeattack';
type Screen = 'home' | 'setup' | 'online-entry' | 'online-lobby';
type RoomPlayer = { id: string; name: string; isHost: boolean; ready: boolean; score: number; joinedAt: number; teamId?: 'sun' | 'olive' };
type RoomSnapshot = {
  code: string; status: 'LOBBY' | 'PUZZLE_OPEN' | 'PUZZLE_RESOLVED' | 'RESULTS'; mode: 'individuals' | 'teams' | 'cooperative';
  settings: GameSettings; players: RoomPlayer[]; currentIndex: number; puzzleCount: number; version: number; viewerId: string; viewerHints: number;
  puzzle: null | { id: string; scramble: string; fixedPrefix?: string; category: Category; band: number; hints: [string, string]; display?: string; reference?: string };
  resolution: null | { solverId: string | null; solverName: string | null; award: number; revealed: boolean };
};
type Credentials = { code: string; token: string; playerId: string };

const DEFAULT_SETTINGS: GameSettings = { categories: ['book', 'person', 'place'], maxBand: 2, length: 10 };
const BAND_NAMES = ['Starter', 'Familiar', 'Challenge', 'Deep Cut'];
const TEAM_COLORS = ['#dd6f57', '#2e7d68', '#bc861a', '#6c6faa'];

function Header({ onHome, sound, setSound }: { onHome: () => void; sound: boolean; setSound: (value: boolean) => void }) {
  return <header className="app-header">
    <button className="brand" type="button" onClick={onHome} aria-label="WordIn home"><span className="brand-mark">W</span><span><strong>WordIn</strong><small>Bible word game</small></span></button>
    <div className="header-actions"><button type="button" className="icon-button" onClick={() => setSound(!sound)} aria-label={`${sound ? 'Turn off' : 'Turn on'} sound`}>{sound ? '♪' : '♪̸'}</button></div>
  </header>;
}

function HomeScreen({ mode, setMode, start }: { mode: EntryMode; setMode: (mode: EntryMode) => void; start: () => void }) {
  const [expanded, setExpanded] = useState<EntryMode | null>(null);
  const modes = [
    { id: 'solo' as const, title: 'Solo Journey', icon: '🧩', tint: 'sky', detail: 'Play by yourself, at your own pace. No timer, no pressure.' },
    { id: 'together' as const, title: 'Play Together', icon: '🤝', tint: 'grass', detail: 'Pass one phone around. Solve as a team, or split into teams that take turns claiming each puzzle.' },
    { id: 'online' as const, title: 'Online Room', icon: '🌐', tint: 'violet', detail: 'Everyone joins from their own phone with a six-character code -- great for players in different places.' },
    { id: 'timeattack' as const, title: 'Time Attack', icon: '⚡', tint: 'berry', detail: 'A solo race against the clock. Each level is faster and harder -- chase your high score.' },
  ];
  return <main className="home-shell">
    <section className="home-grid">
      <h1 className="hero-title">Unscramble the word</h1>
      <p className="hero-copy">Bible books, people, and places. Play solo, pass the phone around, or invite a room.</p>
      <SamplePuzzle />
      <div className="mode-grid" role="radiogroup" aria-label="Choose how to play">
        {modes.map((item) => <div key={item.id} className={`mode-tile mode-tint-${item.tint} ${mode === item.id ? 'active' : ''} ${expanded === item.id ? 'expanded' : ''}`}>
          <button type="button" role="radio" aria-checked={mode === item.id} onClick={() => setMode(item.id)} className="mode-tile-main">
            <span className="mode-icon" aria-hidden="true">{item.icon}</span><strong>{item.title}</strong>
          </button>
          <button type="button" className="mode-info-button" aria-label={`More about ${item.title}`} aria-expanded={expanded === item.id} onClick={(event) => { event.stopPropagation(); setExpanded(expanded === item.id ? null : item.id); }}>i</button>
          {expanded === item.id && <p className="mode-detail">{item.detail}</p>}
        </div>)}
      </div>
      <button type="button" className="primary-button hero-button" onClick={start}>Start {modes.find((item) => item.id === mode)?.title}</button>
      <p className="free-note">No account needed. No timer. Free to play.</p>
    </section>
  </main>;
}

function SamplePuzzle() {
  return <div className="sample-wrap"><div className="puzzle-card sample-card">
    <div className="card-top"><div><p className="puzzle-kicker">People · Starter</p><h2>Who is hiding here?</h2></div><span className="points-pill">5 pts</span></div>
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
  return <div className="settings-stack">
    <fieldset><legend>Choose your word set</legend><p className="field-help">Select one or blend several categories.</p><div className="choice-grid three">
      {(['book', 'person', 'place'] as Category[]).map((category) => { const isSelected = settings.categories.includes(category); return <button type="button" key={category} className={`choice-card ${isSelected ? 'selected' : ''}`} onClick={() => toggleCategory(category)} aria-pressed={isSelected}>
        <span>{category === 'book' ? '📖' : category === 'person' ? '👤' : '📍'}</span><strong>{category === 'book' ? 'Bible Books' : category === 'person' ? 'People' : 'Places'}</strong>
      </button>; })}
    </div></fieldset>
    <fieldset><legend>How challenging?</legend><div className="band-grid">
      {BAND_NAMES.map((name, index) => <button type="button" key={name} onClick={() => setSettings({ ...settings, maxBand: (index + 1) as DifficultyBand })} className={`band-button ${settings.maxBand === index + 1 ? 'selected' : ''}`}><small>Up to band {index + 1}</small><strong>{name}</strong></button>)}
    </div></fieldset>
    <fieldset><legend>How many puzzles?</legend><div className="length-row">
      {[10, 15].map((value) => <button type="button" key={value} onClick={() => setSettings({ ...settings, length: Math.min(value, pool) })} className={`length-button ${settings.length === value ? 'selected' : ''}`}>{value}</button>)}
      <label className="custom-length"><span>Custom</span><input aria-label="Custom puzzle count" type="number" min="3" max={pool} value={settings.length} onChange={(event) => setSettings({ ...settings, length: Math.min(pool, Math.max(3, Number(event.target.value) || 3)) })} /></label>
    </div><p className="field-help">{pool} eligible answers in this set · no repeats inside a match</p></fieldset>
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
    <button className="primary-button full-button" type="button" onClick={start}>Create fresh match</button>
  </section></main>;
}

function TileBoard({ scramble, placed, setPlaced, locked }: { scramble: string; placed: number[]; setPlaced: (placed: number[]) => void; locked?: boolean }) {
  // Numbered-book prefixes (e.g. "1 John") are never shown as a tile while
  // solving -- the puzzle is just the base word. The full name still shows
  // on the resolution/results screen from `entry.display`.
  const available = scramble.split('').map((letter, index) => ({ letter, index })).filter((item) => !placed.includes(item.index));
  return <div className="board"><div className="answer-area" aria-label="Your answer">
    {scramble.split('').map((_, slot) => {
      const sourceIndex = placed[slot];
      return sourceIndex === undefined ? <span className="answer-slot" key={slot} /> : <button type="button" disabled={locked} className="letter-tile placed" key={slot} onClick={() => { playTap(); setPlaced(placed.filter((__, index) => index !== slot)); }}>{scramble[sourceIndex]}</button>;
    })}
  </div><div className="scramble-area" aria-label="Available letters">{available.map((item) => <button type="button" disabled={locked} className="letter-tile" key={item.index} onClick={() => { playTap(); setPlaced([...placed, item.index]); }}>{item.letter}</button>)}</div></div>;
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

function LocalGame({ mode, settings, teams: initialTeams, sound, onHome, onChangeSet }: { mode: PlayMode; settings: GameSettings; teams: Team[]; sound: boolean; onHome: () => void; onChangeSet: () => void }) {
  const [recipe, setRecipe] = useState<MatchRecipe>(() => createFreshRecipe(settings));
  const [index, setIndex] = useState(0); const [placed, setPlaced] = useState<number[]>([]); const [hints, setHints] = useState(0);
  const [scores, setScores] = useState<Team[]>(() => mode === 'teams' ? initialTeams.map((team) => ({ ...team, score: 0 })) : [{ id: 'group', name: mode === 'solo' ? 'You' : 'Everyone', color: '#2e7d68', score: 0 }]);
  const [claimedBy, setClaimedBy] = useState<string | null>(mode === 'teams' ? null : 'group');
  const [resolved, setResolved] = useState<{ correct: boolean; revealed: boolean; award: number } | null>(null);
  const [correctCount, setCorrectCount] = useState(0); const [wrongCount, setWrongCount] = useState(0); const [finished, setFinished] = useState(false);
  const [celebration, setCelebration] = useState<{ id: number; title: string; subtitle: string } | null>(null);
  const [missPop, setMissPop] = useState<number | null>(null);
  const [wrongStreak, setWrongStreak] = useState(0);
  const puzzle = recipe.puzzles[index]; const entry = getPuzzleEntry(recipe, index);
  const assembled = puzzle ? placed.map((source) => puzzle.scramble[source]).join('') : '';
  const currentValue = Math.max(1, 5 - hints);
  // Declared before the effects below since the auto-advance effect needs
  // to reference `next` -- React's compiler requires that ordering.
  const resetPuzzle = () => { setPlaced([]); setHints(0); setResolved(null); setWrongStreak(0); setClaimedBy(mode === 'teams' ? null : 'group'); };
  const next = () => { if (index >= recipe.puzzles.length - 1) setFinished(true); else { setIndex(index + 1); resetPuzzle(); } };
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
  if (!entry || !puzzle) return null;
  const check = () => {
    if (mode === 'teams' && !claimedBy) { showToast('A team needs to claim this puzzle first.'); return; }
    if (placed.length !== puzzle.scramble.length) { showToast('Place every letter before checking.'); return; }
    const correct = normalizeAnswer(assembled) === entry.answer;
    if (correct) {
      setScores(scores.map((team) => team.id === claimedBy ? { ...team, score: team.score + currentValue } : team));
      setCorrectCount(correctCount + 1);
      setResolved({ correct: true, revealed: false, award: currentValue });
      if (sound) playCorrect();
      const solverName = mode === 'teams' ? scores.find((team) => team.id === claimedBy)?.name : undefined;
      setCelebration({ id: Date.now(), title: 'Beautiful!', subtitle: solverName ? `${solverName} · +${currentValue} points` : `+${currentValue} points` });
    } else {
      setScores(scores.map((team) => team.id === claimedBy ? { ...team, score: Math.max(0, team.score - 1) } : team));
      setWrongCount(wrongCount + 1);
      setMissPop(Date.now());
      if (sound) playWrong();
      const nextStreak = wrongStreak + 1;
      setWrongStreak(nextStreak);
      // Three misses in a row on the same word -- reveal it and move on
      // rather than leaving the player stuck.
      if (nextStreak >= 3) { setResolved({ correct: false, revealed: true, award: 0 }); return; }
      if (mode === 'teams') { setClaimedBy(null); setPlaced([]); }
    }
  };
  const reveal = () => setResolved({ correct: false, revealed: true, award: 0 });
  const rematch = () => { setRecipe(createFreshRecipe(settings)); setIndex(0); setScores(scores.map((team) => ({ ...team, score: 0 }))); setCorrectCount(0); setWrongCount(0); setFinished(false); resetPuzzle(); };
  if (finished) return <Results mode={mode} scores={scores} correct={correctCount} wrong={wrongCount} total={recipe.puzzles.length} rematch={rematch} changeSet={onChangeSet} home={onHome} />;
  return <main className="game-shell">
    {celebration && <BigCelebration key={celebration.id} title={celebration.title} subtitle={celebration.subtitle} />}
    {missPop !== null && <MissPopup key={missPop} />}
    <div className="game-topbar"><div><span>Puzzle {index + 1} of {recipe.puzzles.length}</span><div className="progress"><i style={{ width: `${((index + 1) / recipe.puzzles.length) * 100}%` }} /></div></div><div className="score-strip">{scores.map((team) => <span key={team.id}><i style={{ background: team.color }} />{team.name} <strong key={team.score}>{team.score}</strong></span>)}</div></div>
    {mode === 'teams' && !resolved && <div className="claim-panel"><p>{claimedBy ? <><strong>{scores.find((team) => team.id === claimedBy)?.name}</strong> is building</> : 'Who knows it? Claim the puzzle.'}</p><div>{scores.map((team) => <button type="button" key={team.id} disabled={Boolean(claimedBy)} style={{ '--team-color': team.color } as React.CSSProperties} onClick={() => setClaimedBy(team.id)}>{claimedBy === team.id ? 'Building…' : `Claim · ${team.name}`}</button>)}{claimedBy && <button type="button" className="release" onClick={() => { setClaimedBy(null); setPlaced([]); }}>Release</button>}</div></div>}
    <section className="puzzle-card play-card"><div className="card-top"><div><p className="puzzle-kicker">{entry.categories[0]} · {BAND_NAMES[entry.band - 1]}</p><h1>{resolved ? entry.display : 'Unscramble the answer'}</h1></div><span className="points-pill">{currentValue} pts</span></div>
      <TileBoard scramble={puzzle.scramble} placed={placed} setPlaced={setPlaced} locked={Boolean(resolved) || (mode === 'teams' && !claimedBy)} />
      {hints > 0 && !resolved && <div className="hint-box"><span className="hint-icon" aria-hidden="true">💡</span><div className="hint-lines">{entry.hints.slice(0, hints).map((hint) => <p key={hint}>{hint}</p>)}</div></div>}
      {resolved ? <div className="resolution"><span>{resolved.revealed ? 'The answer was' : 'Beautiful work!'}</span><strong>{entry.display}</strong><p>{entry.references[0]} · {resolved.award ? `+${resolved.award} points` : 'No points this time'}</p><button type="button" className="primary-button" onClick={next}>{index === recipe.puzzles.length - 1 ? 'See results' : 'Next puzzle'}</button></div>
      : <div className="game-actions"><button type="button" className="soft-button" onClick={() => setPlaced([])}>↻ Reset</button><button type="button" className="soft-button" disabled={hints >= 2} onClick={() => setHints(Math.min(2, hints + 1))}>✦ Hint {hints}/2</button><button type="button" className="check-button" onClick={check}>Check answer</button><button type="button" className="text-button" onClick={reveal}>Reveal & continue</button></div>}
      <button type="button" className="quit-button" onClick={onHome}>End match</button>
    </section></main>;
}

const BAND_TIME_LIMITS: Record<DifficultyBand, number> = { 1: 30, 2: 24, 3: 18, 4: 14 };
const HIGH_SCORE_KEY = 'wordin-timeattack-highscore';

function getHighScore(): number {
  if (typeof window === 'undefined') return 0;
  try { return Number(localStorage.getItem(HIGH_SCORE_KEY)) || 0; } catch { return 0; }
}
function saveHighScore(value: number) {
  try { localStorage.setItem(HIGH_SCORE_KEY, String(value)); } catch { /* storage can be blocked */ }
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
  const [band, setBand] = useState<DifficultyBand>(1);
  const [queue, setQueue] = useState<PuzzleRecipe[]>(() => buildLevelQueue(1, categories));
  const [placed, setPlaced] = useState<number[]>([]);
  const [score, setScore] = useState(0);
  const [solved, setSolved] = useState(0);
  const [strikes, setStrikes] = useState(0);
  const [timeLeft, setTimeLeft] = useState(BAND_TIME_LIMITS[1]);
  const [resolved, setResolved] = useState<{ correct: boolean; gained: number } | null>(null);
  const [finished, setFinished] = useState<'strikes' | 'cleared' | null>(null);
  const [celebration, setCelebration] = useState<{ id: number; title: string; subtitle: string } | null>(null);
  const bestRef = useRef(getHighScore());
  const milestoneRef = useRef(0);
  const beatBestRef = useRef(false);
  const savedRef = useRef(false);

  useEffect(() => { duckMusic(true); return () => duckMusic(false); }, []);

  const puzzle = queue[0];
  const entry = puzzle ? getEntryById(puzzle.entryId) : undefined;

  // Per-word countdown. Hitting zero counts as a miss, same as a wrong check.
  useEffect(() => {
    if (resolved || finished || !entry) return;
    if (timeLeft <= 0) { resolveWord(false); return; }
    const timer = window.setTimeout(() => setTimeLeft((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, resolved, finished, entry]);

  // Auto-advance shortly after each word resolves -- an arcade mode keeps moving.
  useEffect(() => {
    if (!resolved) return;
    const timer = window.setTimeout(advance, 650);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved]);

  useEffect(() => {
    if (!celebration) return;
    const timer = window.setTimeout(() => setCelebration(null), 1600);
    return () => window.clearTimeout(timer);
  }, [celebration]);

  useEffect(() => {
    if (finished && !savedRef.current) {
      savedRef.current = true;
      if (score > bestRef.current) saveHighScore(score);
    }
  }, [finished, score]);

  if (!entry || !puzzle) return null;

  function checkMilestones(newScore: number) {
    if (newScore > bestRef.current && !beatBestRef.current) {
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
    if (correct) {
      const timeFraction = timeLeft / BAND_TIME_LIMITS[band];
      const gained = 5 + Math.round(timeFraction * 3);
      const newScore = score + gained;
      setScore(newScore);
      setSolved((value) => value + 1);
      setStrikes(0);
      setResolved({ correct: true, gained });
      if (sound) playCorrect();
      checkMilestones(newScore);
    } else {
      const nextStrikes = strikes + 1;
      setStrikes(nextStrikes);
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
      setResolved(null);
      setTimeLeft(BAND_TIME_LIMITS[band]);
      return;
    }
    if (band < 4) {
      const nextBand = (band + 1) as DifficultyBand;
      setBand(nextBand);
      setQueue(buildLevelQueue(nextBand, categories));
      setPlaced([]);
      setResolved(null);
      setStrikes(0);
      setTimeLeft(BAND_TIME_LIMITS[nextBand]);
      showToast(`Leveling up: ${BAND_NAMES[nextBand - 1]}!`);
      return;
    }
    setFinished('cleared');
  }

  const check = () => {
    if (resolved || placed.length !== puzzle.scramble.length) return;
    const assembled = placed.map((source) => puzzle.scramble[source]).join('');
    resolveWord(normalizeAnswer(assembled) === entry.answer);
  };

  if (finished) {
    const best = Math.max(score, bestRef.current);
    return <main className="page-shell"><section className="panel results-panel">
      {score >= bestRef.current && score > 0 && <Confetti key="final" />}
      <div className="celebration">{finished === 'cleared' ? '🏆' : '⏱️'}</div>
      <p className="section-kicker">Time Attack</p>
      <h1 className="page-title">{finished === 'cleared' ? 'Perfect clear!' : 'Run over'}</h1>
      <p className="page-subtitle">{finished === 'cleared' ? 'You cleared every word, every band. That has genuinely never happened before on this device.' : 'Three misses in a row ends the run -- that’s the game.'}</p>
      <div className="result-score"><strong>{score}</strong><span>points</span></div>
      <div className="stat-grid">
        <div><strong>{solved}</strong><span>Solved</span></div>
        <div><strong>{BAND_NAMES[band - 1]}</strong><span>Reached</span></div>
        <div><strong>{best}</strong><span>Best score</span></div>
      </div>
      <div className="result-actions">
        <button className="primary-button" type="button" onClick={() => window.location.reload()}>Play again</button>
        <button className="text-button" type="button" onClick={onHome}>Home</button>
      </div>
    </section></main>;
  }

  const timeLimit = BAND_TIME_LIMITS[band];
  const urgent = timeLeft <= Math.ceil(timeLimit * 0.3);
  return <main className="game-shell">
    {celebration && <BigCelebration key={celebration.id} title={celebration.title} subtitle={celebration.subtitle} />}
    <div className="game-topbar">
      <div><span>{BAND_NAMES[band - 1]} · {solved} solved</span><div className="progress"><i style={{ width: `${(timeLeft / timeLimit) * 100}%`, background: urgent ? 'var(--danger)' : undefined }} /></div></div>
      <div className="score-strip"><span>Score <strong key={score}>{score}</strong></span><span>{'❤️'.repeat(3 - strikes)}{'🖤'.repeat(strikes)}</span></div>
    </div>
    <section className="puzzle-card play-card">
      <div className="card-top"><div><p className="puzzle-kicker">{entry.categories[0]} · {BAND_NAMES[entry.band - 1]}</p><h1>{resolved ? entry.display : 'Unscramble the answer'}</h1></div><span className={`points-pill timer-pill ${urgent ? 'urgent' : ''}`}>{timeLeft}s</span></div>
      <TileBoard scramble={puzzle.scramble} placed={placed} setPlaced={setPlaced} locked={Boolean(resolved)} />
      {resolved && <div className="resolution"><span>{resolved.correct ? `+${resolved.gained} points` : 'Missed it'}</span><strong>{entry.display}</strong><p>{entry.references[0]}</p></div>}
      {!resolved && <div className="game-actions"><button type="button" className="check-button full-button" onClick={check}>Check answer</button></div>}
    </section>
    <button type="button" className="quit-button" onClick={onHome}>End run</button>
  </main>;
}

function Results({ mode, scores, correct, wrong, total, rematch, changeSet, home }: { mode: PlayMode; scores: Team[]; correct: number; wrong: number; total: number; rematch: () => void; changeSet: () => void; home: () => void }) {
  const ranking = [...scores].sort((a, b) => b.score - a.score); const winner = ranking[0];
  return <main className="page-shell"><section className="panel results-panel"><div className="celebration">✦</div><p className="section-kicker">Match complete</p><h1 className="page-title">{mode === 'teams' ? `${winner.name} wins!` : mode === 'solo' ? 'Nicely done!' : 'Wonderful teamwork!'}</h1><p className="page-subtitle">You turned every scramble into a chance to remember.</p>
    <div className="result-score"><strong>{winner.score}</strong><span>points</span></div>{mode === 'teams' && <div className="leaderboard">{ranking.map((team, index) => <div key={team.id}><span>{index + 1}</span><i style={{ background: team.color }} /><strong>{team.name}</strong><b>{team.score}</b></div>)}</div>}
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
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [placed, setPlaced] = useState<number[]>([]);
  const previousStatus = useRef<RoomSnapshot['status'] | null>(null);
  const load = useCallback(async () => { try { const response = await fetch(`/api/rooms/${credentials.code}?playerId=${credentials.playerId}`, { headers: { 'x-room-token': credentials.token } }); const data = await response.json() as RoomSnapshot & { error?: string }; if (!response.ok) throw new Error(data.error || 'Could not update the room.'); setSnapshot((previous) => { if (previous?.currentIndex !== data.currentIndex || previous?.status !== data.status) setPlaced([]); return data; }); setError(''); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Reconnecting…'); } }, [credentials]);
  useEffect(() => { const initial = window.setTimeout(load, 0); const timer = window.setInterval(() => { if (document.visibilityState === 'visible') load(); }, 1800); return () => { window.clearTimeout(initial); window.clearInterval(timer); }; }, [load]);
  useEffect(() => { duckMusic(true); return () => duckMusic(false); }, []);
  useEffect(() => {
    if (sound && snapshot?.status === 'PUZZLE_RESOLVED' && previousStatus.current !== 'PUZZLE_RESOLVED') {
      if (snapshot.resolution?.award) playCorrect(); else if (snapshot.resolution?.revealed) playWrong();
    }
    previousStatus.current = snapshot?.status ?? null;
  }, [snapshot?.status, snapshot?.resolution, sound]);
  const action = async (input: Record<string, unknown>) => { setBusy(true); setError(''); try { const response = await fetch(`/api/rooms/${credentials.code}/action`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-room-token': credentials.token }, body: JSON.stringify({ ...input, playerId: credentials.playerId }) }); const data = await response.json() as RoomSnapshot & { error?: string }; if (!response.ok) throw new Error(data.error || 'That action did not work.'); setSnapshot(data); if (data.status !== 'PUZZLE_OPEN') setPlaced([]); } catch (caught) { const message = caught instanceof Error ? caught.message : 'That action did not work.'; setError(message); showToast(message, 'error'); } finally { setBusy(false); } };
  if (!snapshot) return <main className="page-shell"><section className="panel loading-panel"><span className="loader" /><h1>Opening room {credentials.code}</h1><p>{error || 'Gathering everyone…'}</p><button type="button" className="text-button" onClick={leave}>Leave</button></section></main>;
  const viewer = snapshot.players.find((player) => player.id === credentials.playerId); const isHost = Boolean(viewer?.isHost);
  if (snapshot.status === 'LOBBY') return <OnlineLobby key={snapshot.version} snapshot={snapshot} viewer={viewer} isHost={isHost} busy={busy} action={action} leave={leave} />;
  if (snapshot.status === 'RESULTS') return <OnlineResults snapshot={snapshot} isHost={isHost} action={action} leave={leave} />;
  const puzzle = snapshot.puzzle; if (!puzzle) return null;
  const answer = placed.map((index) => puzzle.scramble[index]).join('');
  const onlineScores = snapshot.mode === 'teams' ? ([['sun', 'Sun Team'], ['olive', 'Olive Team']] as const).map(([id, name]) => ({ id, name, score: snapshot.players.filter((player) => player.teamId === id).reduce((sum, player) => sum + player.score, 0) })) : snapshot.players.map((player) => ({ id: player.id, name: player.name, score: player.score }));
  return <main className="game-shell"><div className="room-banner"><span>Room <strong>{snapshot.code}</strong></span><span>{error || '● Connected'}</span></div><div className="game-topbar"><div><span>Puzzle {snapshot.currentIndex + 1} of {snapshot.puzzleCount}</span><div className="progress"><i style={{ width: `${((snapshot.currentIndex + 1) / snapshot.puzzleCount) * 100}%` }} /></div></div><div className="score-strip">{onlineScores.map((side) => <span key={side.id}>{side.name} <strong key={side.score}>{side.score}</strong></span>)}</div></div>
    <section className="puzzle-card play-card"><div className="card-top"><div><p className="puzzle-kicker">{puzzle.category} · {BAND_NAMES[puzzle.band - 1]}</p><h1>{snapshot.status === 'PUZZLE_RESOLVED' ? puzzle.display : 'Everyone is solving…'}</h1></div><span className="points-pill">{Math.max(1, 5 - snapshot.viewerHints)} pts</span></div>
      <TileBoard scramble={puzzle.scramble} placed={placed} setPlaced={setPlaced} locked={snapshot.status !== 'PUZZLE_OPEN' || busy} />
      {snapshot.viewerHints > 0 && snapshot.status === 'PUZZLE_OPEN' && <div className="hint-box"><span className="hint-icon" aria-hidden="true">💡</span><div className="hint-lines">{puzzle.hints.slice(0, snapshot.viewerHints).map((hint) => <p key={hint}>{hint}</p>)}</div></div>}
      {snapshot.status === 'PUZZLE_RESOLVED' ? <div className="resolution">{Boolean(snapshot.resolution?.award) && <Confetti key={snapshot.currentIndex} />}<span>{snapshot.resolution?.revealed ? 'The answer was' : `${snapshot.resolution?.solverName} solved it!`}</span><strong>{puzzle.display}</strong><p>{puzzle.reference} · {snapshot.resolution?.award ? `+${snapshot.resolution.award} points` : 'No points this time'}</p>{isHost ? <button type="button" className="primary-button" onClick={() => action({ action: 'next' })}>Next puzzle</button> : <p>Waiting for the host…</p>}</div>
      : <div className="game-actions"><button className="soft-button" type="button" onClick={() => setPlaced([])}>↻ Reset</button><button className="soft-button" type="button" disabled={snapshot.viewerHints >= 2 || busy} onClick={() => action({ action: 'hint' })}>✦ Hint {snapshot.viewerHints}/2</button><button className="check-button" type="button" disabled={placed.length !== puzzle.scramble.length || busy} onClick={() => action({ action: 'check', answer })}>Check answer</button>{isHost && <button className="text-button" type="button" onClick={() => action({ action: 'reveal' })}>Host reveal</button>}</div>}
      <button type="button" className="quit-button" onClick={leave}>Leave room</button>
    </section></main>;
}

function OnlineLobby({ snapshot, viewer, isHost, busy, action, leave }: { snapshot: RoomSnapshot; viewer?: RoomPlayer; isHost: boolean; busy: boolean; action: (input: Record<string, unknown>) => void; leave: () => void }) {
  const [settings, setSettings] = useState(snapshot.settings); const [mode, setMode] = useState(snapshot.mode); const joinUrl = typeof window !== 'undefined' ? `${window.location.origin}?room=${snapshot.code}` : '';
  const copy = async () => { try { await navigator.clipboard.writeText(joinUrl); } catch { /* clipboard can be blocked */ } };
  return <main className="page-shell"><section className="panel lobby-panel"><div className="lobby-heading"><div><p className="section-kicker">Private room</p><h1 className="room-code">{snapshot.code}</h1><p>Share this code with up to 11 more players.</p></div><button type="button" className="secondary-button" onClick={copy}>Copy invite link</button></div>
    <div className="lobby-grid"><div><h2>Players <span>{snapshot.players.length}/12</span></h2><div className="player-list">{snapshot.players.map((player) => <div key={player.id}><span className="avatar">{player.name[0]?.toUpperCase()}</span><strong>{player.name}{player.id === viewer?.id ? ' (you)' : ''}</strong>{player.isHost && <small>Host</small>}<em className={player.ready ? 'ready' : ''}>{player.ready ? 'Ready' : 'Not ready'}</em></div>)}</div>{!isHost && <button type="button" className="primary-button full-button" onClick={() => action({ action: 'ready', ready: !viewer?.ready })}>{viewer?.ready ? 'I’m not ready' : 'I’m ready'}</button>}</div>
      <div className="lobby-settings"><h2>Match setup</h2>{isHost ? <><div className="tabs compact three-tabs"><button className={mode === 'individuals' ? 'active' : ''} onClick={() => setMode('individuals')}>Individuals</button><button className={mode === 'teams' ? 'active' : ''} onClick={() => setMode('teams')}>Teams</button><button className={mode === 'cooperative' ? 'active' : ''} onClick={() => setMode('cooperative')}>Co-op</button></div><SettingsPanel settings={settings} setSettings={setSettings} /><button type="button" className="secondary-button full-button" onClick={() => action({ action: 'configure', settings, mode })}>Save settings</button><button type="button" disabled={busy} className="primary-button full-button" onClick={() => action({ action: 'start' })}>Start match</button></> : <div className="setting-summary"><p><strong>{snapshot.mode === 'individuals' ? 'Individuals' : snapshot.mode === 'teams' ? 'Teams' : 'Cooperative'}</strong></p><p>{snapshot.settings.categories.join(' + ')}</p><p>{BAND_NAMES[snapshot.settings.maxBand - 1]} · {snapshot.settings.length} puzzles</p></div>}</div></div>
    <button type="button" className="text-button leave-button" onClick={leave}>Leave room</button>
  </section></main>;
}

function OnlineResults({ snapshot, isHost, action, leave }: { snapshot: RoomSnapshot; isHost: boolean; action: (input: Record<string, unknown>) => void; leave: () => void }) {
  const sides = snapshot.mode === 'teams' ? ([['sun', 'Sun Team'], ['olive', 'Olive Team']] as const).map(([id, name]) => ({ id, name, score: snapshot.players.filter((player) => player.teamId === id).reduce((sum, player) => sum + player.score, 0) })) : snapshot.players.map((player) => ({ id: player.id, name: player.name, score: player.score }));
  const ranking = [...sides].sort((a, b) => b.score - a.score); return <main className="page-shell"><section className="panel results-panel"><div className="celebration">✦</div><p className="section-kicker">Room {snapshot.code} · Match complete</p><h1 className="page-title">{snapshot.mode === 'cooperative' ? 'Wonderful teamwork!' : `${ranking[0]?.name} wins!`}</h1><div className="leaderboard">{ranking.map((side, index) => <div key={side.id}><span>{index + 1}</span><span className="avatar">{side.name[0]}</span><strong>{side.name}</strong><b>{side.score}</b></div>)}</div><div className="result-actions">{isHost && <><button className="primary-button" type="button" onClick={() => action({ action: 'rematch' })}>Play again <span>↻</span></button><button className="secondary-button" type="button" onClick={() => action({ action: 'lobby' })}>Change set</button></>}<button className="text-button" type="button" onClick={leave}>Leave room</button></div></section></main>;
}

export default function GatherWordApp() {
  const [screen, setScreen] = useState<Screen>('home'); const [entryMode, setEntryMode] = useState<EntryMode>('solo'); const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS); const [togetherMode, setTogetherMode] = useState<PlayMode>('cooperative');
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
  const [timeAttackActive, setTimeAttackActive] = useState(false);
  const home = () => { setLocalMode(null); setTimeAttackActive(false); setScreen('home'); };
  const startEntry = () => { if (entryMode === 'online') setScreen('online-entry'); else if (entryMode === 'timeattack') setTimeAttackActive(true); else setScreen('setup'); };
  const startLocal = () => { setLocalGameKey((value) => value + 1); setLocalMode(entryMode === 'solo' ? 'solo' : togetherMode); };
  const connect = (value: Credentials) => { setCredentials(value); sessionStorage.setItem('gatherword-room', JSON.stringify(value)); setScreen('online-lobby'); };
  const leave = () => { setCredentials(null); sessionStorage.removeItem('gatherword-room'); history.replaceState({}, '', window.location.pathname); setScreen('online-entry'); };
  return <div className="app"><Header onHome={home} sound={sound} setSound={setSound} />
    {timeAttackActive ? <TimeAttackGame key={localGameKey} categories={settings.categories} sound={sound} onHome={home} />
    : localMode ? <LocalGame key={localGameKey} mode={localMode} settings={settings} teams={teams} sound={sound} onHome={home} onChangeSet={() => { setLocalMode(null); setScreen('setup'); }} />
    : screen === 'home' ? <HomeScreen mode={entryMode} setMode={setEntryMode} start={startEntry} />
    : screen === 'setup' ? <SetupScreen entryMode={entryMode} settings={settings} setSettings={setSettings} togetherMode={togetherMode} setTogetherMode={setTogetherMode} teams={teams} setTeams={setTeams} start={startLocal} back={home} />
    : screen === 'online-entry' ? <OnlineEntry onBack={home} onConnected={connect} initialCode={initialCode} />
    : credentials ? <OnlineRoom credentials={credentials} leave={leave} sound={sound} /> : null}
    <footer><span>WordIn</span><span>© 2026 SolomonAgyire</span></footer>
    <ToastHost />
  </div>;
}
