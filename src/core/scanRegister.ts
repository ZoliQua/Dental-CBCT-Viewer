/**
 * Fine registration of a surface scan to the CBCT — pure, no Cornerstone/vtk
 * (unit-testable).
 *
 * Three picked landmarks get a scan to within a millimetre or so, which is as
 * accurate as clicking cusp tips by hand can be. This takes over from there:
 * it pulls the dense-tissue surface out of the volume around where the scan
 * currently sits and runs ICP onto it, seeded by the landmark result.
 *
 * The objective is trimmed, because most of an arch scan is gingiva that the
 * CBCT never imaged. Those points have no counterpart in the target and, given
 * a vote, drag the fit off the teeth — the difference between plateauing around
 * a millimetre and reaching the voxel size.
 */

import { icpAlign } from './registration';
import { volumeSurfacePoints, PICK_HU_THRESHOLD } from './volumePick';
import type { VolumeSamplingData } from './cprMath';
import type { Vec3 } from './implantGeometry';

export interface RefineOptions {
  /** Density that counts as surface (default PICK_HU_THRESHOLD). */
  threshold?: number;
  /** Fraction of correspondences that define the fit (default 0.4). */
  keep?: number;
  /** Margin in mm around the scan's current position to search (default 4). */
  marginMm?: number;
  /** Lattice spacing of the extracted CBCT surface, mm (default 0.6). */
  surfaceSpacingMm?: number;
  maxIterations?: number;
}

export interface RefineResult {
  /** The refined scan transform (4×4 column-major), ready for UPDATE_SCAN. */
  transform: number[];
  /** Trimmed RMS of the scan surface to the CBCT surface, mm. */
  rmsMm: number;
  /** Trimmed RMS before refining — for reporting how much it moved. */
  beforeRmsMm: number;
  /** How many CBCT surface points the fit ran against. */
  targetPoints: number;
}

/** World-space AABB of `points` under `transform`, grown by `margin`. */
function transformedBounds(points: Vec3[], transform: number[], margin: number): [Vec3, Vec3] {
  const lo: Vec3 = [Infinity, Infinity, Infinity];
  const hi: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const p of points) {
    const x = transform[0] * p[0] + transform[4] * p[1] + transform[8] * p[2] + transform[12];
    const y = transform[1] * p[0] + transform[5] * p[1] + transform[9] * p[2] + transform[13];
    const z = transform[2] * p[0] + transform[6] * p[1] + transform[10] * p[2] + transform[14];
    if (x < lo[0]) lo[0] = x; if (x > hi[0]) hi[0] = x;
    if (y < lo[1]) lo[1] = y; if (y > hi[1]) hi[1] = y;
    if (z < lo[2]) lo[2] = z; if (z > hi[2]) hi[2] = z;
  }
  return [
    [lo[0] - margin, lo[1] - margin, lo[2] - margin],
    [hi[0] + margin, hi[1] + margin, hi[2] + margin],
  ];
}

/**
 * Refine a scan's placement onto the CBCT's dense-tissue surface.
 *
 * `scanPoints` are the mesh's own (untransformed) vertices, subsampled by the
 * caller; `transform` is where the scan sits now and seeds the fit. Returns
 * null when there is nothing to fit against — too few points, or no bone in
 * the searched box, which is what a wildly misplaced scan looks like.
 */
export function refineScanToVolume(
  vol: VolumeSamplingData,
  scanPoints: Vec3[],
  transform: number[],
  opts: RefineOptions = {},
): RefineResult | null {
  if (scanPoints.length < 32 || transform.length !== 16) return null;

  const [lo, hi] = transformedBounds(scanPoints, transform, opts.marginMm ?? 4);
  const target = volumeSurfacePoints(vol, lo, hi, {
    threshold: opts.threshold ?? PICK_HU_THRESHOLD,
    spacingMm: opts.surfaceSpacingMm ?? 0.6,
  });
  if (target.length < 200) return null; // no bone where the scan is sitting

  const keep = opts.keep ?? 0.4;
  const before = icpAlign(scanPoints, target, { initial: transform, keep, maxIterations: 0 });
  const result = icpAlign(scanPoints, target, {
    initial: transform,
    keep,
    maxIterations: opts.maxIterations ?? 30,
  });
  if (!result) return null;

  return {
    transform: result.transform,
    rmsMm: result.rmsMm,
    beforeRmsMm: before?.rmsMm ?? result.rmsMm,
    targetPoints: target.length,
  };
}
