/**
 * Binary STL writer: correct size, triangle count, and a sane facet normal.
 */

import { describe, it, expect } from 'vitest';
import { triMeshToBinarySTL } from '../src/core/guideExport';
import { cylinderMesh } from '../src/core/guideGeom';

describe('triMeshToBinarySTL', () => {
  it('emits header + count + 50 bytes per triangle', () => {
    const m = cylinderMesh([0, 0, 0], [0, 0, 5], 2, 12);
    const buf = triMeshToBinarySTL(m);
    const view = new DataView(buf);
    const nTri = m.indices.length / 3;
    expect(buf.byteLength).toBe(84 + nTri * 50);
    expect(view.getUint32(80, true)).toBe(nTri);
  });

  it('writes a unit-length facet normal for a known triangle', () => {
    // Single triangle in the z=0 plane → normal ±(0,0,1)
    const m = {
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      indices: new Uint32Array([0, 1, 2]),
    };
    const view = new DataView(triMeshToBinarySTL(m));
    const nx = view.getFloat32(84, true);
    const ny = view.getFloat32(88, true);
    const nz = view.getFloat32(92, true);
    expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1, 5);
    expect(Math.abs(nz)).toBeCloseTo(1, 5);
  });
});
