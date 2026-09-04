/**
 * Measurement statistics — pure helpers for ROI intensity stats, HU sampling
 * along a line (profile), and angles. No Cornerstone import → unit-testable.
 *
 * `lineProfileHU` samples the volume with the same trilinear interpolation the
 * CPR engine uses, so a profile is consistent with the rendered slices.
 */

import { trilinear } from './cprMath';
import type { VolumeSamplingData } from './cprMath';

export type Vec3 = [number, number, number];

export interface RoiStats {
  count: number;
  mean: number;
  stdDev: number;
  min: number;
  max: number;
}

/** Population mean / SD / min / max of a set of intensity samples. */
export function roiStats(values: ArrayLike<number>): RoiStats | null {
  const n = values.length;
  if (n === 0) return null;
  let min = Infinity, max = -Infinity, sum = 0;
  for (let i = 0; i < n; i++) {
    const v = values[i];
    sum += v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const mean = sum / n;
  let sse = 0;
  for (let i = 0; i < n; i++) { const d = values[i] - mean; sse += d * d; }
  return { count: n, mean, stdDev: Math.sqrt(sse / n), min, max };
}

/** Sample HU along the world segment a→b at `samples` evenly spaced points. */
export function lineProfileHU(vol: VolumeSamplingData, a: Vec3, b: Vec3, samples = 64): number[] {
  const n = Math.max(2, Math.floor(samples));
  const [ox, oy, oz] = vol.origin;
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const wx = a[0] + (b[0] - a[0]) * t;
    const wy = a[1] + (b[1] - a[1]) * t;
    const wz = a[2] + (b[2] - a[2]) * t;
    out[i] = trilinear(
      vol.getVoxel, vol.dims,
      (wx - ox) * vol.invSx, (wy - oy) * vol.invSy, (wz - oz) * vol.invSz,
    );
  }
  return out;
}

/** Angle in degrees at `vertex` between the rays to `a` and `b` (2-D or 3-D). */
export function angleDeg(a: number[], vertex: number[], b: number[]): number {
  const u = a.map((v, i) => v - vertex[i]);
  const w = b.map((v, i) => v - vertex[i]);
  const dot = u.reduce((s, x, i) => s + x * w[i], 0);
  const lu = Math.hypot(...u), lw = Math.hypot(...w);
  if (lu === 0 || lw === 0) return 0;
  const c = Math.max(-1, Math.min(1, dot / (lu * lw)));
  return (Math.acos(c) * 180) / Math.PI;
}
