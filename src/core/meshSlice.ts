/**
 * Mesh ∩ plane contour — pure, no vtk/Cornerstone (unit-testable). Slices a
 * world-space triangle soup with an (infinite) plane and returns the cut as a
 * set of world-space line segments (one per crossing triangle). Views then
 * project those endpoints into their own 2D pixel space.
 *
 * Two paths share the same per-triangle intersection:
 *  - `slicePlaneSegments`  — brute force over every triangle (small meshes / ref)
 *  - `buildTriangleBVH` + `slicePlaneBVH` — an AABB tree that prunes whole
 *    subtrees lying entirely on one side of the plane, so a plane scrub over a
 *    large registered scan touches only the ~O(crossings) triangles near the cut.
 */

import type { Vec3 } from './implantGeometry';

/** Intersect one triangle (at float offset `o` in `tris`) with the plane. */
function sliceTriangleAt(
  tris: Float32Array | number[],
  o: number,
  px: number, py: number, pz: number,
  nx: number, ny: number, nz: number,
): [Vec3, Vec3] | null {
  const ax = tris[o], ay = tris[o + 1], az = tris[o + 2];
  const bx = tris[o + 3], by = tris[o + 4], bz = tris[o + 5];
  const cx = tris[o + 6], cy = tris[o + 7], cz = tris[o + 8];
  const d0 = (ax - px) * nx + (ay - py) * ny + (az - pz) * nz;
  const d1 = (bx - px) * nx + (by - py) * ny + (bz - pz) * nz;
  const d2 = (cx - px) * nx + (cy - py) * ny + (cz - pz) * nz;

  const pts: Vec3[] = [];
  const edge = (
    x0: number, y0: number, z0: number, da: number,
    x1: number, y1: number, z1: number, db: number,
  ) => {
    if ((da < 0 && db >= 0) || (da >= 0 && db < 0)) {
      const t = da / (da - db);
      pts.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, z0 + (z1 - z0) * t]);
    }
  };
  edge(ax, ay, az, d0, bx, by, bz, d1);
  edge(bx, by, bz, d1, cx, cy, cz, d2);
  edge(cx, cy, cz, d2, ax, ay, az, d0);

  return pts.length === 2 ? [pts[0], pts[1]] : null;
}

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
  for (let i = 0; i + 8 < tris.length; i += 9) {
    const seg = sliceTriangleAt(tris, i, px, py, pz, nx, ny, nz);
    if (seg) segs.push(seg);
  }
  return segs;
}

// ── Bounding-volume hierarchy (AABB tree) ──────────────────────

interface BVHNode {
  cx: number; cy: number; cz: number; // AABB centre
  hx: number; hy: number; hz: number; // AABB half-extent
  left: BVHNode | null;
  right: BVHNode | null;
  tris: Int32Array | null;            // leaf: triangle indices (× 9 = float offset)
}

export interface TriangleBVH {
  root: BVHNode | null;
  count: number;
}

const LEAF_SIZE = 4;

/** Build an AABB tree over a triangle soup (median centroid split). */
export function buildTriangleBVH(tris: Float32Array | number[]): TriangleBVH {
  const n = Math.floor(tris.length / 9);
  if (n === 0) return { root: null, count: 0 };

  const bmin = new Float64Array(n * 3);
  const bmax = new Float64Array(n * 3);
  const cen = new Float64Array(n * 3);
  for (let t = 0; t < n; t++) {
    const o = t * 9;
    let mnx = tris[o], mny = tris[o + 1], mnz = tris[o + 2];
    let mxx = mnx, mxy = mny, mxz = mnz;
    for (let k = 1; k < 3; k++) {
      const p = o + k * 3;
      const x = tris[p], y = tris[p + 1], z = tris[p + 2];
      if (x < mnx) mnx = x; if (y < mny) mny = y; if (z < mnz) mnz = z;
      if (x > mxx) mxx = x; if (y > mxy) mxy = y; if (z > mxz) mxz = z;
    }
    bmin[t * 3] = mnx; bmin[t * 3 + 1] = mny; bmin[t * 3 + 2] = mnz;
    bmax[t * 3] = mxx; bmax[t * 3 + 1] = mxy; bmax[t * 3 + 2] = mxz;
    cen[t * 3] = (mnx + mxx) / 2; cen[t * 3 + 1] = (mny + mxy) / 2; cen[t * 3 + 2] = (mnz + mxz) / 2;
  }

  const idx = new Int32Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;

  const build = (lo: number, hi: number): BVHNode => {
    let mnx = Infinity, mny = Infinity, mnz = Infinity;
    let mxx = -Infinity, mxy = -Infinity, mxz = -Infinity;
    for (let i = lo; i < hi; i++) {
      const t = idx[i];
      if (bmin[t * 3] < mnx) mnx = bmin[t * 3];
      if (bmin[t * 3 + 1] < mny) mny = bmin[t * 3 + 1];
      if (bmin[t * 3 + 2] < mnz) mnz = bmin[t * 3 + 2];
      if (bmax[t * 3] > mxx) mxx = bmax[t * 3];
      if (bmax[t * 3 + 1] > mxy) mxy = bmax[t * 3 + 1];
      if (bmax[t * 3 + 2] > mxz) mxz = bmax[t * 3 + 2];
    }
    const node: BVHNode = {
      cx: (mnx + mxx) / 2, cy: (mny + mxy) / 2, cz: (mnz + mxz) / 2,
      hx: (mxx - mnx) / 2, hy: (mxy - mny) / 2, hz: (mxz - mnz) / 2,
      left: null, right: null, tris: null,
    };
    const cnt = hi - lo;
    if (cnt <= LEAF_SIZE) { node.tris = idx.slice(lo, hi); return node; }

    // Split on the axis with the widest spread of centroids.
    let cmnx = Infinity, cmny = Infinity, cmnz = Infinity;
    let cmxx = -Infinity, cmxy = -Infinity, cmxz = -Infinity;
    for (let i = lo; i < hi; i++) {
      const t = idx[i];
      const x = cen[t * 3], y = cen[t * 3 + 1], z = cen[t * 3 + 2];
      if (x < cmnx) cmnx = x; if (y < cmny) cmny = y; if (z < cmnz) cmnz = z;
      if (x > cmxx) cmxx = x; if (y > cmxy) cmxy = y; if (z > cmxz) cmxz = z;
    }
    const dx = cmxx - cmnx, dy = cmxy - cmny, dz = cmxz - cmnz;
    const axis = dx >= dy && dx >= dz ? 0 : dy >= dz ? 1 : 2;
    const mid = (axis === 0 ? cmnx + cmxx : axis === 1 ? cmny + cmxy : cmnz + cmxz) / 2;

    // In-place partition of idx[lo,hi) by centroid[axis] < mid.
    let i = lo, j = hi - 1;
    while (i <= j) {
      if (cen[idx[i] * 3 + axis] < mid) {
        i++;
      } else {
        const tmp = idx[i]; idx[i] = idx[j]; idx[j] = tmp; j--;
      }
    }
    let split = i;
    if (split === lo || split === hi) split = lo + (cnt >> 1); // degenerate → median count
    node.left = build(lo, split);
    node.right = build(split, hi);
    return node;
  };

  return { root: build(0, n), count: n };
}

/**
 * Slice a triangle soup using its BVH — identical result to
 * `slicePlaneSegments`, but prunes subtrees whose AABB is entirely on one side
 * of the plane (classic AABB-plane test: |centre·n − d| > extent·|n|).
 */
export function slicePlaneBVH(
  tris: Float32Array | number[],
  bvh: TriangleBVH,
  planePoint: Vec3,
  planeNormal: Vec3,
): [Vec3, Vec3][] {
  const segs: [Vec3, Vec3][] = [];
  if (!bvh.root) return segs;
  const [nx, ny, nz] = planeNormal;
  const [px, py, pz] = planePoint;
  const anx = Math.abs(nx), any = Math.abs(ny), anz = Math.abs(nz);

  const stack: BVHNode[] = [bvh.root];
  while (stack.length) {
    const nd = stack.pop()!;
    const s = (nd.cx - px) * nx + (nd.cy - py) * ny + (nd.cz - pz) * nz;
    const r = nd.hx * anx + nd.hy * any + nd.hz * anz;
    if (Math.abs(s) > r) continue; // whole box on one side → prune
    if (nd.tris) {
      for (let k = 0; k < nd.tris.length; k++) {
        const seg = sliceTriangleAt(tris, nd.tris[k] * 9, px, py, pz, nx, ny, nz);
        if (seg) segs.push(seg);
      }
    } else {
      if (nd.left) stack.push(nd.left);
      if (nd.right) stack.push(nd.right);
    }
  }
  return segs;
}
