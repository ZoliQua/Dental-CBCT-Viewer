/**
 * Metal detection. It exists to warn that a surface-based scan pairing cannot
 * be trusted, so the two ways it could mislead are both failures: calling
 * enamel metal would cry wolf on every healthy case, and missing a restoration
 * would let a bad registration through unremarked.
 */

import { describe, it, expect } from 'vitest';
import { assessMetal } from '../src/core/metalArtifact';
import type { VolumeSamplingData } from '../src/core/cprMath';
import type { Vec3 } from '../src/core/implantGeometry';

/** A 60 mm cube at 0.3 mm holding the given spheres, everything else soft tissue. */
function volumeWith(blobs: { c: Vec3; r: number; hu: number }[]): VolumeSamplingData {
  const spacing = 0.3;
  const dims: [number, number, number] = [200, 200, 200];
  return {
    dims,
    origin: [0, 0, 0],
    invSx: 1 / spacing, invSy: 1 / spacing, invSz: 1 / spacing,
    zMin: 0, zMax: (dims[2] - 1) * spacing, vSpacing: spacing,
    getVoxel: (i, j, k) => {
      const p: Vec3 = [i * spacing, j * spacing, k * spacing];
      for (const b of blobs) {
        if (Math.hypot(p[0] - b.c[0], p[1] - b.c[1], p[2] - b.c[2]) <= b.r) return b.hu;
      }
      return 100;
    },
  };
}

const sphereMm3 = (r: number) => (4 / 3) * Math.PI * r ** 3;

describe('assessMetal', () => {
  it('reports nothing for a scan with no metal in it', () => {
    const r = assessMetal(volumeWith([]));
    expect(r.severity).toBe('none');
    expect(r.volumeMm3).toBe(0);
    expect(r.sites).toEqual([]);
  });

  it('does not mistake enamel for metal', () => {
    // A full crown's worth of the densest tissue in the scan.
    const r = assessMetal(volumeWith([{ c: [30, 30, 30], r: 4, hu: 2400 }]));
    expect(r.severity).toBe('none');
    expect(r.volumeMm3).toBe(0);
  });

  it('finds a restoration and places it', () => {
    const r = assessMetal(volumeWith([{ c: [30, 30, 30], r: 3, hu: 9000 }]));
    expect(r.sites).toHaveLength(1);
    const [s] = r.sites;
    expect(Math.hypot(s.center[0] - 30, s.center[1] - 30, s.center[2] - 30)).toBeLessThan(1);
    // Sampled on a 1 mm lattice, so the volume is approximate by construction.
    expect(s.volumeMm3).toBeGreaterThan(sphereMm3(3) * 0.6);
    expect(s.volumeMm3).toBeLessThan(sphereMm3(3) * 1.6);
  });

  it('keeps separate restorations separate', () => {
    const r = assessMetal(volumeWith([
      { c: [15, 30, 30], r: 2.5, hu: 9000 },
      { c: [40, 30, 30], r: 2.5, hu: 9000 },
    ]));
    expect(r.sites).toHaveLength(2);
  });

  it('calls one small filling minor and a mouthful of metal severe', () => {
    const minor = assessMetal(volumeWith([{ c: [30, 30, 30], r: 2, hu: 9000 }]));
    expect(minor.severity).toBe('minor');

    const severe = assessMetal(volumeWith(
      [10, 20, 30, 40, 50].map((x) => ({ c: [x, 30, 30] as Vec3, r: 3, hu: 9000 })),
    ));
    expect(severe.severity).toBe('severe');
    expect(severe.volumeMm3).toBeGreaterThan(200);
  });

  it('counts scatter towards the total without listing it as a site', () => {
    // Single bright voxels: real enough to matter in bulk, not worth pointing at.
    const speckled: VolumeSamplingData = {
      ...volumeWith([]),
      getVoxel: (i, j, k) => (i % 7 === 0 && j % 7 === 0 && k % 7 === 0 ? 9000 : 100),
    };
    const r = assessMetal(speckled, { minSiteMm3: 50 });
    expect(r.volumeMm3).toBeGreaterThan(0);
    expect(r.sites).toEqual([]);
  });

  it('returns the biggest restoration first', () => {
    const r = assessMetal(volumeWith([
      { c: [15, 30, 30], r: 2, hu: 9000 },
      { c: [40, 30, 30], r: 4, hu: 9000 },
    ]));
    expect(r.sites[0].volumeMm3).toBeGreaterThan(r.sites[1].volumeMm3);
    expect(r.sites[0].center[0]).toBeCloseTo(40, 0);
  });

  it('honours a raised threshold for a scanner that reads enamel high', () => {
    const vol = volumeWith([{ c: [30, 30, 30], r: 3, hu: 3600 }]);
    expect(assessMetal(vol).severity).not.toBe('none');
    expect(assessMetal(vol, { threshold: 5000 }).severity).toBe('none');
  });
});
