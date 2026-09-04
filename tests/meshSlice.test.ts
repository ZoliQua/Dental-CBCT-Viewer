/**
 * Mesh ∩ plane: crossing triangles yield the expected edge-intersection
 * segment; non-crossing triangles yield nothing.
 */

import { describe, it, expect } from 'vitest';
import { slicePlaneSegments, buildTriangleBVH, slicePlaneBVH } from '../src/core/meshSlice';
import type { Vec3 } from '../src/core/implantGeometry';

const origin: Vec3 = [0, 0, 0];
const zUp: Vec3 = [0, 0, 1];

describe('slicePlaneSegments', () => {
  it('cuts a triangle crossing z=0 into one segment at the edge intersections', () => {
    // v0 below (z=-1), v1 & v2 above (z=1)
    const tri = [0, 0, -1, 2, 0, 1, 0, 2, 1];
    const segs = slicePlaneSegments(tri, origin, zUp);
    expect(segs).toHaveLength(1);
    const [a, b] = segs[0];
    const zs = [a[2], b[2]];
    expect(zs[0]).toBeCloseTo(0, 6);
    expect(zs[1]).toBeCloseTo(0, 6);
    // Intersections are the midpoints of edges (0,1) and (0,2): (1,0,0) and (0,1,0)
    const set = [a, b].map(p => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).sort();
    expect(set).toEqual(['0.00,1.00', '1.00,0.00']);
  });

  it('ignores a triangle entirely on one side', () => {
    const tri = [0, 0, 1, 2, 0, 2, 0, 2, 3]; // all z>0
    expect(slicePlaneSegments(tri, origin, zUp)).toHaveLength(0);
  });

  it('handles a two-triangle soup', () => {
    const soup = [
      0, 0, -1, 2, 0, 1, 0, 2, 1, // crosses
      0, 0, 5, 2, 0, 6, 0, 2, 7,  // above
    ];
    expect(slicePlaneSegments(soup, origin, zUp)).toHaveLength(1);
  });
});

// Deterministic bumpy grid surface → a soup of triangles at varying z.
function gridSoup(n: number): number[] {
  const tris: number[] = [];
  const zf = (i: number, j: number) => Math.sin(i * 0.7) * Math.cos(j * 0.9) * 3;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const x0 = i, x1 = i + 1, y0 = j, y1 = j + 1;
      const a: Vec3 = [x0, y0, zf(i, j)];
      const b: Vec3 = [x1, y0, zf(i + 1, j)];
      const c: Vec3 = [x1, y1, zf(i + 1, j + 1)];
      const d: Vec3 = [x0, y1, zf(i, j + 1)];
      tris.push(...a, ...b, ...c, ...a, ...c, ...d);
    }
  }
  return tris;
}

/** Canonical string of a segment set (each segment's points sorted, list sorted). */
function norm(segs: [Vec3, Vec3][]): string[] {
  const key = (p: Vec3) => `${p[0].toFixed(4)},${p[1].toFixed(4)},${p[2].toFixed(4)}`;
  return segs.map(([a, b]) => [key(a), key(b)].sort().join('|')).sort();
}

describe('slicePlaneBVH', () => {
  const soup = gridSoup(16); // 512 triangles
  const bvh = buildTriangleBVH(soup);

  const planes: [Vec3, Vec3][] = [
    [[0, 0, 0], [0, 0, 1]],           // z = 0
    [[8, 0, 0], [1, 0, 0]],           // x = 8
    [[0, 8, 0], [0, 1, 0]],           // y = 8
    [[5, 5, 0.5], [1, 1, 1]],         // oblique
  ];

  it('reports the triangle count', () => {
    expect(bvh.count).toBe(512);
  });

  it.each(planes)('matches brute force for plane %j', (pt, nrm) => {
    const un = Math.hypot(...nrm) || 1;
    const n: Vec3 = [nrm[0] / un, nrm[1] / un, nrm[2] / un];
    const bruteN = norm(slicePlaneSegments(soup, pt, n));
    const bvhN = norm(slicePlaneBVH(soup, bvh, pt, n));
    expect(bvhN).toEqual(bruteN);
    expect(bvhN.length).toBeGreaterThan(0);
  });

  it('returns nothing for an empty mesh', () => {
    const empty = buildTriangleBVH([]);
    expect(empty.count).toBe(0);
    expect(slicePlaneBVH([], empty, [0, 0, 0], [0, 0, 1])).toHaveLength(0);
  });
});
