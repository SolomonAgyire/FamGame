import { env } from 'cloudflare:workers';
import { createRecipe, getPuzzleEntry, normalizeAnswer, unplayableReason } from '@/lib/game-engine';
import { hintsFor } from '@/lib/hints';
import { scoreSolve } from '@/lib/scoring';
import {
  activePlayers, applyCorrectSolve, applyWrongSolve, EMPTY_PROGRESS, eligiblePlayers,
  roleForJoin, shouldCloseWindow,
  type PuzzleProgress, type RoomMode, type RoomPlayer,
} from '@/lib/room-rules';
import type { GameSettings, Level, MatchRecipe } from '@/lib/types';

export type { RoomMode, RoomPlayer, RoomRole } from '@/lib/room-rules';
export { MAX_PLAYERS, MAX_SPECTATORS } from '@/lib/room-rules';

function parseProgress(json: string | null): PuzzleProgress {
  if (!json) return { ...EMPTY_PROGRESS };
  return JSON.parse(json) as PuzzleProgress;
}

type RoomRow = {
  code: string;
  status: 'LOBBY' | 'PUZZLE_OPEN' | 'PUZZLE_RESOLVED' | 'RESULTS';
  mode: RoomMode;
  settings_json: string;
  players_json: string;
  match_json: string | null;
  current_index: number;
  puzzle_status: 'WAITING' | 'OPEN' | 'RESOLVED';
  resolution_json: string | null;
  hint_state_json: string;
  version: number;
  created_at: number;
  last_activity: number;
  expires_at: number;
};

const ROOM_TTL = 2 * 60 * 60 * 1000;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function database() {
  if (!env.DB) throw new Error('Online rooms are not available in this environment.');
  return env.DB;
}

function randomString(length: number, alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_') {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join('');
}

async function digest(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function cleanCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 6);
}

export function cleanName(value: string) {
  return value.trim().replace(/\s+/g, ' ').slice(0, 24);
}

export function validateSettings(input: Partial<GameSettings>): GameSettings {
  const allowed = ['book', 'person', 'place'] as const;
  const categories = allowed.filter((category) => input.categories?.includes(category));
  const maxBand = Math.min(9, Math.max(1, Math.floor(Number(input.maxBand) || 1))) as Level;
  const length = Math.min(30, Math.max(3, Math.floor(Number(input.length) || 10)));
  return { categories: categories.length ? categories : ['book'], maxBand, length };
}

/** A puzzle that has been open long enough, or that everyone eligible has
 * already solved, resolves on the next read -- even if that read is just a
 * player polling for a snapshot rather than submitting an answer. Without
 * this, a room where the last few players never answer would stay open
 * forever: nothing else runs on a schedule to close it. */
async function resolveExpiredWindow(row: RoomRow): Promise<RoomRow> {
  if (row.status !== 'PUZZLE_OPEN' || !row.resolution_json) return row;
  const progress = parseProgress(row.resolution_json);
  const players = JSON.parse(row.players_json) as RoomPlayer[];
  const now = Date.now();
  if (!shouldCloseWindow(progress, eligiblePlayers(players).length, now)) return row;
  const result = await database().prepare(
    `UPDATE rooms SET status = 'PUZZLE_RESOLVED', puzzle_status = 'RESOLVED', version = version + 1, last_activity = ? WHERE code = ? AND version = ? AND status = 'PUZZLE_OPEN'`,
  ).bind(now, row.code, row.version).run();
  if ((result.meta.changes || 0) === 1) {
    return { ...row, status: 'PUZZLE_RESOLVED', puzzle_status: 'RESOLVED', version: row.version + 1, last_activity: now };
  }
  // Something else changed the row first (another request resolved it, or
  // a host action landed) -- read the current truth rather than trust a
  // guess that is already stale.
  const fresh = await database().prepare('SELECT * FROM rooms WHERE code = ?').bind(row.code).first<RoomRow>();
  return fresh ?? row;
}

export async function getRoom(code: string) {
  const row = await database().prepare('SELECT * FROM rooms WHERE code = ?').bind(cleanCode(code)).first<RoomRow>();
  if (!row) return row;
  return resolveExpiredWindow(row);
}

async function makeUniqueCode() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = randomString(6, CODE_CHARS);
    const existing = await getRoom(code);
    if (!existing) return code;
  }
  throw new Error('Could not create a room code. Please try again.');
}

export async function createRoom(nameInput: string, settingsInput: Partial<GameSettings>, modeInput: string) {
  const name = cleanName(nameInput);
  if (name.length < 2) throw new Error('Enter a name with at least 2 characters.');
  const now = Date.now();
  const code = await makeUniqueCode();
  const token = randomString(42);
  const player: RoomPlayer = { id: crypto.randomUUID(), name, tokenHash: await digest(token), isHost: true, ready: true, score: 0, role: 'player', joinedAt: now, lastSeen: now, left: false, sitOutCurrent: false };
  const settings = validateSettings(settingsInput);
  const mode: RoomMode = modeInput === 'cooperative' ? 'cooperative' : modeInput === 'teams' ? 'teams' : 'individuals';
  if (mode === 'teams') player.teamId = 'sun';
  await database().prepare(`INSERT INTO rooms
    (code, status, mode, settings_json, players_json, match_json, current_index, puzzle_status, resolution_json, hint_state_json, version, created_at, last_activity, expires_at)
    VALUES (?, 'LOBBY', ?, ?, ?, NULL, 0, 'WAITING', NULL, '{}', 1, ?, ?, ?)`)
    .bind(code, mode, JSON.stringify(settings), JSON.stringify([player]), now, now, now + ROOM_TTL).run();
  return { code, token, playerId: player.id };
}

export async function joinRoom(codeInput: string, nameInput: string) {
  const code = cleanCode(codeInput);
  const name = cleanName(nameInput);
  if (code.length !== 6) throw new Error('Enter a complete 6-character room code.');
  if (name.length < 2) throw new Error('Enter a name with at least 2 characters.');
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const room = await getRoom(code);
    if (!room || room.expires_at < Date.now()) throw new Error('That room was not found or has expired.');
    if (room.status !== 'LOBBY') throw new Error('That match has already started.');
    const players = JSON.parse(room.players_json) as RoomPlayer[];
    // Past the player cap, a joiner is not refused outright -- they come in
    // as a spectator instead, watching and getting live snapshots but not
    // scoring or counting toward the "everyone answered" check.
    const role = roleForJoin(players);
    if (!role) throw new Error('That room is full.');
    const now = Date.now();
    const token = randomString(42);
    const sunCount = players.filter((item) => item.teamId === 'sun').length;
    const oliveCount = players.filter((item) => item.teamId === 'olive').length;
    const player: RoomPlayer = {
      id: crypto.randomUUID(), name, tokenHash: await digest(token), isHost: false, ready: role === 'spectator', score: 0,
      role, joinedAt: now, lastSeen: now, left: false, sitOutCurrent: false,
      ...(role === 'player' && room.mode === 'teams' ? { teamId: sunCount <= oliveCount ? 'sun' as const : 'olive' as const } : {}),
    };
    const result = await database().prepare('UPDATE rooms SET players_json = ?, version = version + 1, last_activity = ?, expires_at = ? WHERE code = ? AND version = ?')
      .bind(JSON.stringify([...players, player]), now, now + ROOM_TTL, code, room.version).run();
    if ((result.meta.changes || 0) === 1) return { code, token, playerId: player.id, role };
  }
  throw new Error('The room changed while you were joining. Please try again.');
}

export async function authenticate(room: RoomRow, playerId: string, token: string) {
  const players = JSON.parse(room.players_json) as RoomPlayer[];
  const player = players.find((item) => item.id === playerId);
  if (!player || player.tokenHash !== await digest(token)) throw new Error('Your room session is no longer valid.');
  if (player.left) throw new Error('You were removed from this room.');
  return { player, players };
}

export function publicSnapshot(room: RoomRow, viewerId: string) {
  const players = (JSON.parse(room.players_json) as RoomPlayer[]).map((player) => ({
    id: player.id, name: player.name, isHost: player.isHost, ready: player.ready, score: player.score,
    role: player.role, joinedAt: player.joinedAt, lastSeen: player.lastSeen, left: player.left,
    sitOutCurrent: player.sitOutCurrent, teamId: player.teamId,
  }));
  const settings = JSON.parse(room.settings_json) as GameSettings;
  const match = room.match_json ? JSON.parse(room.match_json) as MatchRecipe : null;
  const hints = JSON.parse(room.hint_state_json || '{}') as Record<string, number>;
  const recipePuzzle = match?.puzzles[room.current_index];
  const entry = match ? getPuzzleEntry(match, room.current_index) : undefined;
  const resolved = room.status === 'PUZZLE_RESOLVED' || room.status === 'RESULTS';
  const viewer = players.find((player) => player.id === viewerId);
  const viewerHints = room.mode === 'teams' ? Math.max(0, ...players.filter((player) => player.teamId === viewer?.teamId).map((player) => hints[player.id] || 0)) : (hints[viewerId] || 0);
  const progress = parseProgress(room.resolution_json);
  return {
    code: room.code, status: room.status, mode: room.mode, settings, players,
    currentIndex: room.current_index, puzzleCount: match?.puzzles.length || settings.length,
    version: room.version, viewerId, viewerHints,
    puzzle: recipePuzzle && entry ? {
      id: entry.id, scramble: recipePuzzle.scramble,
      // The full ladder, not the stored pair: the first rung names a
      // character, so a room player buys the same three hints a solo
      // player does. The answer itself is still never sent until the
      // puzzle resolves.
      category: entry.categories[0], band: entry.band,
      hints: hintsFor(entry).map(({ kind, text }) => ({ kind, text })),
      display: resolved ? entry.display : undefined,
      reference: resolved ? entry.references[0] : undefined,
    } : null,
    // Populated for the whole life of a puzzle, not just once it resolves --
    // a client needs `solvers` while still PUZZLE_OPEN to know its own
    // player already solved (and should stop submitting), and `answeredIds`
    // to show who has gone without saying whether they were right.
    resolution: recipePuzzle ? { solvers: progress.solvers, answeredIds: progress.answered, revealed: progress.revealed, paused: progress.paused } : null,
  };
}

export async function roomAction(room: RoomRow, playerId: string, token: string, input: Record<string, unknown>) {
  const { player, players } = await authenticate(room, playerId, token);
  const action = String(input.action || '');
  const now = Date.now();
  let nextPlayers = players;
  let status = room.status;
  let settings = JSON.parse(room.settings_json) as GameSettings;
  let match = room.match_json ? JSON.parse(room.match_json) as MatchRecipe : null;
  let currentIndex = room.current_index;
  let puzzleStatus = room.puzzle_status;
  let resolution = room.resolution_json;
  let hints = JSON.parse(room.hint_state_json || '{}') as Record<string, number>;

  if (action === 'ready' && status === 'LOBBY' && player.role === 'player') {
    nextPlayers = players.map((item) => item.id === player.id ? { ...item, ready: Boolean(input.ready) } : item);
  } else if (action === 'configure' && player.isHost && status === 'LOBBY') {
    settings = validateSettings(input.settings as Partial<GameSettings>);
    room.mode = input.mode === 'cooperative' ? 'cooperative' : input.mode === 'teams' ? 'teams' : 'individuals';
    if (room.mode === 'teams') nextPlayers = players.map((item, index) => item.role === 'player' ? ({ ...item, teamId: index % 2 === 0 ? 'sun' : 'olive' } as RoomPlayer) : item);
    else nextPlayers = players.map((item) => ({ ...item, teamId: undefined }));
  } else if (action === 'start' && player.isHost && status === 'LOBBY') {
    const seated = activePlayers(players);
    if (room.mode !== 'cooperative' && seated.length < 2) throw new Error('Invite at least one more player, or choose Cooperative.');
    if (seated.some((item) => !item.isHost && !item.ready)) throw new Error('Everyone needs to be ready first.');
    // A level the chosen categories have no words at would produce a match
    // with no puzzles -- an empty screen for everyone, in a room only the
    // two-hour TTL could clear. Refuse it here, where the host can still
    // change the setting.
    const blocked = unplayableReason(settings);
    if (blocked) throw new Error(blocked);
    match = createRecipe(settings, randomString(32));
    nextPlayers = players.map((item) => ({ ...item, score: 0, sitOutCurrent: false }));
    status = 'PUZZLE_OPEN'; puzzleStatus = 'OPEN'; currentIndex = 0; resolution = JSON.stringify(EMPTY_PROGRESS); hints = {};
  } else if (action === 'hint' && status === 'PUZZLE_OPEN') {
    if (player.role === 'spectator') throw new Error('Spectators are just watching this room.');
    if (player.sitOutCurrent) throw new Error('You will join in on the next puzzle.');
    hints[player.id] = Math.min(3, (hints[player.id] || 0) + 1);
  } else if (action === 'check' && status === 'PUZZLE_OPEN' && match) {
    if (player.role === 'spectator') throw new Error('Spectators are just watching this room.');
    if (player.sitOutCurrent) throw new Error('You will join in on the next puzzle.');
    const progress = parseProgress(resolution);
    if (progress.paused) throw new Error('The host paused this puzzle.');
    const entry = getPuzzleEntry(match, currentIndex);
    if (!entry) throw new Error('The current puzzle could not be found.');
    if (normalizeAnswer(String(input.answer || '')) === entry.answer) {
      const sideHintCount = room.mode === 'cooperative' ? Math.max(0, ...Object.values(hints)) : room.mode === 'teams' ? Math.max(0, ...players.filter((item) => item.teamId === player.teamId).map((item) => hints[item.id] || 0)) : (hints[player.id] || 0);
      // The same pure function solo and Time Attack use, so a long word at
      // a hard level pays what it is worth in every mode. Sharing the same
      // finish-order curve across every room, whatever its size, is
      // `applyCorrectSolve`'s job.
      const base = scoreSolve({ letterCount: entry.playable.length, level: entry.level, combo: 0, hintsUsed: sideHintCount });
      const outcome = applyCorrectSolve({ players, progress, mode: room.mode, playerId: player.id, playerName: player.name, base, now });
      nextPlayers = outcome.players;
      resolution = JSON.stringify(outcome.progress);
      if (outcome.resolved) { status = 'PUZZLE_RESOLVED'; puzzleStatus = 'RESOLVED'; }
    } else {
      const outcome = applyWrongSolve(players, progress, room.mode, player.id, player.teamId);
      nextPlayers = outcome.players;
      resolution = JSON.stringify(outcome.progress);
    }
  } else if (action === 'reveal' && player.isHost && status === 'PUZZLE_OPEN' && match) {
    const progress = parseProgress(resolution);
    progress.revealed = true;
    status = 'PUZZLE_RESOLVED'; puzzleStatus = 'RESOLVED';
    resolution = JSON.stringify(progress);
  } else if (action === 'next' && player.isHost && status === 'PUZZLE_RESOLVED' && match) {
    if (currentIndex >= match.puzzles.length - 1) status = 'RESULTS';
    else { currentIndex += 1; status = 'PUZZLE_OPEN'; puzzleStatus = 'OPEN'; resolution = JSON.stringify(EMPTY_PROGRESS); hints = {}; }
  } else if (action === 'rematch' && player.isHost && status === 'RESULTS') {
    const blocked = unplayableReason(settings);
    if (blocked) throw new Error(blocked);
    match = createRecipe(settings, randomString(32)); currentIndex = 0; status = 'PUZZLE_OPEN'; puzzleStatus = 'OPEN'; resolution = JSON.stringify(EMPTY_PROGRESS); hints = {};
    nextPlayers = players.map((item) => ({ ...item, score: 0, sitOutCurrent: false }));
  } else if (action === 'lobby' && player.isHost) {
    status = 'LOBBY'; puzzleStatus = 'WAITING'; match = null; currentIndex = 0; resolution = null; hints = {};
    nextPlayers = players.map((item) => ({ ...item, ready: item.isHost, score: 0, sitOutCurrent: false }));
  } else throw new Error('That action is not available right now.');

  // Every successful action is proof of life -- record it so a room can
  // eventually tell a stalled connection from a player who simply left.
  nextPlayers = nextPlayers.map((item) => item.id === player.id ? { ...item, lastSeen: now } : item);

  const result = await database().prepare(`UPDATE rooms SET status = ?, mode = ?, settings_json = ?, players_json = ?, match_json = ?, current_index = ?, puzzle_status = ?, resolution_json = ?, hint_state_json = ?, version = version + 1, last_activity = ?, expires_at = ? WHERE code = ? AND version = ?`)
    .bind(status, room.mode, JSON.stringify(settings), JSON.stringify(nextPlayers), match ? JSON.stringify(match) : null, currentIndex, puzzleStatus, resolution, JSON.stringify(hints), now, now + ROOM_TTL, room.code, room.version).run();
  if ((result.meta.changes || 0) !== 1) throw new Error('The room changed at the same moment. Please try again.');
  return getRoom(room.code);
}
