/**
 * Guide primitives are closed, outward-oriented 2-manifolds (the precondition
 * manifold-3d needs) with the expected volumes.
 */

import { describe, it, expect } from 'vitest';
import { cylinderMesh, sweptBarMesh, meshVolume, isClosedOriented } from '../src/core/guideGeom';
import type { Vec3 } from '../src/core/implantGeometry';

describe('cylinderMesh', () => {
  it('is a closed, consistently-oriented mesh', () => {
    const m = cylinderMesh([0, 0, 0], [0, 0, 10], 3, 48);
    expect(isClosedOriented(m)).toBe(true);
  });

  it('has positive volume ≈ π r² h', () => {
    const r = 3, h = 10;
    const m = cylinderMesh([0, 0, 0], [0, 0, h], r, 256);
    const expected = Math.PI * r * r * h;
    // Polygonal approximation slightly under-estimates the circle area.
    expect(meshVolume(m)).toBeGreaterThan(expected * 0.99);
    expect(meshVolume(m)).toBeLessThan(expected * 1.001);
  });

  it('works for an off-axis (diagonal) cylinder', () => {
    const p0: Vec3 = [1, 2, 3];
    const p1: Vec3 = [5, 7, 9];
    const m = cylinderMesh(p0, p1, 2, 32);
    expect(isClosedOriented(m)).toBe(true);
    const h = Math.hypot(4, 5, 6);
    const expected = Math.PI * 2 * 2 * h;
    expect(meshVolume(m)).toBeGreaterThan(expected * 0.97);
    expect(meshVolume(m)).toBeLessThan(expected * 1.01);
  });
});

describe('sweptBarMesh', () => {
  it('is a closed, consistently-oriented mesh (straight run)', () => {
    const line: Vec3[] = [[0, 0, 0], [10, 0, 0], [20, 0, 0]];
    const m = sweptBarMesh(line, 5, 4);
    expect(isClosedOriented(m)).toBe(true);
  });

  it('a straight bar has volume ≈ width · height · length', () => {
    const line: Vec3[] = [[0, 0, 0], [30, 0, 0]];
    const m = sweptBarMesh(line, 5, 4);
    expect(meshVolume(m)).toBeCloseTo(5 * 4 * 30, 4);
  });

  it('stays closed along a curved (arch-like) centerline', () => {
    const line: Vec3[] = [];
    for (let i = 0; i <= 12; i++) {
      const a = (i / 12) * Math.PI; // half circle radius 20
      line.push([Math.cos(a) * 20, Math.sin(a) * 20, 5]);
    }
    const m = sweptBarMesh(line, 4, 3);
    expect(isClosedOriented(m)).toBe(true);
    expect(meshVolume(m)).toBeGreaterThan(0);
  });

  it('returns empty for a degenerate centerline', () => {
    const m = sweptBarMesh([[0, 0, 0]], 5, 4);
    expect(m.positions.length).toBe(0);
    expect(m.indices.length).toBe(0);
  });
});
