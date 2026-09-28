/**
 * Radiopaque marker registration. Surface matching does not pin a scan down at
 * the millimetre scale; markers do, because a bead is a point rather than a
 * surface. That only holds if the bead's centre is recovered accurately and the
 * beads are paired with the right partners, which is what these check.
 */

import { describe, it, expect } from 'vitest';
import {
  detectFiducials, fitSphere, snapToSphere, nearestFiducialToRay, matchConstellations,
} from '../src/core/fiducials';
import type { VolumeSamplingData } from '../src/core/cprMath';
import type { Vec3 } from '../src/core/implantGeometry';

/**
 * A 0.25 mm volume holding the given spheres at `value`, everything else air.
 * Sampling is analytic, so a bead's centre has no grid bias to hide behind.
 */
function beadVolume(
  beads: { c: Vec3; r: number; value?: number }[],
  extra: (p: Vec3) => number = () => -1000,
): VolumeSamplingData {
  const spacing = 0.25;
  const dims: [number, number, number] = [160, 160, 160]; // 40 mm cube
  return {
    dims,
    origin: [0, 0, 0],
    invSx: 1 / spacing, invSy: 1 / spacing, invSz: 1 / spacing,
    zMin: 0, zMax: (dims[2] - 1) * spacing, vSpacing: spacing,
    getVoxel: (i, j, k) => {
      const p: Vec3 = [i * spacing, j * spacing, k * spacing];
      for (const b of beads) {
        if (Math.hypot(p[0] - b.c[0], p[1] - b.c[1], p[2] - b.c[2]) <= b.r) return b.value ?? 3000;
      }
      return extra(p);
    },
  };
}

const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Points on a sphere's surface — a scan of a marker bead. */
function spherePoints(c: Vec3, r: number, n = 200): Vec3[] {
  const out: Vec3[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const rad = Math.sqrt(Math.max(0, 1 - y * y));
    const th = golden * i;
    out.push([c[0] + Math.cos(th) * rad * r, c[1] + y * r, c[2] + Math.sin(th) * rad * r]);
  }
  return out;
}

describe('detectFiducials', () => {
  it('finds beads and locates their centres to well under a voxel', () => {
    const truth: Vec3[] = [[10.3, 12.7, 20.1], [25.6, 14.2, 19.4], [18.1, 28.9, 21.6]];
    const found = detectFiducials(beadVolume(truth.map((c) => ({ c, r: 1.0 }))));
    expect(found).toHaveLength(3);
    for (const t of truth) {
      const nearest = found.reduce((a, f) => (dist(f.center, t) < dist(a.center, t) ? f : a));
      expect(dist(nearest.center, t)).toBeLessThan(0.25); // one voxel
    }
  });

  it('reports a plausible diameter', () => {
    const [f] = detectFiducials(beadVolume([{ c: [20, 20, 20], r: 1.0 }]));
    expect(f.diameterMm).toBeGreaterThan(1.5);
    expect(f.diameterMm).toBeLessThan(2.6);
  });

  it('rejects anything too large to be a bead', () => {
    // A 12 mm sphere is a tooth, not a marker.
    expect(detectFiducials(beadVolume([{ c: [20, 20, 20], r: 6 }]))).toHaveLength(0);
  });

  it('rejects anything too small to be a bead', () => {
    expect(detectFiducials(beadVolume([{ c: [20, 20, 20], r: 0.2 }]))).toHaveLength(0);
  });

  it('rejects an elongated streak of the same volume', () => {
    // A wire: dense, right size, wrong shape.
    const streak = beadVolume([], (p) =>
      (Math.abs(p[1] - 20) < 0.5 && Math.abs(p[2] - 20) < 0.5 && p[0] > 15 && p[0] < 25 ? 3000 : -1000));
    expect(detectFiducials(streak)).toHaveLength(0);
  });

  it('ignores material below the threshold', () => {
    // Enamel-bright but not marker-bright.
    expect(detectFiducials(beadVolume([{ c: [20, 20, 20], r: 1, value: 1800 }]))).toHaveLength(0);
  });

  it('can be restricted to one jaw', () => {
    const found = detectFiducials(
      beadVolume([{ c: [15, 15, 8], r: 1 }, { c: [15, 15, 30], r: 1 }]),
      { zRange: [20, 40] },
    );
    expect(found).toHaveLength(1);
    expect(found[0].center[2]).toBeGreaterThan(20);
  });

  it('offers one candidate per bead, never the same one twice', () => {
    // Two coarse components can straddle a single bead; the list must not.
    const found = detectFiducials(beadVolume([{ c: [20, 20, 20], r: 1.1 }]));
    expect(found).toHaveLength(1);
  });

  it('caps how many candidates it returns, best first', () => {
    const beads = Array.from({ length: 10 }, (_, i) => ({ c: [5 + i * 3, 20, 20] as Vec3, r: 1 }));
    const found = detectFiducials(beadVolume(beads), { maxResults: 4 });
    expect(found).toHaveLength(4);
    for (let i = 1; i < found.length; i++) {
      expect(found[i - 1].sphericity).toBeGreaterThanOrEqual(found[i].sphericity);
    }
  });
});

describe('fitSphere', () => {
  it('recovers a sphere from points on its surface', () => {
    const fit = fitSphere(spherePoints([3, -4, 5], 1.25))!;
    expect(dist(fit.center, [3, -4, 5])).toBeLessThan(1e-6);
    expect(fit.radiusMm).toBeCloseTo(1.25, 6);
    expect(fit.rmsMm).toBeLessThan(1e-6);
  });

  it('declines on too few points', () => {
    expect(fitSphere(spherePoints([0, 0, 0], 1, 5))).toBeNull();
  });

  it('declines on a degenerate (coplanar) set', () => {
    const flat: Vec3[] = [];
    for (let i = 0; i < 20; i++) flat.push([Math.cos(i), Math.sin(i), 0]);
    const fit = fitSphere(flat);
    // Either it refuses, or it admits a huge residual — never a confident answer.
    expect(fit === null || fit.radiusMm > 100 || fit.rmsMm > 0.1).toBe(true);
  });
});

describe('snapToSphere', () => {
  const bead = spherePoints([10, 10, 10], 1.2, 400);

  it('moves a click on the bead to the bead centre', () => {
    const click: Vec3 = [10, 10, 11.2]; // on the surface
    const r = snapToSphere(bead, click);
    expect(r.snapped).toBe(true);
    expect(dist(r.point, [10, 10, 10])).toBeLessThan(0.02);
  });

  it('leaves a click on flat surface alone', () => {
    const plane: Vec3[] = [];
    for (let x = -3; x <= 3; x += 0.2) for (let y = -3; y <= 3; y += 0.2) plane.push([10 + x, 10 + y, 10]);
    const click: Vec3 = [10, 10, 10];
    const r = snapToSphere(plane, click);
    expect(r.snapped).toBe(false);
    expect(r.point).toEqual(click);
  });

  it('leaves a click alone when nothing is near it', () => {
    expect(snapToSphere(bead, [50, 50, 50]).snapped).toBe(false);
  });

  it('refuses a fit whose radius is not bead-sized', () => {
    // A 10 mm ball is a cusp, not a marker.
    expect(snapToSphere(spherePoints([10, 10, 10], 10, 400), [10, 10, 20]).snapped).toBe(false);
  });
});

describe('nearestFiducialToRay', () => {
  const fids = [
    { center: [10, 0, 0] as Vec3, diameterMm: 2, sphericity: 1, meanValue: 3000 },
    { center: [20, 0, 0] as Vec3, diameterMm: 2, sphericity: 1, meanValue: 3000 },
  ];

  it('picks the nearest one along the ray, not the furthest', () => {
    expect(nearestFiducialToRay(fids, [0, 0, 0], [1, 0, 0])!.center[0]).toBe(10);
  });

  it('ignores candidates behind the camera', () => {
    expect(nearestFiducialToRay(fids, [30, 0, 0], [1, 0, 0])).toBeNull();
  });

  it('ignores a ray that misses', () => {
    expect(nearestFiducialToRay(fids, [0, 20, 0], [1, 0, 0])).toBeNull();
  });

  it('does not require a normalized direction', () => {
    expect(nearestFiducialToRay(fids, [0, 0, 0], [5, 0, 0])!.center[0]).toBe(10);
  });
});

describe('matchConstellations', () => {
  // A deliberately asymmetric constellation — a symmetric one has no unique answer.
  const src: Vec3[] = [[0, 0, 0], [12, 0, 0], [3, 9, 0], [7, 2, 6]];
  /** Move and turn the whole set: the distances are unchanged. */
  const moved = (pts: Vec3[]): Vec3[] => pts.map(([x, y, z]) => {
    const a = 0.7;
    return [Math.cos(a) * x - Math.sin(a) * y + 40, Math.sin(a) * x + Math.cos(a) * y - 15, z + 8] as Vec3;
  });

  it('recovers the identity when the order already matches', () => {
    expect(matchConstellations(src, moved(src))).toEqual([0, 1, 2, 3]);
  });

  it('finds the right partners when the target order is shuffled', () => {
    const perm = [2, 0, 3, 1];
    const target = moved(perm.map((i) => src[i]));
    // src[i] is target[ result[i] ]; target[j] came from src[perm[j]].
    const result = matchConstellations(src, target)!;
    expect(result).not.toBeNull();
    for (let i = 0; i < src.length; i++) expect(perm[result[i]]).toBe(i);
  });

  it('tolerates the small errors real picking leaves behind', () => {
    const jittered = moved(src).map(([x, y, z], i) => [x + (i % 2 ? 0.2 : -0.15), y - 0.1, z + 0.12] as Vec3);
    expect(matchConstellations(src, jittered)).toEqual([0, 1, 2, 3]);
  });

  it('refuses when the two sets are not the same shape', () => {
    const wrong: Vec3[] = [[0, 0, 0], [30, 0, 0], [3, 9, 0], [7, 2, 6]];
    expect(matchConstellations(src, moved(wrong))).toBeNull();
  });

  it('refuses sets that are too small, mismatched or too large to brute force', () => {
    expect(matchConstellations(src.slice(0, 2), src.slice(0, 2))).toBeNull();
    expect(matchConstellations(src, src.slice(0, 3))).toBeNull();
    const big = Array.from({ length: 9 }, (_, i) => [i, i * i, 0] as Vec3);
    expect(matchConstellations(big, big)).toBeNull();
  });
});
