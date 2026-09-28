/**
 * Manual correction of a scan's registration — pure 4×4 algebra, no vtk.
 *
 * Automatic surface registration gets a scan close, but the operator is the one
 * who decides it is close enough, so the viewer offers nudges: small
 * translations along the patient axes and rotations about the scan's own
 * centre. Every nudge is applied *on top of* the current transform in world
 * space, which is what "move it a bit to the left" means on screen, and every
 * one of them is exactly invertible — nothing is baked in, so the user can step
 * back out of a correction as easily as into it.
 *
 * Matrices are 4×4 column-major, the ScanMesh.transform / vtk userMatrix order.
 */

import { mul4, applyMat4 } from './registration';
import type { Vec3 } from './implantGeometry';

/** Step sizes offered in the UI. */
export const NUDGE_MM = 0.25;
export const NUDGE_DEG = 1;

export type NudgeAxis = 'x' | 'y' | 'z';

const AXIS_INDEX: Record<NudgeAxis, 0 | 1 | 2> = { x: 0, y: 1, z: 2 };

/** Column-major translation matrix. */
export function translation4(t: Vec3): number[] {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, t[0], t[1], t[2], 1];
}

/** Column-major rotation of `deg` degrees about a world axis through the origin. */
export function rotation4(axis: NudgeAxis, deg: number): number[] {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r), s = Math.sin(r);
  switch (axis) {
    case 'x': return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1];
    case 'y': return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1];
    case 'z': return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  }
}

/** Translate a registered scan by `mm` along one world axis. */
export function nudgeScan(transform: number[], axis: NudgeAxis, mm: number): number[] {
  const t: Vec3 = [0, 0, 0];
  t[AXIS_INDEX[axis]] = mm;
  return mul4(translation4(t), transform);
}

/**
 * Rotate a registered scan about a world pivot — the scan's own centre, so the
 * mesh turns in place instead of swinging around the volume origin.
 */
export function rotateScan(transform: number[], axis: NudgeAxis, deg: number, pivot: Vec3): number[] {
  const toPivot = translation4([pivot[0], pivot[1], pivot[2]]);
  const back = translation4([-pivot[0], -pivot[1], -pivot[2]]);
  return mul4(mul4(toPivot, mul4(rotation4(axis, deg), back)), transform);
}

/**
 * World-space centre of a scan: its local bounding-box centre carried through
 * the current transform. `bounds` is vtk's [xmin,xmax,ymin,ymax,zmin,zmax].
 */
export function scanCenterWorld(transform: number[], bounds: number[] | null | undefined): Vec3 {
  if (!bounds || bounds.length < 6) return applyMat4(transform, [0, 0, 0]);
  return applyMat4(transform, [
    (bounds[0] + bounds[1]) / 2,
    (bounds[2] + bounds[3]) / 2,
    (bounds[4] + bounds[5]) / 2,
  ]);
}

