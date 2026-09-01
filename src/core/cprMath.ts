/**
 * Pure CPR sampling math — no Cornerstone dependency, so it is unit-testable.
 * Used by cprEngine.ts which supplies the volume data from the Cornerstone cache.
 */

import { interpolateArchCurve, computeCurveNormals, totalArcLength, resampleByArcLength } from './archCurve';

export type Point2 = [number, number];

export interface CPRResult {
  pixelData: Float32Array;
  width: number;
  height: number;
  horizontalSpacing: number;
  verticalSpacing: number;
  zMin: number;
  zMax: number;
}

/** Minimal volume description needed for sampling (subset of what cprEngine builds). */
export interface VolumeSamplingData {
  dims: [number, number, number];
  origin: [number, number, number];
  getVoxel: (i: number, j: number, k: number) => number;
  invSx: number;
  invSy: number;
  invSz: number;
  zMin: number;
  zMax: number;
  vSpacing: number;
}

// ── Trilinear interpolation ────────────────────────────────────

/**
 * -1024 HU ≈ CT air: the sentinel returned for out-of-volume samples.
 * (Medical-L1: this is a CBCT/CT app, so -1024 is the air convention and
 * genuinely out-of-volume voxels correctly read as air.)
 */
const AIR_HU = -1024;

export function trilinear(
  getVoxel: (i: number, j: number, k: number) => number,
  dims: [number, number, number],
  ci: number, cj: number, ck: number,
): number {
  // Genuinely outside the volume → air sentinel
  if (ci < 0 || ci > dims[0] - 1 || cj < 0 || cj > dims[1] - 1 || ck < 0 || ck > dims[2] - 1) {
    return AIR_HU;
  }

  // L1 fix: a sample exactly ON the outermost voxel plane (coord == dims-1)
  // must interpolate real data, not bail to the air sentinel (which painted a
  // one-pixel dark rim on panoramic/cross-section edges). Clamp a hair inside
  // so the upper neighbor index stays in range with negligible weight error.
  const qi = Math.max(0, Math.min(ci, dims[0] - 1 - 1e-6));
  const qj = Math.max(0, Math.min(cj, dims[1] - 1 - 1e-6));
  const qk = Math.max(0, Math.min(ck, dims[2] - 1 - 1e-6));

  const i0 = Math.floor(qi), j0 = Math.floor(qj), k0 = Math.floor(qk);
  const i1 = i0 + 1, j1 = j0 + 1, k1 = k0 + 1;

  const fi = qi - i0, fj = qj - j0, fk = qk - k0;
  const nfi = 1 - fi, nfj = 1 - fj, nfk = 1 - fk;

  return (
    getVoxel(i0, j0, k0) * nfi * nfj * nfk +
    getVoxel(i1, j0, k0) * fi  * nfj * nfk +
    getVoxel(i0, j1, k0) * nfi * fj  * nfk +
    getVoxel(i1, j1, k0) * fi  * fj  * nfk +
    getVoxel(i0, j0, k1) * nfi * nfj * fk  +
    getVoxel(i1, j0, k1) * fi  * nfj * fk  +
    getVoxel(i0, j1, k1) * nfi * fj  * fk  +
    getVoxel(i1, j1, k1) * fi  * fj  * fk
  );
}

// ── Curve construction ─────────────────────────────────────────

/**
 * Build a dense, arc-length-uniform curve with normals from control points.
 * Used by both panoramic and cross-section generation.
 */
export function buildUniformCurve(controlPoints: Point2[], numSamples: number) {
  // First: dense CatmullRom interpolation (high enough to be smooth)
  const numSegments = Math.max(1, controlPoints.length - 1);
  const subsPerSeg = Math.max(10, Math.ceil(numSamples / numSegments) * 2);
  const rawCurve = interpolateArchCurve(controlPoints, subsPerSeg);

  // Then: resample uniformly by arc length → no distortion from uneven CP spacing
  const curve = resampleByArcLength(rawCurve, numSamples);
  if (curve.length === 0) return { curve, normals: [], arcLen: 0 };
  // M3: coincident control points collapse resampling to a single point.
  // Duplicate it so every consumer can assume ≥2 points (computeCurveNormals
  // then yields the default normal for the zero-length tangent).
  const safeCurve = curve.length < 2 ? [curve[0], curve[0]] : curve;
  const normals = computeCurveNormals(safeCurve);
  const arcLen = totalArcLength(safeCurve);

  return { curve: safeCurve, normals, arcLen };
}

// ── Cross-section sampling ─────────────────────────────────────

export interface CrossSectionGeometryParams {
  controlPoints: Point2[];
  position: number;   // 0-1 normalized along the arch curve
  tiltDeg: number;    // degrees, lean of the slice vertical axis along the curve
  widthMm: number;    // total width of cross-section in mm
  resolution: number; // mm per pixel
}

/** World-space frame of the cross-section plane. */
export interface CrossSectionFrame {
  point: Point2;    // curve point (XY)
  normal: Point2;   // buccolingual unit normal
  tangent: Point2;  // unit tangent toward increasing arch position
  origin: [number, number, number]; // plane origin: curve point at mid-Z
  eU: [number, number, number];     // in-plane horizontal unit axis (normal dir)
  eV: [number, number, number];     // in-plane vertical unit axis, pointing up
}

export function crossSectionFrame(
  controlPoints: Point2[],
  position: number,
  tiltDeg: number,
  zMin: number,
  zMax: number,
): CrossSectionFrame | null {
  const { curve, normals } = buildUniformCurve(controlPoints, 500);
  if (curve.length < 2) return null;

  // Position is uniform by arc length, so direct index lookup works
  const idx = Math.round(Math.max(0, Math.min(1, position)) * (curve.length - 1));
  const point = curve[idx];
  const normal = normals[idx];
  // normal = tangent rotated 90° CW ([-ty, tx]), so tangent (pointing toward
  // increasing arch position) is recovered as [ny, -nx]
  const tangent: Point2 = [normal[1], -normal[0]];

  // Medical-L2: clamp tilt to ±30° (the panoramic tilt-drag UI enforces the
  // same range). The vertical sample range deliberately stays the volume's Z
  // range — a taller sampling window would be needed to cover the full leaned
  // extent of a steeper slice, so steeper tilts are disallowed here instead of
  // silently cropping anatomy at the slice's top/bottom.
  const MAX_TILT_DEG = 30;
  const clampedTiltDeg = Math.max(-MAX_TILT_DEG, Math.min(MAX_TILT_DEG, tiltDeg));
  const tiltRad = (clampedTiltDeg * Math.PI) / 180;
  const sinT = Math.sin(tiltRad);
  const cosT = Math.cos(tiltRad);
  const zMid = (zMin + zMax) / 2;

  return {
    point, normal, tangent,
    origin: [point[0], point[1], zMid],
    eU: [normal[0], normal[1], 0],
    eV: [tangent[0] * sinT, tangent[1] * sinT, cosT],
  };
}

/**
 * Sample a cross-section slice perpendicular to the arch curve.
 *
 * The slice plane is spanned by:
 *  - horizontal axis: the curve normal (buccolingual direction)
 *  - vertical axis: the Z axis leaned by tiltDeg toward the curve tangent,
 *    pivoting at mid-Z — matching the tilted line drawn on the panoramic
 *    (positive tilt → top of the slice toward increasing arch position)
 */
export function computeCrossSection(
  vol: VolumeSamplingData,
  params: CrossSectionGeometryParams,
): CPRResult | null {
  const frame = crossSectionFrame(params.controlPoints, params.position, params.tiltDeg, vol.zMin, vol.zMax);
  if (!frame) return null;
  const { origin, eU, eV } = frame;

  // Output dimensions; vertical axis stays mm-true along the (tilted) slice axis
  const halfW = params.widthMm / 2;
  const width = Math.max(1, Math.round(params.widthMm / params.resolution));
  const height = Math.max(1, Math.round((vol.zMax - vol.zMin) / vol.vSpacing));
  const hSpacing = params.widthMm / Math.max(1, width - 1);
  const zMid = (vol.zMin + vol.zMax) / 2;

  const pixelData = new Float32Array(width * height);

  for (let y = 0; y < height; y++) {
    // Signed mm along the slice vertical axis, 0 at the mid-Z pivot
    const v = (vol.zMax - y * vol.vSpacing) - zMid;
    const bx = origin[0] + eV[0] * v;
    const by = origin[1] + eV[1] * v;
    const ck = (origin[2] + eV[2] * v - vol.origin[2]) * vol.invSz;

    for (let x = 0; x < width; x++) {
      const offset = -halfW + x * hSpacing;
      const ci = (bx + eU[0] * offset - vol.origin[0]) * vol.invSx;
      const cj = (by + eU[1] * offset - vol.origin[1]) * vol.invSy;
      pixelData[y * width + x] = trilinear(vol.getVoxel, vol.dims, ci, cj, ck);
    }
  }

  return { pixelData, width, height, horizontalSpacing: hSpacing, verticalSpacing: vol.vSpacing, zMin: vol.zMin, zMax: vol.zMax };
}
