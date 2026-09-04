/**
 * Arch-curve auto-detection tests.
 *
 * A synthetic volume holds a horseshoe (U-shaped) bone band of radius R around a
 * known centre, opening posteriorly (+Y). The detector should trace that band:
 * every emitted control point must lie on it, ordered patient-right → front →
 * left, with the most anterior point near the front of the band.
 */

import { describe, it, expect } from 'vitest';
import { detectArchControlPoints } from '../src/core/archDetect';
import type { VolumeSamplingData } from '../src/core/cprMath';

const dims: [number, number, number] = [120, 120, 20];
const spacing: [number, number, number] = [1, 1, 1];
const origin: [number, number, number] = [0, 0, 0];

function makeVol(field: (i: number, j: number, k: number) => number): VolumeSamplingData {
  return {
    dims, origin, getVoxel: field,
    invSx: 1 / spacing[0], invSy: 1 / spacing[1], invSz: 1 / spacing[2],
    zMin: origin[2], zMax: origin[2] + (dims[2] - 1) * spacing[2],
    vSpacing: spacing[2],
  };
}

// Band centre and radius (world = index here since spacing 1, origin 0).
const CX = 60, CY = 60, R = 35, HALF = 3.5;
const SPAN = (110 * Math.PI) / 180;

// Bone (1500 HU) on a U-band opening toward +Y; air (-1000) elsewhere.
const uBand = (i: number, j: number): number => {
  const dx = i - CX, dy = j - CY;
  const r = Math.hypot(dx, dy);
  const phi = Math.atan2(dx, -dy); // 0 = anterior (−Y), + toward +X
  return Math.abs(r - R) < HALF && Math.abs(phi) < SPAN ? 1500 : -1000;
};

const dist = (p: [number, number]) => Math.hypot(p[0] - CX, p[1] - CY);

describe('detectArchControlPoints', () => {
  it('traces the U-shaped bone band into 9 control points', () => {
    const cps = detectArchControlPoints(makeVol(uBand));
    expect(cps).not.toBeNull();
    expect(cps!.length).toBe(9);

    // Every point lies on the band (its distance to the true centre ≈ R).
    for (const p of cps!) {
      expect(dist(p)).toBeGreaterThan(R - 8);
      expect(dist(p)).toBeLessThan(R + 8);
    }
  });

  it('orders points patient-right → front → left', () => {
    const cps = detectArchControlPoints(makeVol(uBand))!;
    // First point on the −X (right) side, last on the +X (left) side.
    expect(cps[0][0]).toBeLessThan(CX);
    expect(cps[cps.length - 1][0]).toBeGreaterThan(CX);
    // Overall left-to-right progression across the ends.
    expect(cps[cps.length - 1][0]).toBeGreaterThan(cps[0][0]);

    // The most anterior point (min Y) is near the front centre of the band.
    const front = cps.reduce((a, b) => (b[1] < a[1] ? b : a));
    expect(front[1]).toBeLessThan(CY - R + 8); // near y ≈ CY − R (front of band)
    expect(Math.abs(front[0] - CX)).toBeLessThan(14);
  });

  it('returns null when the slab holds no bone', () => {
    expect(detectArchControlPoints(makeVol(() => -1000))).toBeNull();
  });

  it('respects a custom control-point count', () => {
    const cps = detectArchControlPoints(makeVol(uBand), { numControlPoints: 5 });
    expect(cps!.length).toBe(5);
  });
});
