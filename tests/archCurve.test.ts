/**
 * Arch curve math tests: CatmullRom interpolation, arc-length resampling,
 * normals.
 */

import { describe, it, expect } from 'vitest';
import {
  interpolateArchCurve,
  resampleByArcLength,
  computeCurveNormals,
  totalArcLength,
} from '../src/core/archCurve';

type Point2 = [number, number];

describe('resampleByArcLength', () => {
  it('produces uniformly spaced points from unevenly spaced input', () => {
    // Polyline with very uneven segment lengths
    const curve: Point2[] = [[0, 0], [1, 0], [10, 0], [11, 0], [30, 0]];
    const resampled = resampleByArcLength(curve, 31);

    const dists: number[] = [];
    for (let i = 1; i < resampled.length; i++) {
      dists.push(Math.hypot(
        resampled[i][0] - resampled[i - 1][0],
        resampled[i][1] - resampled[i - 1][1],
      ));
    }
    const expected = 30 / 30; // total length / segments
    for (const d of dists) expect(d).toBeCloseTo(expected, 6);
  });

  it('preserves the endpoints', () => {
    const curve: Point2[] = [[0, 0], [5, 5], [10, 0]];
    const r = resampleByArcLength(curve, 10);
    expect(r[0]).toEqual([0, 0]);
    expect(r[r.length - 1][0]).toBeCloseTo(10, 6);
  });
});

describe('interpolateArchCurve', () => {
  it('passes through the control points', () => {
    const cps: Point2[] = [[0, 0], [10, 5], [20, 0]];
    const curve = interpolateArchCurve(cps, 20);
    // First and last points are exact; middle control point is on the curve
    expect(curve[0]).toEqual([0, 0]);
    expect(curve[curve.length - 1]).toEqual([20, 0]);
    const hitsMiddle = curve.some(p => Math.hypot(p[0] - 10, p[1] - 5) < 1e-9);
    expect(hitsMiddle).toBe(true);
  });
});

describe('computeCurveNormals', () => {
  it('returns unit normals perpendicular to the tangent', () => {
    const curve: Point2[] = [[0, 0], [1, 0], [2, 0], [3, 0]];
    const normals = computeCurveNormals(curve);
    for (const n of normals) {
      expect(Math.hypot(n[0], n[1])).toBeCloseTo(1, 9);
      expect(n[0]).toBeCloseTo(0, 9); // tangent +X → normal ±Y
    }
  });

  // M3: degenerate curves must not throw
  it('returns a default normal for a single-point curve without throwing', () => {
    const normals = computeCurveNormals([[5, 7]]);
    expect(normals).toHaveLength(1);
    expect(Math.hypot(normals[0][0], normals[0][1])).toBeCloseTo(1, 9);
  });

  it('returns a default normal for coincident points (zero-length tangent)', () => {
    const normals = computeCurveNormals([[3, 3], [3, 3]]);
    expect(normals).toHaveLength(2);
    for (const n of normals) {
      expect(Math.hypot(n[0], n[1])).toBeCloseTo(1, 9);
    }
  });

  it('does not throw on a resampled fully-collapsed curve', () => {
    // All control points coincide → resampleByArcLength collapses to 1 point
    const collapsed = resampleByArcLength([[4, 4], [4, 4], [4, 4]], 50);
    expect(collapsed).toHaveLength(1);
    expect(() => computeCurveNormals(collapsed)).not.toThrow();
  });
});

describe('totalArcLength', () => {
  it('sums segment lengths', () => {
    expect(totalArcLength([[0, 0], [3, 4], [3, 14]])).toBeCloseTo(15, 9);
  });
});
