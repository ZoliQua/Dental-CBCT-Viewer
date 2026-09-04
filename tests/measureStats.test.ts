/**
 * Measurement stats tests. Trilinear interpolation of a LINEAR voxel field is
 * exact, so a profile through f(i,j,k)=i decodes the exact sampled i-coordinate.
 */

import { describe, it, expect } from 'vitest';
import { roiStats, lineProfileHU, angleDeg } from '../src/core/measureStats';
import type { VolumeSamplingData } from '../src/core/cprMath';

const dims: [number, number, number] = [50, 50, 50];
const spacing: [number, number, number] = [1, 1, 1];
const origin: [number, number, number] = [0, 0, 0];

function makeVol(field: (i: number, j: number, k: number) => number): VolumeSamplingData {
  return {
    dims, origin, getVoxel: field,
    invSx: 1 / spacing[0], invSy: 1 / spacing[1], invSz: 1 / spacing[2],
    zMin: origin[2], zMax: origin[2] + (dims[2] - 1) * spacing[2], vSpacing: spacing[2],
  };
}

describe('roiStats', () => {
  it('computes population mean / SD / min / max', () => {
    const s = roiStats([0, 1, 2, 3, 4])!;
    expect(s.count).toBe(5);
    expect(s.mean).toBeCloseTo(2, 10);
    expect(s.min).toBe(0);
    expect(s.max).toBe(4);
    expect(s.stdDev).toBeCloseTo(Math.SQRT2, 10); // sqrt(10/5)
  });
  it('returns null for empty input', () => {
    expect(roiStats([])).toBeNull();
  });
});

describe('lineProfileHU', () => {
  it('samples a linear field exactly along X', () => {
    const p = lineProfileHU(makeVol((i) => i), [0, 5, 5], [10, 5, 5], 11);
    expect(p.length).toBe(11);
    expect(p[0]).toBeCloseTo(0, 6);
    expect(p[5]).toBeCloseTo(5, 6);
    expect(p[10]).toBeCloseTo(10, 6);
  });
  it('samples along Z (field = k)', () => {
    const p = lineProfileHU(makeVol((_i, _j, k) => k), [3, 3, 0], [3, 3, 8], 9);
    expect(p[4]).toBeCloseTo(4, 6);
    expect(p[8]).toBeCloseTo(8, 6);
  });
});

describe('angleDeg', () => {
  it('measures right, straight and zero angles', () => {
    expect(angleDeg([1, 0], [0, 0], [0, 1])).toBeCloseTo(90, 6);
    expect(angleDeg([1, 0], [0, 0], [-1, 0])).toBeCloseTo(180, 6);
    expect(angleDeg([1, 0], [0, 0], [1, 0])).toBeCloseTo(0, 6);
  });
});
