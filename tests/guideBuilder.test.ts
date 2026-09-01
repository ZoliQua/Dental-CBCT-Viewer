/**
 * planBaseCenterline (pure part of the guide builder): samples the arch over
 * the guided implants' span at the requested base Z. Also covers the pure
 * housing↔base connectivity check (the exact Boolean overlap needs the WASM
 * kernel, which cannot run under vitest).
 */

import { describe, it, expect } from 'vitest';
import { planBaseCenterline, isHousingConnectedToBase } from '../src/core/guideBuilder';
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

describe('isHousingConnectedToBase', () => {
  // Base bar: centerline along X at z=40, cross-section 6 × 4 mm.
  const centerline: Vec3[] = [[-15, 0, 40], [0, 0, 40], [15, 0, 40]];
  const baseW = 6;
  const baseH = 4;

  it('accepts a vertical housing standing on the bar', () => {
    // Housing axis passes through the bar (z 36 → 48) right above the centerline.
    expect(isHousingConnectedToBase([0, 0, 36], [0, 0, 48], 3, centerline, baseW, baseH)).toBe(true);
  });

  it('accepts a slightly tilted housing near the edge of the span', () => {
    expect(isHousingConnectedToBase([14, 1, 37], [16, 2, 49], 3, centerline, baseW, baseH)).toBe(true);
  });

  it('rejects a housing placed far buccal of the arch', () => {
    // 12 mm off the centerline in Y — well beyond housing radius + half bar.
    expect(isHousingConnectedToBase([0, 12, 36], [0, 12, 48], 3, centerline, baseW, baseH)).toBe(false);
  });

  it('rejects a housing whose Z span misses the base slab', () => {
    // Hovering entirely above the bar (bar slab is z 38–42).
    expect(isHousingConnectedToBase([0, 0, 44], [0, 0, 52], 3, centerline, baseW, baseH)).toBe(false);
  });

  it('rejects when there is no base bar at all', () => {
    expect(isHousingConnectedToBase([0, 0, 36], [0, 0, 48], 3, [], baseW, baseH)).toBe(false);
  });
});
