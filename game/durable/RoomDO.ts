/** One Durable Object per online room, replacing the 1.8-second polling
 * loop against D1 with a live WebSocket. `RoomDO` owns everything about a
 * room's live match -- players, settings, the match recipe, the current
 * puzzle index, its resolution progress and the version counter -- in its
 * own (SQLite-backed) storage. D1 keeps only the code -> room index and
 * the two-hour TTL (see `lib/room-service.ts`); once a request reaches
 * here, this object is the only source of truth.
 *
 * The scoring and eligibility *decisions* -- who can join as what, when a
 * puzzle should resolve, how a solve is scored -- are never reimplemented
 * here. They live in `lib/room-rules.ts`, which has no Workers dependency
 * and is exercised directly by `tests/room-service.test.ts`; this file is
 * the I/O layer around those decisions, exactly the role
 * `lib/room-service.ts` played for the D1 transport in Stage 1.
 *
 * Uses the WebSocket Hibernation API (`acceptWebSocket` /
 * `webSocketMessage` / `webSocketClose` / `webSocketError`) rather than
 * `server.accept()` + `addEventListener` -- a room with thirty sockets
 * open between puzzles costs nothing while everyone is just reading the
 * board, because the object itself is allowed to evict from memory and
 * wake back up only when a message actually arrives.
 *
 * A Durable Object does **not** serialize a whole request end to end --
 * only individual `storage` calls are gated. Two `fetch()`/
 * `webSocketMessage()` invocations on the same object can genuinely
 * interleave at any `await` in between (confirmed empirically against
 * `wrangler dev`: three concurrent `join`s on one fresh room reliably lost
 * one of them). Every handler below is written so the only `await`s
 * between reading `this.room` and reassigning it are ones that do not
 * touch `this.room` at all (parsing a request body, hashing a token) --
 * see `commit` for the synchronous reassignment that makes this hold. */
import { DurableObject } from 'cloudflare:workers';
import { createRecipe, getPuzzleEntry, normalizeAnswer, unplayableReason } from '@/lib/game-engine';
import {
  activePlayers, applyCorrectSolve, applyWrongSolve, EMPTY_PROGRESS, eligiblePlayers,
  pauseProgress, publicSnapshot, refundSolvers, resumeProgress, roleForJoin, shouldCloseWindow, validateSettings,
  type PuzzleProgress, type RoomMode, type RoomPlayer, type RoomState,
} from '@/lib/room-rules';
import { SOLVE_WINDOW_MS } from '@/lib/room-scoring';
import { scoreSolve } from '@/lib/scoring';
import type { GameSettings } from '@/lib/types';

/** What a hibernating socket remembers about itself across an eviction --
 * `deserializeAttachment()` is the only thing that survives one, so the
 * player's id and the token that got them in both have to live here
 * rather than in a JS closure variable. */
type SocketAttachment = { playerId: string; token: string };

/** Distinguished so `fetch()` can answer 404 (room gone) instead of 400
 * (this action was invalid) or 401 (bad token) -- the same three-way
 * split the D1-era REST routes made. */
class RoomNotFoundError extends Error {}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong.';
}

// Duplicated from `lib/room-service.ts` rather than imported: that file
// opens with `import { env } from 'cloudflare:workers'`, and pulling
// anything from it here would tie this Durable Object to the D1 glue
// instead of the other way around. These are a handful of lines each.
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

function cleanName(value: string) {
  return value.trim().replace(/\s+/g, ' ').slice(0, 24);
}

export class RoomDO extends DurableObject<Cloudflare.Env> {
  /** The durable state, held in memory as the single source of truth for
   * this object's whole lifetime -- not re-read from `storage` on every
   * request. `blockConcurrencyWhile` in the constructor guarantees it is
   * populated (or confirmed absent) before the runtime delivers this
   * object's very first request. */
  private room: RoomState | undefined;
  private readonly hydrated: Promise<void>;

  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    this.hydrated = ctx.blockConcurrencyWhile(async () => {
      this.room = await ctx.storage.get<RoomState>('room');
    });
  }

  /** Reassigns `this.room` synchronously, then asynchronously flushes it
   * to storage. The order matters: anything that runs on this object
   * before the `storage.put` settles -- another action, a socket
   * connecting -- must see this update immediately, not the state from
   * before it. Durable Objects hold off evicting an object until its
   * outstanding storage writes land (the "output gate"), so deferring the
   * actual flush past the synchronous reassignment costs nothing. */
  private async commit(next: RoomState): Promise<void> {
    this.room = next;
    await this.ctx.storage.put('room', next);
  }

  private requireRoomSync(): RoomState {
    if (!this.room) throw new RoomNotFoundError('That room was not found or has expired.');
    return this.room;
  }

  /** Synchronous on purpose -- the token hash is computed once, up front,
   * by each caller (the one `await` this needs, `digest`, depends only on
   * the token string, never on `this.room`) so this check itself never
   * has to cross an `await` and risk running against a `state` some other
   * request has already moved past. */
  private findAuthenticatedPlayer(state: RoomState, playerId: string, tokenHash: string): RoomPlayer {
    const player = state.players.find((item) => item.id === playerId);
    if (!player || player.tokenHash !== tokenHash) throw new Error('Your room session is no longer valid.');
    if (player.left) throw new Error('You were removed from this room.');
    return player;
  }

  /** A puzzle that has been open long enough, or that everyone eligible
   * has already solved, resolves on the next read -- even a read that is
   * just a client fetching a snapshot or opening a socket, not submitting
   * an answer. The alarm below (`syncAlarm` / `alarm()`) closes the same
   * window proactively so connected sockets see it the instant it
   * happens; this stays as a second, always-correct path for a room
   * nobody has touched since the very first solve. Pure -- returns the
   * same reference when nothing changed, which callers use to decide
   * whether there is anything new to persist and broadcast. */
  private resolveExpiredWindow(state: RoomState): RoomState {
    if (state.status !== 'PUZZLE_OPEN' || !state.resolution) return state;
    const now = Date.now();
    if (!shouldCloseWindow(state.resolution, eligiblePlayers(state.players).length, now)) return state;
    return { ...state, status: 'PUZZLE_RESOLVED', puzzleStatus: 'RESOLVED', version: state.version + 1, lastActivity: now };
  }

  /** Schedules (or cancels) the one alarm that closes an open scoring
   * window the instant it expires, rather than waiting for some client to
   * poll or act. Driven entirely by the puzzle's own `resolution` --
   * paused, not yet opened by a first solve, or already resolved all mean
   * "nothing to schedule". `setAlarm` replaces whatever alarm already
   * existed, so re-deriving it from scratch after every action is safe. */
  private async syncAlarm(state: RoomState): Promise<void> {
    const progress = state.resolution;
    if (state.status === 'PUZZLE_OPEN' && progress && progress.firstSolveAt !== null && !progress.paused) {
      await this.ctx.storage.setAlarm(progress.firstSolveAt + SOLVE_WINDOW_MS);
    } else {
      await this.ctx.storage.deleteAlarm();
    }
  }

  async alarm(): Promise<void> {
    await this.hydrated;
    if (!this.room) return;
    const settled = this.resolveExpiredWindow(this.room);
    if (settled !== this.room) {
      await this.commit(settled);
      this.broadcast(settled);
    }
  }

  /** Sends every connected socket its own view of the room -- hints and
   * "have I already solved this" differ per viewer, so this is never one
   * shared payload. A player the action just kicked is disconnected
   * outright rather than sent a snapshot showing them removed. */
  private broadcast(state: RoomState): void {
    const kicked = new Set(state.players.filter((player) => player.left).map((player) => player.id));
    for (const ws of this.ctx.getWebSockets()) {
      const attachment = ws.deserializeAttachment() as SocketAttachment | null;
      if (!attachment) continue;
      try {
        if (kicked.has(attachment.playerId)) ws.close(4001, 'You were removed from this room.');
        else ws.send(JSON.stringify({ type: 'snapshot', snapshot: publicSnapshot(state, attachment.playerId) }));
      } catch {
        // The socket is already on its way out; webSocketClose cleans it up.
      }
    }
  }

  /** The same action surface `lib/room-service.ts` exposed over D1 in
   * Stage 1 -- ready, configure, start, hint, check, reveal, skip, pause,
   * resume, kick, end, next, rematch, lobby -- ported line for line onto
   * plain `RoomState` fields instead of four JSON-encoded D1 columns.
   * Pure and synchronous: every scoring and eligibility decision still
   * runs through `lib/room-rules.ts`; nothing here reimplements it, and
   * nothing here reads or writes `this.room` -- callers do that. */
  private applyAction(state: RoomState, player: RoomPlayer, input: Record<string, unknown>): RoomState {
    const players = state.players;
    const action = String(input.action || '');
    const now = Date.now();
    let nextPlayers = players;
    let status = state.status;
    let mode = state.mode;
    let settings = state.settings;
    let match = state.match;
    let currentIndex = state.currentIndex;
    let puzzleStatus = state.puzzleStatus;
    let resolution: PuzzleProgress | null = state.resolution;
    let hints = state.hints;

    if (action === 'ready' && status === 'LOBBY' && player.role === 'player') {
      nextPlayers = players.map((item) => item.id === player.id ? { ...item, ready: Boolean(input.ready) } : item);
    } else if (action === 'configure' && player.isHost && status === 'LOBBY') {
      settings = validateSettings(input.settings as Partial<GameSettings>);
      mode = input.mode === 'cooperative' ? 'cooperative' : input.mode === 'teams' ? 'teams' : 'individuals';
      if (mode === 'teams') nextPlayers = players.map((item, index) => item.role === 'player' ? ({ ...item, teamId: index % 2 === 0 ? 'sun' : 'olive' } as RoomPlayer) : item);
      else nextPlayers = players.map((item) => ({ ...item, teamId: undefined }));
    } else if (action === 'start' && player.isHost && status === 'LOBBY') {
      const seated = activePlayers(players);
      if (mode !== 'cooperative' && seated.length < 2) throw new Error('Invite at least one more player, or choose Cooperative.');
      if (seated.some((item) => !item.isHost && !item.ready)) throw new Error('Everyone needs to be ready first.');
      const blocked = unplayableReason(settings);
      if (blocked) throw new Error(blocked);
      match = createRecipe(settings, randomString(32));
      nextPlayers = players.map((item) => ({ ...item, score: 0, sitOutCurrent: false }));
      status = 'PUZZLE_OPEN'; puzzleStatus = 'OPEN'; currentIndex = 0; resolution = { ...EMPTY_PROGRESS }; hints = {};
    } else if (action === 'hint' && status === 'PUZZLE_OPEN') {
      if (player.role === 'spectator') throw new Error('Spectators are just watching this room.');
      if (player.sitOutCurrent) throw new Error('You will join in on the next puzzle.');
      hints = { ...hints, [player.id]: Math.min(3, (hints[player.id] || 0) + 1) };
    } else if (action === 'check' && status === 'PUZZLE_OPEN' && match) {
      if (player.role === 'spectator') throw new Error('Spectators are just watching this room.');
      if (player.sitOutCurrent) throw new Error('You will join in on the next puzzle.');
      const progress = resolution ?? { ...EMPTY_PROGRESS };
      if (progress.paused) throw new Error('The host paused this puzzle.');
      const entry = getPuzzleEntry(match, currentIndex);
      if (!entry) throw new Error('The current puzzle could not be found.');
      if (normalizeAnswer(String(input.answer || '')) === entry.answer) {
        const sideHintCount = mode === 'cooperative' ? Math.max(0, ...Object.values(hints)) : mode === 'teams' ? Math.max(0, ...players.filter((item) => item.teamId === player.teamId).map((item) => hints[item.id] || 0)) : (hints[player.id] || 0);
        const base = scoreSolve({ letterCount: entry.playable.length, level: entry.level, combo: 0, hintsUsed: sideHintCount });
        const outcome = applyCorrectSolve({ players, progress, mode, playerId: player.id, playerName: player.name, base, now });
        nextPlayers = outcome.players;
        resolution = outcome.progress;
        if (outcome.resolved) { status = 'PUZZLE_RESOLVED'; puzzleStatus = 'RESOLVED'; }
      } else {
        const outcome = applyWrongSolve(players, progress, mode, player.id, player.teamId);
        nextPlayers = outcome.players;
        resolution = outcome.progress;
      }
    } else if (action === 'reveal' && player.isHost && status === 'PUZZLE_OPEN' && match) {
      const progress = resolution ?? { ...EMPTY_PROGRESS };
      resolution = { ...progress, revealed: true };
      status = 'PUZZLE_RESOLVED'; puzzleStatus = 'RESOLVED';
    } else if (action === 'skip' && player.isHost && status === 'PUZZLE_OPEN' && match) {
      const progress = resolution ?? { ...EMPTY_PROGRESS };
      nextPlayers = refundSolvers(players, progress);
      if (currentIndex >= match.puzzles.length - 1) { status = 'RESULTS'; resolution = null; }
      else { currentIndex += 1; status = 'PUZZLE_OPEN'; puzzleStatus = 'OPEN'; resolution = { ...EMPTY_PROGRESS }; }
      hints = {};
    } else if (action === 'pause' && player.isHost && status === 'PUZZLE_OPEN') {
      resolution = pauseProgress(resolution ?? { ...EMPTY_PROGRESS }, now);
    } else if (action === 'resume' && player.isHost && status === 'PUZZLE_OPEN') {
      resolution = resumeProgress(resolution ?? { ...EMPTY_PROGRESS }, now);
    } else if (action === 'kick' && player.isHost) {
      const targetId = String(input.targetId || '');
      if (targetId === player.id) throw new Error('You cannot kick yourself.');
      if (!players.some((item) => item.id === targetId)) throw new Error('That player is not in this room.');
      nextPlayers = players.map((item) => item.id === targetId ? { ...item, left: true, ready: false } : item);
    } else if (action === 'end' && player.isHost && (status === 'PUZZLE_OPEN' || status === 'PUZZLE_RESOLVED')) {
      status = 'RESULTS'; resolution = null;
    } else if (action === 'next' && player.isHost && status === 'PUZZLE_RESOLVED' && match) {
      if (currentIndex >= match.puzzles.length - 1) status = 'RESULTS';
      else { currentIndex += 1; status = 'PUZZLE_OPEN'; puzzleStatus = 'OPEN'; resolution = { ...EMPTY_PROGRESS }; hints = {}; }
    } else if (action === 'rematch' && player.isHost && status === 'RESULTS') {
      const blocked = unplayableReason(settings);
      if (blocked) throw new Error(blocked);
      match = createRecipe(settings, randomString(32)); currentIndex = 0; status = 'PUZZLE_OPEN'; puzzleStatus = 'OPEN'; resolution = { ...EMPTY_PROGRESS }; hints = {};
      nextPlayers = players.map((item) => ({ ...item, score: 0, sitOutCurrent: false }));
    } else if (action === 'lobby' && player.isHost) {
      status = 'LOBBY'; puzzleStatus = 'WAITING'; match = null; currentIndex = 0; resolution = null; hints = {};
      nextPlayers = players.map((item) => ({ ...item, ready: item.isHost, score: 0, sitOutCurrent: false }));
    } else throw new Error('That action is not available right now.');

    // Every successful action is proof of life -- record it so a room can
    // eventually tell a stalled connection from a player who simply left.
    nextPlayers = nextPlayers.map((item) => item.id === player.id ? { ...item, lastSeen: now } : item);

    return { ...state, status, mode, settings, players: nextPlayers, match, currentIndex, puzzleStatus, resolution, hints, version: state.version + 1, lastActivity: now };
  }

  private async handleInit(request: Request): Promise<Response> {
    await this.hydrated;
    try {
      // Only ever called once, right after `lib/room-service.ts` reserves
      // a brand-new code in D1 -- there is no pre-existing `this.room` to
      // race against here the way `handleJoin` and `handleAction` do.
      if (this.room) throw new Error('This room has already been created.');
      const body = await request.json() as { code: string; name: string; settings?: Partial<GameSettings>; mode?: string };
      const name = cleanName(body.name || '');
      if (name.length < 2) throw new Error('Enter a name with at least 2 characters.');
      const now = Date.now();
      const token = randomString(42);
      const mode: RoomMode = body.mode === 'cooperative' ? 'cooperative' : body.mode === 'teams' ? 'teams' : 'individuals';
      const player: RoomPlayer = {
        id: crypto.randomUUID(), name, tokenHash: await digest(token), isHost: true, ready: true, score: 0,
        role: 'player', joinedAt: now, lastSeen: now, left: false, sitOutCurrent: false,
        ...(mode === 'teams' ? { teamId: 'sun' as const } : {}),
      };
      const state: RoomState = {
        code: body.code, status: 'LOBBY', mode, settings: validateSettings(body.settings || {}),
        players: [player], match: null, currentIndex: 0, puzzleStatus: 'WAITING', resolution: null,
        hints: {}, version: 1, createdAt: now, lastActivity: now,
      };
      await this.commit(state);
      return Response.json({ token, playerId: player.id });
    } catch (error) {
      return Response.json({ error: errorMessage(error) }, { status: 400 });
    }
  }

  private async handleJoin(request: Request): Promise<Response> {
    await this.hydrated;
    try {
      const body = await request.json() as { name?: string };
      const name = cleanName(body.name || '');
      if (name.length < 2) throw new Error('Enter a name with at least 2 characters.');
      const token = randomString(42);
      const tokenHash = await digest(token); // the one `await` here -- depends only on `token`, never on `this.room`

      // Synchronous from here to `this.commit(nextState)`: nothing below
      // reads `this.room` more than once, and nothing awaits in between.
      const state = this.requireRoomSync();
      // Past the player cap, a joiner is not refused outright -- they come
      // in as a spectator instead. Ungated online rooms stay ungated even
      // mid-match, too: a joiner while a puzzle is open just sits that one
      // out and plays from the next.
      const role = roleForJoin(state.players);
      if (!role) throw new Error('That room is full.');
      const now = Date.now();
      const sunCount = state.players.filter((item) => item.teamId === 'sun').length;
      const oliveCount = state.players.filter((item) => item.teamId === 'olive').length;
      const sitOutCurrent = role === 'player' && state.status !== 'LOBBY';
      const player: RoomPlayer = {
        id: crypto.randomUUID(), name, tokenHash, isHost: false, ready: role === 'spectator', score: 0,
        role, joinedAt: now, lastSeen: now, left: false, sitOutCurrent,
        ...(role === 'player' && state.mode === 'teams' ? { teamId: sunCount <= oliveCount ? 'sun' as const : 'olive' as const } : {}),
      };
      const nextState: RoomState = { ...state, players: [...state.players, player], version: state.version + 1, lastActivity: now };
      await this.commit(nextState);
      this.broadcast(nextState);
      return Response.json({ token, playerId: player.id, role });
    } catch (error) {
      return Response.json({ error: errorMessage(error) }, { status: error instanceof RoomNotFoundError ? 404 : 400 });
    }
  }

  private async handleSnapshot(request: Request, url: URL): Promise<Response> {
    await this.hydrated;
    try {
      const playerId = url.searchParams.get('playerId') || '';
      const token = request.headers.get('x-room-token') || '';
      const tokenHash = await digest(token);

      const priorRoom = this.requireRoomSync();
      const state = this.resolveExpiredWindow(priorRoom);
      const player = this.findAuthenticatedPlayer(state, playerId, tokenHash);
      if (state !== priorRoom) { await this.commit(state); this.broadcast(state); }
      return Response.json(publicSnapshot(state, player.id));
    } catch (error) {
      return Response.json({ error: errorMessage(error) }, { status: error instanceof RoomNotFoundError ? 404 : 401 });
    }
  }

  private async handleAction(request: Request): Promise<Response> {
    await this.hydrated;
    try {
      const body = await request.json() as Record<string, unknown>;
      const playerId = String(body.playerId || '');
      const token = request.headers.get('x-room-token') || '';
      const tokenHash = await digest(token);

      // Synchronous from here to `this.commit(nextState)` -- see the class
      // comment. A window that expired since the last read is folded into
      // the same commit as this action rather than persisted separately;
      // the alarm below is what guarantees it is never left unresolved for
      // long, so that simplification costs nothing.
      const priorRoom = this.requireRoomSync();
      const settled = this.resolveExpiredWindow(priorRoom);
      const player = this.findAuthenticatedPlayer(settled, playerId, tokenHash);
      const nextState = this.applyAction(settled, player, body);
      await this.commit(nextState);
      await this.syncAlarm(nextState);
      this.broadcast(nextState);
      return Response.json(publicSnapshot(nextState, playerId));
    } catch (error) {
      return Response.json({ error: errorMessage(error) }, { status: error instanceof RoomNotFoundError ? 404 : 400 });
    }
  }

  /** A browser's native `WebSocket` cannot set request headers, so the
   * token travels in the query string here (and only here) rather than
   * `x-room-token`. `acceptWebSocket` -- not `server.accept()` -- is what
   * makes this connection hibernatable: the object is free to spin down
   * between messages instead of staying resident for however long the
   * player leaves the tab open. */
  private async handleSocket(request: Request, url: URL): Promise<Response> {
    await this.hydrated;
    const playerId = url.searchParams.get('playerId') || '';
    const token = url.searchParams.get('token') || '';
    let state: RoomState;
    try {
      const tokenHash = await digest(token);
      const priorRoom = this.requireRoomSync();
      state = this.resolveExpiredWindow(priorRoom);
      this.findAuthenticatedPlayer(state, playerId, tokenHash);
      if (state !== priorRoom) { await this.commit(state); this.broadcast(state); }
    } catch (error) {
      return new Response(errorMessage(error), { status: error instanceof RoomNotFoundError ? 404 : 401 });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server, [playerId]);
    server.serializeAttachment({ playerId, token } satisfies SocketAttachment);
    server.send(JSON.stringify({ type: 'snapshot', snapshot: publicSnapshot(state, playerId) }));
    return new Response(null, { status: 101, webSocket: client });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.headers.get('Upgrade') === 'websocket') return this.handleSocket(request, url);
    if (request.method === 'POST' && url.pathname === '/init') return this.handleInit(request);
    if (request.method === 'POST' && url.pathname === '/join') return this.handleJoin(request);
    if (request.method === 'GET' && url.pathname === '/snapshot') return this.handleSnapshot(request, url);
    if (request.method === 'POST' && url.pathname === '/action') return this.handleAction(request);
    return new Response('Not found', { status: 404 });
  }

  async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string): Promise<void> {
    await this.hydrated;
    const attachment = ws.deserializeAttachment() as SocketAttachment | null;
    if (!attachment) { ws.close(1011, 'Not authenticated'); return; }
    let input: Record<string, unknown>;
    try {
      input = JSON.parse(typeof message === 'string' ? message : new TextDecoder().decode(message));
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: 'That message could not be read.' }));
      return;
    }
    try {
      const tokenHash = await digest(attachment.token);
      // Synchronous from here to `this.commit(nextState)` -- same reason
      // as `handleAction`; this is the socket equivalent of it.
      const priorRoom = this.requireRoomSync();
      const settled = this.resolveExpiredWindow(priorRoom);
      const player = this.findAuthenticatedPlayer(settled, attachment.playerId, tokenHash);
      const nextState = this.applyAction(settled, player, input);
      await this.commit(nextState);
      await this.syncAlarm(nextState);
      this.broadcast(nextState);
    } catch (error) {
      ws.send(JSON.stringify({ type: 'error', message: errorMessage(error) }));
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    try { ws.close(code, reason); } catch { /* already closing */ }
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    try { ws.close(1011, 'WebSocket error'); } catch { /* already closed */ }
  }
}
