import { describe, it, expect } from 'vitest';
import {
  createGame,
  defaultSetup,
  elapsed,
  makeRoll,
  reduceGame,
  setupFromGame,
  warnings,
  GAME_RECOVERY_MS,
} from '../src/shared/game.js';
import { newId, randomInt } from '../src/shared/random.js';
import { gameSchema, seatProfileSchema, setupSchema, type Command, type Game } from '../src/shared/schema.js';
import type { CommanderCard } from '../src/shared/cards.js';
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
  it('saves player details and both commanders as one reversible change without resetting play', () => {
    let game = initial();
    const playerId = game.order[0];
    const commanders = Object.values(game.commanders).filter((entry) => entry.ownerId === playerId);
    const card: CommanderCard = {
      id: newId(),
      name: 'Tymna the Weaver',
      imageUrl: 'https://cards.scryfall.io/art_crop/front/1/2/12345678-1234-4234-8234-123456789abc.jpg',
      scryfallUrl: 'https://scryfall.com/card/test/1/tymna-the-weaver',
      artist: 'Example Artist',
    };
    game = action(game, { type: 'cast', commanderId: commanders[0].id });
    game = action(game, {
      type: 'damage',
      playerId: game.order[1],
      commanderId: commanders[1].id,
      amount: 7,
      subtractLife: true,
    });
    const previous = structuredClone(game);
    const edited = action(game, {
      type: 'editPlayer',
      playerId,
      name: 'Rowan',
      color: 'teal',
      commanders: [
        { id: commanders[1].id, label: 'A custom partner', card: null },
        { id: commanders[0].id, label: card.name, card },
      ],
    });
    expect(game).toEqual(previous);
    expect(edited.players).toEqual({
      ...game.players,
      [playerId]: { ...game.players[playerId], name: 'Rowan', color: 'teal' },
    });
    expect(edited.commanders[commanders[0].id]).toEqual({
      ...game.commanders[commanders[0].id],
      label: card.name,
      card,
    });
    expect(edited.commanders[commanders[1].id]).toEqual({
      ...game.commanders[commanders[1].id],
      label: 'A custom partner',
    });
    expect(Object.keys(edited.commanders)).toEqual(Object.keys(game.commanders));
    expect(edited.damageReceived).toEqual(game.damageReceived);
    expect(edited.timer).toEqual(game.timer);
    expect(edited.revision).toBe(game.revision + 1);
    expect(edited.history).toHaveLength(game.history.length + 1);
    expect(edited.undo).toHaveLength(game.undo.length + 1);
    const saved = gameSchema.parse(JSON.parse(JSON.stringify(edited)));
    expect(saved.players[playerId].color).toBe('teal');
    expect(saved.commanders[commanders[0].id].card).toEqual(card);
    const undone = action(saved, { type: 'undo' });
    expect(undone.players).toEqual(game.players);
    expect(undone.commanders).toEqual(game.commanders);
    expect(undone.damageReceived).toEqual(game.damageReceived);
    const redone = action(undone, { type: 'redo' });
    expect(redone.players).toEqual(edited.players);
    expect(redone.commanders).toEqual(edited.commanders);
  });
  it('rejects a partial or invalid player edit without changing names, colors or commanders', () => {
    const game = initial();
    const playerId = game.order[0];
    const commanders = Object.values(game.commanders)
      .filter((entry) => entry.ownerId === playerId)
      .map(({ id, label }) => ({ id, label }));
    const other = Object.values(game.commanders).find((entry) => entry.ownerId !== playerId)!;
    const previous = structuredClone(game);
    const command: Extract<Command, { type: 'editPlayer' }> = {
      type: 'editPlayer',
      playerId,
      name: 'Changed',
      color: 'rose',
      commanders,
    };
    for (const invalid of [
      [],
      [commanders[0]],
      [...commanders, { id: newId(), label: 'Added commander' }],
      [commanders[0], commanders[0]],
      [commanders[0], { id: newId(), label: 'Unknown commander' }],
      [commanders[0], { id: other.id, label: 'Someone else’s commander' }],
      [commanders[0], { ...commanders[1], label: '' }],
    ]) {
      expect(() => action(game, { ...command, commanders: invalid })).toThrow();
      expect(game).toEqual(previous);
    }
    expect(() => action(game, { ...command, name: 'P'.repeat(41) })).toThrow();
    expect(game).toEqual(previous);
  });
  it('clears omitted or null artwork in a submitted profile while keeping supplied partner artwork', () => {
    let game = initial();
    const playerId = game.order[0];
    const commanders = Object.values(game.commanders).filter((entry) => entry.ownerId === playerId);
    const card: CommanderCard = {
      id: newId(),
      name: 'Tymna the Weaver',
      imageUrl: 'https://cards.scryfall.io/art_crop/front/1/2/12345678-1234-4234-8234-123456789abc.jpg',
      scryfallUrl: 'https://scryfall.com/card/test/1/tymna-the-weaver',
      artist: 'Example Artist',
    };
    for (const commander of commanders)
      game = action(game, { type: 'commanderName', commanderId: commander.id, label: card.name, card });
    const command: Extract<Command, { type: 'editPlayer' }> = {
      type: 'editPlayer',
      playerId,
      name: 'Rowan',
      color: 'teal',
      commanders: [
        { id: commanders[0].id, label: 'Custom commander' },
        { id: commanders[1].id, label: card.name, card },
      ],
    };
    const edited = action(game, command);
    expect(edited.commanders[commanders[0].id]).not.toHaveProperty('card');
    expect(edited.commanders[commanders[1].id].card).toEqual(card);
    const cleared = action(edited, {
      ...command,
      commanders: command.commanders.map((entry) => ({ ...entry, card: null })),
    });
    expect(cleared.commanders[commanders[1].id]).not.toHaveProperty('card');
    expect(action(cleared, { type: 'undo' }).commanders).toEqual(edited.commanders);
  });
  it('keeps chosen commander artwork through saves, setup, rematches, undo and manual renames', () => {
    let game = initial();
    const commander = Object.values(game.commanders)[0];
    const card: CommanderCard = {
      id: newId(),
      name: 'A Legendary Commander With A Name Longer Than Forty Characters',
      imageUrl: 'https://cards.scryfall.io/art_crop/front/1/2/12345678-1234-4234-8234-123456789abc.jpg',
      scryfallUrl: 'https://scryfall.com/card/test/1/example-commander',
      artist: 'Example Artist',
    };
    game = action(game, { type: 'cast', commanderId: commander.id });
    game = action(game, {
      type: 'damage',
      playerId: game.order[1],
      commanderId: commander.id,
      amount: 7,
      subtractLife: true,
    });
    const before = game;
    game = action(game, { type: 'commanderName', commanderId: commander.id, label: card.name, card });
    expect(game.commanders[commander.id]).toEqual({
      ...before.commanders[commander.id],
      label: card.name,
      card,
    });
    expect(game.players).toEqual(before.players);
    expect(game.damageReceived).toEqual(before.damageReceived);
    const saved = gameSchema.parse(JSON.parse(JSON.stringify(game)));
    expect(saved.commanders[commander.id].card).toEqual(card);
    const setup = setupFromGame(saved);
    expect(setup.seats[0].commanderCards).toEqual([card, null]);
    expect(Object.values(createGame(setup, newId, 4000).commanders)[0].card).toEqual(card);
    const rematch = action(saved, { type: 'rematch' });
    expect(rematch.commanders[commander.id]).toEqual({ ...saved.commanders[commander.id], casts: 0 });
    expect(action(saved, { type: 'undo' }).commanders[commander.id]).toEqual(before.commanders[commander.id]);
    expect(action(action(saved, { type: 'undo' }), { type: 'redo' }).commanders[commander.id]).toEqual(
      saved.commanders[commander.id],
    );
    for (const command of [
      { type: 'commanderName', commanderId: commander.id, label: 'A custom nickname' },
      { type: 'commanderName', commanderId: commander.id, label: card.name, card: null },
    ] as const) {
      const renamed = action(saved, command);
      expect(renamed.commanders[commander.id]).not.toHaveProperty('card');
      expect(action(renamed, { type: 'undo' }).commanders[commander.id].card).toEqual(card);
    }
    const legacy = initial();
    expect(gameSchema.parse(legacy)).toEqual(legacy);
    expect(setupFromGame(legacy).seats[0]).not.toHaveProperty('commanderCards');
  });
  it('bounds commander names separately from player names and aligns optional artwork slots', () => {
    const setup = defaultSetup();
    setup.seats[0].commanders = ['C'.repeat(100), 'Partner'];
    setup.seats[0].commanderCards = [null, null];
    expect(() => createGame(setup, newId, 1000)).not.toThrow();
    expect(
      seatProfileSchema.parse({
        name: 'Alex',
        commanders: setup.seats[0].commanders,
        commanderCards: [null, null],
      }),
    ).toHaveProperty('commanderCards');
    setup.seats[0].commanderCards = [null];
    expect(setupSchema.safeParse(setup).success).toBe(false);
    expect(seatProfileSchema.safeParse({ name: 'Alex', commanderCards: [null] }).success).toBe(false);
    expect(
      seatProfileSchema.safeParse({ name: 'Alex', commanders: ['One', 'Two'], commanderCards: [null] })
        .success,
    ).toBe(false);
    expect(seatProfileSchema.safeParse({ name: 'Alex', commanders: ['C'.repeat(101)] }).success).toBe(false);
    expect(seatProfileSchema.safeParse({ name: 'P'.repeat(41), commanders: ['One'] }).success).toBe(false);
  });
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
  it('records the chosen player for dice and coins while accepting older unassigned rolls', () => {
    const game = initial(),
      playerId = game.order[1],
      context = { id: newId(), now: 2000, actor: 'Alex', actorId, operationId: newId() };
    for (const kind of ['dice', 'coin'] as const) {
      const command = { type: 'roll', kind, sides: 20, count: 1, playerId } as const;
      const roll = makeRoll(game, command, context, () => 0);
      expect(roll.playerId).toBe(playerId);
      const rolled = reduceGame(game, command, { ...context, roll });
      const saved = gameSchema.parse(JSON.parse(JSON.stringify(rolled)));
      expect(saved.rolls[0].playerId).toBe(playerId);
      expect(saved.players).toEqual(game.players);
      delete saved.rolls[0].playerId;
      expect(gameSchema.parse(saved).rolls[0]).not.toHaveProperty('playerId');
      expect(() => makeRoll(game, { ...command, playerId: newId() }, context, () => 0)).toThrow(
        /Unknown player/,
      );
      expect(gameSchema.safeParse({ ...rolled, rolls: [{ ...roll, playerId: newId() }] }).success).toBe(
        false,
      );
    }
    const tableRoll = makeRoll(
      game,
      { type: 'roll', kind: 'first', sides: 20, count: 1, playerId },
      context,
      () => 0,
    );
    expect(tableRoll).not.toHaveProperty('playerId');
    expect(tableRoll.candidates).toEqual(game.order);
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
