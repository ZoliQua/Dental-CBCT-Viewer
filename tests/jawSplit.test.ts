/**
 * Splitting a CBCT into its two jaws. The detection decides both where the
 * occlusal plane is and whether there is a second arch to hide at all — get the
 * latter wrong on a mandible-only scan and the "upper jaw" option blanks the
 * view, which is the failure this pins down.
 */

import { describe, it, expect } from 'vitest';
import { detectJawSplit, jawClipPlane, canSplitJaws, NO_JAW_SPLIT } from '../src/core/jawSplit';
import type { VolumeSamplingData } from '../src/core/cprMath';

/**
 * A synthetic scan on a 1 mm grid. `arches` are world-z bands filled with
 * enamel-density voxels (crowns); `bone` is a band of ordinary bone, which is
 * what tells a maxilla from a mandible when only one arch is present.
 */
function volume(opts: {
  arches: [number, number][];
  bone?: [number, number];
  dims?: [number, number, number];
  originZ?: number;
}): VolumeSamplingData {
  const dims = opts.dims ?? [40, 40, 80];
  const originZ = opts.originZ ?? 0;
  const zOf = (k: number) => originZ + k;
  const inBand = (z: number, band: [number, number]) => z >= band[0] && z <= band[1];
  return {
    dims,
    origin: [0, 0, originZ],
    invSx: 1, invSy: 1, invSz: 1,
    zMin: originZ, zMax: originZ + dims[2] - 1,
    vSpacing: 1,
    getVoxel: (i, j, k) => {
      if (i < 0 || j < 0 || k < 0 || i >= dims[0] || j >= dims[1] || k >= dims[2]) return -1024;
      const z = zOf(k);
      // Crowns sit in an arch-shaped ring, bone fills the middle too — the
      // detector only counts voxels, so a plain central block is enough.
      const central = i > 8 && i < 32 && j > 8 && j < 32;
      if (!central) return -1000;
      if (opts.arches.some((a) => inBand(z, a))) return 2500; // enamel
      if (opts.bone && inBand(z, opts.bone)) return 900; //      bone
      return -800;
    },
  };
}

describe('detectJawSplit', () => {
  it('finds the occlusal gap between two arches', () => {
    // Lower crowns 20–30, upper crowns 36–46, gap at ~33.
    const split = detectJawSplit(volume({ arches: [[20, 30], [36, 46]] }));
    expect(split.hasUpper).toBe(true);
    expect(split.hasLower).toBe(true);
    expect(split.splitZ).not.toBeNull();
    expect(split.splitZ!).toBeGreaterThan(30);
    expect(split.splitZ!).toBeLessThan(36);
  });

  it('reports a mandible-only scan as lower, with nothing to split', () => {
    // Crowns on top, the body of the mandible below them.
    const split = detectJawSplit(volume({ arches: [[50, 60]], bone: [10, 48] }));
    expect(split.hasLower).toBe(true);
    expect(split.hasUpper).toBe(false);
    expect(split.splitZ).toBeNull();
    expect(canSplitJaws(split)).toBe(false);
  });

  it('reports a maxilla-only scan as upper', () => {
    // Crowns at the bottom, sinus/nasal bone above them.
    const split = detectJawSplit(volume({ arches: [[10, 20]], bone: [22, 70] }));
    expect(split.hasUpper).toBe(true);
    expect(split.hasLower).toBe(false);
    expect(split.splitZ).toBeNull();
  });

  it('does not invent a split in a scan with no enamel at all', () => {
    expect(detectJawSplit(volume({ arches: [], bone: [10, 60] }))).toEqual(NO_JAW_SPLIT);
  });

  it('does not split one thick arch into two', () => {
    // A single continuous band must not be read as two peaks with a gap.
    expect(detectJawSplit(volume({ arches: [[20, 46]], bone: [5, 18] })).splitZ).toBeNull();
  });

  it('works away from the origin (world z offsets)', () => {
    const split = detectJawSplit(volume({ arches: [[-30, -20], [-14, -4]], originZ: -50 }));
    expect(split.splitZ!).toBeGreaterThan(-20);
    expect(split.splitZ!).toBeLessThan(-14);
  });
});

describe('jawClipPlane', () => {
  const split = { splitZ: 33, hasUpper: true, hasLower: true };

  it('keeps everything above the split for the upper jaw', () => {
    const p = jawClipPlane(split, 'upper')!;
    expect(p.origin).toEqual([0, 0, 33]);
    expect(p.normal).toEqual([0, 0, 1]); // vtk keeps (x − o) · n ≥ 0
  });

  it('keeps everything below the split for the lower jaw', () => {
    expect(jawClipPlane(split, 'lower')!.normal).toEqual([0, 0, -1]);
  });

  it('clips nothing for "both", or when there is no split', () => {
    expect(jawClipPlane(split, 'both')).toBeNull();
    expect(jawClipPlane(NO_JAW_SPLIT, 'upper')).toBeNull();
  });
});
