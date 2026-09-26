/**
 * Fine registration of a scan onto the CBCT surface. What matters here is that
 * a landmark-registered scan gets *closer*, that gingiva-like points with no
 * counterpart in the volume cannot drag it off, and that a hopeless input is
 * reported rather than silently "refined" into nonsense.
 *
 * The phantom is a row of dense spheres — cusps, in effect. A single sphere or
 * an axis-aligned box would measure the phantom rather than the algorithm: on a
 * box, which lattice sample lands nearest each face is arbitrary and biases the
 * fit, and on one sphere the closest-N correspondences a trimmed fit keeps all
 * come from one band, which constrains translation along the offset poorly.
 * Several separated features is what real crowns look like to ICP.
 */

import { describe, it, expect } from 'vitest';
import { refineScanToVolume } from '../src/core/scanRegister';
import { applyMat4, mul4 } from '../src/core/registration';
import { translation4, rotation4 } from '../src/core/scanAdjust';
import type { VolumeSamplingData } from '../src/core/cprMath';
import type { Vec3 } from '../src/core/implantGeometry';

const RADIUS = 6;
// Five "cusps" along an arc, the way a row of crowns sits.
const CUSPS: Vec3[] = [
  [26, 34, 40], [33, 28, 40], [42, 26, 40], [51, 28, 40], [58, 34, 40],
];

const vol: VolumeSamplingData = {
  dims: [84, 64, 64],
  origin: [0, 0, 0],
  invSx: 1, invSy: 1, invSz: 1,
  zMin: 0, zMax: 63, vSpacing: 1,
  getVoxel: (i, j, k) =>
    CUSPS.some((c) => Math.hypot(i - c[0], j - c[1], k - c[2]) <= RADIUS) ? 1500 : -1000,
};

/** Points spread evenly over one sphere (Fibonacci lattice). */
function spherePoints(center: Vec3, n: number, radius = RADIUS): Vec3[] {
  const pts: Vec3[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const th = golden * i;
    pts.push([center[0] + Math.cos(th) * r * radius, center[1] + y * radius, center[2] + Math.sin(th) * r * radius]);
  }
  return pts;
}

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const scan = CUSPS.flatMap((c) => spherePoints(c, 160));
/** A 1 mm lattice keeps the synthetic surface extraction quick. */
const FAST = { surfaceSpacingMm: 1 } as const;

/** Mean distance between where a transform puts the scan and where it belongs. */
function meanError(points: Vec3[], transform: number[], truth: number[]): number {
  let sum = 0;
  for (const p of points) {
    const a = applyMat4(transform, p);
    const b = applyMat4(truth, p);
    sum += Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  }
  return sum / points.length;
}

describe('refineScanToVolume', () => {
  it('pulls a slightly-off scan back onto the bone surface', () => {
    const off = translation4([1.5, -1.2, 0.9]);
    const before = meanError(scan, off, IDENTITY);
    const res = refineScanToVolume(vol, scan, off, { ...FAST, keep: 1 })!;
    expect(res).not.toBeNull();
    expect(meanError(scan, res.transform, IDENTITY)).toBeLessThan(before / 3);
    expect(res.rmsMm).toBeLessThan(res.beforeRmsMm);
  });

  it('recovers a small rotation as well as a shift', () => {
    const pivot: Vec3 = [42, 30, 40];
    const off = mul4(
      mul4(translation4(pivot), mul4(rotation4('z', 4), translation4([-pivot[0], -pivot[1], -pivot[2]]))),
      translation4([1, 0.5, 0]),
    );
    const res = refineScanToVolume(vol, scan, off, { ...FAST, keep: 1 })!;
    expect(meanError(scan, res.transform, IDENTITY)).toBeLessThan(meanError(scan, off, IDENTITY) / 2);
  });

  it('reports how far off it started, and what it fitted against', () => {
    const res = refineScanToVolume(vol, scan, translation4([1, 1, 0]), FAST)!;
    expect(res.beforeRmsMm).toBeGreaterThan(0);
    expect(res.targetPoints).toBeGreaterThan(200);
  });

  it('is not dragged off by points the volume does not contain', () => {
    // A flat skirt of "gingiva" well below the cusps, with no counterpart in
    // the CBCT at all — and more of it than there is real surface. Trimming has
    // to leave it out of the fit.
    const gingiva: Vec3[] = [];
    for (let x = 24; x <= 60; x += 1) for (let y = 22; y <= 40; y += 1) gingiva.push([x, y, 18]);
    const off = translation4([1.2, -1, 0.8]);
    const before = meanError(scan, off, IDENTITY);
    const res = refineScanToVolume(vol, [...scan, ...gingiva], off, { ...FAST, keep: 0.35 })!;
    expect(meanError(scan, res.transform, IDENTITY)).toBeLessThan(before);
  });

  it('never returns a fit worse than the one it was seeded with', () => {
    const res = refineScanToVolume(vol, scan, IDENTITY, FAST)!;
    expect(res.rmsMm).toBeLessThanOrEqual(res.beforeRmsMm + 1e-9);
  });

  it('declines when the scan is nowhere near any bone', () => {
    expect(refineScanToVolume(vol, scan, translation4([500, 500, 500]), FAST)).toBeNull();
  });

  it('declines on too few points or a malformed transform', () => {
    expect(refineScanToVolume(vol, scan.slice(0, 8), IDENTITY, FAST)).toBeNull();
    expect(refineScanToVolume(vol, scan, [1, 2, 3], FAST)).toBeNull();
  });
});
