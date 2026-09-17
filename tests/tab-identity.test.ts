import { afterEach, describe, expect, it, vi } from 'vitest';
import { acquireEditorIdentity } from '../src/client/storage/tabIdentity.js';

type LockCallback = (lock: Lock | null) => unknown;

function documentContext(initialId: string) {
  const values = new Map([['mtg-tab', initialId]]);
  const window = Object.assign(new EventTarget(), {
    sessionStorage: { setItem: (key: string, value: string) => values.set(key, value) },
  });
  const document = Object.assign(new EventTarget(), { defaultView: window });
  return {
    document,
    values,
    hide: () => window.dispatchEvent(new Event('pagehide')),
    freeze: () => document.dispatchEvent(new Event('freeze')),
    activate: () => vi.stubGlobal('document', document),
  };
}

function lockManager() {
  const held = new Set<string>();
  const request = vi.fn((name: string, _options: LockOptions, callback: LockCallback) => {
    if (held.has(name)) return Promise.resolve().then(() => callback(null));
    held.add(name);
    return Promise.resolve()
      .then(() => callback({ name, mode: 'exclusive' }))
      .finally(() => held.delete(name));
  });
  vi.stubGlobal('navigator', { locks: { request } });
  return { held, request };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('local editor identity', () => {
  it('gives a cloned tab its own identity while preserving the original editor and reload identity', async () => {
    const locks = lockManager();
    const first = documentContext('original');
    first.activate();
    expect(await acquireEditorIdentity('original')).toBe('original');
    const duplicate = documentContext('original');
    duplicate.activate();
    const duplicateId = await acquireEditorIdentity('original');
    expect(duplicateId).not.toBe('original');
    expect(duplicate.values.get('mtg-tab')).toBe(duplicateId);
    expect(first.values.get('mtg-tab')).toBe('original');
    expect(locks.held.size).toBe(2);

    first.hide();
    await vi.waitFor(() => expect(locks.held.has('mtg-util:editor:original')).toBe(false));
    const reload = documentContext('original');
    reload.activate();
    expect(await acquireEditorIdentity('original')).toBe('original');
    reload.hide();
    duplicate.hide();
  });

  it('shares one reservation across repeated calls and module reloads in the same document', async () => {
    const locks = lockManager();
    const page = documentContext('original');
    page.activate();
    const first = acquireEditorIdentity('original');
    expect(acquireEditorIdentity('original')).toBe(first);
    expect(await first).toBe('original');
    vi.resetModules();
    const reloaded = await import('../src/client/storage/tabIdentity.js');
    expect(reloaded.acquireEditorIdentity('original')).toBe(first);
    expect(locks.request).toHaveBeenCalledTimes(1);
    page.hide();
  });

  it.each(['hide', 'freeze'] as const)(
    'releases on %s and claims a fresh identity if another document took the old one while away',
    async (event) => {
      const locks = lockManager();
      const first = documentContext('original');
      first.activate();
      expect(await acquireEditorIdentity('original')).toBe('original');
      first[event]();
      await vi.waitFor(() => expect(locks.held.size).toBe(0));

      const other = documentContext('original');
      other.activate();
      expect(await acquireEditorIdentity('original')).toBe('original');
      first.activate();
      expect(await acquireEditorIdentity('original')).not.toBe('original');
      expect(locks.held.size).toBe(2);
      first.hide();
      other.hide();
    },
  );

  it.each(['missing', 'throws', 'rejects'] as const)(
    'allows hydration when Web Locks is %s',
    async (failure) => {
      const page = documentContext('original');
      page.activate();
      vi.stubGlobal('navigator', {
        locks:
          failure === 'missing'
            ? undefined
            : {
                request: () => {
                  if (failure === 'throws') throw new DOMException('Storage denied', 'SecurityError');
                  return Promise.reject(new DOMException('Storage denied', 'SecurityError'));
                },
              },
      });
      expect(await acquireEditorIdentity('original')).toBe('original');
      page.hide();
    },
  );

  it('limits startup waiting and ignores a late callback from a stalled lock request', async () => {
    vi.useFakeTimers();
    const page = documentContext('original');
    page.activate();
    let callback!: LockCallback;
    vi.stubGlobal('navigator', {
      locks: {
        request: (_name: string, _options: LockOptions, ready: LockCallback) => {
          callback = ready;
          return new Promise(() => {});
        },
      },
    });
    const loading = acquireEditorIdentity('original');
    await vi.advanceTimersByTimeAsync(1000);
    expect(await loading).toBe('original');
    expect(callback({ name: 'mtg-util:editor:original', mode: 'exclusive' })).toBeUndefined();
    expect(page.values.get('mtg-tab')).toBe('original');
    page.hide();
  });

  it('still reserves a unique identity when session storage writes are denied', async () => {
    const locks = lockManager();
    locks.held.add('mtg-util:editor:copied');
    const page = documentContext('copied');
    page.document.defaultView.sessionStorage.setItem = () => {
      throw new DOMException('Storage denied', 'SecurityError');
    };
    page.activate();
    const id = await acquireEditorIdentity('copied');
    expect(id).not.toBe('copied');
    expect(locks.held.has(`mtg-util:editor:${id}`)).toBe(true);
    page.hide();
  });
});
