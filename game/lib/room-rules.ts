/** Pure online-room business logic: who can join as what, when a puzzle
 * should resolve, and how a solve is scored and recorded. Kept free of any
 * D1/Workers dependency on purpose -- `lib/room-service.ts` is the only
 * caller, and it supplies the actual database reads and writes around the
 * decisions made here. Splitting it out this way is also what makes any of
 * it unit-testable at all: `room-service.ts` imports `cloudflare:workers`
 * at the top of the file, which only resolves inside the Workers runtime,
 * so nothing in that file can be imported by a plain Node test. */
import { CATEGORY_LABELS, getPuzzleEntry, hash32, makeScramble, seededRandom, unplayableReason, wordsForLevel } from '@/lib/game-engine';
import { hintsFor } from '@/lib/hints';
import { awardForFinishOrder, isWindowOpen } from '@/lib/room-scoring';
import type { Category, Level, MatchRecipe, PuzzleRecipe, RoomDifficulty, RoomSettings } from '@/lib/types';

export type RoomMode = 'individuals' | 'teams' | 'cooperative';
export type RoomRole = 'player' | 'spectator';

/** A room stops seating new players once this many active seats are
 * filled -- overflow joins land as spectators instead of being refused
 * outright. Spectators get their own, much larger ceiling since they cost
 * nothing but a row in `players_json`. */
export const MAX_PLAYERS = 30;
export const MAX_SPECTATORS = 100;

export type RoomPlayer = {
  id: string;
  name: string;
  tokenHash: string;
  isHost: boolean;
  ready: boolean;
  score: number;
  role: RoomRole;
  teamId?: 'sun' | 'olive';
  joinedAt: number;
  /** Bumped on every action this player takes, so a disconnect is
   * detectable without a live socket to notice one dropping. */
  lastSeen: number;
  /** A kicked player keeps their seat and final score -- marked left
   * rather than removed, so the standings still account for them. */
  left: boolean;
  /** True for a player who joined while a puzzle was already under way.
   * They sit out that one puzzle and rejoin normal play from the next. */
  sitOutCurrent: boolean;
};

/** One player's finish on the current puzzle, in the order they landed. */
export type SolveRecord = { solverId: string; solverName: string; award: number; position: number };

/** Tracks a puzzle's whole life from the moment it opens: who has
 * answered (right or wrong, without saying which), who has solved and
 * for how much, and whether the host paused it or forced a reveal. Kept
 * alive for the entire time a puzzle is open, not just once it resolves --
 * that is what lets a second solver's answer land cleanly while the first
 * solver is still waiting, and lets every client see who else has gone. */
export type PuzzleProgress = {
  solvers: SolveRecord[];
  answered: string[];
  firstSolveAt: number | null;
  paused: boolean;
  pausedAt: number | null;
  revealed: boolean;
};

export const EMPTY_PROGRESS: PuzzleProgress = { solvers: [], answered: [], firstSolveAt: null, paused: false, pausedAt: null, revealed: false };

/** Players who can still affect this puzzle's outcome: seated, not kicked,
 * not sitting the current puzzle out, and not just watching. Both the
 * finish-order curve's denominator and the "has everyone gone" check read
 * from this same list, so they never disagree about who counts. */
export function eligiblePlayers(players: RoomPlayer[]): RoomPlayer[] {
  return players.filter((item) => item.role === 'player' && !item.left && !item.sitOutCurrent);
}

/** Every seated, non-kicked player, regardless of whether they are sitting
 * out the current puzzle -- what the lobby's "ready to start" check and
 * the players-count against `MAX_PLAYERS` both mean by "in the room". */
export function activePlayers(players: RoomPlayer[]): RoomPlayer[] {
  return players.filter((item) => item.role === 'player' && !item.left);
}

/** The role a new joiner gets: a seat while one is free, a spectator once
 * the room is at `MAX_PLAYERS`, or `null` once spectating is full too --
 * the only case where a join is actually refused. */
export function roleForJoin(players: RoomPlayer[]): RoomRole | null {
  if (activePlayers(players).length < MAX_PLAYERS) return 'player';
  const spectators = players.filter((item) => item.role === 'spectator' && !item.left).length;
  return spectators < MAX_SPECTATORS ? 'spectator' : null;
}

/** Whether a puzzle that is still open should resolve right now: everyone
 * eligible has answered, or the scoring window has run out. A paused
 * puzzle never resolves on its own -- the host has to resume it first. */
export function shouldCloseWindow(progress: PuzzleProgress, eligibleCount: number, now: number): boolean {
  if (progress.paused) return false;
  const allSolved = eligibleCount > 0 && progress.solvers.length >= eligibleCount;
  const windowClosed = progress.firstSolveAt !== null && !isWindowOpen(progress.firstSolveAt, now);
  return allSolved || windowClosed;
}

export type CorrectSolveResult = { players: RoomPlayer[]; progress: PuzzleProgress; resolved: boolean };

/** Scores one correct answer and decides whether the puzzle is done.
 *
 * In cooperative play the whole side is paid the instant anyone lands it --
 * there is only one shared score, so there is no "next finisher" to wait
 * for. Everywhere else, each solver is paid on the finish-order curve
 * (`awardForFinishOrder`) and the puzzle stays open for more of them until
 * everyone eligible has gone or the window closes.
 *
 * A repeat call for a solver already recorded this puzzle is a no-op --
 * that is what lets a retried request land safely without double-paying
 * anyone. */
export function applyCorrectSolve(params: {
  players: RoomPlayer[]; progress: PuzzleProgress; mode: RoomMode;
  playerId: string; playerName: string; base: number; now: number;
}): CorrectSolveResult {
  const { players, mode, playerId, playerName, base, now } = params;
  const progress: PuzzleProgress = { ...params.progress, solvers: [...params.progress.solvers], answered: [...params.progress.answered] };
  if (progress.solvers.some((item) => item.solverId === playerId)) return { players, progress, resolved: false };
  if (!progress.answered.includes(playerId)) progress.answered = [...progress.answered, playerId];

  if (mode === 'cooperative') {
    const nextPlayers = players.map((item) => ({ ...item, score: item.score + base }));
    progress.solvers = [{ solverId: playerId, solverName: playerName, award: base, position: 1 }];
    return { players: nextPlayers, progress, resolved: true };
  }

  const eligible = eligiblePlayers(players);
  const position = progress.solvers.length + 1;
  const award = awardForFinishOrder(base, position, eligible.length);
  progress.firstSolveAt = progress.firstSolveAt ?? now;
  progress.solvers = [...progress.solvers, { solverId: playerId, solverName: playerName, award, position }];
  const nextPlayers = players.map((item) => item.id === playerId ? { ...item, score: item.score + award } : item);
  const resolved = shouldCloseWindow(progress, eligible.length, now);
  return { players: nextPlayers, progress, resolved };
}

export type WrongSolveResult = { players: RoomPlayer[]; progress: PuzzleProgress };

/** A wrong answer costs the solver a point (or, in Teams, their team's
 * current top scorer -- never a player who hasn't scored yet). It is still
 * recorded in `answered`, the same as a correct one, so the standings can
 * show that this player has gone without saying whether they were right. */
export function applyWrongSolve(players: RoomPlayer[], progress: PuzzleProgress, mode: RoomMode, playerId: string, teamId?: string): WrongSolveResult {
  const nextProgress: PuzzleProgress = { ...progress, answered: progress.answered.includes(playerId) ? progress.answered : [...progress.answered, playerId] };
  if (mode === 'teams') {
    const payer = [...players].filter((item) => item.teamId === teamId && item.score > 0).sort((a, b) => b.score - a.score)[0];
    return { players: players.map((item) => item.id === payer?.id ? { ...item, score: item.score - 1 } : item), progress: nextProgress };
  }
  return { players: players.map((item) => item.id === playerId ? { ...item, score: Math.max(0, item.score - 1) } : item), progress: nextProgress };
}

/** Undoes whatever a skipped puzzle already paid out -- "nobody scores" is
 * the whole point of abandoning it. */
export function refundSolvers(players: RoomPlayer[], progress: PuzzleProgress): RoomPlayer[] {
  if (!progress.solvers.length) return players;
  const refund = new Map(progress.solvers.map((item) => [item.solverId, item.award]));
  return players.map((item) => refund.has(item.id) ? { ...item, score: Math.max(0, item.score - (refund.get(item.id) as number)) } : item);
}

/** Freezes the solve window in place; `check` refuses to run while paused. */
export function pauseProgress(progress: PuzzleProgress, now: number): PuzzleProgress {
  if (progress.paused) return progress;
  return { ...progress, paused: true, pausedAt: now };
}

/** Shifts the window's start forward by however long it was paused, so
 * time spent frozen never counts against the twelve seconds solvers get. */
export function resumeProgress(progress: PuzzleProgress, now: number): PuzzleProgress {
  if (!progress.paused) return progress;
  const pausedFor = progress.pausedAt ? now - progress.pausedAt : 0;
  return { ...progress, paused: false, pausedAt: null, firstSolveAt: progress.firstSolveAt !== null ? progress.firstSolveAt + pausedFor : null };
}

/** `'mixed'` or an integer 1-9, exactly as advertised -- anything else
 * (a stray string, `NaN`, `0`, `10`, `null`) is rejected back to
 * `'mixed'`, the same default a brand-new lobby opens on. Never trusts a
 * request body's `difficulty` directly. */
export function validateDifficulty(input: unknown): RoomDifficulty {
  if (input === 'mixed') return 'mixed';
  const level = Math.floor(Number(input));
  return Number.isFinite(level) && level >= 1 && level <= 9 ? (level as Level) : 'mixed';
}

/** Clamps whatever a client sends into a legal `RoomSettings` -- never
 * trusts categories, difficulty or length from a request body directly.
 * Moved here from the D1-era `room-service.ts` (Stage 1) so `RoomDO`
 * (Stage 2) can run the exact same clamp when a host saves settings,
 * starts a match or asks for a rematch, without either side
 * reimplementing it. */
export function validateSettings(input: Partial<RoomSettings>): RoomSettings {
  const allowed = ['book', 'person', 'place'] as const;
  const categories = allowed.filter((category) => input.categories?.includes(category));
  const difficulty = validateDifficulty(input.difficulty);
  const length = Math.min(30, Math.max(3, Math.floor(Number(input.length) || 10)));
  return { categories: categories.length ? categories : ['book'], difficulty, length };
}

/** Why this room cannot start a match, or null when it can -- the room
 * equivalent of `unplayableReason`. A pinned difficulty is exactly that
 * check at that one level; `'mixed'` instead asks whether the chosen
 * categories have approved words at ANY of the nine levels, since a
 * mixed room only ever needs one rung of the ladder to still have
 * something to draw from. */
export function roomUnplayableReason(difficulty: RoomDifficulty, categories: Category[]): string | null {
  if (categories.length === 0) return 'Choose at least one word set.';
  if (difficulty !== 'mixed') return unplayableReason({ categories, maxBand: difficulty, length: 1 });
  for (let level = 1; level <= 9; level += 1) {
    if (wordsForLevel(level as Level, categories).length > 0) return null;
  }
  const sets = categories.map((category) => CATEGORY_LABELS[category]).join(' + ');
  return `No words yet for ${sets} at any level. Pick another word set.`;
}

/** How many distinct approved words this room's difficulty and category
 * choice can actually draw from -- the room equivalent of `eligibleWords`,
 * and what the lobby's puzzle-count ceiling is clamped against. A pinned
 * difficulty is exactly that level's pool; `'mixed'` sums every level's,
 * since a Mixed match draws from all nine across the run. */
export function roomWordPool(difficulty: RoomDifficulty, categories: Category[]): number {
  if (difficulty !== 'mixed') return wordsForLevel(difficulty, categories).length;
  let total = 0;
  for (let level = 1; level <= 9; level += 1) total += wordsForLevel(level as Level, categories).length;
  return total;
}

/** Where a Mixed room's puzzle at position `index` of `total` draws from:
 * level 1 right at the start, level 9 right at the end, climbing steadily
 * between the two. A newcomer therefore always has an easy opening to
 * score on, and the match still finishes at the hardest content in the
 * game -- the "starts easy, gets harder" the lobby's Mixed option
 * promises. */
function risingLevel(index: number, total: number): Level {
  if (total <= 1) return 1;
  const level = 1 + Math.round((index / (total - 1)) * 8);
  return Math.min(9, Math.max(1, level)) as Level;
}

/** Picks one not-yet-used word for a puzzle at `level`, preferring
 * `preferred` category to keep the same round-robin category balance
 * `createRecipe` gives solo matches. If that level has run dry for these
 * categories -- a thin level, or a category like tribes that stops partway
 * up the ladder -- the search widens outward by level rather than
 * repeating a word or abandoning the puzzle count outright. Returns
 * undefined only once every level has been exhausted for these
 * categories, in which case the match is simply shorter than asked. */
function pickUnusedWord(level: Level, categories: Category[], preferred: Category, used: Set<string>, random: () => number) {
  const atLevel = wordsForLevel(level, categories).filter((entry) => !used.has(entry.id));
  const inPreferred = atLevel.filter((entry) => entry.categories.includes(preferred));
  const pool = inPreferred.length > 0 ? inPreferred : atLevel;
  if (pool.length > 0) return pool[Math.floor(random() * pool.length)];
  for (let offset = 1; offset <= 8; offset += 1) {
    for (const candidate of [level - offset, level + offset]) {
      if (candidate < 1 || candidate > 9) continue;
      const options = wordsForLevel(candidate as Level, categories).filter((entry) => !used.has(entry.id));
      if (options.length > 0) return options[Math.floor(random() * options.length)];
    }
  }
  return undefined;
}

/** Builds one room's match. A pinned `Level` draws every puzzle from that
 * single level, exactly like a solo or Play Together match at that level.
 * `'mixed'` instead spreads the same puzzle count across all nine levels
 * on `risingLevel`'s curve, so the room opens somewhere everyone can
 * score and finishes at the hardest content in the game -- meant for a
 * table of mixed ability, where one pinned level is wrong for everyone at
 * once. Both keep the same per-category round-robin and no-repeat
 * guarantee `createRecipe` gives a solo match. */
export function buildRoomRecipe(difficulty: RoomDifficulty, categories: Category[], length: number, seed: string): MatchRecipe {
  const random = seededRandom(seed);
  const used = new Set<string>();
  const puzzles: PuzzleRecipe[] = [];
  for (let index = 0; index < length; index += 1) {
    const level = difficulty === 'mixed' ? risingLevel(index, length) : difficulty;
    const preferred = categories[index % categories.length];
    const entry = pickUnusedWord(level, categories, preferred, used, random);
    if (!entry) continue;
    used.add(entry.id);
    puzzles.push({ entryId: entry.id, scramble: makeScramble(entry.playable, random) });
  }
  const signature = hash32(puzzles.map((puzzle) => `${puzzle.entryId}:${puzzle.scramble}`).join('|')).toString(36);
  return { seed, signature, puzzles };
}

export type RoomStatus = 'LOBBY' | 'PUZZLE_OPEN' | 'PUZZLE_RESOLVED' | 'RESULTS';
export type RoomPuzzleStatus = 'WAITING' | 'OPEN' | 'RESOLVED';

/** `RoomDO`'s whole picture of one room, held in Durable Object storage.
 * Stage 1 kept this as four separate JSON-encoded D1 columns
 * (`players_json`, `match_json`, `resolution_json`, `hint_state_json`);
 * Stage 2 moves the live match off D1 entirely, so it is just plain
 * fields now -- there is no serialization boundary to encode around
 * inside the object that owns the data. */
export type RoomState = {
  code: string;
  status: RoomStatus;
  mode: RoomMode;
  settings: RoomSettings;
  players: RoomPlayer[];
  match: MatchRecipe | null;
  currentIndex: number;
  puzzleStatus: RoomPuzzleStatus;
  resolution: PuzzleProgress | null;
  hints: Record<string, number>;
  version: number;
  createdAt: number;
  lastActivity: number;
};

export type PublicPlayer = Omit<RoomPlayer, 'tokenHash'>;

/** Apply the lobby draft and start as one operation. A rejected start never
 * saves half a configuration or resets players' scores. Older clients may
 * omit the draft and start using the room's existing configuration. */
export function prepareRoomStart(
  room: Pick<RoomState, 'settings' | 'mode' | 'players'>,
  input: Record<string, unknown>,
  seed: string,
): Pick<RoomState, 'settings' | 'mode' | 'players' | 'match'> {
  const draft = input.settings && typeof input.settings === 'object' && !Array.isArray(input.settings)
    ? input.settings as Partial<RoomSettings> : {};
  const settings = input.settings === undefined ? room.settings : validateSettings({
    ...draft, categories: Array.isArray(draft.categories) ? draft.categories : [],
  });
  const mode = input.mode === undefined ? room.mode
    : input.mode === 'cooperative' ? 'cooperative' : input.mode === 'teams' ? 'teams' : 'individuals';
  const seated = activePlayers(room.players);
  if (mode !== 'cooperative' && seated.length < 2) throw new Error('Invite at least one more player, or choose Cooperative.');
  if (seated.some((player) => !player.isHost && !player.ready)) throw new Error('Everyone needs to be ready first.');
  const blocked = roomUnplayableReason(settings.difficulty, settings.categories);
  if (blocked) throw new Error(blocked);
  const match = buildRoomRecipe(settings.difficulty, settings.categories, settings.length, seed);
  let seat = 0;
  const players = room.players.map((player): RoomPlayer => ({
    ...player, score: 0, sitOutCurrent: false,
    teamId: mode === 'teams' && player.role === 'player' && !player.left
      ? (seat++ % 2 === 0 ? 'sun' : 'olive') : undefined,
  }));
  return { settings, mode, players, match };
}

export type RoomSnapshotDTO = {
  code: string; status: RoomStatus; mode: RoomMode; settings: RoomSettings; players: PublicPlayer[];
  currentIndex: number; puzzleCount: number; version: number; viewerId: string; viewerHints: number;
  puzzle: null | { id: string; scramble: string; category: Category; band: Level; hints: { kind: string; text: string }[]; display?: string; reference?: string };
  resolution: null | { solvers: SolveRecord[]; answeredIds: string[]; revealed: boolean; paused: boolean };
};

/** Shapes one player's view of the room for the wire: strips `tokenHash`
 * from every player (never sent, not even the viewer's own), and only
 * reveals the answer/reference once the puzzle has actually resolved.
 * Ported from the D1-era `room-service.ts` with the same behaviour --
 * only the input changed, from four parsed JSON columns to plain
 * `RoomState` fields -- so both `RoomDO` and (through it) every REST and
 * WebSocket response describe a room exactly the same way. */
export function publicSnapshot(room: RoomState, viewerId: string): RoomSnapshotDTO {
  const players: PublicPlayer[] = room.players.map((player) => ({
    id: player.id, name: player.name, isHost: player.isHost, ready: player.ready, score: player.score,
    role: player.role, joinedAt: player.joinedAt, lastSeen: player.lastSeen, left: player.left,
    sitOutCurrent: player.sitOutCurrent, teamId: player.teamId,
  }));
  const match = room.match;
  const recipePuzzle = match?.puzzles[room.currentIndex];
  const entry = match ? getPuzzleEntry(match, room.currentIndex) : undefined;
  const resolved = room.status === 'PUZZLE_RESOLVED' || room.status === 'RESULTS';
  const viewer = room.players.find((player) => player.id === viewerId);
  const viewerHints = room.mode === 'teams'
    ? Math.max(0, ...room.players.filter((player) => player.teamId === viewer?.teamId).map((player) => room.hints[player.id] || 0))
    : (room.hints[viewerId] || 0);
  const progress = room.resolution ?? EMPTY_PROGRESS;
  return {
    code: room.code, status: room.status, mode: room.mode, settings: room.settings, players,
    currentIndex: room.currentIndex, puzzleCount: match?.puzzles.length || room.settings.length,
    version: room.version, viewerId, viewerHints,
    puzzle: recipePuzzle && entry ? {
      id: entry.id, scramble: recipePuzzle.scramble,
      category: entry.categories[0], band: entry.band,
      hints: hintsFor(entry).map(({ kind, text }) => ({ kind, text })),
      display: resolved ? entry.display : undefined,
      reference: resolved ? entry.references[0] : undefined,
    } : null,
    resolution: recipePuzzle ? { solvers: progress.solvers, answeredIds: progress.answered, revealed: progress.revealed, paused: progress.paused } : null,
  };
}
