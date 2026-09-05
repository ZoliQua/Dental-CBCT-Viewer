/**
 * Prosthetically-driven planning: PCA long axis + the world-axis→angles inverse
 * (round-trips with implantAxis) + the combined crown suggestion.
 */

import { describe, it, expect } from 'vitest';
import { principalAxis, anglesFromWorldAxis, suggestImplantFromMesh } from '../src/core/toothSetup';
import { implantAxis, type ArchFrame } from '../src/core/implantGeometry';
import type { Vec3 } from '../src/core/implantGeometry';
import type { Point2 } from '../src/core/cprMath';

// Frame with normal +X, tangent = [normal[1], -normal[0]] = [0,-1] (the app's convention).
const frame: ArchFrame = { s: 0.5, point: [0, 0], normal: [1, 0], tangent: [0, -1] };

describe('principalAxis', () => {
  it('finds the long axis and extent of an elongated cloud', () => {
    // Points strung along +Z from −5..+5 with a little XY jitter.
    const pts: number[] = [];
    for (let z = -5; z <= 5; z += 1) pts.push(0.2 * ((z % 2) - 0.5), -0.1 * (z % 3), z);
    const pa = principalAxis(pts)!;
    expect(pa).not.toBeNull();
    expect(Math.abs(pa.axis[2])).toBeGreaterThan(0.98); // axis ≈ ±Z
    expect(pa.extent).toBeCloseTo(10, 1);
    expect(pa.centroid[2]).toBeCloseTo(0, 6);
  });

  it('returns null for < 3 points', () => {
    expect(principalAxis([0, 0, 0, 1, 1, 1])).toBeNull();
  });
});

describe('anglesFromWorldAxis', () => {
  it('round-trips through implantAxis for a range of angles', () => {
    for (const bl of [-30, 0, 25, 60, 175]) {
      for (const md of [-20, 0, 15]) {
        const A = implantAxis(frame, bl, md);
        const { angleBLDeg, angleMDDeg } = anglesFromWorldAxis(frame, A);
        const A2 = implantAxis(frame, angleBLDeg, angleMDDeg);
        for (let k = 0; k < 3; k++) expect(A2[k]).toBeCloseTo(A[k], 6);
      }
    }
  });

  it('recovers small apex-down angles directly', () => {
    const A = implantAxis(frame, 10, -8);
    const { angleBLDeg, angleMDDeg } = anglesFromWorldAxis(frame, A);
    expect(angleBLDeg).toBeCloseTo(10, 4);
    expect(angleMDDeg).toBeCloseTo(-8, 4);
  });
});

describe('suggestImplantFromMesh', () => {
  // Straight arch along +X at y = 5.
  const arch: Point2[] = [[-10, 5], [0, 5], [10, 5], [20, 5]];

  it('suggests a near-vertical apex-down implant for a vertical crown', () => {
    // Vertical tooth cluster around (10, 5, 20), spanning z 15..25.
    const pts: number[] = [];
    for (let z = -5; z <= 5; z += 1) pts.push(10 + 0.2 * (z % 2), 5 - 0.1 * (z % 3), 20 + z);
    const s = suggestImplantFromMesh(arch, pts)!;
    expect(s).not.toBeNull();
    expect(Math.abs(s.angleBLDeg)).toBeLessThan(10);
    expect(Math.abs(s.angleMDDeg)).toBeLessThan(10);
    // Platform at the apical (lower-Z) end of the crown.
    expect(s.position[2]).toBeLessThan(16);
    expect(s.position[0]).toBeCloseTo(10, 0);
  });

  it('flips the axis for the upper jaw (apex up)', () => {
    const pts: number[] = [];
    for (let z = -5; z <= 5; z += 1) pts.push(10, 5, 20 + z);
    const down = suggestImplantFromMesh(arch, pts)!;
    const up = suggestImplantFromMesh(arch, pts, { apexUp: true })!;
    // Apex-up platform sits at the opposite (higher-Z) end.
    expect(up.position[2]).toBeGreaterThan(down.position[2]);
    // The reconstructed axes point opposite in Z.
    const axDown = implantAxis(frame, down.angleBLDeg, down.angleMDDeg);
    const axUp = implantAxis(frame, up.angleBLDeg, up.angleMDDeg);
    expect(Math.sign(axDown[2])).toBe(-1);
    expect(Math.sign(axUp[2])).toBe(1);
  });
});
