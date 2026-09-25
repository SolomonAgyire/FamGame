/** Pure online-room business logic: who can join as what, when a puzzle
 * should resolve, and how a solve is scored and recorded. Kept free of any
 * D1/Workers dependency on purpose -- `lib/room-service.ts` is the only
 * caller, and it supplies the actual database reads and writes around the
 * decisions made here. Splitting it out this way is also what makes any of
 * it unit-testable at all: `room-service.ts` imports `cloudflare:workers`
 * at the top of the file, which only resolves inside the Workers runtime,
 * so nothing in that file can be imported by a plain Node test. */
import { awardForFinishOrder, isWindowOpen } from '@/lib/room-scoring';

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
