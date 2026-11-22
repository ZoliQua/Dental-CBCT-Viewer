/**
 * Plan files are untrusted: numbers that drive allocations, loops or the
 * safety warnings are clamped to sane ranges, and implant fields are coerced.
 */

import { describe, it, expect } from 'vitest';
import { planFromObject } from '../src/core/planIO';

describe('planFromObject clamps hostile numbers', () => {
  it('bounds panoramic sizes, tilt and position', () => {
    const p = planFromObject({
      version: 1, panoramicResolution: 1e-9, panoramicSlabWidth: 1e9,
      crossSectionTiltDeg: 400, crossSectionPosition: -3,
    })!;
    expect(p.panoramicResolution).toBe(0.1);
    expect(p.panoramicSlabWidth).toBe(60);
    expect(p.crossSectionTiltDeg).toBe(30);
    expect(p.crossSectionPosition).toBe(0);
  });

  it('never lets a negative threshold switch the safety warnings off', () => {
    const p = planFromObject({ version: 1, safety: { nerveMm: -100, sinusMm: -1, neighborMm: -5, marginMm: -2 } })!;
    expect(p.safety.nerveMm).toBe(0);
    expect(p.safety.sinusMm).toBe(0);
    expect(p.safety.neighborMm).toBe(0);
    expect(p.safety.marginMm).toBe(0);
  });

  it('bounds the guide tessellation', () => {
    expect(planFromObject({ version: 1, guide: { segments: 1e8 } })!.guide.segments).toBe(128);
    expect(planFromObject({ version: 1, guide: { segments: 2.4 } })!.guide.segments).toBe(8);
  });

  it('drops arch points and anatomy far outside any scan', () => {
    const p = planFromObject({
      version: 1,
      archCurveControlPoints: [[1, 2], [1e15, 0], [3, 4]],
      anatomy: [{ id: 'a', radius: 1, points: [[0, 0, 1e12]] }, { id: 'b', radius: -1, points: [[0, 0, 0]] }],
    })!;
    expect(p.archCurveControlPoints).toEqual([[1, 2], [3, 4]]);
    expect(p.anatomy).toEqual([]);
  });

  it('coerces implant angles, sizes and the sleeve', () => {
    const p = planFromObject({
      version: 1,
      implants: [{
        id: 'i', position: [0, 0, 0], diameter: 500, length: 10,
        angleBLDeg: 'up', angleMDDeg: Number.NaN, name: 42,
        guided: { enabled: 'yes', sleeveOffset: -4, sleeveHeight: 5, drillLength: 1e6 },
      }],
    })!;
    const imp = p.implants[0];
    expect(imp.diameter).toBe(30);
    expect(imp.angleBLDeg).toBe(0);
    expect(imp.angleMDDeg).toBe(0);
    expect(imp.name).toBe('i');
    expect(imp.visible).toBe(true);
    expect(imp.guided).toEqual({ enabled: false, sleeveOffset: 0, sleeveHeight: 5, drillLength: 50 });
  });

  it('keeps an ordinary plan unchanged', () => {
    const p = planFromObject({
      version: 1, panoramicResolution: 0.3, panoramicSlabWidth: 20, crossSectionTiltDeg: -12,
      safety: { nerveMm: 2, sinusMm: 1, neighborMm: 3, marginMm: 1 },
    })!;
    expect(p.panoramicResolution).toBe(0.3);
    expect(p.crossSectionTiltDeg).toBe(-12);
    expect(p.safety.nerveMm).toBe(2);
  });
});
