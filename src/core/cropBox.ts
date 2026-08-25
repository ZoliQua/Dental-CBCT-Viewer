/**
 * Crop box → clipping planes — pure, no vtk (unit-testable). Turns a normalized
 * axis-aligned crop box (0–1 of the volume bounds) into up to 6 world-space
 * clipping planes. vtk convention: a plane keeps the half-space where
 * (point − origin) · normal ≥ 0, and clips away the rest.
 */

import type { Vec3 } from './implantGeometry';

export interface CropBox {
  /** Lower corner, normalized 0–1 of the volume bounds per axis */
  min: [number, number, number];
  /** Upper corner, normalized 0–1 */
  max: [number, number, number];
}

export const NO_CROP: CropBox = { min: [0, 0, 0], max: [1, 1, 1] };

export interface ClipPlaneParam { origin: Vec3; normal: Vec3 }

const AXES: Vec3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

/**
 * Clipping planes for the crop box within world bounds [bmin, bmax]. Only the
 * sides that actually cut (crop.min > 0 or crop.max < 1) produce a plane.
 */
export function clipPlanes(bmin: Vec3, bmax: Vec3, crop: CropBox): ClipPlaneParam[] {
  const planes: ClipPlaneParam[] = [];
  for (let a = 0; a < 3; a++) {
    const span = bmax[a] - bmin[a];
    const pos = AXES[a];
    const neg: Vec3 = [-pos[0], -pos[1], -pos[2]];
    if (crop.min[a] > 0.001) {
      const o: Vec3 = [bmin[0], bmin[1], bmin[2]];
      o[a] = bmin[a] + crop.min[a] * span;
      planes.push({ origin: o, normal: pos }); // keep coord ≥ lo
    }
    if (crop.max[a] < 0.999) {
      const o: Vec3 = [bmin[0], bmin[1], bmin[2]];
      o[a] = bmin[a] + crop.max[a] * span;
      planes.push({ origin: o, normal: neg }); // keep coord ≤ hi
    }
  }
  return planes;
}
