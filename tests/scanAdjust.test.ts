/**
 * Manual correction of a scan's registration. The whole point of the nudge
 * controls is that they are reversible and that a rotation happens in place, so
 * that is what these lock down.
 */

import { describe, it, expect } from 'vitest';
import { nudgeScan, rotateScan, scanCenterWorld, translation4, rotation4 } from '../src/core/scanAdjust';
import { applyMat4, IDENTITY4 } from '../src/core/registration';

const near = (a: number[], b: number[], eps = 1e-9) => {
  expect(a.length).toBe(b.length);
  a.forEach((v, i) => expect(Math.abs(v - b[i])).toBeLessThan(eps));
};

describe('scanAdjust', () => {
  it('nudges a point by exactly the requested millimetres', () => {
    const m = nudgeScan(IDENTITY4, 'y', 2.5);
    near(applyMat4(m, [1, 1, 1]), [1, 3.5, 1]);
  });

  it('is exactly reversible — the opposite nudge restores the transform', () => {
    const start = translation4([3, -4, 5]);
    const there = nudgeScan(start, 'x', 0.25);
    const back = nudgeScan(there, 'x', -0.25);
    near(back, start, 1e-12);
  });

  it('applies the nudge in world space, on top of an existing rotation', () => {
    // A scan already rotated 90° about z still moves along the world +x axis.
    const rotated = rotation4('z', 90);
    const moved = nudgeScan(rotated, 'x', 10);
    near(applyMat4(moved, [0, 0, 0]), [10, 0, 0], 1e-9);
  });

  it('rotates about the given pivot, leaving the pivot itself fixed', () => {
    const pivot: [number, number, number] = [5, 5, 0];
    const m = rotateScan(IDENTITY4, 'z', 37, pivot);
    near(applyMat4(m, pivot), pivot, 1e-9);
  });

  it('rotates a point about the pivot by the requested angle', () => {
    const m = rotateScan(IDENTITY4, 'z', 90, [0, 0, 0]);
    near(applyMat4(m, [1, 0, 0]), [0, 1, 0], 1e-9);
  });

  it('undoes a rotation exactly when applied with the opposite sign', () => {
    const start = translation4([1, 2, 3]);
    const pivot: [number, number, number] = [0, 10, 0];
    const back = rotateScan(rotateScan(start, 'x', 5, pivot), 'x', -5, pivot);
    near(back, start, 1e-9);
  });

  it('takes the scan centre from its bounds through the current transform', () => {
    const bounds = [0, 2, 0, 4, 0, 6]; // centre (1, 2, 3)
    near(scanCenterWorld(translation4([10, 0, 0]), bounds), [11, 2, 3], 1e-9);
  });

  it('falls back to the transform origin when the mesh has no bounds', () => {
    near(scanCenterWorld(translation4([7, 8, 9]), null), [7, 8, 9], 1e-9);
  });
});
