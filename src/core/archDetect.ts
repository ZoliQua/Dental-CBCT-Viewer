/**
 * Automatic dental arch-curve detection (heuristic, no ML).
 *
 * Given an axially-acquired CT/CBCT volume it estimates the 9 Catmull-Rom
 * control points of the dental arch, so the user no longer has to place them by
 * hand. The result is a starting suggestion — fully editable afterwards.
 *
 * Pure math only (no Cornerstone import) so it is unit-testable: the caller
 * passes a `VolumeSamplingData` (the same accessor `cprEngine.getVolumeData`
 * already produces). Control points are returned in **world XY (mm, LPS)**, in
 * the same order as `generateDefaultArchCurve` (patient right → front → left),
 * so they drop straight into `SET_ARCH_CURVE`.
 *
 * Method:
 *   1. Max-intensity project a thin axial slab around the focal Z → a 2-D
 *      bone-ness map M(i,j).
 *   2. Take the weighted centroid of the thresholded bone as the arch centre.
 *   3. Sweep rays from the centre across the anterior arc; per ray, march
 *      outward and keep the radius of peak bone (the alveolar/teeth band).
 *   4. Smooth the traced band and arc-length-resample it to 9 control points.
 *
 * The arch opens posteriorly (+Y in LPS): ray angle φ=0 points anteriorly (−Y),
 * φ>0 toward +X (patient left), φ<0 toward −X (patient right).
 */

import { resampleByArcLength } from './archCurve';
import type { Point2, VolumeSamplingData } from './cprMath';

export interface ArchDetectOptions {
  /** World Z of the slab centre (e.g. the axial focal point). Default: mid-Z. */
  focalWorldZ?: number;
  /** Half-thickness of the projected slab, in mm. Default 6. */
  slabHalfMm?: number;
  /** Bone threshold in stored HU. Default 400 (alveolar cortical / teeth). */
  boneThreshold?: number;
  /** Number of control points to emit. Default 9. */
  numControlPoints?: number;
  /** Angular half-span of the swept arc from anterior, in degrees. Default 115. */
  angularSpanDeg?: number;
}

/**
 * Estimate arch control points from a volume. Returns null when the slab holds
 * too little bone to trace a plausible arch (caller should keep the manual/
 * default curve in that case).
 */
export function detectArchControlPoints(
  vol: VolumeSamplingData,
  opts: ArchDetectOptions = {},
): Point2[] | null {
  const {
    slabHalfMm = 6,
    boneThreshold = 400,
    numControlPoints = 9,
    angularSpanDeg = 115,
  } = opts;

  const [nx, ny, nz] = vol.dims;
  const [ox, oy, oz] = vol.origin;
  const sx = 1 / vol.invSx;
  const sy = 1 / vol.invSy;
  const sz = 1 / vol.invSz;
  if (nx < 4 || ny < 4 || nz < 1) return null;

  // Slab index range around the focal Z.
  const focalZ = opts.focalWorldZ ?? (vol.zMin + vol.zMax) / 2;
  const kCenter = Math.round((focalZ - oz) / sz);
  const kHalf = Math.max(0, Math.round(slabHalfMm / Math.abs(sz)));
  const kLo = Math.max(0, kCenter - kHalf);
  const kHi = Math.min(nz - 1, kCenter + kHalf);
  if (kLo > kHi) return null;

  // 1. Max-intensity projection over the slab → M(i,j).
  const M = new Float32Array(nx * ny);
  for (let k = kLo; k <= kHi; k++) {
    for (let j = 0; j < ny; j++) {
      const row = j * nx;
      for (let i = 0; i < nx; i++) {
        const v = vol.getVoxel(i, j, k);
        if (v > M[row + i]) M[row + i] = v;
      }
    }
  }

  // 2. Bone centroid (index space, weighted by 1 over the mask).
  let sumI = 0, sumJ = 0, count = 0;
  for (let j = 0; j < ny; j++) {
    const row = j * nx;
    for (let i = 0; i < nx; i++) {
      if (M[row + i] > boneThreshold) { sumI += i; sumJ += j; count++; }
    }
  }
  // Need a meaningful amount of bone to trust the centroid / trace.
  if (count < Math.max(50, (nx * ny) * 0.002)) return null;
  const ci = sumI / count;
  const cj = sumJ / count;
  const cxw = ox + ci * sx;
  const cyw = oy + cj * sy;

  // Bilinear sample of M at an index-space coordinate (0 outside bounds).
  const sampleM = (fi: number, fj: number): number => {
    if (fi < 0 || fj < 0 || fi > nx - 1 || fj > ny - 1) return 0;
    const i0 = Math.floor(fi), j0 = Math.floor(fj);
    const i1 = Math.min(nx - 1, i0 + 1), j1 = Math.min(ny - 1, j0 + 1);
    const ti = fi - i0, tj = fj - j0;
    const a = M[j0 * nx + i0], b = M[j0 * nx + i1];
    const c = M[j1 * nx + i0], d = M[j1 * nx + i1];
    return (a * (1 - ti) + b * ti) * (1 - tj) + (c * (1 - ti) + d * ti) * tj;
  };

  // 3. Radial trace across the anterior arc.
  const spanRad = (angularSpanDeg * Math.PI) / 180;
  const stepRad = (1.5 * Math.PI) / 180;
  const rMin = 4;                                        // mm
  const rMax = 0.48 * Math.min(nx * sx, ny * sy);        // mm
  const rStep = Math.max(0.5, Math.min(sx, sy));         // mm
  const band: Point2[] = [];
  for (let phi = -spanRad; phi <= spanRad + 1e-6; phi += stepRad) {
    const dx = Math.sin(phi);
    const dy = -Math.cos(phi);
    let bestR = -1, bestV = boneThreshold;
    for (let r = rMin; r <= rMax; r += rStep) {
      const wx = cxw + r * dx;
      const wy = cyw + r * dy;
      const v = sampleM((wx - ox) / sx, (wy - oy) / sy);
      if (v > bestV) { bestV = v; bestR = r; }
    }
    if (bestR > 0) band.push([cxw + bestR * dx, cyw + bestR * dy]);
  }
  if (band.length < 5) return null;

  // 4. Smooth (moving average) then arc-length resample to N control points.
  const smoothed = smoothPolyline(band, 2);
  const cps = resampleByArcLength(smoothed, numControlPoints);
  return cps.length === numControlPoints ? cps : null;
}

/** Simple symmetric moving-average smoothing of a polyline (radius in samples). */
function smoothPolyline(pts: Point2[], radius: number): Point2[] {
  const n = pts.length;
  if (radius < 1 || n < 3) return pts;
  const out: Point2[] = [];
  for (let i = 0; i < n; i++) {
    let sx = 0, sy = 0, c = 0;
    for (let k = -radius; k <= radius; k++) {
      const idx = i + k;
      if (idx < 0 || idx >= n) continue;
      sx += pts[idx][0]; sy += pts[idx][1]; c++;
    }
    out.push([sx / c, sy / c]);
  }
  return out;
}
