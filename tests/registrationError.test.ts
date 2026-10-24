/**
 * Predicted registration error at a target.
 *
 * The point of this module is that the residual at the markers does not say
 * how good the registration is where the implant goes, so the tests that
 * matter are the ones where the residual is held constant and only the marker
 * geometry changes.
 */

import { describe, it, expect } from 'vitest';
import {
  fiducialSpread,
  estimateFle,
  predictTre,
  registrationAccuracy,
  MIN_FLE_MM,
} from '../src/core/registrationError';
import type { Vec3 } from '../src/core/implantGeometry';

/** Four markers on a circle of radius r in the z = 0 plane, centred on origin. */
const ring = (r: number): Vec3[] => [[r, 0, 0], [-r, 0, 0], [0, r, 0], [0, -r, 0]];

describe('fiducialSpread', () => {
  it('needs three markers — a rigid fit has nothing to spare below that', () => {
    expect(fiducialSpread([])).toBeNull();
    expect(fiducialSpread([[0, 0, 0]])).toBeNull();
    expect(fiducialSpread([[0, 0, 0], [1, 0, 0]])).toBeNull();
    expect(fiducialSpread([[0, 0, 0], [1, 0, 0], [0, 1, 0]])).not.toBeNull();
  });

  it('finds the centroid and the spread about each principal axis', () => {
    const s = fiducialSpread(ring(10))!;
    expect(s.count).toBe(4);
    expect(s.centroid[0]).toBeCloseTo(0, 9);
    expect(s.centroid[1]).toBeCloseTo(0, 9);
    expect(s.centroid[2]).toBeCloseTo(0, 9);
    // Every marker is 10 mm from the out-of-plane axis; about either in-plane
    // axis two sit on it and two 10 mm off, so the RMS is 10/√2.
    const sorted = [...s.axisRms].sort((a, b) => a - b);
    expect(sorted[0]).toBeCloseTo(10 / Math.SQRT2, 6);
    expect(sorted[1]).toBeCloseTo(10 / Math.SQRT2, 6);
    expect(sorted[2]).toBeCloseTo(10, 6);
  });

  it('reports no spread about the line that collinear markers lie on', () => {
    const s = fiducialSpread([[0, 0, 0], [1, 0, 0], [2, 0, 0]])!;
    expect(Math.min(...s.axisRms)).toBeCloseTo(0, 9);
  });
});

describe('estimateFle', () => {
  it('inflates the residual by the share the fit absorbed', () => {
    // FRE² = FLE²(1 − 2/N): with four points the fit hides a factor of √2.
    expect(estimateFle(1, 4)).toBeCloseTo(Math.SQRT2, 9);
    expect(estimateFle(1, 3)).toBeCloseTo(Math.sqrt(3), 9);
    // More points, less of each point's error absorbed.
    expect(estimateFle(1, 8)).toBeLessThan(estimateFle(1, 4));
  });

  it('will not report a flawless fit from three lucky points', () => {
    expect(estimateFle(0, 3)).toBe(MIN_FLE_MM);
    expect(estimateFle(1e-9, 3)).toBe(MIN_FLE_MM);
  });
});

describe('predictTre', () => {
  it('is FLE/√N at the centre of the markers', () => {
    const s = fiducialSpread(ring(10))!;
    expect(predictTre([0, 0, 0], s, 0.4)).toBeCloseTo(0.4 / 2, 9);
  });

  it('grows with distance from the markers', () => {
    const s = fiducialSpread(ring(10))!;
    const near = predictTre([0, 0, 2], s, 0.4);
    const far = predictTre([0, 0, 20], s, 0.4);
    expect(far).toBeGreaterThan(near);
    expect(near).toBeGreaterThan(predictTre([0, 0, 0], s, 0.4));
  });

  it('is unbounded off the line when the markers are collinear', () => {
    const s = fiducialSpread([[0, 0, 0], [1, 0, 0], [2, 0, 0]])!;
    // Rotation about the markers' own line is not determined by the fit.
    expect(predictTre([1, 5, 0], s, 0.3)).toBe(Infinity);
    // A target on that line is still held.
    expect(predictTre([5, 0, 0], s, 0.3)).toBeLessThan(Infinity);
  });

  it('punishes a clustered constellation that fits just as well', () => {
    // Same residual, same marker count, same target — only the spread differs.
    const apex: Vec3 = [0, 0, 20];
    const fle = estimateFle(0.15, 4);
    const spreadOut = predictTre(apex, fiducialSpread(ring(15))!, fle);
    const clustered = predictTre(apex, fiducialSpread(ring(2))!, fle);
    expect(clustered).toBeGreaterThan(spreadOut * 5);
    // And the clustered one is far worse than its own residual suggests.
    expect(clustered).toBeGreaterThan(0.15 * 5);
  });
});

describe('registrationAccuracy', () => {
  it('names the worst-held target and sorts the rest behind it', () => {
    const res = registrationAccuracy(ring(10), 0.2, [
      { target: 'near', point: [0, 0, 1] },
      { target: 'far', point: [0, 0, 25] },
      { target: 'middle', point: [0, 0, 10] },
    ])!;
    expect(res.targets.map((t) => t.target)).toEqual(['far', 'middle', 'near']);
    expect(res.worstMm).toBeCloseTo(res.targets[0].treMm, 12);
    expect(res.degenerate).toBe(false);
    expect(res.fleMm).toBeCloseTo(0.2 * Math.SQRT2, 9);
  });

  it('flags a collinear constellation', () => {
    const res = registrationAccuracy([[0, 0, 0], [1, 0, 0], [2, 0, 0]], 0.2, [
      { target: 'apex', point: [1, 5, 0] },
    ])!;
    expect(res.degenerate).toBe(true);
    expect(res.worstMm).toBe(Infinity);
  });

  it('returns null below three markers, and copes with no targets', () => {
    expect(registrationAccuracy([[0, 0, 0], [1, 0, 0]], 0.2, [])).toBeNull();
    const res = registrationAccuracy(ring(10), 0.2, [])!;
    expect(res.worstMm).toBeNull();
    expect(res.targets).toEqual([]);
  });
});
