'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { advanceMatch, buildLevelQueue, createFreshRecipe, eligibleWords, getEntryById, getPuzzleEntry, nextPlayableLevelAbove, normalizeAnswer, playableLevelFrom, unplayableReason } from '@/lib/game-engine';
import { duckMusic, playCorrect, playRewardFanfare, playShuffle, playWrong, startMusic, stopMusic } from '@/lib/audio';
import { showToast, subscribeToasts, type Toast } from '@/lib/toast';
import type { Category, GameSettings, Level, MatchRecipe, PlayMode, PuzzleRecipe, RoomSettings, Team } from '@/lib/types';
import { LEVEL_NAMES } from '@/lib/types';
import { applyLetterHint, HINT_LABELS, hintsFor, type HintKind } from '@/lib/hints';
import { scoreSolve } from '@/lib/scoring';
import { secondsFor, timeAttackSecondsFor, timerModeFor } from '@/lib/timing';
import { saveProgress, recordMatch, masteredCount, subscribeProgress, getProgressSnapshot, getProgressServerSnapshot } from '@/lib/progress';
import { highestUnlocked, runLengthFor, totalStars } from '@/lib/levels';
import { roomUnplayableReason, roomWordPool } from '@/lib/room-rules';
import { LevelBar } from '@/components/LevelBar';
import { DifficultyBar, roomDifficultyLabel } from '@/components/DifficultyBar';
import { Standings } from '@/components/Standings';
import { shuffledOrder, TileBoard } from '@/components/TileBoard';
import { DailyWord, useHydrated } from '@/components/DailyWord';
import { dailyPuzzleFor } from '@/lib/daily';
import { ScoreFlight } from '@/components/ScoreFlight';
import { GameCharacter, type GameCharacterId } from '@/components/GameCharacter';
import { GameTool, MissionHud } from '@/components/GameChrome';
import { Results } from '@/components/Results';
import { matchStars } from '@/lib/economy';

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
  settings: RoomSettings; players: RoomPlayer[]; currentIndex: number; puzzleCount: number; version: number; viewerId: string; viewerHints: number;
  puzzle: null | { id: string; scramble: string; category: Category; band: number; hints: { kind: HintKind; text: string }[]; display?: string; reference?: string };
  resolution: null | { solvers: SolveRecord[]; answeredIds: string[]; revealed: boolean; paused: boolean };
};
type Credentials = { code: string; token: string; playerId: string };

const DEFAULT_SETTINGS: GameSettings = { categories: ['book', 'person', 'place'], maxBand: 1, length: 10 };
// Mixed is the room default -- a room is mixed-ability by nature (a
// grandparent and a child on one screen), so a single pinned level would
// be wrong for both at once.
const DEFAULT_ROOM_SETTINGS: RoomSettings = { categories: ['book', 'person', 'place'], difficulty: 'mixed', length: 10 };
const TEAM_COLORS = ['#dd6f57', '#2e7d68', '#bc861a', '#6c6faa'];
const SEAT_ACCENTS = ['#ffbd59', '#71ce85', '#7fb8ff', '#ff8fa8', '#c9a2ff', '#ffd35d'];
/** A stable, distinct ring color per player, independent of team color --
 * client-side only, so no RoomDO/protocol field is needed for it. */
function seatAccent(id: string): string {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  return SEAT_ACCENTS[hash % SEAT_ACCENTS.length];
}
// Mirrors `MAX_PLAYERS` in lib/room-service.ts -- kept as a plain constant
// here rather than imported, since that module pulls in Workers-only APIs
// that a client component must not bundle.
const MAX_ROOM_PLAYERS = 30;

function JourneyBackdrop() {
  return <div className="journey-world" aria-hidden="true">
    <div className="journey-atmosphere"><span className="journey-cloud" />
      <span className="journey-sunbeam" /><span className="journey-water-glint" />
      <span className="journey-firefly" /><span className="journey-firefly" /><span className="journey-firefly" />
      <span className="journey-firefly" /><span className="journey-firefly" />
      {['near', 'far'].map((flock) => <div className={`journey-flock journey-flock-${flock}`} key={flock}>{[0, 1, 2, 3, 4].map((bird) => <span className="journey-bird" key={bird}>
        <svg viewBox="0 0 48 24" focusable="false"><path className="bird-wing bird-wing-left" d="M24 16 Q13 1 2 8 Q13 8 24 16" /><path className="bird-wing bird-wing-right" d="M24 16 Q35 1 46 8 Q35 8 24 16" /><circle cx="24" cy="15" r="2.4" /></svg>
      </span>)}</div>)}
      <span className="journey-leaf leaf-one" /><span className="journey-leaf leaf-two" /><span className="journey-leaf leaf-three" />
    </div>
    <div className="journey-foreground"><span /><span /></div>
  </div>;
}

function ResultMascot({ mood = 'happy', character = 'nuri' }: { mood?: 'happy' | 'brave'; character?: GameCharacterId }) {
  return <div className={`result-mascot result-mascot-${mood}`}><GameCharacter character={character} mood={mood === 'happy' ? 'cheer' : 'oops'} size="large" /></div>;
}

type GameIconName = EntryMode | Category | 'teams';

function GameIcon({ name }: { name: GameIconName }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
    {name === 'solo' && <><path {...common} d="M8.2 3.5h3.2v3.2a2 2 0 1 0 4 0V3.5h3.1a2 2 0 0 1 2 2v3.2h-2.7a2 2 0 1 0 0 4h2.7v5.8a2 2 0 0 1-2 2h-5.3v-2.8a2 2 0 1 0-4 0v2.8H5.5a2 2 0 0 1-2-2v-4h2.8a2 2 0 1 0 0-4H3.5v-5a2 2 0 0 1 2-2Z" /></>}
    {name === 'together' && <><circle {...common} cx="8" cy="8" r="3" /><circle {...common} cx="17" cy="9" r="2.5" /><path {...common} d="M2.8 19c.5-3.2 2.3-5 5.2-5s4.8 1.8 5.2 5M13 15.2c1-.9 2.2-1.3 3.7-1.3 2.5 0 4 1.5 4.5 4.1" /></>}
    {name === 'teams' && <><path {...common} d="M5 21V4l7-2v11l-7 2M14 6l6-2v11l-6 2M16 17v4" /></>}
    {name === 'online' && <><circle {...common} cx="12" cy="12" r="9" /><path {...common} d="M3.5 12h17M12 3c2.4 2.5 3.6 5.5 3.6 9S14.4 18.5 12 21M12 3C9.6 5.5 8.4 8.5 8.4 12s1.2 6.5 3.6 9" /></>}
    {name === 'timeattack' && <path {...common} d="M13.7 2.5 5.8 13h5.5l-1 8.5L18.5 11H13Z" />}
    {name === 'daily' && <><circle {...common} cx="12" cy="12" r="4" /><path {...common} d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" /></>}
    {name === 'book' && <><path {...common} d="M3.5 5.5c3.2-.8 5.9-.2 8.5 1.8v13c-2.6-2-5.3-2.6-8.5-1.8Z" /><path {...common} d="M20.5 5.5c-3.2-.8-5.9-.2-8.5 1.8v13c2.6-2 5.3-2.6 8.5-1.8Z" /></>}
    {name === 'person' && <><circle {...common} cx="12" cy="8" r="4" /><path {...common} d="M4.5 21c.7-4.4 3.2-6.7 7.5-6.7s6.8 2.3 7.5 6.7" /></>}
    {name === 'place' && <><path {...common} d="M19 9.5c0 5-7 11.5-7 11.5S5 14.5 5 9.5a7 7 0 1 1 14 0Z" /><circle {...common} cx="12" cy="9.5" r="2.4" /></>}
  </svg>;
}

function Header({ onHome, sound, setSound, homeMode = false, showingHome = false, hud, dailyNumber, dailyDone, onDaily }: {
  onHome: () => void; sound: boolean; setSound: (value: boolean) => void; homeMode?: boolean; showingHome?: boolean;
  hud?: { totalStars: number; coins: number; gems: number };
  dailyNumber?: number | null; dailyDone?: boolean; onDaily?: () => void;
}) {
  if (showingHome && hud) return <header className="app-header home-hud">
    <button type="button" className="home-hud-avatar" onClick={onHome} aria-label="WordIn home">
      <GameCharacter character="nuri" mood="idle" size="small" />
    </button>
    <div className="home-hud-currency" aria-label={`${hud.totalStars} stars, ${hud.coins} coins, ${hud.gems} gems`}>
      <span><b aria-hidden="true">★</b>{hud.totalStars}</span>
      <span><b aria-hidden="true">🪙</b>{hud.coins}</span>
      <span><b aria-hidden="true">💎</b>{hud.gems}</span>
    </div>
    <div className="home-hud-actions">
      <button type="button" className="home-hud-icon" onClick={onDaily} aria-label={dailyDone ? 'Daily Word, already done today' : 'Daily Word'}>
        <span aria-hidden="true">✎</span>
        {!dailyDone && <b className="home-hud-dot" aria-hidden="true" />}
      </button>
      {/* No dedicated settings screen exists yet -- the gear keeps today's
          one real option, sound, rather than adding a panel nothing else needs. */}
      <button type="button" className="home-hud-icon" onClick={() => setSound(!sound)} aria-label={`${sound ? 'Turn off' : 'Turn on'} sound`}>
        <span aria-hidden="true">⚙</span>
      </button>
    </div>
  </header>;
  return <header className={`app-header ${homeMode ? 'home-header' : ''}`}>
    <button className={`brand ${homeMode ? 'home-brand' : ''}`} type="button" onClick={onHome} aria-label="WordIn home">
      {homeMode
        ? <span><strong>Word<span>In</span></strong></span>
        : <span className="brand-mark inner-home-mark" aria-hidden="true">⌂</span>}
    </button>
    <div className="header-actions"><button type="button" className="icon-button" onClick={() => setSound(!sound)} aria-label={`${sound ? 'Turn off' : 'Turn on'} sound`}>{sound ? '♪' : '♪̸'}</button></div>
    {homeMode && <button type="button" className="home-daily-button" onClick={onDaily}>
      <span>Daily Word</span>
      <strong>{dailyDone ? '✓' : dailyNumber === null || dailyNumber === undefined ? '…' : `#${dailyNumber}`}</strong>
    </button>}
  </header>;
}

function HomeScreen({ startAs, level, setLevel, blocked, newlyUnlocked }: { startAs: (mode: EntryMode) => void; level: Level; setLevel: (level: Level) => void; blocked: string | null; newlyUnlocked: Level | null }) {
  const modes = [
    { id: 'solo' as const, title: 'Solo', tint: 'sky', character: 'nuri' as const },
    { id: 'together' as const, title: 'Together', tint: 'grass', character: 'boaz' as const },
    { id: 'online' as const, title: 'Online', tint: 'violet', character: 'mira' as const },
    { id: 'timeattack' as const, title: 'Time Attack', tint: 'berry', character: 'tali' as const },
  ];
  const stopped = Boolean(blocked);
  return <main className="home-shell">
    <section className="home-grid">
      <h1 className="home-title-plaque">WordIn</h1>
      <div className="home-signposts" aria-hidden="true">
        {['Rivers', 'Villages', 'High Places', 'New World'].map((label) => <span key={label} className="home-signpost">{label}</span>)}
      </div>
      <LevelBar selected={level} onSelect={setLevel} variant="ground" newlyUnlocked={newlyUnlocked} />
      <GameCharacter character="nuri" mood="idle" size="large" className="home-mascot" />
      {stopped && <p className="field-help warn" role="status">{blocked}</p>}
      <div className="home-mode-row" aria-label="Choose how to play">
        {modes.map((item) => {
          const gated = Boolean(blocked) && (item.id === 'solo' || item.id === 'together');
          return <button key={item.id} type="button" disabled={gated} onClick={() => startAs(item.id)} className={`home-mode-chip home-mode-tint-${item.tint}`} aria-label={`Play ${item.title}`}>
            <GameCharacter character={item.character} mood="idle" size="small" className="home-mode-chip-character" />
            <small>{item.title}</small>
          </button>;
        })}
      </div>
    </section>
  </main>;
}

/** The category toggle grid, shared by solo/together's `SettingsPanel` and
 * the room lobby's `RoomSettingsPanel` -- the only piece of "choose your
 * word set" that means the same thing regardless of how the level or
 * difficulty is picked. */
function CategoryPicker({ categories, setCategories }: { categories: Category[]; setCategories: (categories: Category[]) => void }) {
  const toggleCategory = (category: Category) => {
    const active = categories.includes(category);
    if (active && categories.length === 1) return;
    setCategories(active ? categories.filter((item) => item !== category) : [...categories, category]);
  };
  return <fieldset><legend>Word set</legend><div className="choice-grid three">
    {(['book', 'person', 'place'] as Category[]).map((category) => { const isSelected = categories.includes(category); return <button type="button" key={category} className={`choice-card ${isSelected ? 'selected' : ''}`} onClick={() => toggleCategory(category)} aria-pressed={isSelected}>
      <span><GameIcon name={category} /></span><strong>{category === 'book' ? 'Bible Books' : category === 'person' ? 'People' : 'Places'}</strong>
      {isSelected && <span className="choice-check" aria-hidden="true">✓</span>}
    </button>; })}
  </div></fieldset>;
}

function PuzzleCount({ value, min = 3, max, setValue }: { value: number; min?: number; max: number; setValue: (value: number) => void }) {
  return <div className="puzzle-count" aria-label="Number of puzzles">
    <span className="puzzle-count-copy"><small>Puzzles</small><strong>{value}</strong></span>
    <div className="puzzle-stepper">
      <button type="button" aria-label="Fewer puzzles" disabled={value <= min} onClick={() => setValue(Math.max(min, value - 1))}>−</button>
      <button type="button" aria-label="More puzzles" disabled={value >= max} onClick={() => setValue(Math.min(max, value + 1))}>+</button>
    </div>
  </div>;
}

function SettingsPanel({ settings, setSettings, showLength = true }: { settings: GameSettings; setSettings: (settings: GameSettings) => void; showLength?: boolean }) {
  const pool = eligibleWords(settings).length;
  const blocked = unplayableReason(settings);
  // With an empty pool the length controls would clamp to zero and offer a
  // match with no puzzles; hold them at the minimum instead and let the
  // Start button carry the explanation.
  const cap = Math.max(3, pool);
  return <div className="settings-stack">
    <CategoryPicker categories={settings.categories} setCategories={(categories) => setSettings({ ...settings, categories })} />
    {/* A host setting the length for a group (Play Together, an online
        room) is a real decision, so this control stays. Solo derives its
        length from the level instead -- see `SoloLengthSummary` below --
        which is why this fieldset is skippable. */}
    {showLength && <div className="count-setting"><PuzzleCount value={settings.length} max={cap} setValue={(length) => setSettings({ ...settings, length })} /><p className={`field-help${blocked ? ' warn' : ''}`}>{blocked ?? `${pool} words · No repeats`}</p></div>}
  </div>;
}

/** The room lobby's word-set and puzzle-count controls. A near-twin of
 * `SettingsPanel`, but keyed to `RoomSettings.difficulty` rather than
 * `GameSettings.maxBand` -- `roomWordPool`/`roomUnplayableReason` are the
 * room equivalents of `eligibleWords`/`unplayableReason` for that reason.
 * The puzzle-count control stays here unconditionally: a host choosing
 * length for a group is a real decision, unlike solo choosing for itself. */
function RoomSettingsPanel({ settings, setSettings }: { settings: RoomSettings; setSettings: (settings: RoomSettings) => void }) {
  const pool = roomWordPool(settings.difficulty, settings.categories);
  const blocked = roomUnplayableReason(settings.difficulty, settings.categories);
  const cap = Math.max(3, pool);
  return <div className="settings-stack">
    <CategoryPicker categories={settings.categories} setCategories={(categories) => setSettings({ ...settings, categories })} />
    <div className="count-setting"><PuzzleCount value={settings.length} max={cap} setValue={(length) => setSettings({ ...settings, length })} /><p className={`field-help${blocked ? ' warn' : ''}`}>{blocked ?? `${pool} words · No repeats`}</p></div>
  </div>;
}

/** Solo no longer asks how many puzzles -- the run's length is derived
 * from the level (`runLengthFor`), and says so in plain words instead of
 * offering a choice. Anyone who still wants a different length can reveal
 * the same clamped number input a "Change length" tap away; the value
 * they pick is held in `override` by the caller, not in `settings` itself,
 * so it survives a level change without ever losing track of which one is
 * the level's default and which one was chosen on purpose. */
function SoloLengthSummary({ settings, override, setOverride }: { settings: GameSettings; override: number | null; setOverride: (value: number | null) => void }) {
  const pool = eligibleWords(settings).length;
  const cap = Math.max(3, pool);
  const blocked = unplayableReason(settings);
  return <fieldset className="solo-length-panel"><legend>Your run</legend>
    <div className="solo-run-row"><span><small>Level</small><strong>{LEVEL_NAMES[settings.maxBand - 1]}</strong></span><PuzzleCount value={override ?? settings.length} max={cap} setValue={setOverride} /></div>
    <p className={`field-help${blocked ? ' warn' : ''}`}>{blocked ?? `${pool} words · No repeats`}</p>
  </fieldset>;
}

function SetupScreen({ entryMode, settings, setSettings, togetherMode, setTogetherMode, teams, setTeams, start, back, soloLengthOverride, setSoloLengthOverride }: {
  entryMode: EntryMode; settings: GameSettings; setSettings: (settings: GameSettings) => void; togetherMode: PlayMode; setTogetherMode: (mode: PlayMode) => void;
  teams: Team[]; setTeams: (teams: Team[]) => void; start: () => void; back: () => void;
  soloLengthOverride: number | null; setSoloLengthOverride: (value: number | null) => void;
}) {
  const updateTeam = (index: number, name: string) => setTeams(teams.map((team, position) => position === index ? { ...team, name: name.slice(0, 18) } : team));
  return <main className="page-shell setup-stage"><section className="panel setup-panel"><GameCharacter character={entryMode === 'solo' ? 'nuri' : 'boaz'} mood="think" size="medium" className="setup-character" /><button className="back-button" type="button" onClick={back}>← Back</button>
    <h1 className="setup-mode-title">{entryMode === 'solo' ? 'Solo journey' : 'Play together'}</h1>
    {entryMode === 'together' && <fieldset className="play-style-picker"><legend>Play style</legend><div className="choice-grid two">
      <button type="button" className={`wide-choice ${togetherMode === 'cooperative' ? 'selected' : ''}`} aria-pressed={togetherMode === 'cooperative'} title="Cooperative — solve together for one score" onClick={() => setTogetherMode('cooperative')}><span className="play-style-icon"><GameIcon name="together" /></span><strong>Co-op</strong></button>
      <button type="button" className={`wide-choice ${togetherMode === 'teams' ? 'selected' : ''}`} aria-pressed={togetherMode === 'teams'} title="Teams — compete head to head" onClick={() => setTogetherMode('teams')}><span className="play-style-icon"><GameIcon name="teams" /></span><strong>Teams</strong></button>
    </div></fieldset>}
    {entryMode === 'together' && togetherMode === 'teams' && <details className="team-drawer"><summary><span><GameIcon name="teams" /></span><strong>{teams.length} teams</strong><small>Edit names</small><span className="drawer-chevron" aria-hidden="true">⌄</span></summary><div className="team-inputs">
      {teams.map((team, index) => <label key={team.id}><span style={{ background: team.color }} /><input value={team.name} aria-label={`Team ${index + 1} name`} onChange={(event) => updateTeam(index, event.target.value)} /></label>)}
      <div className="mini-actions">{teams.length < 4 && <button type="button" onClick={() => setTeams([...teams, { id: `team-${teams.length + 1}`, name: `Team ${teams.length + 1}`, color: TEAM_COLORS[teams.length], score: 0 }])}>+ Add team</button>}{teams.length > 2 && <button type="button" onClick={() => setTeams(teams.slice(0, -1))}>− Remove</button>}</div>
    </div></details>}
    <SettingsPanel settings={settings} setSettings={setSettings} showLength={entryMode !== 'solo'} />
    {entryMode === 'solo' && <SoloLengthSummary settings={settings} override={soloLengthOverride} setOverride={setSoloLengthOverride} />}
    <button className="primary-button full-button quest-play-button" type="button" disabled={Boolean(unplayableReason(settings))} onClick={start}>Play <span aria-hidden="true">▶</span></button>
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
  const [summary, setSummary] = useState<{ points: number; isBest: boolean; previousBest: number; lifetime: number; mastered: number; coinsEarned: number; gemEarned: boolean } | null>(null);
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
        coinsEarned: outcome.coinsEarned,
        gemEarned: outcome.gemEarned,
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
  const shuffleTray = () => { playShuffle(); setOrder(shuffledOrder(puzzle.scramble.length)); };
  const rematch = () => { finishedRef.current = false; const fresh = createFreshRecipe(settings); setRecipe(fresh); setTimeLeft(secondsForPuzzle(fresh, 0)); setIndex(0); setScores(scores.map((team) => ({ ...team, score: 0 }))); setCorrectCount(0); setWrongCount(0); setRevealCount(0); setFinished(false); resetPuzzle(); setSolvedIds([]); setCombo(0); setSummary(null); setUnlocked(null); };
  if (finished) {
    const ranking = [...scores].sort((a, b) => b.score - a.score);
    const winner = ranking[0];
    const accuracy = correctCount + wrongCount === 0 ? 0 : Math.round((correctCount / Math.max(1, correctCount + wrongCount)) * 100);
    // Matches the `wrong` count `recordMatch` was given (below, in `next()`)
    // so the stars shown here always agree with the coins paid for them.
    const stars = matchStars({ correct: correctCount, wrong: wrongCount + revealCount });
    return <Results
      character={mode === 'solo' ? 'nuri' : 'boaz'}
      stars={stars}
      subtitle="Quest complete"
      title={mode === 'teams' ? `${winner.name} wins!` : mode === 'solo' ? 'Trail cleared!' : 'Great teamwork!'}
      banner={unlocked ? <div className="unlock-banner" role="status">
        <span className="unlock-key" aria-hidden="true">🔓</span>
        <strong>{unlocked.name} unlocked</strong>
        <small>A new level is open on your journey.</small>
      </div> : undefined}
      headline={{ value: winner.score, label: 'points' }}
      coinsEarned={summary?.coinsEarned}
      gemEarned={summary?.gemEarned}
      scripture={unlocked ? `${unlocked.name} is open` : `${correctCount} words remembered`}
      scriptureLabel="Journey reward"
      extra={<>
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
      </>}
      stats={[{ label: 'Solved', value: correctCount }, { label: 'Misses', value: wrongCount }, { label: 'Accuracy', value: `${accuracy}%` }]}
      primaryLabel="Play again"
      onPrimary={rematch}
      secondaryAction={<button className="secondary-button" type="button" onClick={onChangeSet} aria-label="Change word set">⚙</button>}
      onHome={onHome}
    />;
  }
  return <main className="game-shell">
    {celebration && <BigCelebration key={celebration.id} title={celebration.title} subtitle={celebration.subtitle} character={mode === 'solo' ? 'nuri' : 'boaz'} />}
    {missPop !== null && <MissPopup key={missPop} character={mode === 'solo' ? 'nuri' : 'boaz'} />}
    <MissionHud
      character={<GameCharacter character={mode === 'solo' ? 'nuri' : 'boaz'} mood={resolved ? resolved.correct ? 'cheer' : 'oops' : timerMode === 'enforced' && timeLeft <= Math.ceil(secondsTotal * 0.3) ? 'urgent' : 'think'} size="small" />}
      mission={`${index + 1} / ${recipe.puzzles.length}`}
      progress={((index + 1) / recipe.puzzles.length) * 100}
      urgent={timerMode === 'enforced' && timeLeft <= Math.ceil(secondsTotal * 0.3)}
      timer={timerMode !== 'none' ? <><span aria-hidden="true">◷</span><strong>{timeLeft}</strong></> : undefined}
      score={<div className="hud-score-row">{scores.map((team) => <span key={team.id}><i style={{ background: team.color }} />{team.name}<strong key={team.score}>{team.score}</strong><ScoreFlight score={team.score} /></span>)}</div>}
    />
    {mode === 'teams' && !resolved && <div className="claim-panel"><p>{claimedBy ? <><strong>{scores.find((team) => team.id === claimedBy)?.name}</strong> is building</> : 'Who knows it? Claim the puzzle.'}</p><div>{scores.map((team) => <button type="button" key={team.id} disabled={Boolean(claimedBy)} style={{ '--team-color': team.color } as React.CSSProperties} onClick={() => setClaimedBy(team.id)}>{claimedBy === team.id ? 'Building…' : `Claim · ${team.name}`}</button>)}{claimedBy && <button type="button" className="release" onClick={() => { setClaimedBy(null); setPlaced([]); }}>Release</button>}</div></div>}
    <section className="puzzle-card play-card"><div className="card-top"><div><p className="puzzle-kicker">{entry.categories[0]} · {LEVEL_NAMES[entry.band - 1]}</p><h1>{resolved ? entry.display : 'Build the word'}</h1></div><span className="points-pill">{currentValue}</span></div>
      {timerMode === 'bonus' && !metLevelBefore && !resolved && <p className="notice">A clock from here on — but running out costs you nothing. Beat it and it pays a speed bonus.</p>}
      <TileBoard scramble={puzzle.scramble} placed={placed} setPlaced={setPlaced} order={order ?? undefined} shakeKey={shake ?? undefined} feedback={resolved ? resolved.correct ? 'correct' : 'wrong' : 'playing'} locked={Boolean(resolved) || (mode === 'teams' && !claimedBy)} />
      {hints > 0 && !resolved && <div className="hint-box"><span className="hint-icon" aria-hidden="true">💡</span><div className="hint-lines">{ladder.slice(0, hints).map((hint) => <p key={hint.kind}>{hint.text}</p>)}</div></div>}
      {resolved ? <Resolution lead={resolved.revealed ? 'The answer was' : 'Beautiful work!'} word={entry.display} reference={entry.references[0]} award={resolved.award ? `+${resolved.award} points` : 'No points this time'}><GameCharacter character={mode === 'solo' ? 'nuri' : 'boaz'} mood={resolved.correct ? 'cheer' : 'oops'} size="medium" className="resolution-character" /><button type="button" className="primary-button" onClick={next}>{index === recipe.puzzles.length - 1 ? 'See results' : 'Next puzzle'}</button></Resolution>
      : <div className="game-actions tool-dock"><GameTool icon="💡" label={nextHint ? HINT_LABELS[nextHint.kind] : 'Hints used'} count={Math.max(0, ladder.length - hints)} disabled={!nextHint} onClick={takeHint} tone="gold" /><GameTool icon="↻" label="Shuffle" onClick={shuffleTray} /><GameTool icon="🔨" label="Clear" disabled={placed.length === 0} onClick={() => { rejectedRef.current = null; setPlaced([]); }} tone="coral" /><GameTool icon="🧭" label="Reveal" onClick={reveal} tone="violet" /></div>}
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

function BigCelebration({ title, subtitle, character = 'nuri' }: { title: string; subtitle: string; character?: GameCharacterId }) {
  return <div className="big-celebration" role="status" aria-live="assertive">
    <Confetti count={40} />
    <div className="big-celebration-bubble"><GameCharacter character={character} mood="cheer" size="medium" /><strong>{title}</strong><span>{subtitle}</span></div>
  </div>;
}

/** Center-screen pop for a wrong answer -- appears, sits briefly, vanishes.
 * No confetti, no full-page wash; a lighter, quicker beat than a win. */
function MissPopup({ character = 'nuri' }: { character?: GameCharacterId }) {
  return <div className="miss-popup" role="status" aria-live="assertive">
    <div className="miss-popup-bubble"><GameCharacter character={character} mood="oops" size="medium" /><strong>Oh no!</strong><span>Try again</span></div>
  </div>;
}

function TimeAttackGame({ categories, sound, started, onStart, onHome, onReplay }: { categories: Category[]; sound: boolean; started: boolean; onStart: () => void; onHome: () => void; onReplay: () => void }) {
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
  const [timeLeft, setTimeLeft] = useState<number>(() => timeAttackSecondsFor(startLevel, queue[0]?.scramble.length ?? 0));
  const [resolved, setResolved] = useState<{ correct: boolean; gained: number } | null>(null);
  const [combo, setCombo] = useState(0);
  const [finished, setFinished] = useState<'strikes' | 'cleared' | 'ended' | null>(null);
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
        secondsLeft: timeLeft,
        secondsTotal: timeAttackSecondsFor(band, puzzle.scramble.length),
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
      setTimeLeft(timeAttackSecondsFor(band, remaining[0].scramble.length));
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
      setTimeLeft(timeAttackSecondsFor(nextBand, nextQueue[0]?.scramble.length ?? 0));
      showToast(`Leveling up: ${LEVEL_NAMES[nextBand - 1]}!`);
      return;
    }
    setFinished('cleared');
  }


  // Time Attack always has a per-word countdown. Journey levels can be
  // untimed, but an arcade mode without a clock breaks its own promise.
  useEffect(() => {
    if (!started || resolved || finished || !entry || timeLeft <= 0) return;
    const timer = window.setTimeout(() => setTimeLeft((value: number) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [timeLeft, resolved, finished, entry, started]);

  // A spent Time Attack clock is always a miss. Schedule the state change so
  // the zero frame paints before the resolution animation begins.
  useEffect(() => {
    if (!started || resolved || finished || !entry || timeLeft > 0) return;
    const strike = window.setTimeout(() => resolveWord(false), 0);
    return () => window.clearTimeout(strike);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, resolved, finished, entry, started]);

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
    if (!started || resolved || finished || !entry || !puzzle) return;
    if (placed.length !== puzzle.scramble.length) return;
    const timer = window.setTimeout(() => {
      resolveWord(normalizeAnswer(placed.map((source) => puzzle.scramble[source]).join('')) === entry.answer);
    }, 250);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placed, resolved, finished, entry, puzzle, started]);

  useEffect(() => {
    if (finished && !savedRef.current) {
      savedRef.current = true;
      if (score > personalBest) saveHighScore(score);
      if (sound && score > 0) playRewardFanfare();
    }
  }, [finished, score, personalBest, sound]);

  if (!entry || !puzzle) return <main className="page-shell"><section className="panel results-panel">
    <div className="celebration">🔒</div>
    <p className="section-kicker">Time Attack</p>
    <h1 className="page-title">No words to race</h1>
    <p className="page-subtitle">{unplayableReason({ categories, maxBand: band, length: 1 }) ?? 'Choose a different word set to start a run.'}</p>
    <div className="result-actions"><button className="primary-button" type="button" onClick={onHome}>Home</button></div>
  </section></main>;

  if (!started) {
    return <main className="page-shell time-attack-launch-stage"><section className="panel time-attack-launch">
      <ResultMascot character="tali" />
      <span className="mode-medallion" aria-hidden="true"><GameIcon name="timeattack" /></span>
      <p className="section-kicker">Arcade challenge</p>
      <h1 className="page-title">Time Attack</h1>
      <p className="page-subtitle">Beat each clock, protect your three hearts, and climb for a high score.</p>
      <div className="mission-rules">
        <span><b>⏱</b><strong>Clock</strong><small>Every word</small></span>
        <span><b>♥</b><strong>3 hearts</strong><small>Solve refills</small></span>
        <span><b>★</b><strong>High score</strong><small>{personalBest} best</small></span>
      </div>
      <button className="primary-button launch-play-button" type="button" onClick={onStart}>Play <span aria-hidden="true">▶</span></button>
      <button className="text-button launch-home-button" type="button" onClick={onHome}>Back</button>
    </section></main>;
  }

  if (finished) {
    const best = Math.max(score, personalBest);
    const cleared = finished === 'cleared';
    const ended = finished === 'ended';
    const stars = matchStars({ correct: solved, wrong: strikes });
    return <>
      {score >= personalBest && score > 0 && <Confetti key="final" />}
      <Results
        character="tali"
        stars={stars}
        subtitle="Time Attack"
        title={cleared ? 'Perfect clear!' : ended ? 'Run ended' : 'Time’s up!'}
        headline={{ value: score, label: 'points' }}
        stats={[{ label: 'Solved', value: solved }, { label: 'Reached', value: LEVEL_NAMES[band - 1] }, { label: 'Best score', value: best }]}
        primaryLabel="Play again"
        onPrimary={onReplay}
        onHome={onHome}
      />
    </>;
  }

  const timeLimit = timeAttackSecondsFor(band, puzzle.scramble.length);
  const urgent = timeLeft <= Math.ceil(timeLimit * 0.3);
  return <main className="game-shell">
    {celebration && <BigCelebration key={celebration.id} title={celebration.title} subtitle={celebration.subtitle} character="tali" />}
    <MissionHud
      character={<GameCharacter character="tali" mood={resolved ? resolved.correct ? 'cheer' : 'oops' : urgent ? 'urgent' : 'think'} size="small" />}
      mission={`${LEVEL_NAMES[band - 1]} · ${solved}`}
      progress={(timeLeft / Math.max(1, timeLimit)) * 100}
      urgent={urgent}
      timer={<><span aria-hidden="true">◷</span><strong>{timeLeft}</strong></>}
      score={<><span className="heart-meter" aria-label={`${3 - strikes} hearts left`}>{'♥'.repeat(3 - strikes)}<i>{'♥'.repeat(strikes)}</i></span><strong key={score}>{score}</strong><ScoreFlight score={score} /></>}
    />
    <section className="puzzle-card play-card">
      <div className="card-top"><div><p className="puzzle-kicker">{entry.categories[0]} · {LEVEL_NAMES[entry.band - 1]}</p><h1>{resolved ? entry.display : 'Build the word'}</h1></div><span className="points-pill">×{Math.max(1, combo + 1)}</span></div>
      <TileBoard scramble={puzzle.scramble} placed={placed} setPlaced={setPlaced} order={order ?? undefined} feedback={resolved ? resolved.correct ? 'correct' : 'wrong' : 'playing'} locked={Boolean(resolved)} />
      {resolved && <Resolution lead={resolved.correct ? 'Solved it' : 'Missed it'} word={entry.display} reference={entry.references[0]} award={resolved.correct ? `+${resolved.gained} points` : 'No points'}><GameCharacter character="tali" mood={resolved.correct ? 'cheer' : 'oops'} size="medium" className="resolution-character" /></Resolution>}
      {!resolved && <div className="game-actions tool-dock arcade-tools"><GameTool icon="↻" label="Shuffle" onClick={() => { playShuffle(); setOrder(shuffledOrder(puzzle.scramble.length)); }} /><GameTool icon="🔨" label="Clear" disabled={placed.length === 0} onClick={() => setPlaced([])} tone="coral" /></div>}
    </section>
    <button type="button" className="quit-button" onClick={() => setFinished('ended')}>End run</button>
  </main>;
}

function OnlineEntry({ onBack, onConnected, initialCode }: { onBack: () => void; onConnected: (credentials: Credentials) => void; initialCode: string }) {
  const [kind, setKind] = useState<'create' | 'join'>(initialCode ? 'join' : 'create'); const [name, setName] = useState(''); const [code, setCode] = useState(initialCode); const [busy, setBusy] = useState(false);
  const submit = async () => { setBusy(true); try { const response = await fetch(kind === 'create' ? '/api/rooms' : `/api/rooms/${code}/join`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(kind === 'create' ? { name, settings: DEFAULT_ROOM_SETTINGS, mode: 'individuals' } : { name }) }); const data = await response.json() as Credentials & { error?: string }; if (!response.ok) throw new Error(data.error || 'Could not connect.'); onConnected(data); } catch (caught) { showToast(caught instanceof Error ? caught.message : 'Could not connect.', 'error'); } finally { setBusy(false); } };
  return <main className="page-shell character-menu-stage"><section className="panel online-entry character-menu"><GameCharacter character="tali" mood="think" size="medium" className="menu-character" /><button className="back-button" type="button" onClick={onBack}>← Back</button><h1 className="page-title">Online room</h1>
    <div className="tabs room-entry-tabs"><button type="button" className={kind === 'create' ? 'active' : ''} onClick={() => setKind('create')}>Create</button><button type="button" className={kind === 'join' ? 'active' : ''} onClick={() => setKind('join')}>Join</button></div>
    <div className="form-stack"><label>Display name<input value={name} maxLength={24} autoComplete="name" placeholder="Your name" onChange={(event) => setName(event.target.value)} /></label>{kind === 'join' && <label>Room code<input className="code-input" value={code} maxLength={6} placeholder="A7K4PQ" autoCapitalize="characters" onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ''))} /></label>}<button type="button" disabled={busy} className="primary-button room-entry-action" onClick={submit}>{busy ? '…' : kind === 'create' ? 'Create' : 'Join'}</button></div>
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
  if (snapshot.status === 'LOBBY') return <OnlineLobby key={`${snapshot.code}-${isHost}`} snapshot={snapshot} viewer={viewer} isHost={isHost} busy={busy} action={action} leave={leave} />;
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
    <p className="page-subtitle">{roomUnplayableReason(snapshot.settings.difficulty, snapshot.settings.categories) ?? 'The match could not be built. Head back to the lobby and pick another difficulty or word set.'}</p>
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
  return <main className="game-shell online-play-shell"><div className="room-banner"><span>Room <strong>{snapshot.code}</strong></span><span>{error || '●'}</span></div>
    {isHost && <div className="host-controls">
      {snapshot.status === 'PUZZLE_OPEN' && <button type="button" className="host-tool" title="Skip puzzle" aria-label="Skip puzzle" disabled={busy} onClick={() => action({ action: 'skip' })}>»</button>}
      <button type="button" className="host-tool danger" title="End match" aria-label="End match" disabled={busy} onClick={() => action({ action: 'end' })}>■</button>
    </div>}
    {paused && <p className="notice">The host paused this puzzle.</p>}
    <MissionHud
      pauseButton={isHost && snapshot.status === 'PUZZLE_OPEN' ? <button type="button" title={paused ? 'Resume' : 'Pause'} aria-label={paused ? 'Resume' : 'Pause'} disabled={busy} onClick={() => action({ action: paused ? 'resume' : 'pause' })}>{paused ? '▶' : 'Ⅱ'}</button> : undefined}
      character={<GameCharacter character="tali" mood={snapshot.status === 'PUZZLE_RESOLVED' ? viewerSolve ? 'cheer' : 'oops' : 'think'} size="small" />}
      mission={`${snapshot.currentIndex + 1} / ${snapshot.puzzleCount}`}
      progress={((snapshot.currentIndex + 1) / snapshot.puzzleCount) * 100}
      score={snapshot.mode === 'teams' ? <div className="hud-score-row">{teamScores.map((side) => <span key={side.id}>{side.name}<strong>{side.score}</strong></span>)}</div> : <><span aria-hidden="true">★</span><strong>{viewer?.score ?? 0}</strong></>}
    />
    <Standings players={snapshot.players} viewerId={snapshot.viewerId} answeredIds={snapshot.resolution?.answeredIds ?? []} phase="play" isHost={isHost} onKick={kick} />
    <section className="puzzle-card play-card"><div className="card-top"><div><p className="puzzle-kicker">{puzzle.category} · {LEVEL_NAMES[puzzle.band - 1]}</p><h1>{snapshot.status === 'PUZZLE_RESOLVED' ? puzzle.display : 'Build the word'}</h1></div><span className="points-pill">{scoreSolve({ letterCount: puzzle.scramble.length, level: puzzle.band, combo: 0, hintsUsed: snapshot.viewerHints })}</span></div>
      <TileBoard scramble={puzzle.scramble} placed={placed} setPlaced={setPlaced} order={order ?? undefined} feedback={snapshot.status === 'PUZZLE_RESOLVED' ? viewerSolve ? 'correct' : 'wrong' : 'playing'} locked={boardLocked} />
      {snapshot.viewerHints > 0 && snapshot.status === 'PUZZLE_OPEN' && !spectating && !sittingOut && <div className="hint-box"><span className="hint-icon" aria-hidden="true">💡</span><div className="hint-lines">{puzzle.hints.slice(0, snapshot.viewerHints).map((hint) => <p key={hint.kind}>{hint.text}</p>)}</div></div>}
      {snapshot.status === 'PUZZLE_RESOLVED' ? <Resolution lead={lead} word={puzzle.display ?? ''} reference={puzzle.reference} award={viewerSolve ? `+${viewerSolve.award} points` : 'No points this time'}>{solvers.length > 0 && <Confetti key={snapshot.currentIndex} />}<GameCharacter character="tali" mood={viewerSolve ? 'cheer' : 'oops'} size="medium" className="resolution-character" />{isHost ? <button type="button" className="primary-button" onClick={() => action({ action: 'next' })}>Next puzzle</button> : <p>Waiting for the host…</p>}</Resolution>
      : spectating ? <p className="notice">You&rsquo;re watching this room.</p>
      : sittingOut ? <p className="notice">You&rsquo;ll join in on the next puzzle.</p>
      : viewerSolve ? <p className="notice">Nice! +{viewerSolve.award} points — waiting for the round to finish…</p>
      : paused ? null
      : <div className="game-actions tool-dock"><GameTool icon="💡" label={puzzle.hints[snapshot.viewerHints]?.kind ? HINT_LABELS[puzzle.hints[snapshot.viewerHints].kind] : 'Hints used'} count={Math.max(0, puzzle.hints.length - snapshot.viewerHints)} disabled={snapshot.viewerHints >= puzzle.hints.length || busy} onClick={() => action({ action: 'hint' })} tone="gold" /><GameTool icon="↻" label="Shuffle" onClick={() => { playShuffle(); setOrder(shuffledOrder(puzzle.scramble.length)); }} /><GameTool icon="🔨" label="Clear" disabled={placed.length === 0} onClick={() => setPlaced([])} tone="coral" />{isHost && <GameTool icon="🧭" label="Reveal" onClick={() => action({ action: 'reveal' })} tone="violet" />}</div>}
      <button type="button" className="quit-button" onClick={leave}>Leave room</button>
    </section></main>;
}

function OnlineLobby({ snapshot, viewer, isHost, busy, action, leave }: { snapshot: RoomSnapshot; viewer?: RoomPlayer; isHost: boolean; busy: boolean; action: (input: Record<string, unknown>) => void; leave: () => void }) {
  const [settings, setSettings] = useState(snapshot.settings); const [mode, setMode] = useState(snapshot.mode); const joinUrl = typeof window !== 'undefined' ? `${window.location.origin}?room=${snapshot.code}` : '';
  // The difficulty picker is deliberately ungated, so a host can land on
  // one their categories have no words at. Say so here rather than
  // letting them start a match nobody can play.
  const blocked = roomUnplayableReason(settings.difficulty, settings.categories);
  const copy = async () => { try { await navigator.clipboard.writeText(joinUrl); } catch { /* clipboard can be blocked */ } };
  const activePlayers = snapshot.players.filter((player) => player.role === 'player' && !player.left);
  const seatedCount = activePlayers.length;
  const spectatorCount = snapshot.players.filter((player) => player.role === 'spectator' && !player.left).length;
  const campSeats = Array.from({ length: 6 }, (_, index) => activePlayers[index] ?? null);
  return <main className="page-shell character-menu-stage"><section className="panel lobby-panel character-menu"><GameCharacter character="tali" mood="idle" size="medium" className="menu-character" />
    <div className="lobby-heading">
      <button type="button" className="lobby-back-button" onClick={leave} aria-label="Leave room">‹</button>
      <div><p className="section-kicker">Room code</p><h1 className="room-code">{snapshot.code}</h1></div>
      <button type="button" className="lobby-invite-button" onClick={copy} aria-label="Copy invite link">＋👤</button>
    </div>
    <div className="room-camp" aria-label={`${seatedCount} players in the room`}>
      <div className="camp-code"><small>Room</small><strong>{snapshot.code}</strong></div>
      <div className="campfire" aria-hidden="true"><i /><i /><span>✦</span></div>
      {campSeats.map((player, index) => <div key={player?.id ?? `empty-${index}`} className={`camp-seat camp-seat-${index + 1}${player?.ready ? ' ready' : ''}${player?.teamId ? ` team-${player.teamId}` : ''}${player ? '' : ' empty'}`}>
        <span className="camp-avatar" style={player && !player.teamId ? { '--seat-accent': seatAccent(player.id) } as React.CSSProperties : undefined}>{player ? player.name[0]?.toUpperCase() : '+'}{player?.isHost && <b aria-label="Host">♛</b>}</span>
        <small>{player ? player.name : 'Open'}</small>
        {player && <i>{player.ready ? 'Ready' : 'Waiting'}</i>}
      </div>)}
    </div>
    {!isHost && viewer?.role === 'player' && <button type="button" disabled={busy} className="room-ready-toggle" aria-pressed={viewer.ready} onClick={() => action({ action: 'ready', ready: !viewer.ready })}>{viewer.ready ? '✓ Ready' : 'Ready'}</button>}
    <div className="lobby-grid">
      <div className="lobby-players">
        <details className="room-roster"><summary>Players <span>{seatedCount}/{MAX_ROOM_PLAYERS}{spectatorCount > 0 ? ` · ${spectatorCount} watching` : ''}</span></summary><div className="player-list">{snapshot.players.filter((player) => !player.left).map((player) => <div key={player.id}>
          <span className="avatar">{player.name[0]?.toUpperCase()}</span>
          <strong>{player.name}{player.id === viewer?.id ? ' (you)' : ''}{player.isHost && <small>Host</small>}</strong>
          <em>{player.role === 'spectator' ? 'Watching' : player.ready ? '✓ Ready' : 'Not ready'}</em>
        </div>)}</div></details>
      </div>
      <div className="lobby-settings">
        {isHost ? <>
          <div className="tabs compact three-tabs" aria-label="Room play style">
            <button type="button" aria-pressed={mode === 'individuals'} className={mode === 'individuals' ? 'active' : ''} onClick={() => setMode('individuals')}>Solo</button>
            <button type="button" aria-pressed={mode === 'teams'} className={mode === 'teams' ? 'active' : ''} onClick={() => setMode('teams')}>Teams</button>
            <button type="button" aria-pressed={mode === 'cooperative'} className={mode === 'cooperative' ? 'active' : ''} onClick={() => setMode('cooperative')}>Co-op</button>
          </div>
          <fieldset className="room-difficulty"><legend>Difficulty</legend><DifficultyBar selected={settings.difficulty} onSelect={(difficulty) => setSettings({ ...settings, difficulty })} /></fieldset>
          <RoomSettingsPanel settings={settings} setSettings={setSettings} />
        </> : <div className="setting-summary"><p><strong>{snapshot.mode === 'individuals' ? 'Solo' : snapshot.mode === 'teams' ? 'Teams' : 'Co-op'}</strong> · {roomDifficultyLabel(snapshot.settings.difficulty)} · {snapshot.settings.length} puzzles</p><p>{snapshot.settings.categories.join(' + ')}</p></div>}
      </div>
    </div>
    <div className="room-actions">
      <button type="button" className="text-button" onClick={leave}>Leave room</button>
      {isHost && <button type="button" disabled={busy || Boolean(blocked)} className="primary-button room-start-button" onClick={() => action({ action: 'start', settings, mode })}>{busy ? 'Starting…' : 'Start match'} <span aria-hidden="true">▶</span></button>}
    </div>
  </section></main>;
}

/** Online rooms track only a cumulative `score` per player/side, not
 * correct/wrong counts, so results use a rank-based approximation instead
 * of `matchStars` -- top score (or a tie for it) is a clean sweep, the
 * middle of the pack is solid, and a lone or zero score is a consolation
 * star rather than a flat constant every room used to show. */
function rankStars(score: number, allScores: number[]): number {
  if (score <= 0) return allScores.every((value) => value <= 0) ? 0 : 1;
  const best = Math.max(...allScores, 0);
  if (score >= best) return 3;
  const sorted = [...allScores].sort((a, b) => b - a);
  const medianIndex = Math.floor(sorted.length / 2);
  return score >= (sorted[medianIndex] ?? 0) ? 2 : 1;
}

function OnlineResults({ snapshot, isHost, action, leave }: { snapshot: RoomSnapshot; isHost: boolean; action: (input: Record<string, unknown>) => void; leave: () => void }) {
  const sides = snapshot.mode === 'teams' ? ([['sun', 'Sun Team'], ['olive', 'Olive Team']] as const).map(([id, name]) => ({ id, name, score: snapshot.players.filter((player) => player.teamId === id).reduce((sum, player) => sum + player.score, 0) })) : snapshot.players.map((player) => ({ id: player.id, name: player.name, score: player.score }));
  const ranking = [...sides].sort((a, b) => b.score - a.score);
  // In teams mode `sides` is keyed by team id ('sun'/'olive'), never a
  // player id, so the viewer's own side has to be resolved through their
  // team membership first -- looking it up by `viewerId` directly always
  // missed and silently scored every viewer against the winning side.
  const viewerSideId = snapshot.mode === 'teams'
    ? snapshot.players.find((player) => player.id === snapshot.viewerId)?.teamId
    : snapshot.viewerId;
  const viewerScore = sides.find((side) => side.id === viewerSideId)?.score ?? ranking[0]?.score ?? 0;
  const stars = rankStars(viewerScore, sides.map((side) => side.score));
  return <Results
    character="tali"
    stars={stars}
    subtitle={`Room ${snapshot.code}`}
    title={snapshot.mode === 'cooperative' ? 'Great teamwork!' : `${ranking[0]?.name} wins!`}
    headline={{ value: ranking[0]?.score ?? 0, label: 'points' }}
    scripture={`${snapshot.puzzleCount} words shared`}
    scriptureLabel="Room reward"
    extra={snapshot.mode === 'teams'
      ? <div className="leaderboard">{ranking.map((side, index) => <div key={side.id}><span>{index + 1}</span><span className="avatar">{side.name[0]}</span><strong>{side.name}</strong><b>{side.score}</b></div>)}</div>
      : <Standings players={snapshot.players} viewerId={snapshot.viewerId} answeredIds={[]} phase="results" />}
    stats={[]}
    primaryLabel={isHost ? 'Play again ↻' : 'Leave'}
    onPrimary={isHost ? () => action({ action: 'rematch' }) : leave}
    secondaryAction={isHost ? <button className="secondary-button" type="button" aria-label="Change match settings" onClick={() => action({ action: 'lobby' })}>⚙</button> : undefined}
    onHome={leave}
  />;
}

export default function GatherWordApp() {
  const [screen, setScreen] = useState<Screen>('home'); const [entryMode, setEntryMode] = useState<EntryMode>('solo'); const [chosenSettings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS); const [togetherMode, setTogetherMode] = useState<PlayMode>('cooperative');
  // Home opens where the player actually is, the way Time Attack already
  // does. `useSyncExternalStore` keeps this hydration-safe: the server
  // snapshot is an empty record, so both first renders say level 1, and
  // the stored record arrives immediately after.
  const progress = useSyncExternalStore(subscribeProgress, getProgressSnapshot, getProgressServerSnapshot);
  const [newlyUnlocked, setNewlyUnlocked] = useState<Level | null>(null);
  const previousUnlocked = useRef<Level | null>(null);
  const [pickedLevel, setPickedLevel] = useState<Level | null>(null);
  const level: Level = pickedLevel ?? highestUnlocked(progress);
  // Solo no longer asks how many puzzles: its length is derived from the
  // level (`runLengthFor`) unless this holds an explicit override from
  // "Change length". `null` means "use the level's default" -- which is
  // what keeps the default in step when the level changes on the home
  // screen, since nothing here needs to react to that change on purpose.
  const [soloLengthOverride, setSoloLengthOverride] = useState<number | null>(null);
  // Picking a level on the journey path is what a solo/together match
  // actually plays at -- the band picker used to live in SettingsPanel,
  // but the journey path replaced it. Deriving `maxBand` rather than
  // copying it means the two can never disagree.
  const settings = useMemo<GameSettings>(() => {
    const merged: GameSettings = { ...chosenSettings, maxBand: level };
    if (entryMode !== 'solo') return merged;
    // A run never asks for more words than the level holds, so the
    // default -- and any override -- is clamped to the level's own pool.
    const cap = Math.max(3, eligibleWords(merged).length);
    const length = soloLengthOverride !== null ? Math.min(cap, Math.max(3, soloLengthOverride)) : Math.min(runLengthFor(level), cap);
    return { ...merged, length };
  }, [chosenSettings, level, entryMode, soloLengthOverride]);
  const setLevel = (value: Level) => { setPickedLevel(value); if (value === newlyUnlocked) setNewlyUnlocked(null); };
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
  const [timeAttackStarted, setTimeAttackStarted] = useState(false);
  const [dailyActive, setDailyActive] = useState(false);
  // Today's number and whether it is done drive the badge on the home tile.
  // Both are date-dependent, so they stay hidden until hydration rather
  // than rendering a server guess the client then contradicts.
  const hydrated = useHydrated();
  const [today] = useState(() => new Date());
  const dailyKey = useMemo(() => dailyPuzzleFor(today), [today]);
  const dailyDone = progress.daily?.day === dailyKey.dayKey;
  const home = () => { setLocalMode(null); setTimeAttackActive(false); setTimeAttackStarted(false); setDailyActive(false); setScreen('home'); };
  // Takes the mode explicitly: a tile sets the mode and starts it in one
  // tap, and reading `entryMode` here would still see the previous value.
  const startEntry = (next?: EntryMode) => {
    const target = next ?? entryMode;
    if (target !== entryMode) setEntryMode(target);
    if (target === 'online') setScreen('online-entry');
    else if (target === 'timeattack') { setTimeAttackStarted(false); setTimeAttackActive(true); }
    else if (target === 'daily') setDailyActive(true);
    else setScreen('setup');
  };
  const startLocal = () => { setLocalGameKey((value) => value + 1); setLocalMode(entryMode === 'solo' ? 'solo' : togetherMode); };
  const connect = (value: Credentials) => { setCredentials(value); sessionStorage.setItem('gatherword-room', JSON.stringify(value)); setScreen('online-lobby'); };
  const leave = () => { setCredentials(null); sessionStorage.removeItem('gatherword-room'); history.replaceState({}, '', window.location.pathname); setScreen('online-entry'); };
  const showingHome = !dailyActive && !timeAttackActive && !localMode && screen === 'home';
  const mapOverlayOpen = !dailyActive && !localMode && ((timeAttackActive && !timeAttackStarted) || (!timeAttackActive && (screen === 'setup' || screen === 'online-entry')));
  const showingMap = showingHome || mapOverlayOpen;
  useEffect(() => {
    if (!hydrated) return;
    const unlocked = highestUnlocked(progress);
    // Hydrating saved progress is not a new unlock. Keep the reward until
    // the player returns from results to the map.
    const frame = window.requestAnimationFrame(() => {
      if (previousUnlocked.current !== null && unlocked > previousUnlocked.current) setNewlyUnlocked(unlocked);
      previousUnlocked.current = unlocked;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [hydrated, progress]);
  useEffect(() => {
    if (!showingHome || newlyUnlocked === null) return;
    const timer = window.setTimeout(() => setNewlyUnlocked(null), 8000);
    return () => window.clearTimeout(timer);
  }, [showingHome, newlyUnlocked]);
  const scene = showingMap ? 'home' : dailyActive ? 'daily' : timeAttackActive ? 'timeattack'
    : screen === 'online-entry' || screen === 'online-lobby' ? 'online' : entryMode;
  return <div className={`app${showingMap ? '' : ' in-world'}`} data-scene={scene}><JourneyBackdrop /><Header onHome={home} sound={sound} setSound={setSound} homeMode={showingMap} showingHome={showingHome} hud={{ totalStars: totalStars(progress), coins: progress.coins, gems: progress.gems }} dailyNumber={hydrated ? dailyKey.number : null} dailyDone={dailyDone} onDaily={() => startEntry('daily')} />
    {showingMap && <div className={`map-underlay${mapOverlayOpen ? ' map-underlay-inactive' : ''}`} inert={mapOverlayOpen ? true : undefined}><HomeScreen startAs={startEntry} level={level} setLevel={setLevel} blocked={unplayableReason(settings)} newlyUnlocked={newlyUnlocked} /></div>}
    {dailyActive ? <DailyWord sound={sound} onHome={home} />
    : timeAttackActive ? <div className={timeAttackStarted ? 'game-layer' : 'map-modal-layer in-world'}><TimeAttackGame key={localGameKey} categories={settings.categories} sound={sound} started={timeAttackStarted} onStart={() => setTimeAttackStarted(true)} onHome={home} onReplay={() => { setLocalGameKey((value) => value + 1); setTimeAttackStarted(false); }} /></div>
    : localMode ? <LocalGame key={localGameKey} mode={localMode} settings={settings} teams={teams} sound={sound} onHome={home} onChangeSet={() => { setLocalMode(null); setScreen('setup'); }} />
    : screen === 'home' ? null
    : screen === 'setup' ? <div className="map-modal-layer in-world"><SetupScreen entryMode={entryMode} settings={settings} setSettings={setSettings} togetherMode={togetherMode} setTogetherMode={setTogetherMode} teams={teams} setTeams={setTeams} start={startLocal} back={home} soloLengthOverride={soloLengthOverride} setSoloLengthOverride={setSoloLengthOverride} /></div>
    : screen === 'online-entry' ? <div className="map-modal-layer in-world"><OnlineEntry onBack={home} onConnected={connect} initialCode={initialCode} /></div>
    : credentials ? <OnlineRoom credentials={credentials} leave={leave} sound={sound} /> : null}
    <ToastHost />
  </div>;
}
