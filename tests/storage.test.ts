import 'fake-indexeddb/auto';
import { describe, it, expect, vi } from 'vitest';
import { Repository, gameExport, parseImport } from '../src/client/storage/repository.js';
import { createGame, defaultSetup, reduceGame, GAME_RECOVERY_MS } from '../src/shared/game.js';
import { newId } from '../src/shared/random.js';
describe('local transactions and recovery', () => {
  it('keeps an ended game through a new game and reload, respects leases, and expires recovery', async () => {
    let now = 1_800_000_000_000;
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => now);
    try {
      const a = new Repository('a', newId());
      await a.open();
      const game = createGame(defaultSetup(), newId, now);
      const context = () => ({ id: newId(), operationId: newId(), now, actorId: 'a', actor: 'Alex' });
      const changed = reduceGame(
        game,
        { type: 'adjust', playerId: game.order[0], field: 'life', delta: -7 },
        context(),
      );
      await a.commit(changed, undefined, true);
      const ended = reduceGame(changed, { type: 'end' }, context());
      await a.commit(ended, changed);
      const second = createGame(defaultSetup(2, false), newId, now);
      await a.commit(second, undefined, true);
      const b = new Repository('b', a.databaseName);
      await b.open();
      expect(await b.recentEnded()).toEqual([ended]);
      await expect(b.reopenSaved(game.id, context())).rejects.toThrow(/Another tab/);
      now += 18001;
      const reopened = (await b.reopenSaved(game.id, context())).game!;
      expect(reopened.id).toBe(game.id);
      expect(reopened.players).toEqual(changed.players);
      expect(reopened.status).toBe('active');
      expect((await b.recentLocal()).some((g) => g.id === second.id)).toBe(true);
      expect(await b.recentEnded()).toEqual([]);
      const endedAgain = reduceGame(reopened, { type: 'end' }, context());
      await b.commit(endedAgain, reopened);
      now += GAME_RECOVERY_MS;
      expect(await b.recentEnded()).toEqual([]);
      await expect(b.reopenSaved(game.id, context())).rejects.toThrow(/24-hour/);
      expect((await b.active()).game).toEqual(endedAgain);
    } finally {
      clock.mockRestore();
    }
  });
  it('reads older display preferences without losing identity or manual seat flips', async () => {
    const a = new Repository('a', newId());
    await a.open();
    const profile = await a.profile();
    const legacy: Partial<typeof profile> = { ...profile, rotations: { seat: true } };
    delete legacy.tableLayout;
    await a.put('profile', legacy);
    expect(await a.profile()).toEqual({ ...legacy, tableLayout: 'upright' });
    await a.put('profile', { ...legacy, tableLayout: 'shared' });
    const reopened = new Repository('b', a.databaseName);
    await reopened.open();
    expect((await reopened.profile()).tableLayout).toBe('shared');
    expect((await reopened.profile()).installationId).toBe(profile.installationId);
  });
  it('resumes the original unfinished game with its latest life, names, damage and history', async () => {
    const a = new Repository('a', newId());
    await a.open();
    const original = createGame(defaultSetup(), newId, 1000);
    const context = () => ({ id: newId(), operationId: newId(), actorId: 'a', actor: 'Alex', now: 2000 });
    let changed = reduceGame(
      original,
      {
        type: 'damage',
        playerId: original.order[0],
        commanderId: Object.keys(original.commanders)[0],
        amount: 7,
        subtractLife: true,
      },
      context(),
    );
    changed = reduceGame(
      changed,
      { type: 'commanderName', commanderId: Object.keys(changed.commanders)[0], label: 'Atraxa' },
      context(),
    );
    await a.commit(changed, undefined, true);
    const second = createGame(defaultSetup(2, false), newId, 3000);
    await a.commit(second, undefined, true);
    expect((await a.recentLocal()).map((g) => g.id)).toEqual([second.id, original.id]);
    expect((await a.resumeSaved(original.id)).game).toEqual(changed);
    expect((await a.recentLocal()).map((g) => g.id)).toEqual([original.id, second.id]);
    const ended = reduceGame(changed, { type: 'end' }, context());
    await a.commit(ended, changed);
    expect((await a.recentLocal()).map((g) => g.id)).toEqual([second.id]);
    await a.resumeSaved(second.id);
    expect((await a.archive()).find((g) => g.id === original.id)?.status).toBe('ended');
  });
  it('bounds unfinished games, excludes rematched games, and respects another tab when resuming', async () => {
    const a = new Repository('a', newId());
    await a.open();
    for (let i = 0; i < 12; i++) await a.commit(createGame(defaultSetup(), newId, 1000 + i), undefined, true);
    const recent = await a.recentLocal();
    expect(recent).toHaveLength(10);
    const b = new Repository('b', a.databaseName);
    await b.open();
    await expect(b.resumeSaved(recent[1].id)).rejects.toThrow(/Another tab/);
    const olderArchive = (await a.archive()).at(-1)!;
    expect(recent.map((g) => g.id)).not.toContain(olderArchive.id);
    expect((await a.resumeSaved(olderArchive.id)).game!.id).toBe(olderArchive.id);
    await a.resumeSaved(recent[0].id);
    const rematch = reduceGame(
      recent[0],
      { type: 'rematch' },
      { id: newId(), operationId: newId(), actorId: 'a', actor: 'Alex', now: 3000, newGameId: newId() },
    );
    await a.commit(rematch, recent[0]);
    expect((await a.recentLocal()).some((g) => g.id === recent[0].id)).toBe(false);
    expect((await a.archive()).find((g) => g.id === recent[0].id)?.status).toBe('ended');
  });
  it('commits before reload and prevents stale writers and tab takeover races', async () => {
    const name = newId(),
      a = new Repository('a', name),
      b = new Repository('b', name);
    await a.open();
    await b.open();
    const g = createGame(defaultSetup(), newId, 1000);
    await a.commit(g, undefined, true);
    expect((await b.active()).readOnly).toBe(true);
    const next = reduceGame(
      g,
      { type: 'adjust', playerId: g.order[0], field: 'life', delta: -3 },
      { id: newId(), operationId: newId(), actorId: 'a', actor: 'Alex', now: 2000 },
    );
    await expect(b.commit(next, g)).rejects.toThrow(/Another tab/);
    await a.commit(next, g);
    expect((await b.active()).game!.players[g.order[0]].life).toBe(37);
    await b.commit(next, next, false, true);
    await expect(a.commit(next, g)).rejects.toThrow();
    expect((await a.checkpoint())!.revision).toBe(1);
  });
  it('preserves corrupt data, offers checkpoint, bounds archives and exports no profile', async () => {
    const a = new Repository('a', newId());
    await a.open();
    const g = createGame(defaultSetup(), newId, 1000);
    await a.commit(g, undefined, true);
    for (let i = 0; i < 12; i++)
      await a.commit(createGame(defaultSetup(2), newId, 2000 + i), undefined, true);
    expect(await a.archive()).toHaveLength(10);
    expect(parseImport(gameExport(g))).toEqual(g);
    expect(gameExport(g)).not.toContain('installationId');
    await a.put('active', { game: { schemaVersion: 99 }, owner: 'a', until: 0 });
    await expect(a.active()).rejects.toThrow(/damaged/);
    expect(await a.get('active')).toEqual({ game: { schemaVersion: 99 }, owner: 'a', until: 0 });
    expect(await a.checkpoint()).toBeDefined();
    expect(() => parseImport('{"format":"mtg-util-game","version":99}')).toThrow();
  });
});
