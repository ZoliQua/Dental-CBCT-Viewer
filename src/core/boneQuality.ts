/**
 * Bone quality at the implant site — Misch D1–D5 classification from the mean
 * gray value sampled along the implant body. Pure (uses the cprMath
 * trilinear sampler over a VolumeSamplingData) → unit-testable.
 *
 * IMPORTANT: CBCT gray values are NOT calibrated Hounsfield units. They vary
 * with the device, exposure settings and scatter, so the sampled values and
 * the Misch mapping below are INDICATIVE ONLY (relative density class), not a
 * measurement of true bone density. The UI displays them as "GV" (gray value),
 * never as HU.
 *
 * Misch reference ranges (applied to the uncalibrated gray values):
 *   D1 > 1250 · D2 850–1250 · D3 350–850 · D4 150–350 · D5 < 150
 */

import { trilinear, type VolumeSamplingData } from './cprMath';
import { cross3, type Vec3 } from './implantGeometry';

export type BoneClass = 'D1' | 'D2' | 'D3' | 'D4' | 'D5';

export function classifyBone(hu: number): BoneClass {
  if (hu > 1250) return 'D1';
  if (hu >= 850) return 'D2';
  if (hu >= 350) return 'D3';
  if (hu >= 150) return 'D4';
  return 'D5';
}

export interface BoneSample {
  meanHU: number;
  bone: BoneClass;
  /** Number of in-volume samples averaged */
  samples: number;
}

function normalize(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

/** Sample one world point; returns null when outside the volume. */
function sampleWorld(vol: VolumeSamplingData, x: number, y: number, z: number): number | null {
  const ci = (x - vol.origin[0]) * vol.invSx;
  const cj = (y - vol.origin[1]) * vol.invSy;
  const ck = (z - vol.origin[2]) * vol.invSz;
  if (ci < 0 || cj < 0 || ck < 0 || ci >= vol.dims[0] - 1 || cj >= vol.dims[1] - 1 || ck >= vol.dims[2] - 1) {
    return null;
  }
  return trilinear(vol.getVoxel, vol.dims, ci, cj, ck);
}

/**
 * Mean HU along the implant body — centerline plus a ring of radial samples at
 * 60% radius, over the full entry→apex length. Out-of-volume samples are
 * skipped. Returns null if nothing could be sampled.
 */
export function sampleImplantBoneHU(
  vol: VolumeSamplingData,
  entry: Vec3,
  apex: Vec3,
  radius: number,
  axialSteps = 12,
  radialSteps = 4,
): BoneSample | null {
  const dir: Vec3 = [apex[0] - entry[0], apex[1] - entry[1], apex[2] - entry[2]];
  const len = Math.hypot(dir[0], dir[1], dir[2]);
  if (len < 1e-6) return null;
  const u: Vec3 = [dir[0] / len, dir[1] / len, dir[2] / len];
  const ref: Vec3 = Math.abs(u[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const p1 = normalize(cross3(u, ref));
  const p2 = cross3(u, p1);
  const rr = radius * 0.6;

  let sum = 0;
  let n = 0;
  for (let a = 0; a <= axialSteps; a++) {
    const t = a / axialSteps;
    const cx = entry[0] + dir[0] * t;
    const cy = entry[1] + dir[1] * t;
    const cz = entry[2] + dir[2] * t;

    const c = sampleWorld(vol, cx, cy, cz);
    if (c !== null) { sum += c; n++; }

    for (let r = 0; r < radialSteps; r++) {
      const ang = (2 * Math.PI * r) / radialSteps;
      const ca = Math.cos(ang) * rr;
      const sa = Math.sin(ang) * rr;
      const px = cx + p1[0] * ca + p2[0] * sa;
      const py = cy + p1[1] * ca + p2[1] * sa;
      const pz = cz + p1[2] * ca + p2[2] * sa;
      const v = sampleWorld(vol, px, py, pz);
      if (v !== null) { sum += v; n++; }
    }
  }

  if (n === 0) return null;
  const meanHU = sum / n;
  return { meanHU, bone: classifyBone(meanHU), samples: n };
}
