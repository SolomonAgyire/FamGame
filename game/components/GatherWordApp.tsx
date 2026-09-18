'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { WORD_BANK } from '@/data/word-bank';
import { createFreshRecipe, eligibleWords, getPuzzleEntry, normalizeAnswer } from '@/lib/game-engine';
import type { Category, DifficultyBand, GameSettings, MatchRecipe, PlayMode, Team } from '@/lib/types';

type EntryMode = 'solo' | 'together' | 'online';
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
    <button className="brand" type="button" onClick={onHome} aria-label="GatherWord home"><span className="brand-mark">G</span><span><strong>GatherWord</strong><small>Bible word game</small></span></button>
    <div className="header-actions"><button type="button" className="icon-button" onClick={() => setSound(!sound)} aria-label={`${sound ? 'Turn off' : 'Turn on'} sound`}>{sound ? '♪' : '♪̸'}</button></div>
  </header>;
}

function HomeScreen({ mode, setMode, start }: { mode: EntryMode; setMode: (mode: EntryMode) => void; start: () => void }) {
  const modes = [
    { id: 'solo' as const, eyebrow: 'One player', title: 'Solo Journey', copy: 'Solve at your own pace.', icon: '✦' },
    { id: 'together' as const, eyebrow: 'One device', title: 'Play Together', copy: 'Co-op or team play.', icon: '◎' },
    { id: 'online' as const, eyebrow: 'Different devices', title: 'Online Room', copy: 'Invite with a room code.', icon: '⌁' },
  ];
  return <main className="home-shell"><div className="sunwash" aria-hidden="true" />
    <section className="home-grid">
      <div><p className="eyebrow-pill"><span>●</span> A warm word challenge for everyone</p>
        <h1 className="hero-title">Unscramble.<span>Connect.</span>Remember.</h1>
        <p className="hero-copy">Pick Bible books, people, or places. Play quietly on your own or bring the whole room into the puzzle.</p>
        <div className="mode-grid" role="radiogroup" aria-label="Choose how to play">
          {modes.map((item) => <button key={item.id} type="button" role="radio" aria-checked={mode === item.id} onClick={() => setMode(item.id)} className={`mode-card ${mode === item.id ? 'active' : ''}`}>
            <span className="mode-icon" aria-hidden="true">{item.icon}</span><span><small>{item.eyebrow}</small><strong>{item.title}</strong><em>{item.copy}</em></span>
          </button>)}
        </div>
        <button type="button" className="primary-button hero-button" onClick={start}>Start {modes.find((item) => item.id === mode)?.title}<span>→</span></button>
        <p className="free-note">No account · No timer · Free to play</p>
      </div>
      <SamplePuzzle />
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
      {(['book', 'person', 'place'] as Category[]).map((category) => <button type="button" key={category} className={`choice-card ${settings.categories.includes(category) ? 'selected' : ''}`} onClick={() => toggleCategory(category)} aria-pressed={settings.categories.includes(category)}><span>{category === 'book' ? '▤' : category === 'person' ? '◉' : '⌖'}</span><strong>{category === 'book' ? 'Bible Books' : category === 'person' ? 'People' : 'Places'}</strong></button>)}
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
    <p className="section-kicker">{entryMode === 'solo' ? 'Solo journey' : 'One-device play'}</p><h1 className="page-title">Build your match</h1><p className="page-subtitle">Choose the set. GatherWord creates a fresh match and remembers your last 1,000 recipes on this device.</p>
    {entryMode === 'together' && <fieldset><legend>How are you playing?</legend><div className="choice-grid two">
      <button type="button" className={`wide-choice ${togetherMode === 'cooperative' ? 'selected' : ''}`} onClick={() => setTogetherMode('cooperative')}><span>◎</span><div><strong>Cooperative</strong><small>One score. Solve as a group.</small></div></button>
      <button type="button" className={`wide-choice ${togetherMode === 'teams' ? 'selected' : ''}`} onClick={() => setTogetherMode('teams')}><span>⚑</span><div><strong>Teams</strong><small>Claim puzzles and compete.</small></div></button>
    </div></fieldset>}
    {entryMode === 'together' && togetherMode === 'teams' && <fieldset><legend>Name your teams</legend><div className="team-inputs">
      {teams.map((team, index) => <label key={team.id}><span style={{ background: team.color }} /><input value={team.name} aria-label={`Team ${index + 1} name`} onChange={(event) => updateTeam(index, event.target.value)} /></label>)}
      <div className="mini-actions">{teams.length < 4 && <button type="button" onClick={() => setTeams([...teams, { id: `team-${teams.length + 1}`, name: `Team ${teams.length + 1}`, color: TEAM_COLORS[teams.length], score: 0 }])}>+ Add team</button>}{teams.length > 2 && <button type="button" onClick={() => setTeams(teams.slice(0, -1))}>− Remove</button>}</div>
    </div></fieldset>}
    <SettingsPanel settings={settings} setSettings={setSettings} />
    <button className="primary-button full-button" type="button" onClick={start}>Create fresh match <span>→</span></button>
  </section></main>;
}

function TileBoard({ scramble, fixedPrefix, placed, setPlaced, locked }: { scramble: string; fixedPrefix?: string; placed: number[]; setPlaced: (placed: number[]) => void; locked?: boolean }) {
  const available = scramble.split('').map((letter, index) => ({ letter, index })).filter((item) => !placed.includes(item.index));
  return <div className="board"><div className="answer-area" aria-label="Your answer">
    {fixedPrefix && <span className="fixed-tile">{fixedPrefix}</span>}{scramble.split('').map((_, slot) => {
      const sourceIndex = placed[slot];
      return sourceIndex === undefined ? <span className="answer-slot" key={slot} /> : <button type="button" disabled={locked} className="letter-tile placed" key={slot} onClick={() => setPlaced(placed.filter((__, index) => index !== slot))}>{scramble[sourceIndex]}</button>;
    })}
  </div><div className="scramble-area" aria-label="Available letters">{available.map((item) => <button type="button" disabled={locked} className="letter-tile" key={item.index} onClick={() => setPlaced([...placed, item.index])}>{item.letter}</button>)}</div></div>;
}

function LocalGame({ mode, settings, teams: initialTeams, sound, onHome, onChangeSet }: { mode: PlayMode; settings: GameSettings; teams: Team[]; sound: boolean; onHome: () => void; onChangeSet: () => void }) {
  const [recipe, setRecipe] = useState<MatchRecipe>(() => createFreshRecipe(settings));
  const [index, setIndex] = useState(0); const [placed, setPlaced] = useState<number[]>([]); const [hints, setHints] = useState(0);
  const [scores, setScores] = useState<Team[]>(() => mode === 'teams' ? initialTeams.map((team) => ({ ...team, score: 0 })) : [{ id: 'group', name: mode === 'solo' ? 'You' : 'Everyone', color: '#2e7d68', score: 0 }]);
  const [claimedBy, setClaimedBy] = useState<string | null>(mode === 'teams' ? null : 'group');
  const [resolved, setResolved] = useState<{ correct: boolean; revealed: boolean; award: number } | null>(null);
  const [notice, setNotice] = useState(''); const [correctCount, setCorrectCount] = useState(0); const [wrongCount, setWrongCount] = useState(0); const [finished, setFinished] = useState(false);
  const puzzle = recipe.puzzles[index]; const entry = getPuzzleEntry(recipe, index);
  const assembled = puzzle ? placed.map((source) => puzzle.scramble[source]).join('') : '';
  const currentValue = Math.max(1, 5 - hints);
  const beep = useCallback(() => { if (!sound) return; try { const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext; const context = new AudioContextClass(); const oscillator = context.createOscillator(); const gain = context.createGain(); oscillator.frequency.value = 660; gain.gain.value = 0.05; oscillator.connect(gain); gain.connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + .12); } catch { /* optional sound */ } }, [sound]);
  if (!entry || !puzzle) return null;
  const resetPuzzle = () => { setPlaced([]); setHints(0); setResolved(null); setNotice(''); setClaimedBy(mode === 'teams' ? null : 'group'); };
  const check = () => {
    if (mode === 'teams' && !claimedBy) { setNotice('A team needs to claim this puzzle first.'); return; }
    if (placed.length !== puzzle.scramble.length) { setNotice('Place every letter before checking.'); return; }
    const correct = normalizeAnswer(assembled) === entry.answer;
    if (correct) { setScores(scores.map((team) => team.id === claimedBy ? { ...team, score: team.score + currentValue } : team)); setCorrectCount(correctCount + 1); setResolved({ correct: true, revealed: false, award: currentValue }); setNotice(''); beep(); }
    else { setScores(scores.map((team) => team.id === claimedBy ? { ...team, score: Math.max(0, team.score - 1) } : team)); setWrongCount(wrongCount + 1); setNotice('Not quite — one point was removed. Try again!'); if (mode === 'teams') { setClaimedBy(null); setPlaced([]); } }
  };
  const reveal = () => setResolved({ correct: false, revealed: true, award: 0 });
  const next = () => { if (index >= recipe.puzzles.length - 1) setFinished(true); else { setIndex(index + 1); resetPuzzle(); } };
  const rematch = () => { setRecipe(createFreshRecipe(settings)); setIndex(0); setScores(scores.map((team) => ({ ...team, score: 0 }))); setCorrectCount(0); setWrongCount(0); setFinished(false); resetPuzzle(); };
  if (finished) return <Results mode={mode} scores={scores} correct={correctCount} wrong={wrongCount} total={recipe.puzzles.length} rematch={rematch} changeSet={onChangeSet} home={onHome} />;
  return <main className="game-shell"><div className="game-topbar"><div><span>Puzzle {index + 1} of {recipe.puzzles.length}</span><div className="progress"><i style={{ width: `${((index + 1) / recipe.puzzles.length) * 100}%` }} /></div></div><div className="score-strip">{scores.map((team) => <span key={team.id}><i style={{ background: team.color }} />{team.name} <strong>{team.score}</strong></span>)}</div></div>
    {mode === 'teams' && !resolved && <div className="claim-panel"><p>{claimedBy ? <><strong>{scores.find((team) => team.id === claimedBy)?.name}</strong> is building</> : 'Who knows it? Claim the puzzle.'}</p><div>{scores.map((team) => <button type="button" key={team.id} disabled={Boolean(claimedBy)} style={{ '--team-color': team.color } as React.CSSProperties} onClick={() => { setClaimedBy(team.id); setNotice(''); }}>{claimedBy === team.id ? 'Building…' : `Claim · ${team.name}`}</button>)}{claimedBy && <button type="button" className="release" onClick={() => { setClaimedBy(null); setPlaced([]); }}>Release</button>}</div></div>}
    <section className="puzzle-card play-card"><div className="card-top"><div><p className="puzzle-kicker">{entry.categories[0]} · {BAND_NAMES[entry.band - 1]}</p><h1>{resolved ? entry.display : 'Unscramble the answer'}</h1></div><span className="points-pill">{currentValue} pts</span></div>
      <TileBoard scramble={puzzle.scramble} fixedPrefix={entry.fixedPrefix} placed={placed} setPlaced={setPlaced} locked={Boolean(resolved) || (mode === 'teams' && !claimedBy)} />
      {hints > 0 && !resolved && <div className="hint-box">{entry.hints.slice(0, hints).map((hint) => <p key={hint}>✦ {hint}</p>)}</div>}
      {notice && <p className="notice" role="status">{notice}</p>}
      {resolved ? <div className="resolution"><span>{resolved.revealed ? 'The answer was' : 'Beautiful work!'}</span><strong>{entry.display}</strong><p>{entry.references[0]} · {resolved.award ? `+${resolved.award} points` : 'No points this time'}</p><button type="button" className="primary-button" onClick={next}>{index === recipe.puzzles.length - 1 ? 'See results' : 'Next puzzle'} <span>→</span></button></div>
      : <div className="game-actions"><button type="button" className="soft-button" onClick={() => { setPlaced([]); setNotice(''); }}>↻ Reset</button><button type="button" className="soft-button" disabled={hints >= 2} onClick={() => setHints(Math.min(2, hints + 1))}>✦ Hint {hints}/2</button><button type="button" className="check-button" onClick={check}>Check answer</button><button type="button" className="text-button" onClick={reveal}>Reveal & continue</button></div>}
    </section></main>;
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
  const [kind, setKind] = useState<'create' | 'join'>(initialCode ? 'join' : 'create'); const [name, setName] = useState(''); const [code, setCode] = useState(initialCode); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const submit = async () => { setBusy(true); setError(''); try { const response = await fetch(kind === 'create' ? '/api/rooms' : `/api/rooms/${code}/join`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(kind === 'create' ? { name, settings: DEFAULT_SETTINGS, mode: 'individuals' } : { name }) }); const data = await response.json() as Credentials & { error?: string }; if (!response.ok) throw new Error(data.error || 'Could not connect.'); onConnected(data); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not connect.'); } finally { setBusy(false); } };
  return <main className="page-shell"><section className="panel online-entry"><button className="back-button" type="button" onClick={onBack}>← Back</button><p className="section-kicker">Different devices, one game</p><h1 className="page-title">Online room</h1><p className="page-subtitle">The host creates a private six-character code. Everyone else joins from their own device.</p>
    <div className="tabs"><button type="button" className={kind === 'create' ? 'active' : ''} onClick={() => setKind('create')}>Create room</button><button type="button" className={kind === 'join' ? 'active' : ''} onClick={() => setKind('join')}>Join room</button></div>
    <div className="form-stack"><label>Display name<input value={name} maxLength={24} autoComplete="name" placeholder="Your name" onChange={(event) => setName(event.target.value)} /></label>{kind === 'join' && <label>Room code<input className="code-input" value={code} maxLength={6} placeholder="A7K4PQ" autoCapitalize="characters" onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ''))} /></label>}{error && <p className="error-box" role="alert">{error}</p>}<button type="button" disabled={busy} className="primary-button full-button" onClick={submit}>{busy ? 'Connecting…' : kind === 'create' ? 'Create private room' : 'Join room'} <span>→</span></button></div>
    <div className="privacy-note"><span>⌁</span><p><strong>No account needed.</strong> Room data expires after two hours of inactivity.</p></div>
  </section></main>;
}

function OnlineRoom({ credentials, leave }: { credentials: Credentials; leave: () => void }) {
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [placed, setPlaced] = useState<number[]>([]);
  const load = useCallback(async () => { try { const response = await fetch(`/api/rooms/${credentials.code}?playerId=${credentials.playerId}`, { headers: { 'x-room-token': credentials.token } }); const data = await response.json() as RoomSnapshot & { error?: string }; if (!response.ok) throw new Error(data.error || 'Could not update the room.'); setSnapshot((previous) => { if (previous?.currentIndex !== data.currentIndex || previous?.status !== data.status) setPlaced([]); return data; }); setError(''); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Reconnecting…'); } }, [credentials]);
  useEffect(() => { const initial = window.setTimeout(load, 0); const timer = window.setInterval(() => { if (document.visibilityState === 'visible') load(); }, 1800); return () => { window.clearTimeout(initial); window.clearInterval(timer); }; }, [load]);
  const action = async (input: Record<string, unknown>) => { setBusy(true); setError(''); try { const response = await fetch(`/api/rooms/${credentials.code}/action`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-room-token': credentials.token }, body: JSON.stringify({ ...input, playerId: credentials.playerId }) }); const data = await response.json() as RoomSnapshot & { error?: string }; if (!response.ok) throw new Error(data.error || 'That action did not work.'); setSnapshot(data); if (data.status !== 'PUZZLE_OPEN') setPlaced([]); } catch (caught) { setError(caught instanceof Error ? caught.message : 'That action did not work.'); } finally { setBusy(false); } };
  if (!snapshot) return <main className="page-shell"><section className="panel loading-panel"><span className="loader" /><h1>Opening room {credentials.code}</h1><p>{error || 'Gathering everyone…'}</p><button type="button" className="text-button" onClick={leave}>Leave</button></section></main>;
  const viewer = snapshot.players.find((player) => player.id === credentials.playerId); const isHost = Boolean(viewer?.isHost);
  if (snapshot.status === 'LOBBY') return <OnlineLobby key={snapshot.version} snapshot={snapshot} viewer={viewer} isHost={isHost} error={error} busy={busy} action={action} leave={leave} />;
  if (snapshot.status === 'RESULTS') return <OnlineResults snapshot={snapshot} isHost={isHost} action={action} leave={leave} />;
  const puzzle = snapshot.puzzle; if (!puzzle) return null;
  const answer = placed.map((index) => puzzle.scramble[index]).join('');
  const onlineScores = snapshot.mode === 'teams' ? ([['sun', 'Sun Team'], ['olive', 'Olive Team']] as const).map(([id, name]) => ({ id, name, score: snapshot.players.filter((player) => player.teamId === id).reduce((sum, player) => sum + player.score, 0) })) : snapshot.players.map((player) => ({ id: player.id, name: player.name, score: player.score }));
  return <main className="game-shell"><div className="room-banner"><span>Room <strong>{snapshot.code}</strong></span><span>{error || '● Connected'}</span></div><div className="game-topbar"><div><span>Puzzle {snapshot.currentIndex + 1} of {snapshot.puzzleCount}</span><div className="progress"><i style={{ width: `${((snapshot.currentIndex + 1) / snapshot.puzzleCount) * 100}%` }} /></div></div><div className="score-strip">{onlineScores.map((side) => <span key={side.id}>{side.name} <strong>{side.score}</strong></span>)}</div></div>
    <section className="puzzle-card play-card"><div className="card-top"><div><p className="puzzle-kicker">{puzzle.category} · {BAND_NAMES[puzzle.band - 1]}</p><h1>{snapshot.status === 'PUZZLE_RESOLVED' ? puzzle.display : 'Everyone is solving…'}</h1></div><span className="points-pill">{Math.max(1, 5 - snapshot.viewerHints)} pts</span></div>
      <TileBoard scramble={puzzle.scramble} fixedPrefix={puzzle.fixedPrefix} placed={placed} setPlaced={setPlaced} locked={snapshot.status !== 'PUZZLE_OPEN' || busy} />
      {snapshot.viewerHints > 0 && snapshot.status === 'PUZZLE_OPEN' && <div className="hint-box">{puzzle.hints.slice(0, snapshot.viewerHints).map((hint) => <p key={hint}>✦ {hint}</p>)}</div>}{error && <p className="error-box">{error}</p>}
      {snapshot.status === 'PUZZLE_RESOLVED' ? <div className="resolution"><span>{snapshot.resolution?.revealed ? 'The answer was' : `${snapshot.resolution?.solverName} solved it!`}</span><strong>{puzzle.display}</strong><p>{puzzle.reference} · {snapshot.resolution?.award ? `+${snapshot.resolution.award} points` : 'No points this time'}</p>{isHost ? <button type="button" className="primary-button" onClick={() => action({ action: 'next' })}>Next puzzle <span>→</span></button> : <p>Waiting for the host…</p>}</div>
      : <div className="game-actions"><button className="soft-button" type="button" onClick={() => setPlaced([])}>↻ Reset</button><button className="soft-button" type="button" disabled={snapshot.viewerHints >= 2 || busy} onClick={() => action({ action: 'hint' })}>✦ Hint {snapshot.viewerHints}/2</button><button className="check-button" type="button" disabled={placed.length !== puzzle.scramble.length || busy} onClick={() => action({ action: 'check', answer })}>Check answer</button>{isHost && <button className="text-button" type="button" onClick={() => action({ action: 'reveal' })}>Host reveal</button>}</div>}
    </section></main>;
}

function OnlineLobby({ snapshot, viewer, isHost, error, busy, action, leave }: { snapshot: RoomSnapshot; viewer?: RoomPlayer; isHost: boolean; error: string; busy: boolean; action: (input: Record<string, unknown>) => void; leave: () => void }) {
  const [settings, setSettings] = useState(snapshot.settings); const [mode, setMode] = useState(snapshot.mode); const joinUrl = typeof window !== 'undefined' ? `${window.location.origin}?room=${snapshot.code}` : '';
  const copy = async () => { try { await navigator.clipboard.writeText(joinUrl); } catch { /* clipboard can be blocked */ } };
  return <main className="page-shell"><section className="panel lobby-panel"><div className="lobby-heading"><div><p className="section-kicker">Private room</p><h1 className="room-code">{snapshot.code}</h1><p>Share this code with up to 11 more players.</p></div><button type="button" className="secondary-button" onClick={copy}>Copy invite link</button></div>
    <div className="lobby-grid"><div><h2>Players <span>{snapshot.players.length}/12</span></h2><div className="player-list">{snapshot.players.map((player) => <div key={player.id}><span className="avatar">{player.name[0]?.toUpperCase()}</span><strong>{player.name}{player.id === viewer?.id ? ' (you)' : ''}</strong>{player.isHost && <small>Host</small>}<em className={player.ready ? 'ready' : ''}>{player.ready ? 'Ready' : 'Not ready'}</em></div>)}</div>{!isHost && <button type="button" className="primary-button full-button" onClick={() => action({ action: 'ready', ready: !viewer?.ready })}>{viewer?.ready ? 'I’m not ready' : 'I’m ready'}</button>}</div>
      <div className="lobby-settings"><h2>Match setup</h2>{isHost ? <><div className="tabs compact three-tabs"><button className={mode === 'individuals' ? 'active' : ''} onClick={() => setMode('individuals')}>Individuals</button><button className={mode === 'teams' ? 'active' : ''} onClick={() => setMode('teams')}>Teams</button><button className={mode === 'cooperative' ? 'active' : ''} onClick={() => setMode('cooperative')}>Co-op</button></div><SettingsPanel settings={settings} setSettings={setSettings} /><button type="button" className="secondary-button full-button" onClick={() => action({ action: 'configure', settings, mode })}>Save settings</button><button type="button" disabled={busy} className="primary-button full-button" onClick={() => action({ action: 'start' })}>Start match <span>→</span></button></> : <div className="setting-summary"><p><strong>{snapshot.mode === 'individuals' ? 'Individuals' : snapshot.mode === 'teams' ? 'Teams' : 'Cooperative'}</strong></p><p>{snapshot.settings.categories.join(' + ')}</p><p>{BAND_NAMES[snapshot.settings.maxBand - 1]} · {snapshot.settings.length} puzzles</p></div>}</div></div>
    {error && <p className="error-box">{error}</p>}<button type="button" className="text-button leave-button" onClick={leave}>Leave room</button>
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
  const home = () => { setLocalMode(null); setScreen('home'); };
  const startEntry = () => { if (entryMode === 'online') setScreen('online-entry'); else setScreen('setup'); };
  const startLocal = () => { setLocalGameKey((value) => value + 1); setLocalMode(entryMode === 'solo' ? 'solo' : togetherMode); };
  const connect = (value: Credentials) => { setCredentials(value); sessionStorage.setItem('gatherword-room', JSON.stringify(value)); setScreen('online-lobby'); };
  const leave = () => { setCredentials(null); sessionStorage.removeItem('gatherword-room'); history.replaceState({}, '', window.location.pathname); setScreen('online-entry'); };
  return <div className="app"><Header onHome={home} sound={sound} setSound={setSound} />
    {localMode ? <LocalGame key={localGameKey} mode={localMode} settings={settings} teams={teams} sound={sound} onHome={home} onChangeSet={() => { setLocalMode(null); setScreen('setup'); }} />
    : screen === 'home' ? <HomeScreen mode={entryMode} setMode={setEntryMode} start={startEntry} />
    : screen === 'setup' ? <SetupScreen entryMode={entryMode} settings={settings} setSettings={setSettings} togetherMode={togetherMode} setTogetherMode={setTogetherMode} teams={teams} setTeams={setTeams} start={startLocal} back={home} />
    : screen === 'online-entry' ? <OnlineEntry onBack={home} onConnected={connect} initialCode={initialCode} />
    : credentials ? <OnlineRoom credentials={credentials} leave={leave} /> : null}
    <footer><span>GatherWord</span><span>{WORD_BANK.length} curated Bible answers · original hints</span></footer>
  </div>;
}
