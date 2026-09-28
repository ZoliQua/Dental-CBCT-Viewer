/**
 * Picking a landmark on the 3D volume: a camera ray has to land on the first
 * dense surface it meets, accurately enough to register a scan by, and it must
 * respect the clipping the view is showing — clicking a jaw that has been
 * hidden should never return a point on it.
 */

import { describe, it, expect } from 'vitest';
import { rayBoxRange, volumeBounds, pickVolumeSurface } from '../src/core/volumePick';
import type { VolumeSamplingData } from '../src/core/cprMath';
import type { Vec3 } from '../src/core/implantGeometry';

/** 1 mm grid, 60³, with a solid dense block over the given index box. */
function blockVolume(box: { i: [number, number]; j: [number, number]; k: [number, number] }, hu = 1500): VolumeSamplingData {
  const dims: [number, number, number] = [60, 60, 60];
  const inside = (v: number, r: [number, number]) => v >= r[0] && v <= r[1];
  return {
    dims,
    origin: [0, 0, 0],
    invSx: 1, invSy: 1, invSz: 1,
    zMin: 0, zMax: 59, vSpacing: 1,
    getVoxel: (i, j, k) => (inside(i, box.i) && inside(j, box.j) && inside(k, box.k) ? hu : -1000),
  };
}

describe('rayBoxRange', () => {
  const lo: Vec3 = [0, 0, 0];
  const hi: Vec3 = [10, 10, 10];

  it('returns the entry and exit parameters of a ray through the box', () => {
    const r = rayBoxRange([-5, 5, 5], [1, 0, 0], lo, hi)!;
    expect(r[0]).toBeCloseTo(5, 6);
    expect(r[1]).toBeCloseTo(15, 6);
  });

  it('misses a box the ray passes beside', () => {
    expect(rayBoxRange([-5, 20, 5], [1, 0, 0], lo, hi)).toBeNull();
  });

  it('handles a ray parallel to an axis, inside and outside the slab', () => {
    expect(rayBoxRange([5, 5, -5], [0, 0, 1], lo, hi)).not.toBeNull();
    expect(rayBoxRange([50, 5, -5], [0, 0, 1], lo, hi)).toBeNull();
  });

  it('clamps a ray that starts inside the box to t = 0', () => {
    expect(rayBoxRange([5, 5, 5], [1, 0, 0], lo, hi)![0]).toBe(0);
  });

  it('rejects a box entirely behind the ray', () => {
    expect(rayBoxRange([20, 5, 5], [1, 0, 0], lo, hi)).toBeNull();
  });
});

describe('volumeBounds', () => {
  it('spans origin to origin + (dims − 1) · spacing', () => {
    const [lo, hi] = volumeBounds(blockVolume({ i: [0, 0], j: [0, 0], k: [0, 0] }));
    expect(lo).toEqual([0, 0, 0]);
    expect(hi).toEqual([59, 59, 59]);
  });
});

describe('pickVolumeSurface', () => {
  // A block occupying x ∈ [20,40] — a ray along +x should stop at its face.
  const vol = blockVolume({ i: [20, 40], j: [10, 50], k: [10, 50] });

  it('lands on the first dense face, to sub-voxel accuracy', () => {
    const p = pickVolumeSurface(vol, [-10, 30, 30], [1, 0, 0])!;
    expect(p).not.toBeNull();
    // The trilinear field crosses the threshold inside the voxel before the
    // block, so the hit sits just short of x = 20 — well under one voxel out.
    expect(Math.abs(p[0] - 20)).toBeLessThan(1);
    expect(p[1]).toBeCloseTo(30, 6);
    expect(p[2]).toBeCloseTo(30, 6);
  });

  it('returns null when the ray never meets dense tissue', () => {
    expect(pickVolumeSurface(vol, [-10, 55, 55], [1, 0, 0])).toBeNull();
  });

  it('returns null when the ray misses the volume entirely', () => {
    expect(pickVolumeSurface(vol, [-10, 500, 500], [1, 0, 0])).toBeNull();
  });

  it('does not require a normalized direction', () => {
    const a = pickVolumeSurface(vol, [-10, 30, 30], [1, 0, 0])!;
    const b = pickVolumeSurface(vol, [-10, 30, 30], [7, 0, 0])!;
    expect(b[0]).toBeCloseTo(a[0], 6);
  });

  it('skips tissue the view has clipped away', () => {
    // Hide everything with x ≤ 45: the near face is gone, so nothing is hit.
    const clipped = pickVolumeSurface(vol, [-10, 30, 30], [1, 0, 0], {
      clipPlanes: [{ origin: [45, 0, 0], normal: [1, 0, 0] }],
    });
    expect(clipped).toBeNull();
  });

  it('still picks the part of the volume the clip keeps', () => {
    // Keep x ≥ 30, which cuts the block in half: the ray now stops at the cut.
    const p = pickVolumeSurface(vol, [-10, 30, 30], [1, 0, 0], {
      clipPlanes: [{ origin: [30, 0, 0], normal: [1, 0, 0] }],
    })!;
    expect(p[0]).toBeGreaterThanOrEqual(30);
    expect(p[0]).toBeLessThan(32);
  });

  it('honours a custom threshold', () => {
    const faint = blockVolume({ i: [20, 40], j: [10, 50], k: [10, 50] }, 400);
    expect(pickVolumeSurface(faint, [-10, 30, 30], [1, 0, 0])).toBeNull();
    expect(pickVolumeSurface(faint, [-10, 30, 30], [1, 0, 0], { threshold: 300 })).not.toBeNull();
  });
});

