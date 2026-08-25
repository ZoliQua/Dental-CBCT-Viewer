/**
 * Mesh ∩ plane contour — pure, no vtk/Cornerstone (unit-testable). Slices a
 * world-space triangle soup with an (infinite) plane and returns the cut as a
 * set of world-space line segments (one per crossing triangle). Views then
 * project those endpoints into their own 2D pixel space.
 */

import type { Vec3 } from './implantGeometry';

/**
 * Segments where the plane (point + unit normal) cuts the triangle soup
 * [ax,ay,az, bx,by,bz, cx,cy,cz, …]. Each crossing triangle yields one segment.
 */
export function slicePlaneSegments(
  tris: Float32Array | number[],
  planePoint: Vec3,
  planeNormal: Vec3,
): [Vec3, Vec3][] {
  const [nx, ny, nz] = planeNormal;
  const [px, py, pz] = planePoint;
  const segs: [Vec3, Vec3][] = [];

  const dist = (x: number, y: number, z: number) => (x - px) * nx + (y - py) * ny + (z - pz) * nz;

  for (let i = 0; i + 8 < tris.length; i += 9) {
    const v0: Vec3 = [tris[i], tris[i + 1], tris[i + 2]];
    const v1: Vec3 = [tris[i + 3], tris[i + 4], tris[i + 5]];
    const v2: Vec3 = [tris[i + 6], tris[i + 7], tris[i + 8]];
    const d0 = dist(v0[0], v0[1], v0[2]);
    const d1 = dist(v1[0], v1[1], v1[2]);
    const d2 = dist(v2[0], v2[1], v2[2]);

    const pts: Vec3[] = [];
    const edge = (a: Vec3, da: number, b: Vec3, db: number) => {
      if ((da < 0 && db >= 0) || (da >= 0 && db < 0)) {
        const t = da / (da - db);
        pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
      }
    };
    edge(v0, d0, v1, d1);
    edge(v1, d1, v2, d2);
    edge(v2, d2, v0, d0);

    if (pts.length === 2) segs.push([pts[0], pts[1]]);
  }

  return segs;
}
