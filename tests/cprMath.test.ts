/**
 * Cross-section sampling geometry tests.
 *
 * Trick: trilinear interpolation of a LINEAR voxel field is exact, so by using
 * fields f(i,j,k)=i, =j, =k we can decode the exact world position each output
 * pixel was sampled at, and compare against the geometry the UI promises:
 *
 *  - image horizontal axis: along the curve normal (buccolingual), centered on
 *    the curve point at `position`
 *  - image vertical axis: the Z axis leaned by tiltDeg toward the curve tangent
 *    (the tilted blue line drawn on the panoramic), pivoting at mid-Z
 *  - positive tilt → TOP of the slice moves toward INCREASING arch position
 */

import { describe, it, expect } from 'vitest';
import {
  trilinear,
  buildUniformCurve,
  computeCrossSection,
  type VolumeSamplingData,
  type Point2,
} from '../src/core/cprMath';

// Synthetic volume: dims/spacing/origin chosen so all samples stay inside
const dims: [number, number, number] = [100, 120, 80];
const spacing: [number, number, number] = [0.5, 0.5, 0.5];
const origin: [number, number, number] = [10, 20, 30];

function makeVol(field: (i: number, j: number, k: number) => number): VolumeSamplingData {
  return {
    dims,
    origin,
    getVoxel: field,
    invSx: 1 / spacing[0],
    invSy: 1 / spacing[1],
    invSz: 1 / spacing[2],
    zMin: origin[2],
    zMax: origin[2] + (dims[2] - 1) * spacing[2], // 69.5
    vSpacing: spacing[2],
  };
}

// Straight "arch" along +X at y=45 → tangent (1,0), normal (0,1)
const controlPoints: Point2[] = [[15, 45], [20, 45], [25, 45], [30, 45], [35, 45]];

const zMin = 30, zMax = 69.5;
const zMid = (zMin + zMax) / 2;

function decodeSampledPositions(tiltDeg: number) {
  const params = { controlPoints, position: 0.5, tiltDeg, widthMm: 10, resolution: 0.5 };
  const rx = computeCrossSection(makeVol((i) => i), params)!;
  const ry = computeCrossSection(makeVol((_i, j) => j), params)!;
  const rz = computeCrossSection(makeVol((_i, _j, k) => k), params)!;
  return { rx, ry, rz };
}

function maxGeometryError(tiltDeg: number): number {
  const { rx, ry, rz } = decodeSampledPositions(tiltDeg);
  const { width, height, horizontalSpacing: hSpacing } = rx;

  // Expected geometry (mirrors the engine's position lookup on the 500-pt curve)
  const idx = Math.round(0.5 * 499);
  const point: Point2 = [15 + (idx / 499) * 20, 45];
  const tangent: Point2 = [1, 0];
  const normal: Point2 = [0, 1];

  const tiltRad = (tiltDeg * Math.PI) / 180;
  const sinT = Math.sin(tiltRad);
  const cosT = Math.cos(tiltRad);
  const halfW = 5;

  let maxErr = 0;
  for (let y = 0; y < height; y++) {
    const v = (zMax - y * 0.5) - zMid; // mm along the slice's vertical axis, 0 at zMid
    for (let x = 0; x < width; x++) {
      const offset = -halfW + x * hSpacing;
      const ex = point[0] + normal[0] * offset + tangent[0] * (v * sinT);
      const ey = point[1] + normal[1] * offset + tangent[1] * (v * sinT);
      const ez = zMid + v * cosT;

      // Skip samples on the volume boundary: trilinear() returns the -1024
      // sentinel when any neighbor index falls outside the volume
      const ei = (ex - origin[0]) / spacing[0];
      const ej = (ey - origin[1]) / spacing[1];
      const ek = (ez - origin[2]) / spacing[2];
      if (ei < 0 || ei >= dims[0] - 1 || ej < 0 || ej >= dims[1] - 1 || ek < 0 || ek >= dims[2] - 1) continue;

      const p = y * width + x;
      const ax = origin[0] + rx.pixelData[p] * spacing[0];
      const ay = origin[1] + ry.pixelData[p] * spacing[1];
      const az = origin[2] + rz.pixelData[p] * spacing[2];

      maxErr = Math.max(maxErr, Math.abs(ax - ex), Math.abs(ay - ey), Math.abs(az - ez));
    }
  }
  return maxErr;
}

describe('computeCrossSection', () => {
  it.each([0, 30, -15])('samples exactly the promised plane at tilt %d°', (tilt) => {
    expect(maxGeometryError(tilt)).toBeLessThan(0.05);
  });

  it('positive tilt leans the slice top toward increasing arch position, pivoting at mid-Z', () => {
    const { rx, rz } = decodeSampledPositions(30);
    const xc = Math.round((rx.width - 1) / 2);
    const topX = origin[0] + rx.pixelData[xc] * spacing[0];
    const topZ = origin[2] + rz.pixelData[xc] * spacing[2];
    const curveX = 15 + (Math.round(0.5 * 499) / 499) * 20;
    expect(topX).toBeGreaterThan(curveX + 1); // displaced along the arch
    expect(topZ).toBeLessThan(zMax - 1);      // compressed toward zMid by cos(tilt)
  });

  // Medical-L2: tilt is clamped to ±30° — the vertical sample range stays the
  // volume Z range, so steeper tilts are disallowed instead of cropping anatomy
  it('clamps tilt beyond ±30° (tilt 60° samples the same plane as tilt 30°)', () => {
    const r60 = computeCrossSection(makeVol((i, j, k) => i + j + k), {
      controlPoints, position: 0.5, tiltDeg: 60, widthMm: 10, resolution: 0.5,
    })!;
    const r30 = computeCrossSection(makeVol((i, j, k) => i + j + k), {
      controlPoints, position: 0.5, tiltDeg: 30, widthMm: 10, resolution: 0.5,
    })!;
    expect(r60.pixelData).toHaveLength(r30.pixelData.length);
    for (let p = 0; p < r30.pixelData.length; p++) {
      expect(r60.pixelData[p]).toBeCloseTo(r30.pixelData[p], 6);
    }
  });
});

describe('trilinear boundary handling', () => {
  // L1: samples exactly on the outermost voxel plane must return real data,
  // not the -1024 air sentinel (previously a dark rim on CPR edges)
  it('returns real data for a sample exactly on the outermost voxel plane (coord == dims-1)', () => {
    const getVoxel = (i: number) => 100 + i;
    const dims3: [number, number, number] = [8, 8, 8];
    const v = trilinear(getVoxel, dims3, dims3[0] - 1, 3, 3);
    expect(v).not.toBe(-1024);
    expect(v).toBeCloseTo(100 + (dims3[0] - 1), 3);
  });

  // Medical-L1: -1024 is the CT air sentinel — genuinely out-of-volume samples
  it('still returns -1024 for genuinely out-of-volume samples', () => {
    const getVoxel = () => 0;
    const dims3: [number, number, number] = [8, 8, 8];
    expect(trilinear(getVoxel, dims3, -0.5, 3, 3)).toBe(-1024);
    expect(trilinear(getVoxel, dims3, dims3[0], 3, 3)).toBe(-1024);
    expect(trilinear(getVoxel, dims3, 3, 3, dims3[2] + 0.25)).toBe(-1024);
  });
});

describe('buildUniformCurve degenerate input', () => {
  // M3: coincident control points must not crash downstream sampling
  it('returns a safe 2-point degenerate curve for coincident control points', () => {
    const { curve, normals, arcLen } = buildUniformCurve([[5, 5], [5, 5], [5, 5]], 100);
    expect(curve.length).toBe(2);
    expect(normals.length).toBe(2);
    expect(arcLen).toBe(0);
    for (const n of normals) {
      expect(Math.hypot(n[0], n[1])).toBeCloseTo(1, 9); // default unit normal
    }
  });
});
