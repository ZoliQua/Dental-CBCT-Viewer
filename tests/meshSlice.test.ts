/**
 * Mesh ∩ plane: crossing triangles yield the expected edge-intersection
 * segment; non-crossing triangles yield nothing.
 */

import { describe, it, expect } from 'vitest';
import { slicePlaneSegments } from '../src/core/meshSlice';
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
