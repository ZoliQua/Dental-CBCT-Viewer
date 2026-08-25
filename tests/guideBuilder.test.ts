/**
 * planBaseCenterline (pure part of the guide builder): samples the arch over
 * the guided implants' span at the requested base Z.
 */

import { describe, it, expect } from 'vitest';
import { planBaseCenterline } from '../src/core/guideBuilder';
import type { Vec3 } from '../src/core/implantGeometry';
import type { Point2 } from '../src/core/cprMath';

// A gentle arch (parabola-ish) of control points in XY.
const arch: Point2[] = [
  [-30, 10], [-20, 2], [-10, -2], [0, -3], [10, -2], [20, 2], [30, 10],
];

describe('planBaseCenterline', () => {
  it('returns samples+1 points, all at the base Z', () => {
    const entries: Vec3[] = [[-10, -2, 40], [10, -2, 44]];
    const line = planBaseCenterline(arch, entries, 42, 0.03, 20);
    expect(line.length).toBe(21);
    for (const p of line) expect(p[2]).toBe(42);
  });

  it('spans across the two implant positions', () => {
    const entries: Vec3[] = [[-10, -2, 40], [10, -2, 40]];
    const line = planBaseCenterline(arch, entries, 40);
    const xs = line.map((p) => p[0]);
    // The sampled centerline should reach out toward both implants.
    expect(Math.min(...xs)).toBeLessThanOrEqual(-9);
    expect(Math.max(...xs)).toBeGreaterThanOrEqual(9);
  });

  it('returns empty for no entries', () => {
    expect(planBaseCenterline(arch, [], 40)).toEqual([]);
  });
});
