import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGame, defaultSetup, reduceGame } from '../src/shared/game.js';
import { newId } from '../src/shared/random.js';
import type { Game, RoomView } from '../src/shared/schema.js';
import { Repository } from '../src/client/storage/repository.js';

let store: typeof import('../src/client/app/store.js');
const readers: Repository[] = [];

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
  vi.setSystemTime(1_800_000_000_000);
  vi.stubGlobal('document', { hidden: false });
  vi.stubGlobal('BroadcastChannel', undefined);
  vi.stubGlobal('dispatchEvent', vi.fn());
  const values = new Map<string, string>();
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
  store = await import('../src/client/app/store.js');
  store.repository.databaseName = `store-test-${newId()}`;
  await store.repository.open();
});

afterEach(() => {
  store.repository.db?.close();
  for (const reader of readers.splice(0)) reader.db?.close();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function connectedRoom(recovery = false) {
  const game = createGame(defaultSetup(2), newId, Date.now());
  const member = {
    id: newId(),
    name: 'Alex',
    seatId: game.order[0],
    requestedSeat: null,
    status: 'approved' as const,
  };
  const room: RoomView = {
    protocolVersion: 1,
    id: newId(),
    revision: 7,
    gameId: game.id,
    hostId: member.id,
    me: member,
    members: [member],
    seats: game.order.map((id) => ({ id, name: game.players[id].name, taken: id === member.seatId })),
    locked: false,
    everyoneEdits: false,
    expiresAt: Date.now() + 86_400_000,
    retentionDays: 1,
    serverTime: Date.now() + 120_000,
    game,
  };
  const send = vi.fn(async () => {}),
    disconnect = vi.fn();
  store.registerRoom(send, disconnect);
  store.useApp.setState({
    ready: true,
    mode: 'room',
    room,
    game,
    confirmed: game,
    screen: 'board',
    connected: true,
    readOnly: true,
    recovery,
    pending: 3,
    unresolved: ['A previous room action needs review.'],
    clockOffset: 120_000,
    error: recovery ? 'Saved data needs recovery.' : '',
  });
  await store.updateProfile({ lastMode: 'room', roomId: room.id });
  return { room, send, disconnect };
}

async function corruptActive() {
  const raw = {
    game: { schemaVersion: 99, preserved: 'unreadable save' },
    owner: newId(),
    until: Date.now() + 18_000,
  };
  await store.repository.put('active', raw);
  await expect(store.repository.active()).rejects.toThrow(/damaged|newer/);
  expect(store.repository.corrupt).toEqual(raw);
  return raw;
}

async function reopenedStorage() {
  const reader = new Repository(newId(), store.repository.databaseName);
  readers.push(reader);
  await reader.open();
  return reader;
}

function expectLocal(game: Game) {
  expect(store.useApp.getState()).toMatchObject({
    ready: true,
    mode: 'local',
    game,
    confirmed: game,
    localGame: game,
    screen: 'board',
    room: undefined,
    connected: false,
    readOnly: false,
    pending: 0,
    clockOffset: 0,
    unresolved: [],
    profile: { lastMode: 'local' },
  });
}

describe('local game transitions and recovery', () => {
  it('restores a durable checkpoint and disconnects the room before local play continues', async () => {
    const checkpoint = createGame(defaultSetup(), newId, Date.now());
    checkpoint.players[checkpoint.order[0]].life = 27;
    await store.repository.commit(checkpoint, undefined, true);
    const next = reduceGame(
      checkpoint,
      { type: 'adjust', playerId: checkpoint.order[0], field: 'life', delta: -1 },
      { id: newId(), operationId: newId(), actorId: 'test', actor: 'Alex', now: Date.now() },
    );
    await store.repository.commit(next, checkpoint);
    await corruptActive();
    const room = await connectedRoom(true);

    await store.recoverCheckpoint();

    expectLocal(checkpoint);
    expect(store.useApp.getState()).toMatchObject({ recovery: false, error: '' });
    expect(room.disconnect).toHaveBeenCalledTimes(1);
    expect(store.repository.corrupt).toBeUndefined();
    const reader = await reopenedStorage();
    expect((await reader.active()).game).toEqual(checkpoint);
    expect((await reader.profile()).lastMode).toBe('local');
    // New input must save to the restored game instead of the old room sender.
    await store.act({ type: 'adjust', playerId: checkpoint.order[0], field: 'life', delta: -1 });
    expect(room.send).not.toHaveBeenCalled();
    expect((await reader.active()).game!.players[checkpoint.order[0]].life).toBe(26);
  });

  it('keeps recovery available after a failed fresh start and preserves the original on a successful retry', async () => {
    const original = await corruptActive();
    const room = await connectedRoom(true);
    const before = store.useApp.getState();
    const commit = vi.spyOn(store.repository, 'commit').mockRejectedValueOnce(new Error('Storage is full'));

    await expect(store.startFreshAfterRecovery()).rejects.toThrow('Storage is full');

    expect(store.useApp.getState()).toEqual(before);
    expect(store.repository.corrupt).toEqual(original);
    expect(await store.repository.get('active')).toEqual(original);
    expect(room.disconnect).not.toHaveBeenCalled();
    commit.mockRestore();

    await store.startFreshAfterRecovery();

    const game = store.useApp.getState().game!;
    expectLocal(game);
    expect(game.id).not.toBe(room.room.gameId);
    expect(game.order).toHaveLength(4);
    expect(game.order.map((id) => game.players[id].life)).toEqual([40, 40, 40, 40]);
    expect(store.useApp.getState()).toMatchObject({ recovery: false, error: '' });
    expect(room.disconnect).toHaveBeenCalledTimes(1);
    expect(store.repository.corrupt).toBeUndefined();
    const reader = await reopenedStorage();
    expect(await reader.get(`recovery:${Date.now()}`)).toEqual(original);
    expect((await reader.active()).game).toEqual(game);
    expect((await reader.profile()).lastMode).toBe('local');
  });

  it.each(['start', 'resume'])('clears shared room state when local play is %s', async (transition) => {
    const saved = createGame(defaultSetup(), newId, Date.now());
    saved.players[saved.order[0]].life = 33;
    await store.repository.commit(saved, undefined, true);
    const room = await connectedRoom();

    if (transition === 'start') await store.startLocal(defaultSetup(1, false));
    else await store.resumeLocal();

    const game = store.useApp.getState().game!;
    expectLocal(game);
    expect(room.disconnect).toHaveBeenCalledTimes(1);
    if (transition === 'resume') expect(game).toEqual(saved);
    else {
      expect(game.id).not.toBe(saved.id);
      expect(game.order).toHaveLength(1);
      expect(game.players[game.order[0]].life).toBe(20);
    }
    const reader = await reopenedStorage();
    expect((await reader.active()).game).toEqual(game);
    expect((await reader.profile()).lastMode).toBe('local');
  });
});
