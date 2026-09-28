/**
 * Picking a landmark on the volume itself — pure, no Cornerstone
 * (unit-testable).
 *
 * Landmarks for scan registration are cusp tips, and cusp tips are much easier
 * to hit on the rotatable 3D rendering than by scrubbing an axial slice until
 * the tip happens to lie in it. Clicking the 3D view gives a camera ray; this
 * walks that ray through the volume and returns the first point where the
 * density crosses into bone/enamel, refined to well under a voxel.
 *
 * What is *visible* is what should be pickable, so the walk honours the same
 * clipping planes the 3D view is rendering with — cut the volume down to the
 * lower jaw and a click can no longer land on the upper one.
 */

import { trilinear, type VolumeSamplingData } from './cprMath';
import type { ClipPlaneParam } from './cropBox';
import type { Vec3 } from './implantGeometry';

/**
 * Density that counts as "surface". Enamel and cortical bone are far above it,
 * soft tissue and the scanner's air far below, so the exact value barely
 * matters — but it must stay above the ~200–400 HU of cancellous bone or the
 * ray stops on the first trabecula inside the jaw.
 */
export const PICK_HU_THRESHOLD = 800;

export interface VolumePickOptions {
  /** Density that counts as the surface (default PICK_HU_THRESHOLD). */
  threshold?: number;
  /** Planes the volume is clipped by; samples they cut away are skipped. */
  clipPlanes?: ClipPlaneParam[];
  /** March step in mm (default: half the finest voxel). */
  stepMm?: number;
}

/** vtk convention: a clipping plane keeps (p − origin) · normal ≥ 0. */
function insidePlanes(p: Vec3, planes: ClipPlaneParam[] | undefined): boolean {
  if (!planes?.length) return true;
  for (const pl of planes) {
    const d = (p[0] - pl.origin[0]) * pl.normal[0]
      + (p[1] - pl.origin[1]) * pl.normal[1]
      + (p[2] - pl.origin[2]) * pl.normal[2];
    if (d < 0) return false;
  }
  return true;
}

/**
 * Ray/AABB slab test. Returns the [tEnter, tExit] range of the ray inside the
 * box, or null when it misses. `dir` need not be normalized, but t is in units
 * of `dir`, so callers that want millimetres should normalize it.
 */
export function rayBoxRange(origin: Vec3, dir: Vec3, bmin: Vec3, bmax: Vec3): [number, number] | null {
  let tEnter = -Infinity;
  let tExit = Infinity;
  for (let a = 0; a < 3; a++) {
    if (Math.abs(dir[a]) < 1e-12) {
      // Parallel to this slab: either inside it for all t, or never.
      if (origin[a] < bmin[a] || origin[a] > bmax[a]) return null;
      continue;
    }
    const inv = 1 / dir[a];
    let t0 = (bmin[a] - origin[a]) * inv;
    let t1 = (bmax[a] - origin[a]) * inv;
    if (t0 > t1) { const tmp = t0; t0 = t1; t1 = tmp; }
    if (t0 > tEnter) tEnter = t0;
    if (t1 < tExit) tExit = t1;
    if (tEnter > tExit) return null;
  }
  return tExit < 0 ? null : [Math.max(tEnter, 0), tExit];
}

/** World-space axis-aligned bounds of a sampled volume. */
export function volumeBounds(vol: VolumeSamplingData): [Vec3, Vec3] {
  const min: Vec3 = [vol.origin[0], vol.origin[1], vol.origin[2]];
  const max: Vec3 = [
    vol.origin[0] + (vol.dims[0] - 1) / vol.invSx,
    vol.origin[1] + (vol.dims[1] - 1) / vol.invSy,
    vol.origin[2] + (vol.dims[2] - 1) / vol.invSz,
  ];
  return [min, max];
}

const sampleAt = (vol: VolumeSamplingData, p: Vec3): number => trilinear(
  vol.getVoxel, vol.dims,
  (p[0] - vol.origin[0]) * vol.invSx,
  (p[1] - vol.origin[1]) * vol.invSy,
  (p[2] - vol.origin[2]) * vol.invSz,
);

/**
 * First point along the ray where the volume crosses `threshold`, or null if
 * the ray never enters dense tissue. The crossing is bracketed by the march and
 * then bisected, so the result is accurate to a small fraction of a voxel
 * rather than to the step size.
 */
export function pickVolumeSurface(
  vol: VolumeSamplingData,
  origin: Vec3,
  direction: Vec3,
  opts: VolumePickOptions = {},
): Vec3 | null {
  const len = Math.hypot(direction[0], direction[1], direction[2]);
  if (!Number.isFinite(len) || len < 1e-12) return null;
  const dir: Vec3 = [direction[0] / len, direction[1] / len, direction[2] / len];

  const [bmin, bmax] = volumeBounds(vol);
  const range = rayBoxRange(origin, dir, bmin, bmax);
  if (!range) return null;

  const threshold = opts.threshold ?? PICK_HU_THRESHOLD;
  const finestVoxel = Math.min(1 / vol.invSx, 1 / vol.invSy, 1 / vol.invSz);
  const step = opts.stepMm ?? Math.max(0.1, finestVoxel / 2);
  const at = (t: number): Vec3 => [origin[0] + dir[0] * t, origin[1] + dir[1] * t, origin[2] + dir[2] * t];

  const [tEnter, tExit] = range;
  let prevT = tEnter;
  let prevInside = insidePlanes(at(tEnter), opts.clipPlanes);
  if (prevInside && sampleAt(vol, at(tEnter)) >= threshold) return at(tEnter); // ray starts in bone

  for (let t = tEnter + step; t <= tExit; t += step) {
    const p = at(t);
    if (!insidePlanes(p, opts.clipPlanes)) { prevT = t; prevInside = false; continue; }
    const v = sampleAt(vol, p);
    if (v >= threshold) {
      // Only bisect when the previous sample was a genuine below-threshold
      // reading; stepping straight out of a clipped region has no bracket, so
      // the entry point is the best answer available.
      if (!prevInside) return p;
      let lo = prevT;
      let hi = t;
      for (let i = 0; i < 16; i++) {
        const mid = (lo + hi) / 2;
        if (sampleAt(vol, at(mid)) >= threshold) hi = mid; else lo = mid;
      }
      return at(hi);
    }
    prevT = t;
    prevInside = true;
  }
  return null;
}

