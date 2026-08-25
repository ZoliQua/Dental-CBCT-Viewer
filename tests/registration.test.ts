/**
 * Rigid landmark registration: Kabsch recovers a known rotation+translation,
 * and ray-triangle picking hits the expected surface point.
 */

import { describe, it, expect } from 'vitest';
import { kabschTransform, applyMat4, mul4, rayTriangleHit, pickTriangleSoup, IDENTITY4 } from '../src/core/registration';
import type { Vec3 } from '../src/core/implantGeometry';

// Rotate 90° about Z, then translate — apply to points to build the target set.
function transformKnown(p: Vec3): Vec3 {
  // Rz(90°): (x,y,z) → (−y, x, z); translation (5, −3, 2)
  return [-p[1] + 5, p[0] - 3, p[2] + 2];
}

const src: Vec3[] = [[0, 0, 0], [10, 0, 0], [0, 8, 0], [3, 4, 6]];
const tgt = src.map(transformKnown);

describe('kabschTransform', () => {
  it('recovers a known rigid transform (maps src onto tgt)', () => {
    const m = kabschTransform(src, tgt)!;
    expect(m).not.toBeNull();
    for (let i = 0; i < src.length; i++) {
      const out = applyMat4(m, src[i]);
      expect(out[0]).toBeCloseTo(tgt[i][0], 4);
      expect(out[1]).toBeCloseTo(tgt[i][1], 4);
      expect(out[2]).toBeCloseTo(tgt[i][2], 4);
    }
  });

  it('recovers a pure translation', () => {
    const t: Vec3[] = src.map((p) => [p[0] + 7, p[1] - 2, p[2] + 1]);
    const m = kabschTransform(src, t)!;
    const out = applyMat4(m, [1, 2, 3]);
    expect(out).toEqual([expect.closeTo(8, 4), expect.closeTo(0, 4), expect.closeTo(4, 4)]);
  });

  it('returns null for too few / mismatched points', () => {
    expect(kabschTransform([[0, 0, 0]], [[0, 0, 0]])).toBeNull();
    expect(kabschTransform(src, tgt.slice(0, 3))).toBeNull();
  });
});

describe('mul4 / applyMat4', () => {
  it('identity is neutral', () => {
    expect(applyMat4(IDENTITY4, [3, 4, 5])).toEqual([3, 4, 5]);
    expect(mul4(IDENTITY4, IDENTITY4)).toEqual(IDENTITY4);
  });
});

describe('ray-triangle picking', () => {
  const a: Vec3 = [0, 0, 5];
  const b: Vec3 = [10, 0, 5];
  const c: Vec3 = [0, 10, 5];

  it('hits a triangle straight ahead', () => {
    const t = rayTriangleHit([1, 1, 0], [0, 0, 1], a, b, c);
    expect(t).toBeCloseTo(5, 6);
  });

  it('misses outside the triangle', () => {
    expect(rayTriangleHit([9, 9, 0], [0, 0, 1], a, b, c)).toBeNull();
  });

  it('pickTriangleSoup returns the nearest world hit', () => {
    const soup = [...a, ...b, ...c]; // single triangle
    const hit = pickTriangleSoup([1, 1, 0], [0, 0, 1], soup)!;
    expect(hit[2]).toBeCloseTo(5, 6);
  });
});
