import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareRoomStart, type RoomPlayer, type RoomState } from '../lib/room-rules';
import { getEntryById } from '../lib/game-engine';

function player(id: string, overrides: Partial<RoomPlayer> = {}): RoomPlayer {
  return { id, name: id, tokenHash: 'test-only', isHost: id === 'host', ready: true,
    score: 30, role: 'player', joinedAt: 0, lastSeen: 0, left: false, sitOutCurrent: false, ...overrides };
}

function lobby(players = [player('host')]): Pick<RoomState, 'settings' | 'mode' | 'players'> {
  return { mode: 'individuals', settings: { difficulty: 'mixed', categories: ['book'], length: 10 }, players };
}

test('Start applies the unsaved draft before mode checks and builds the requested puzzle set', () => {
  const before = lobby();
  const draft = { mode: 'cooperative', settings: { difficulty: 2, categories: ['person'], length: 3 } };
  const started = prepareRoomStart(before, draft, 'draft-start');
  assert.equal(started.mode, 'cooperative', 'a host alone can start a newly selected co-op game');
  assert.deepEqual(started.settings, draft.settings);
  assert.equal(started.match?.puzzles.length, 3);
  for (const puzzle of started.match!.puzzles) {
    const entry = getEntryById(puzzle.entryId)!;
    assert.equal(entry.level, 2);
    assert.ok(entry.categories.includes('person'));
  }
  assert.equal(started.players[0].score, 0);
  assert.equal(before.mode, 'individuals');
  assert.equal(before.players[0].score, 30, 'preparation never mutates the saved room');
});

test('Starting directly in Teams assigns active seats evenly, skipping spectators and departed players', () => {
  const before = lobby([player('host'), player('watcher', { role: 'spectator' }),
    player('gone', { left: true }), player('guest'), player('third'), player('fourth')]);
  const started = prepareRoomStart(before, { mode: 'teams' }, 'teams-start');
  assert.deepEqual(started.players.map((member) => member.teamId), ['sun', undefined, undefined, 'olive', 'sun', 'olive']);
  assert.ok(started.players.every((member) => member.score === 0));
});

test('A failed start neither applies a draft nor erases scores', () => {
  const before = lobby([player('host'), player('guest', { ready: false })]);
  const saved = structuredClone(before);
  assert.throws(() => prepareRoomStart(before, { mode: 'teams' }, 'not-ready'), /ready first/);
  assert.deepEqual(before, saved);
  assert.throws(() => prepareRoomStart(lobby(), { mode: 'teams' }, 'alone'), /Invite at least one more/);
  const empty = lobby();
  empty.mode = 'cooperative';
  empty.settings = { categories: ['tribe'], difficulty: 9, length: 3 };
  assert.throws(() => prepareRoomStart(empty, {}, 'empty-set'), /No words/);
});

test('Clients without a start draft retain the existing room settings', () => {
  const before = lobby([player('host'), player('guest')]);
  const started = prepareRoomStart(before, {}, 'legacy-start');
  assert.deepEqual(started.settings, before.settings);
  assert.equal(started.mode, before.mode);
  assert.equal(started.match?.puzzles.length, 10);
});

test('The start draft is validated server-side and stale teams are removed in co-op', () => {
  const before = lobby([player('host', { teamId: 'sun' })]);
  const started = prepareRoomStart(before, { mode: 'cooperative', settings: { categories: ['invalid', 'person'], difficulty: 100, length: 999 } }, 'validated');
  assert.deepEqual(started.settings, { categories: ['person'], difficulty: 'mixed', length: 30 });
  assert.equal(started.players[0].teamId, undefined);
});
