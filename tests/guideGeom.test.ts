/**
 * Guide primitives are closed, outward-oriented 2-manifolds (the precondition
 * manifold-3d needs) with the expected volumes.
 */

import { describe, it, expect } from 'vitest';
import { cylinderMesh, sweptBarMesh, meshVolume, isClosedOriented, planSleeveSeat } from '../src/core/guideGeom';
import type { Vec3 } from '../src/core/implantGeometry';

describe('cylinderMesh', () => {
  it('is a closed, consistently-oriented mesh', () => {
    const m = cylinderMesh([0, 0, 0], [0, 0, 10], 3, 48);
    expect(isClosedOriented(m)).toBe(true);
  });

  it('has positive volume ≈ π r² h', () => {
    const r = 3, h = 10;
    const m = cylinderMesh([0, 0, 0], [0, 0, h], r, 256);
    const expected = Math.PI * r * r * h;
    // Polygonal approximation slightly under-estimates the circle area.
    expect(meshVolume(m)).toBeGreaterThan(expected * 0.99);
    expect(meshVolume(m)).toBeLessThan(expected * 1.001);
  });

  it('works for an off-axis (diagonal) cylinder', () => {
    const p0: Vec3 = [1, 2, 3];
    const p1: Vec3 = [5, 7, 9];
    const m = cylinderMesh(p0, p1, 2, 32);
    expect(isClosedOriented(m)).toBe(true);
    const h = Math.hypot(4, 5, 6);
    const expected = Math.PI * 2 * 2 * h;
    expect(meshVolume(m)).toBeGreaterThan(expected * 0.97);
    expect(meshVolume(m)).toBeLessThan(expected * 1.01);
  });
});

describe('sweptBarMesh', () => {
  it('is a closed, consistently-oriented mesh (straight run)', () => {
    const line: Vec3[] = [[0, 0, 0], [10, 0, 0], [20, 0, 0]];
    const m = sweptBarMesh(line, 5, 4);
    expect(isClosedOriented(m)).toBe(true);
  });

  it('a straight bar has volume ≈ width · height · length', () => {
    const line: Vec3[] = [[0, 0, 0], [30, 0, 0]];
    const m = sweptBarMesh(line, 5, 4);
    expect(meshVolume(m)).toBeCloseTo(5 * 4 * 30, 4);
  });

  it('stays closed along a curved (arch-like) centerline', () => {
    const line: Vec3[] = [];
    for (let i = 0; i <= 12; i++) {
      const a = (i / 12) * Math.PI; // half circle radius 20
      line.push([Math.cos(a) * 20, Math.sin(a) * 20, 5]);
    }
    const m = sweptBarMesh(line, 4, 3);
    expect(isClosedOriented(m)).toBe(true);
    expect(meshVolume(m)).toBeGreaterThan(0);
  });

  it('returns empty for a degenerate centerline', () => {
    const m = sweptBarMesh([[0, 0, 0]], 5, 4);
    expect(m.positions.length).toBe(0);
    expect(m.indices.length).toBe(0);
  });
});

describe('planSleeveSeat', () => {
  // Axis pointing +Z (apical), entry at origin. Occlusal = −Z.
  const entry: Vec3 = [0, 0, 0];
  const axis: Vec3 = [0, 0, 1];
  const p = { wallMm: 1.5, seatClearanceMm: 0.05, sleeveWallMm: 0.9, channelTolMm: 0.1 };
  const outer = 5, offset = 9, height = 5, length = 12;
  const plan = planSleeveSeat(entry, axis, length, outer, offset, height, p);

  it('seats the sleeve on a shoulder at −offset (repeatable drill stop)', () => {
    expect(plan.shoulderT).toBe(-offset);
    // Seat floor sits at z = −offset (occlusal side).
    expect(plan.seat.b[2]).toBeCloseTo(-offset, 6);
  });

  it('opens the seat at the occlusal surface with depth = sleeveHeight', () => {
    // Seat spans from above the occlusal opening down to the shoulder.
    const seatSpan = plan.seat.b[2] - plan.seat.a[2]; // b is more apical (larger z)
    expect(seatSpan).toBeCloseTo(height + 2, 6); // sleeveHeight + 2 mm overshoot
    expect(plan.seat.a[2]).toBeCloseTo(-(offset + height) - 2, 6);
  });

  it('makes the seat wider than the drill channel (a real shoulder forms)', () => {
    expect(plan.seat.radius).toBeGreaterThan(plan.channel.radius);
    expect(plan.seat.radius).toBeCloseTo(outer / 2 + p.seatClearanceMm, 6);
    // channel Ø = (outer − 2·sleeveWall) + 2·channelTol
    const innerD = outer - 2 * p.sleeveWallMm;
    expect(plan.channel.radius).toBeCloseTo(innerD / 2 + p.channelTolMm, 6);
  });

  it('wraps the seat in a wall of thickness wallMm', () => {
    expect(plan.housingRadius).toBeCloseTo(plan.seat.radius + p.wallMm, 6);
  });

  it('runs the drill channel from past the apex up to the seat opening', () => {
    expect(plan.channel.a[2]).toBeCloseTo(length + 2, 6);          // past apex
    expect(plan.channel.b[2]).toBeCloseTo(plan.seat.a[2], 6);       // meets the seat top
  });
});
