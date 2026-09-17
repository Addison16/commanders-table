import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Envelope } from '../src/shared/schema.js';
import { newId } from '../src/shared/random.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetModules();
  vi.doUnmock('../src/client/app/store.js');
});

describe('room reconnection cancellation', () => {
  it('does not reopen a room or submit its saved actions after switching to local play during storage loading', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('document', { hidden: false, addEventListener: vi.fn() });
    vi.stubGlobal('addEventListener', vi.fn());
    vi.stubGlobal('dispatchEvent', vi.fn());
    const fetch = vi.fn(async (path: string) => {
      if (path === '/api/session') return Response.json({ csrf: 'test', serverTime: Date.now() });
      return Response.json({ error: 'Unexpected stale room request' }, { status: 404 });
    });
    vi.stubGlobal('fetch', fetch);
    const readStarted = deferred<void>();
    const saved = deferred<Envelope[]>();
    const state = { mode: 'room', connected: false, pending: 0 };
    let disconnect = () => {};
    vi.doMock('../src/client/app/store.js', () => ({
      useApp: {
        getState: () => state,
        setState: (patch: Partial<typeof state>) => Object.assign(state, patch),
      },
      repository: {
        pending: () => {
          readStarted.resolve();
          return saved.promise;
        },
      },
      registerRoom: (_send: unknown, stop: () => void) => {
        disconnect = stop;
      },
      updateProfile: vi.fn(),
      report: vi.fn(),
      errorMessage: (error: Error) => error.message,
      notify: vi.fn(),
    }));
    const { connectRoom } = await import('../src/client/adapters/room.js');
    const roomId = newId();
    const connecting = connectRoom(roomId);
    await readStarted.promise;
    disconnect();
    state.mode = 'local';
    saved.resolve([
      {
        protocolVersion: 1,
        roomId,
        gameId: newId(),
        operationId: newId(),
        baseRevision: 0,
        command: { type: 'adjust', playerId: newId(), field: 'life', delta: -1 },
      },
    ]);
    await connecting;
    expect(state.mode).toBe('local');
    expect(state.pending).toBe(0);
    expect(fetch.mock.calls.map(([path]) => path)).toEqual(['/api/session']);
  });
});
