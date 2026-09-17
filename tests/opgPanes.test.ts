/**
 * Panoramic-layout pane order (swap big ↔ small) and the 3D cut-plane quad.
 */

import { describe, it, expect } from 'vitest';
import { normalizeOpgOrder, swapOpgBig, OPG_VIEWS, DEFAULT_PANEL, type OpgView } from '../src/types/dicom';
import { crossSectionPlaneCorners, type CrossSectionFrame } from '../src/core/cprMath';

describe('normalizeOpgOrder', () => {
  it('keeps a valid permutation untouched', () => {
    const o: OpgView[] = ['CROSS', 'AXIAL', 'PANORAMA', '3D'];
    expect(normalizeOpgOrder(o)).toEqual(o);
  });

  it('repairs duplicates and gaps into a full permutation', () => {
    const fixed = normalizeOpgOrder(['AXIAL', 'AXIAL'] as OpgView[]);
    expect(fixed).toHaveLength(4);
    expect([...fixed].sort()).toEqual([...OPG_VIEWS].sort());
  });

  it('falls back to a full permutation for undefined', () => {
    expect([...normalizeOpgOrder(undefined)].sort()).toEqual([...OPG_VIEWS].sort());
  });

  it('drops unknown pane names', () => {
    const fixed = normalizeOpgOrder(['SAGITTAL' as OpgView, 'CROSS']);
    expect([...fixed].sort()).toEqual([...OPG_VIEWS].sort());
    expect(fixed).toContain('CROSS');
  });
});

describe('swapOpgBig', () => {
  const base = DEFAULT_PANEL.opgOrder;

  it('promotes a small pane into the big slot', () => {
    const next = swapOpgBig(base, 2); // CROSS
    expect(next[0]).toBe('CROSS');
    // the displaced big pane lands in the slot just vacated → reversible
    expect(next[2]).toBe('PANORAMA');
  });

  it('is its own inverse (works back and forth)', () => {
    for (const i of [1, 2, 3]) {
      expect(swapOpgBig(swapOpgBig(base, i), i)).toEqual(base);
    }
  });

  it('ignores the big slot and out-of-range indices', () => {
    expect(swapOpgBig(base, 0)).toEqual(base);
    expect(swapOpgBig(base, 9)).toEqual(base);
  });

  it('always yields a full permutation', () => {
    const next = swapOpgBig(base, 3);
    expect([...next].sort()).toEqual([...OPG_VIEWS].sort());
  });
});

describe('crossSectionPlaneCorners', () => {
  it('spans ±halfWidth along eU and ±halfHeight along eV', () => {
    const frame: CrossSectionFrame = {
      point: [0, 0], normal: [1, 0], tangent: [0, -1],
      origin: [0, 0, 0], eU: [1, 0, 0], eV: [0, 0, 1],
    };
    const c = crossSectionPlaneCorners(frame, 25, 10);
    expect(c.origin).toEqual([-25, 0, -10]);
    expect(c.point1).toEqual([25, 0, -10]);
    expect(c.point2).toEqual([-25, 0, 10]);
  });

  it('follows a tilted / rotated frame', () => {
    const frame: CrossSectionFrame = {
      point: [5, 7], normal: [0, 1], tangent: [-1, 0],
      origin: [5, 7, 3], eU: [0, 1, 0], eV: [0, 0, 1],
    };
    const c = crossSectionPlaneCorners(frame, 2, 4);
    expect(c.origin).toEqual([5, 5, -1]);   // origin − 2·eU − 4·eV
    expect(c.point1).toEqual([5, 9, -1]);   // +2·eU
    expect(c.point2).toEqual([5, 5, 7]);    // +4·eV
  });
});
