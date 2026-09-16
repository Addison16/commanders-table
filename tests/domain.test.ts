import { describe, it, expect } from 'vitest';
import {
  createGame,
  defaultSetup,
  elapsed,
  makeRoll,
  reduceGame,
  warnings,
  GAME_RECOVERY_MS,
} from '../src/shared/game.js';
import { newId, randomInt } from '../src/shared/random.js';
import { gameSchema, type Command, type Game } from '../src/shared/schema.js';
const initial = () => {
  const setup = defaultSetup();
  setup.seats[0].commanders.push('Partner');
  return createGame(setup, newId, 1000);
};
const actorId = newId();
function action(g: Game, c: Command, groupId?: string, now = 2000) {
  return reduceGame(g, c, {
    id: newId(),
    operationId: newId(),
    actorId,
    actor: 'Alex',
    now,
    groupId,
    newGameId: c.type === 'rematch' ? newId() : undefined,
  });
}
describe('game invariants', () => {
  it('reopens the same game for 24 hours without resetting scores, identities or timer', () => {
    let game = initial();
    game = action(game, {
      type: 'damage',
      playerId: game.order[0],
      commanderId: Object.keys(game.commanders)[0],
      amount: 7,
      subtractLife: true,
    });
    const ended = action(game, { type: 'end' }, undefined, 5000);
    const restored = action(ended, { type: 'reopen' }, undefined, 5000 + GAME_RECOVERY_MS - 1);
    expect(restored.id).toBe(game.id);
    expect(restored.players).toEqual(game.players);
    expect(restored.commanders).toEqual(game.commanders);
    expect(restored.damageReceived).toEqual(game.damageReceived);
    expect(restored.timer).toEqual(ended.timer);
    expect(restored.status).toBe('active');
    expect(restored.endedAt).toBeNull();
    expect(restored.history.slice(0, -2)).toEqual(game.history);
    expect(() => action(ended, { type: 'reopen' }, undefined, 5000 + GAME_RECOVERY_MS)).toThrow(/24-hour/);
    expect(() => action(ended, { type: 'undo' }, undefined, 5000 + GAME_RECOVERY_MS)).toThrow(/24-hour/);
    const legacy = JSON.parse(JSON.stringify(game));
    delete legacy.endedAt;
    expect(gameSchema.parse(legacy).endedAt).toBeNull();
  });
  it('defaults older saves to optional turn tracking and allows dice after a game ends', () => {
    const g = initial();
    const legacy = JSON.parse(JSON.stringify(g));
    delete legacy.settings.turnTracking;
    expect(gameSchema.parse(legacy).settings.turnTracking).toBe(false);
    const enabled = action(g, { type: 'turnTracking', enabled: true });
    expect(enabled.settings.turnTracking).toBe(true);
    expect(action(enabled, { type: 'undo' }).settings.turnTracking).toBe(false);
    const ended = action(enabled, { type: 'end' });
    const command = { type: 'roll', kind: 'dice', sides: 20, count: 1 } as const;
    const context = { id: newId(), now: 3000, actor: 'Alex', actorId, operationId: newId() };
    const roll = makeRoll(ended, command, context, () => 14);
    const rolled = reduceGame(ended, command, { ...context, roll });
    expect(rolled.rolls[0].values).toEqual([15]);
    expect(rolled.status).toBe('ended');
    expect(rolled.players).toEqual(ended.players);
    expect(() => action(ended, { type: 'adjust', playerId: g.order[0], field: 'life', delta: 1 })).toThrow();
  });
  it('records an actual die for a single remaining player', () => {
    const g = createGame(defaultSetup(1), newId, 1000);
    const roll = makeRoll(
      g,
      { type: 'roll', kind: 'd20-each', sides: 20, count: 1 },
      { id: newId(), now: 2000, actor: 'Alex' },
      () => 6,
    );
    expect(roll.rounds).toEqual([[{ playerId: g.order[0], value: 7 }]]);
    expect(roll.winner).toBe(g.order[0]);
  });
  it.each([1, 2, 3, 4, 5, 6, 7, 8])('supports %i stable seats', (count) => {
    const g = createGame(defaultSetup(count), newId, 0);
    expect(g.order).toHaveLength(count);
    expect(gameSchema.parse(g)).toEqual(g);
  });
  it('allows negative life but rejects negative counters, overflow, and unsafe fields', () => {
    const g = initial(),
      id = g.order[0];
    expect(action(g, { type: 'set', playerId: id, field: 'life', value: -8 }).players[id].life).toBe(-8);
    for (const field of ['poison', '__proto__'])
      expect(() => action(g, { type: 'set', playerId: id, field, value: -1 })).toThrow();
    expect(() => action(g, { type: 'adjust', playerId: id, field: 'life', delta: 999999 })).toThrow();
  });
  it('keeps partners, own commanders, identity and life independent', () => {
    let g = initial();
    const id = g.order[0],
      cs = Object.values(g.commanders).filter((c) => c.ownerId === id);
    for (const c of cs)
      g = action(g, { type: 'damage', playerId: id, commanderId: c.id, amount: 11, subtractLife: false });
    expect(warnings(g, id)).toEqual([]);
    g = action(g, { type: 'customize', playerId: id, name: 'Renamed', color: 'teal' });
    g.order.reverse();
    g = action(g, { type: 'adjust', playerId: id, field: 'life', delta: 10 });
    expect(g.damageReceived[id][cs[0].id]).toBe(11);
    g = action(g, { type: 'damage', playerId: id, commanderId: cs[0].id, amount: 11, subtractLife: false });
    expect(warnings(g, id)).toContain('Commander damage');
    expect(g.players[id].life).toBe(50);
  });
  it('undoes combined damage and life atomically; corrections only affect damage', () => {
    const g = initial(),
      id = g.order[0],
      cid = Object.keys(g.commanders)[0];
    const hit = action(g, { type: 'damage', playerId: id, commanderId: cid, amount: 5, subtractLife: true });
    expect(hit.players[id].life).toBe(35);
    const corrected = action(hit, { type: 'damageSet', playerId: id, commanderId: cid, value: 9 });
    expect(corrected.players[id].life).toBe(35);
    const undone = action(action(corrected, { type: 'undo' }), { type: 'undo' });
    expect(undone.players).toEqual(g.players);
    expect(undone.damageReceived).toEqual(g.damageReceived);
    const redone = action(undone, { type: 'redo' });
    expect(redone.players[id].life).toBe(35);
    expect(redone.damageReceived[id][cid]).toBe(5);
  });
  it('groups holds without delaying revisions and retains 60 undo actions', () => {
    let g = initial();
    const id = g.order[0],
      group = newId();
    for (let i = 0; i < 12; i++)
      g = action(g, { type: 'adjust', playerId: id, field: 'life', delta: -1 }, group);
    expect(g.revision).toBe(12);
    expect(g.undo).toHaveLength(1);
    expect(g.history[0].summary).toContain('lost 12 life');
    g = action(g, { type: 'undo' });
    expect(g.players[id].life).toBe(40);
    g = action(g, { type: 'redo' });
    expect(g.players[id].life).toBe(28);
    for (let i = 0; i < 65; i++) g = action(g, { type: 'adjust', playerId: id, field: 'life', delta: 1 });
    expect(g.undo).toHaveLength(60);
    expect(g.redo).toHaveLength(0);
  });
  it('tracks casts independently, retains markers on elimination, resets rematches', () => {
    let g = initial();
    const id = g.order[0],
      cs = Object.values(g.commanders).filter((c) => c.ownerId === id);
    g = action(g, { type: 'cast', commanderId: cs[0].id });
    expect(g.commanders[cs[0].id].casts * 2).toBe(2);
    expect(g.commanders[cs[1].id].casts).toBe(0);
    g = action(g, { type: 'marker', marker: 'monarch', playerId: id });
    g = action(g, { type: 'eliminate', playerId: id, eliminated: true });
    expect(g.markers.monarch).toBe(id);
    expect(() => action(g, { type: 'adjust', playerId: id, field: 'life', delta: 1 })).toThrow(/Restore/);
    const reset = action(g, { type: 'rematch' });
    expect(reset.id).not.toBe(g.id);
    expect(reset.order).toEqual(g.order);
    expect(reset.markers.monarch).toBeNull();
    expect(reset.commanders[cs[0].id].casts).toBe(0);
    expect(reset.players[id].eliminated).toBe(false);
  });
  it('timer derives elapsed time from timestamps and pause duration', () => {
    let g = initial();
    g = action(g, { type: 'timer', action: 'pause' }, undefined, 4000);
    expect(elapsed(g, 9999)).toBe(3000);
    g = action(g, { type: 'timer', action: 'resume' }, undefined, 7000);
    expect(elapsed(g, 8000)).toBe(4000);
  });
  it('records dice once, excludes eliminated seats and rerolls only tied leaders', () => {
    let g = initial();
    const id = g.order[0];
    g = action(g, { type: 'eliminate', playerId: id, eliminated: true });
    const base = { id: newId(), now: 2000, actor: 'Alex' };
    const first = makeRoll(g, { type: 'roll', kind: 'first', sides: 20, count: 1 }, base, () => 0);
    expect(first.winner).toBe(g.order[1]);
    const samples = [19, 19, 2, 0, 9];
    const roll = makeRoll(g, { type: 'roll', kind: 'd20-each', sides: 20, count: 1 }, base, () =>
      samples.shift()!,
    );
    expect(roll.rounds.map((r) => r.length)).toEqual([3, 2]);
    expect(roll.winner).toBe(g.order[2]);
    const d100 = makeRoll(g, { type: 'roll', kind: 'dice', sides: 100, count: 20 }, base, () => 99);
    expect(d100.values).toEqual(Array(20).fill(100));
  });
  it('rejection sampling discards biased tail values', () => {
    const values = [0xffffffff, 13];
    expect(
      randomInt(6, (a) => {
        a[0] = values.shift()!;
        return a;
      }),
    ).toBe(1);
    expect(values).toHaveLength(0);
  });
  it('rejects dangling IDs and future schemas on import', () => {
    const g = initial();
    expect(gameSchema.safeParse({ ...g, schemaVersion: 2 }).success).toBe(false);
    g.commanders[Object.keys(g.commanders)[0]].ownerId = newId();
    expect(gameSchema.safeParse(g).success).toBe(false);
  });
});
