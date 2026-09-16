import { describe, expect, it } from 'vitest';
import { dot, geometry, orient, rollSpin } from '../src/client/dice/geometry.js';
import { roundedGeometry } from '../src/client/dice/rounded.js';

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
