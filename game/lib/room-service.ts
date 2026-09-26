/** The D1 side of an online room -- Stage 2 of Phase F moved the live
 * match (players, settings, match recipe, current puzzle, score) into
 * `durable/RoomDO.ts`, one Durable Object per room. What is left here is
 * exactly what the plan asked D1 to keep: a code -> room index (so a
 * fresh code can be checked for collisions, and a request can tell a
 * room that never existed from one that did) and the two-hour TTL (a
 * sliding window, refreshed on every join, action and socket connect).
 *
 * Every function below is a thin proxy: check the index, then hand the
 * request to that room's Durable Object and relay its answer back. None
 * of the actual game rules live here any more -- `RoomDO` calls into
 * `lib/room-rules.ts` for those, same as this file used to. */
import { env } from 'cloudflare:workers';
import type { RoomSettings } from '@/lib/types';

export type { RoomMode, RoomPlayer, RoomRole } from '@/lib/room-rules';
export { MAX_PLAYERS, MAX_SPECTATORS } from '@/lib/room-rules';

const ROOM_TTL = 2 * 60 * 60 * 1000;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_DO_ORIGIN = 'https://room-do';

/** Thrown for a code the index has never heard of, or one whose TTL has
 * already lapsed -- the one case every route answers with 404 rather
 * than 400/401, same as the D1-era version of this file did. */
export class RoomNotFoundError extends Error {}

function database() {
  if (!env.DB) throw new Error('Online rooms are not available in this environment.');
  return env.DB;
}

function randomString(length: number, alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_') {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join('');
}

export function cleanCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 6);
}

export function cleanName(value: string) {
  return value.trim().replace(/\s+/g, ' ').slice(0, 24);
}

/** One Durable Object instance per room code -- `idFromName` is
 * deterministic, so any request for the same code always lands on the
 * same object without D1 ever having to record which one it was. */
function getStub(code: string) {
  return env.ROOMS.get(env.ROOMS.idFromName(code));
}

async function codeTaken(code: string) {
  const row = await database().prepare('SELECT code FROM rooms WHERE code = ?').bind(code).first();
  return Boolean(row);
}

async function reserveCode() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = randomString(6, CODE_CHARS);
    if (!(await codeTaken(code))) return code;
  }
  throw new Error('Could not create a room code. Please try again.');
}

/** The only row this file still writes on creation -- everything but the
 * code and the TTL columns is a placeholder now that the Durable Object
 * is the source of truth. Kept as real, if unused, JSON so the existing
 * `NOT NULL` columns need no migration. */
async function insertIndex(code: string, now: number) {
  await database().prepare(
    `INSERT INTO rooms (code, settings_json, players_json, created_at, last_activity, expires_at) VALUES (?, '{}', '[]', ?, ?, ?)`,
  ).bind(code, now, now, now + ROOM_TTL).run();
}

async function assertRoomAlive(code: string) {
  const row = await database().prepare('SELECT expires_at FROM rooms WHERE code = ?').bind(code).first<{ expires_at: number }>();
  if (!row || row.expires_at < Date.now()) throw new RoomNotFoundError('That room was not found or has expired.');
}

/** Slides the two-hour TTL forward from whichever of join / action /
 * socket-connect just happened -- not from every message a live socket
 * exchanges, which is the whole point of not polling any more. A match
 * played entirely over one long-lived socket for more than two hours
 * without a fresh join or REST action is the one case this does not
 * cover; ordinary matches run for minutes, not hours. */
async function touchRoom(code: string) {
  const now = Date.now();
  await database().prepare('UPDATE rooms SET last_activity = ?, expires_at = ? WHERE code = ?').bind(now, now + ROOM_TTL, code).run();
}

function messageFrom(data: unknown, fallback: string) {
  return typeof data === 'object' && data && 'error' in data && typeof (data as { error?: unknown }).error === 'string'
    ? (data as { error: string }).error
    : fallback;
}

export async function createRoom(nameInput: string, settingsInput: Partial<RoomSettings>, modeInput: string) {
  const name = cleanName(nameInput);
  if (name.length < 2) throw new Error('Enter a name with at least 2 characters.');
  const now = Date.now();
  const code = await reserveCode();
  const response = await getStub(code).fetch(`${ROOM_DO_ORIGIN}/init`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code, name, settings: settingsInput, mode: modeInput }),
  });
  const data = await response.json() as { token?: string; playerId?: string; error?: string };
  if (!response.ok || !data.token || !data.playerId) throw new Error(messageFrom(data, 'Room creation failed.'));
  // Only committed to the index once the Durable Object has confirmed it
  // actually holds a room for this code -- an index row with nothing
  // behind it would be a room a client could "find" but never join.
  await insertIndex(code, now);
  return { code, token: data.token, playerId: data.playerId };
}

export async function joinRoom(codeInput: string, nameInput: string) {
  const code = cleanCode(codeInput);
  const name = cleanName(nameInput);
  if (code.length !== 6) throw new Error('Enter a complete 6-character room code.');
  if (name.length < 2) throw new Error('Enter a name with at least 2 characters.');
  await assertRoomAlive(code);
  await touchRoom(code);
  const response = await getStub(code).fetch(`${ROOM_DO_ORIGIN}/join`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  const data = await response.json() as { token?: string; playerId?: string; role?: string; error?: string };
  if (!response.ok || !data.token || !data.playerId) throw new Error(messageFrom(data, 'Could not join the room.'));
  return { code, token: data.token, playerId: data.playerId, role: data.role };
}

/** Backs `GET /api/rooms/[code]` -- a room the index has never heard of
 * throws `RoomNotFoundError` (404); a room the Durable Object refuses to
 * authenticate throws a plain `Error` (401), same split the D1-era route
 * made between "gone" and "not you". */
export async function getRoomSnapshot(codeInput: string, playerId: string, token: string) {
  const code = cleanCode(codeInput);
  await assertRoomAlive(code);
  const response = await getStub(code).fetch(`${ROOM_DO_ORIGIN}/snapshot?playerId=${encodeURIComponent(playerId)}`, {
    headers: { 'x-room-token': token },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(messageFrom(data, 'Could not load the room.'));
  return data;
}

/** Backs `POST /api/rooms/[code]/action`. Same 404-vs-everything-else
 * split as above; every actual rule about whether this particular action
 * is legal right now lives in `RoomDO`, not here. */
export async function performRoomAction(codeInput: string, playerId: string, token: string, input: Record<string, unknown>) {
  const code = cleanCode(codeInput);
  await assertRoomAlive(code);
  await touchRoom(code);
  const response = await getStub(code).fetch(`${ROOM_DO_ORIGIN}/action`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-room-token': token },
    body: JSON.stringify({ ...input, playerId }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(messageFrom(data, 'The room action failed.'));
  return data;
}

/** Backs `GET /api/rooms/[code]/socket`. The incoming request is handed
 * to the Durable Object exactly as it arrived -- the `Upgrade` header and
 * the WebSocket handshake it carries are what actually matter, and only
 * `RoomDO.fetch` knows how to turn that into an accepted, hibernatable
 * connection. This function's own job is just the same index check every
 * other entry point makes first. */
export async function openRoomSocket(codeInput: string, request: Request) {
  const code = cleanCode(codeInput);
  await assertRoomAlive(code);
  await touchRoom(code);
  return getStub(code).fetch(request);
}
