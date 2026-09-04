/**
 * Drill-guide printability & safety validation.
 */

import { describe, it, expect } from 'vitest';
import { validateGuide, MIN_WALL_MM, type GuideCheckImplant } from '../src/core/guideValidate';
import { GUIDE_DEFAULTS, type GuideParams, type AnatomyMarker } from '../src/types/dicom';
import type { Vec3 } from '../src/core/implantGeometry';

// A well-spaced implant along +Z, entry at origin.
function implant(entry: Vec3, axis: Vec3 = [0, 0, 1]): GuideCheckImplant {
  return { entry, axis, length: 10, sleeveDiameter: 5, sleeveOffset: 9, sleeveHeight: 5 };
}

const params = (over: Partial<GuideParams> = {}): GuideParams => ({ ...GUIDE_DEFAULTS, ...over });

function marker(type: 'nerve' | 'sinus', points: Vec3[], radius = 1.5): AnatomyMarker {
  return { id: 't', name: type, visible: true, type, color: '#f00', radius, points };
}

describe('validateGuide', () => {
  it('passes a single well-spaced implant clear of anatomy', () => {
    const issues = validateGuide({ implants: [implant([0, 0, 0])], params: params() });
    expect(issues).toHaveLength(0);
  });

  it('warns on a thin housing wall', () => {
    const issues = validateGuide({ implants: [implant([0, 0, 0])], params: params({ wallMm: 0.5 }) });
    expect(issues.some((i) => i.code === 'thinWall' && i.severity === 'warning')).toBe(true);
  });

  it('warns when the drill channel is too narrow', () => {
    // sleeveWall so large the inner channel < MIN_DRILL_MM
    const issues = validateGuide({ implants: [implant([0, 0, 0])], params: params({ sleeveWallMm: 1.8 }) });
    expect(issues.some((i) => i.code === 'narrowChannel')).toBe(true);
  });

  it('flags two bores whose web is too thin', () => {
    // Two parallel drills 2 mm apart, each drill radius ~1.6 mm → they overlap.
    const issues = validateGuide({
      implants: [implant([0, 0, 0]), implant([2, 0, 0])],
      params: params(),
    });
    const bore = issues.find((i) => i.code === 'boresClose');
    expect(bore).toBeTruthy();
    expect(bore!.severity).toBe('error'); // negative gap = overlap
  });

  it('does not flag two well-separated bores', () => {
    const issues = validateGuide({
      implants: [implant([0, 0, 0]), implant([12, 0, 0])],
      params: params(),
    });
    expect(issues.some((i) => i.code === 'boresClose')).toBe(false);
  });

  it('errors when the drill path pierces the nerve below the apex', () => {
    // Nerve runs horizontally at z = 11 (1 mm past the 10 mm apex, within the
    // 2 mm overshoot) crossing the axis at x=0 → the drill hits it.
    const nerve = marker('nerve', [[-5, 0, 11], [5, 0, 11]], 1);
    const issues = validateGuide({
      implants: [implant([0, 0, 0])], params: params(), anatomy: [nerve],
    });
    const hit = issues.find((i) => i.code === 'drillNerve');
    expect(hit).toBeTruthy();
    expect(hit!.severity).toBe('error');
    // Errors sort before warnings.
    expect(issues[0].severity).toBe('error');
  });

  it('does not flag a nerve far from the drill path', () => {
    const nerve = marker('nerve', [[-5, 20, 11], [5, 20, 11]], 1); // 20 mm buccal
    const issues = validateGuide({
      implants: [implant([0, 0, 0])], params: params(), anatomy: [nerve],
    });
    expect(issues.some((i) => i.code === 'drillNerve')).toBe(false);
  });

  it('exposes the minimum-wall constant', () => {
    expect(MIN_WALL_MM).toBeGreaterThan(0);
  });
});
