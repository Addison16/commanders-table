import { describe, expect, it } from 'vitest';
import { dot, geometry, orient, rollSpin } from '../src/client/dice/geometry.js';
import { roundedGeometry } from '../src/client/dice/rounded.js';
import { diceSurfaceColor } from '../src/client/dice/ivory.js';
import { visualDice } from '../src/client/dice/presentation.js';
import { createGame, defaultSetup } from '../src/shared/game.js';
import { newId } from '../src/shared/random.js';
import { palettes, type Roll } from '../src/shared/schema.js';

describe('player dice colors', () => {
  const game = () => createGame(defaultSetup(), newId, 1000);
  const roll = (changes: Partial<Roll> = {}): Roll => ({
    id: newId(),
    kind: 'dice',
    sides: 20,
    values: [7, 18],
    candidates: [],
    rounds: [],
    winner: null,
    at: 2000,
    actor: 'This device',
    ...changes,
  });
  it('uses the selected seat for every die, independent of names or result values', () => {
    const g = game();
    const playerId = g.order[1];
    g.players[g.order[0]].name = g.players[playerId].name;
    g.players[playerId].color = 'rose';
    const r = roll({ playerId });
    const dice = visualDice(r, g, 0);
    expect(dice.map((die) => die.color)).toEqual(['rose', 'rose']);
    expect(dice.map((die) => die.value)).toEqual([7, 18]);
    expect(r.values).toEqual([7, 18]);
    expect(visualDice(roll({ kind: 'coin', sides: 2, values: [2], playerId }), g, 0)).toEqual([
      { value: 2, sides: 2, color: 'rose' },
    ]);
  });
  it('keeps both percentile dice in the same player color, including double-zero 100', () => {
    const g = game();
    const playerId = g.order[1];
    g.players[playerId].color = 'teal';
    const dice = visualDice(roll({ sides: 100, values: [1, 47, 100], playerId }), g, 0);
    expect(dice.map((die) => die.value)).toEqual([0, 1, 40, 7, 0, 0]);
    expect(dice.every((die) => die.color === 'teal')).toBe(true);
    expect(dice.filter((die) => die.percent).map((die) => die.name)).toEqual([
      '1 · tens',
      '2 · tens',
      '3 · tens',
    ]);
  });
  it('keeps each tied player’s own color through reordered first-player rerolls', () => {
    const g = game();
    const [a, b, c] = g.order;
    g.players[a].color = 'ember';
    g.players[b].color = 'blue';
    g.players[c].color = 'green';
    const r = roll({
      kind: 'd20-each',
      values: [],
      candidates: [a, b, c],
      rounds: [
        [
          { playerId: a, value: 20 },
          { playerId: b, value: 12 },
          { playerId: c, value: 20 },
        ],
        [
          { playerId: c, value: 4 },
          { playerId: a, value: 17 },
        ],
      ],
      winner: a,
    });
    expect(visualDice(r, g, 0).map((die) => die.color)).toEqual(['ember', 'blue', 'green']);
    expect(visualDice(r, g, 1).map((die) => [die.name, die.color, die.value])).toEqual([
      [g.players[c].name, 'green', 4],
      [g.players[a].name, 'ember', 17],
    ]);
  });
  it('keeps legacy rolls neutral and never identifies a random winner by color', () => {
    const g = game();
    expect(visualDice(roll(), g, 0).every((die) => die.color === 'ivory')).toBe(true);
    const winner = g.order[1];
    g.players[winner].color = 'violet';
    expect(visualDice(roll({ kind: 'first', values: [], candidates: g.order, winner }), g, 0)).toEqual([
      { value: 1, sides: 20, symbol: true, color: 'ivory' },
    ]);
  });
  it('tints the polished faces themselves for every seat while retaining natural shading', () => {
    const litFace = [0, 0, 1] as const;
    const shadowFace = [0, 0, -1] as const;
    for (const coin of [false, true]) {
      const colors = palettes.map((palette) => diceSurfaceColor([...litFace], palette, coin));
      expect(new Set(colors).size).toBe(palettes.length);
      for (const palette of palettes) {
        const lit = diceSurfaceColor([...litFace], palette, coin)
          .match(/\d+/g)!
          .map(Number);
        const shadow = diceSurfaceColor([...shadowFace], palette, coin)
          .match(/\d+/g)!
          .map(Number);
        lit.forEach((channel, i) => {
          expect(channel).toBeGreaterThan(shadow[i]);
          expect(channel).toBeLessThanOrEqual(255);
          expect(shadow[i]).toBeGreaterThanOrEqual(0);
        });
      }
      expect(diceSurfaceColor([...litFace], 'unknown', coin)).toBe(
        diceSurfaceColor([...litFace], 'ivory', coin),
      );
    }
  });
});

describe('dice polyhedra', () => {
  it.each([2, 4, 6, 8, 10, 12, 20])(
    'rounds d%i into a closed surface with finite outward fillets',
    (sides) => {
      for (const detail of [2, 4]) {
        const mesh = roundedGeometry(sides, detail);
        const edges = new Map<string, number>();
        const pointKey = (p: number[]) => p.map((n) => n.toFixed(6)).join(',');
        for (const surface of mesh.surfaces) {
          expect(dot(surface.normal, surface.center)).toBeGreaterThan(0);
          expect(surface.points.flat().every(Number.isFinite)).toBe(true);
          surface.points.forEach((p, i) => {
            const key = [pointKey(p), pointKey(surface.points[(i + 1) % surface.points.length])]
              .sort()
              .join('|');
            edges.set(key, (edges.get(key) ?? 0) + 1);
          });
        }
        expect([...edges.values()].every((count) => count === 2)).toBe(true);
        expect(mesh.surfaces.length).toBeGreaterThan(mesh.faces.length);
      }
    },
  );
  it.each([4, 6, 8, 10, 12, 20])('renders d%i as a closed solid with outward faces', (sides) => {
    const faces = geometry(sides);
    expect(faces).toHaveLength(sides);
    const edges = new Map<string, number>();
    for (const face of faces) {
      expect(dot(face.normal, face.center)).toBeGreaterThan(0);
      expect(orient(face.normal, faces[0], [0, 0, 0]).every(Number.isFinite)).toBe(true);
      face.points.forEach((point, i) => {
        const key = [point.join(','), face.points[(i + 1) % face.points.length].join(',')].sort().join('|');
        edges.set(key, (edges.get(key) ?? 0) + 1);
      });
    }
    expect([...edges.values()].every((n) => n === 2)).toBe(true);
    // The actual final animation pose must make the result face head-on and
    // its lettering upright, for every motion seed and every supported solid.
    for (const seed of [0, 0.37, 1]) {
      const face = faces[0],
        spin = rollSpin(1, seed);
      for (const [axis, expected] of [
        [face.normal, [0, 0, 1]],
        [face.u, [1, 0, 0]],
        [face.v, [0, 1, 0]],
      ] as const)
        orient(axis, face, spin).forEach((n, i) => expect(n).toBeCloseTo(expected[i]));
      expect(face.inradius).toBeGreaterThan(0);
    }
  });
});
