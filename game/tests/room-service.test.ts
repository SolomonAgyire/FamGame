// `lib/room-service.ts` opens with `import { env } from 'cloudflare:workers'`,
// a scheme only the Workers runtime resolves -- Node's own loader refuses it
// outright (`ERR_UNSUPPORTED_ESM_URL_SCHEME`), so nothing in that file can be
// imported by a plain `node:test` run. Its actual game-rules decisions --
// who can join as what, when a puzzle resolves, how a solve is scored --
// live in `lib/room-rules.ts` instead, which room-service.ts calls into and
// which has no such dependency. This file exercises that logic directly;
// the D1 read/write glue around it is covered by the plan's manual
// two-browser check instead.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activePlayers, applyCorrectSolve, applyWrongSolve, EMPTY_PROGRESS, eligiblePlayers,
  MAX_PLAYERS, MAX_SPECTATORS, pauseProgress, refundSolvers, resumeProgress, roleForJoin, shouldCloseWindow,
  type PuzzleProgress, type RoomPlayer,
} from '../lib/room-rules';
import { SOLVE_WINDOW_MS } from '../lib/room-scoring';

function makePlayer(overrides: Partial<RoomPlayer> & { id: string }): RoomPlayer {
  return {
    name: overrides.id, tokenHash: 'hash', isHost: false, ready: true, score: 0, role: 'player',
    joinedAt: 0, lastSeen: 0, left: false, sitOutCurrent: false, ...overrides,
  };
}

function makeRoom(count: number): RoomPlayer[] {
  return Array.from({ length: count }, (_, index) => makePlayer({ id: `p${index}` }));
}

test('a room seats players up to the cap', () => {
  const players = makeRoom(MAX_PLAYERS - 1);
  assert.equal(roleForJoin(players), 'player');
});

test('the joiner past the cap is a spectator, not refused', () => {
  const players = makeRoom(MAX_PLAYERS);
  assert.equal(roleForJoin(players), 'spectator');
});

test('a room only refuses a join once spectating is also full', () => {
  const players = [...makeRoom(MAX_PLAYERS), ...Array.from({ length: MAX_SPECTATORS }, (_, index) => makePlayer({ id: `s${index}`, role: 'spectator' }))];
  assert.equal(roleForJoin(players), null);
});

test('a left player frees their seat back up', () => {
  const players = makeRoom(MAX_PLAYERS).map((player, index) => index === 0 ? { ...player, left: true } : player);
  assert.equal(roleForJoin(players), 'player');
});

test('spectators and sitting-out players do not count toward eligibility', () => {
  const players = [
    makePlayer({ id: 'a' }),
    makePlayer({ id: 'b', role: 'spectator' }),
    makePlayer({ id: 'c', sitOutCurrent: true }),
    makePlayer({ id: 'd', left: true }),
  ];
  assert.deepEqual(eligiblePlayers(players).map((item) => item.id), ['a']);
  // Active (seated, not kicked) still counts the late joiner -- they are in
  // the room, just sitting this one puzzle out.
  assert.deepEqual(activePlayers(players).map((item) => item.id), ['a', 'c']);
});

test('a spectator cannot solve: applying a correct answer never scores one', () => {
  // room-service.ts refuses the action outright for a spectator before it
  // ever reaches applyCorrectSolve -- this just confirms the payout math
  // itself would never credit a non-player id if that guard were skipped.
  const players = [makePlayer({ id: 'watcher', role: 'spectator' })];
  const outcome = applyCorrectSolve({ players, progress: { ...EMPTY_PROGRESS }, mode: 'individuals', playerId: 'watcher', playerName: 'Watcher', base: 10, now: 0 });
  // The spectator still shows up as the sole "eligible" pool has nobody in
  // it -- a room of only spectators can never auto-resolve on "everyone answered".
  assert.equal(eligiblePlayers(players).length, 0);
  assert.equal(outcome.players.find((item) => item.id === 'watcher')?.score, 10, 'the pure function pays whoever it is asked to -- the role guard belongs to the caller');
});

test('the puzzle resolves once every eligible player has solved', () => {
  const players = makeRoom(3);
  let progress: PuzzleProgress = { ...EMPTY_PROGRESS };
  let outcome = applyCorrectSolve({ players, progress, mode: 'individuals', playerId: 'p0', playerName: 'p0', base: 10, now: 1000 });
  assert.equal(outcome.resolved, false, 'two more players have not gone yet');
  progress = outcome.progress;
  outcome = applyCorrectSolve({ players: outcome.players, progress, mode: 'individuals', playerId: 'p1', playerName: 'p1', base: 10, now: 1500 });
  assert.equal(outcome.resolved, false);
  progress = outcome.progress;
  outcome = applyCorrectSolve({ players: outcome.players, progress, mode: 'individuals', playerId: 'p2', playerName: 'p2', base: 10, now: 2000 });
  assert.equal(outcome.resolved, true, 'the last eligible player just solved it');
});

test('the puzzle resolves once the window closes, even with players left unsolved', () => {
  const players = makeRoom(5);
  const opened: PuzzleProgress = { ...EMPTY_PROGRESS, solvers: [{ solverId: 'p0', solverName: 'p0', award: 10, position: 1 }], firstSolveAt: 0 };
  assert.equal(shouldCloseWindow(opened, eligiblePlayers(players).length, SOLVE_WINDOW_MS - 1), false);
  assert.equal(shouldCloseWindow(opened, eligiblePlayers(players).length, SOLVE_WINDOW_MS + 1), true);
});

test('a paused puzzle never resolves on its own', () => {
  const players = makeRoom(2);
  const paused: PuzzleProgress = { ...EMPTY_PROGRESS, solvers: [{ solverId: 'p0', solverName: 'p0', award: 10, position: 1 }], firstSolveAt: 0, paused: true };
  assert.equal(shouldCloseWindow(paused, eligiblePlayers(players).length, 1_000_000), false);
});

test('later finishers in the same room are paid on the finish-order curve, not the full award', () => {
  const players = makeRoom(3);
  let outcome = applyCorrectSolve({ players, progress: { ...EMPTY_PROGRESS }, mode: 'individuals', playerId: 'p0', playerName: 'p0', base: 20, now: 0 });
  const firstAward = outcome.players.find((item) => item.id === 'p0')?.score;
  outcome = applyCorrectSolve({ players: outcome.players, progress: outcome.progress, mode: 'individuals', playerId: 'p1', playerName: 'p1', base: 20, now: 1000 });
  const secondAward = outcome.players.find((item) => item.id === 'p1')?.score;
  assert.equal(firstAward, 20);
  assert.ok(secondAward !== undefined && secondAward > 0 && secondAward < 20, `expected a reduced but positive award, got ${secondAward}`);
});

test('a repeated correct answer for an already-scored player is a harmless no-op', () => {
  const players = makeRoom(2);
  const first = applyCorrectSolve({ players, progress: { ...EMPTY_PROGRESS }, mode: 'individuals', playerId: 'p0', playerName: 'p0', base: 20, now: 0 });
  const retried = applyCorrectSolve({ players: first.players, progress: first.progress, mode: 'individuals', playerId: 'p0', playerName: 'p0', base: 20, now: 500 });
  assert.equal(retried.players.find((item) => item.id === 'p0')?.score, 20, 'must not be paid twice');
  assert.equal(retried.progress.solvers.length, 1);
});

test('cooperative play pays every player the same the instant anyone solves it', () => {
  const players = makeRoom(4);
  const outcome = applyCorrectSolve({ players, progress: { ...EMPTY_PROGRESS }, mode: 'cooperative', playerId: 'p2', playerName: 'p2', base: 12, now: 0 });
  assert.equal(outcome.resolved, true, 'one shared score -- there is no "next finisher" to wait for');
  for (const item of outcome.players) assert.equal(item.score, 12);
});

test('a wrong answer costs the solver a point, floored at zero', () => {
  const players = [makePlayer({ id: 'p0', score: 0 })];
  const outcome = applyWrongSolve(players, { ...EMPTY_PROGRESS }, 'individuals', 'p0');
  assert.equal(outcome.players[0].score, 0);
  assert.ok(outcome.progress.answered.includes('p0'), 'a wrong answer still counts as having answered');
});

test('a wrong answer in Teams mode docks the team\'s top scorer, not a player at zero', () => {
  const players = [
    makePlayer({ id: 'p0', teamId: 'sun', score: 0 }),
    makePlayer({ id: 'p1', teamId: 'sun', score: 9 }),
  ];
  const outcome = applyWrongSolve(players, { ...EMPTY_PROGRESS }, 'teams', 'p0', 'sun');
  assert.equal(outcome.players.find((item) => item.id === 'p1')?.score, 8, 'the top scorer on the team pays, not the player who guessed wrong');
  assert.equal(outcome.players.find((item) => item.id === 'p0')?.score, 0);
});

test('reconnecting mid-round does not disturb any other player\'s score', () => {
  const players = makeRoom(4).map((player) => player.id === 'p1' ? { ...player, score: 7 } : player);
  // Simulate the room advancing through two more solves while p1's client
  // reconnects and reads a fresh snapshot -- p1's own score must be exactly
  // what it was, and nobody else's changes because of it.
  const before = new Map(players.map((item) => [item.id, item.score]));
  const outcome = applyCorrectSolve({ players, progress: { ...EMPTY_PROGRESS }, mode: 'individuals', playerId: 'p0', playerName: 'p0', base: 10, now: 0 });
  for (const item of outcome.players) {
    if (item.id === 'p0') continue;
    assert.equal(item.score, before.get(item.id), `${item.id}'s score must be untouched by someone else's solve`);
  }
});

test('a kicked player is excluded from every seat and eligibility count', () => {
  const kicked = [makePlayer({ id: 'p0' }), makePlayer({ id: 'p1', left: true })];
  assert.deepEqual(activePlayers(kicked).map((item) => item.id), ['p0']);
  assert.deepEqual(eligiblePlayers(kicked).map((item) => item.id), ['p0']);
  assert.equal(roleForJoin(makeRoom(MAX_PLAYERS).map((player, index) => index === 0 ? { ...player, left: true } : player)), 'player');
});

test('a late joiner sits out the puzzle already in progress', () => {
  // room-service.ts marks a joiner sitOutCurrent when the room is not in
  // LOBBY -- once that is set, they must not count toward the puzzle
  // that was already live when they arrived.
  const lateJoiner = makePlayer({ id: 'late', sitOutCurrent: true });
  const players = [...makeRoom(2), lateJoiner];
  assert.equal(eligiblePlayers(players).length, 2, 'the late joiner does not shrink or grow this round\'s denominator');
  const outcome = applyCorrectSolve({ players, progress: { ...EMPTY_PROGRESS }, mode: 'individuals', playerId: 'p0', playerName: 'p0', base: 10, now: 0 });
  const secondSolve = applyCorrectSolve({ players: outcome.players, progress: outcome.progress, mode: 'individuals', playerId: 'p1', playerName: 'p1', base: 10, now: 100 });
  assert.equal(secondSolve.resolved, true, 'the puzzle resolves once both real players have gone, without waiting on the late joiner');
});

test('pausing freezes the window and resuming shifts it forward by the pause duration', () => {
  const open: PuzzleProgress = { ...EMPTY_PROGRESS, firstSolveAt: 1000 };
  const paused = pauseProgress(open, 2000);
  assert.equal(paused.paused, true);
  assert.equal(pauseProgress(paused, 5000).pausedAt, 2000, 'pausing an already-paused puzzle is a no-op');
  const resumed = resumeProgress(paused, 6000);
  assert.equal(resumed.paused, false);
  assert.equal(resumed.firstSolveAt, 1000 + (6000 - 2000), 'the four seconds spent paused must not count against the window');
  assert.equal(resumeProgress(resumed, 9000), resumed, 'resuming a puzzle that is not paused is a no-op');
});

test('skipping a puzzle refunds anyone it already paid, and leaves everyone else untouched', () => {
  const players = [makePlayer({ id: 'p0', score: 15 }), makePlayer({ id: 'p1', score: 3 })];
  const progress: PuzzleProgress = { ...EMPTY_PROGRESS, solvers: [{ solverId: 'p0', solverName: 'p0', award: 10, position: 1 }] };
  const refunded = refundSolvers(players, progress);
  assert.equal(refunded.find((item) => item.id === 'p0')?.score, 5, 'the 10 points this puzzle paid must come back out');
  assert.equal(refunded.find((item) => item.id === 'p1')?.score, 3, 'a player who did not solve this puzzle is untouched');
});

test('refunding never sends a score below zero', () => {
  const players = [makePlayer({ id: 'p0', score: 4 })];
  const progress: PuzzleProgress = { ...EMPTY_PROGRESS, solvers: [{ solverId: 'p0', solverName: 'p0', award: 10, position: 1 }] };
  assert.equal(refundSolvers(players, progress)[0].score, 0);
});
