/**
 * Crop box → clipping planes: correct origins/normals, and only cutting sides
 * produce a plane.
 */

import { describe, it, expect } from 'vitest';
import { clipPlanes, NO_CROP } from '../src/core/cropBox';
import type { Vec3 } from '../src/core/implantGeometry';

const bmin: Vec3 = [0, 0, 0];
const bmax: Vec3 = [10, 20, 30];

describe('clipPlanes', () => {
  it('produces no planes for a full (uncropped) box', () => {
    expect(clipPlanes(bmin, bmax, NO_CROP)).toHaveLength(0);
  });

  it('cuts only the requested sides with correct origin + normal', () => {
    const planes = clipPlanes(bmin, bmax, { min: [0.2, 0, 0], max: [1, 0.5, 1] });
    expect(planes).toHaveLength(2);
    // X low at 2, keeping x ≥ 2 → normal +X
    const xlo = planes.find((p) => p.normal[0] === 1)!;
    expect(xlo.origin[0]).toBeCloseTo(2, 6);
    // Y high at 10, keeping y ≤ 10 → normal −Y
    const yhi = planes.find((p) => p.normal[1] === -1)!;
    expect(yhi.origin[1]).toBeCloseTo(10, 6);
  });

  it('produces all 6 planes when fully cropped inward', () => {
    const planes = clipPlanes(bmin, bmax, { min: [0.1, 0.1, 0.1], max: [0.9, 0.9, 0.9] });
    expect(planes).toHaveLength(6);
    // The half-space normals point inward from each face
    expect(planes.filter((p) => p.normal.some((n) => n > 0))).toHaveLength(3);
    expect(planes.filter((p) => p.normal.some((n) => n < 0))).toHaveLength(3);
  });
});
