/**
 * Prosthetically-driven ("backward") planning helpers — pure, unit-testable.
 *
 * A tooth-setup / wax-up mesh (a planned crown) defines where the tooth should
 * be; its long axis is the ideal screw axis. These helpers derive a suggested
 * implant from that mesh:
 *
 *   1. `principalAxis`      — PCA long axis + centroid + extent of a point set
 *   2. `anglesFromWorldAxis`— inverse of `implantAxis`: a world axis → the
 *                             implant's (buccolingual, mesiodistal) angles at an
 *                             arch frame (round-trips with `implantAxis`)
 *   3. `suggestImplantFromMesh` — combines them into a placement suggestion
 *
 * The result is a starting point the clinician adjusts — not a final plan.
 */

import { jacobiEigenSymmetric } from './registration';
import { nearestArchFrame, type ArchFrame } from './implantGeometry';
import type { Vec3 } from './implantGeometry';
import { trilinear, type Point2, type VolumeSamplingData } from './cprMath';

export interface PrincipalAxis {
  /** Mean of the input points. */
  centroid: Vec3;
  /** Unit eigenvector of the largest spread (the mesh's long axis; sign arbitrary). */
  axis: Vec3;
  /** Extent (max − min projection) along that axis, mm. */
  extent: number;
}

/** PCA long axis of a flat [x,y,z, …] point set (≥ 3 points). */
export function principalAxis(positions: ArrayLike<number>): PrincipalAxis | null {
  const n = Math.floor(positions.length / 3);
  if (n < 3) return null;

  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < n; i++) { cx += positions[3 * i]; cy += positions[3 * i + 1]; cz += positions[3 * i + 2]; }
  cx /= n; cy /= n; cz /= n;

  // Symmetric 3×3 covariance.
  let xx = 0, yy = 0, zz = 0, xy = 0, xz = 0, yz = 0;
  for (let i = 0; i < n; i++) {
    const dx = positions[3 * i] - cx, dy = positions[3 * i + 1] - cy, dz = positions[3 * i + 2] - cz;
    xx += dx * dx; yy += dy * dy; zz += dz * dz;
    xy += dx * dy; xz += dx * dz; yz += dy * dz;
  }
  const cov = [
    [xx / n, xy / n, xz / n],
    [xy / n, yy / n, yz / n],
    [xz / n, yz / n, zz / n],
  ];
  const { values, vectors } = jacobiEigenSymmetric(cov, 3);
  let best = 0;
  for (let i = 1; i < 3; i++) if (values[i] > values[best]) best = i;
  let ax = vectors[0][best], ay = vectors[1][best], az = vectors[2][best];
  const len = Math.hypot(ax, ay, az) || 1;
  ax /= len; ay /= len; az /= len;

  // Extent along the axis (max − min projection).
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < n; i++) {
    const p = (positions[3 * i] - cx) * ax + (positions[3 * i + 1] - cy) * ay + (positions[3 * i + 2] - cz) * az;
    if (p < min) min = p; if (p > max) max = p;
  }
  return { centroid: [cx, cy, cz], axis: [ax, ay, az], extent: max - min };
}

/**
 * Inverse of `implantAxis`: given a (unit) world apex axis and an arch frame,
 * recover the implant's buccolingual + mesiodistal angles. The sign of cos(BL)
 * is chosen so the mesiodistal lean stays small (|MD| ≤ 90°) and BL carries the
 * jaw (apex down → |BL| small, apex up → |BL| near 180°).
 */
export function anglesFromWorldAxis(frame: ArchFrame, axis: Vec3): { angleBLDeg: number; angleMDDeg: number } {
  const n = axis[0] * frame.normal[0] + axis[1] * frame.normal[1];  // sin(BL)
  const t = axis[0] * frame.tangent[0] + axis[1] * frame.tangent[1]; // cos(BL)·sin(MD)
  const z = axis[2];                                                 // −cos(BL)·cos(MD)
  let C = Math.sqrt(Math.max(0, 1 - n * n)); // |cos(BL)|
  if (z > 0) C = -C;                          // apex up → cos(BL) < 0
  const bl = Math.atan2(n, C);
  const sinMD = C !== 0 ? t / C : 0;
  const cosMD = C !== 0 ? -z / C : 1;
  const md = Math.atan2(sinMD, cosMD);
  return { angleBLDeg: (bl * 180) / Math.PI, angleMDDeg: (md * 180) / Math.PI };
}

export interface CrownSuggestion {
  position: Vec3;
  angleBLDeg: number;
  angleMDDeg: number;
}

/**
 * Pick the apical direction (±axis) as the one with denser bone just beyond the
 * crown — the apex points into the jaw. `huAt` samples volume intensity at a
 * world point; returns the oriented axis. Auto-detects upper vs lower jaw.
 */
export function orientAxisByBone(
  centroid: Vec3,
  axis: Vec3,
  extent: number,
  huAt: (p: Vec3) => number,
): Vec3 {
  let sumPos = 0, sumNeg = 0;
  const base = extent / 2;
  for (let d = 2; d <= 8; d += 2) {
    const r = base + d;
    sumPos += huAt([centroid[0] + axis[0] * r, centroid[1] + axis[1] * r, centroid[2] + axis[2] * r]);
    sumNeg += huAt([centroid[0] - axis[0] * r, centroid[1] - axis[1] * r, centroid[2] - axis[2] * r]);
  }
  return sumPos >= sumNeg ? axis : [-axis[0], -axis[1], -axis[2]];
}

/**
 * Suggest an implant placement from a tooth-setup mesh: its PCA long axis is
 * the screw axis, oriented apically, and the platform is placed at the mesh's
 * apical (bone-facing) end. If `vol` is given the apical direction is detected
 * from bone density (auto jaw); otherwise it defaults to apex down (pass
 * `apexUp` for the maxilla).
 */
export function suggestImplantFromMesh(
  controlPoints: Point2[],
  positions: ArrayLike<number>,
  opts: { apexUp?: boolean; vol?: VolumeSamplingData } = {},
): CrownSuggestion | null {
  const pa = principalAxis(positions);
  if (!pa) return null;
  let axis: Vec3 = pa.axis;
  if (opts.vol) {
    const v = opts.vol;
    const huAt = (p: Vec3) => trilinear(
      v.getVoxel, v.dims,
      (p[0] - v.origin[0]) * v.invSx, (p[1] - v.origin[1]) * v.invSy, (p[2] - v.origin[2]) * v.invSz,
    );
    axis = orientAxisByBone(pa.centroid, axis, pa.extent, huAt);
  } else {
    // No volume → apex down (−Z) by default, up (+Z) for the maxilla.
    const wantDown = !opts.apexUp;
    if ((wantDown && axis[2] > 0) || (!wantDown && axis[2] < 0)) axis = [-axis[0], -axis[1], -axis[2]];
  }
  const [ax, ay, az] = axis;

  // Platform at the apical end of the crown (centroid + half the long extent).
  const half = pa.extent / 2;
  const position: Vec3 = [
    pa.centroid[0] + ax * half,
    pa.centroid[1] + ay * half,
    pa.centroid[2] + az * half,
  ];

  const frame = nearestArchFrame(controlPoints, [position[0], position[1]]);
  if (!frame) return null;
  const { angleBLDeg, angleMDDeg } = anglesFromWorldAxis(frame, axis);
  return { position, angleBLDeg, angleMDDeg };
}
