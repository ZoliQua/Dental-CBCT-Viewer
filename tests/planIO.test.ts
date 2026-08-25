/**
 * Plan persistence: serialize → JSON round-trip → validate restores every slice,
 * and planFromObject coerces bad input to safe defaults.
 */

import { describe, it, expect } from 'vitest';
import { serializePlan, planFromObject, extractPlan, PLAN_VERSION, type PlanData } from '../src/core/planIO';

const sample: PlanData = {
  implants: [
    { id: 'i1', name: 'Implant 1', visible: true, position: [10, 20, -5], diameter: 4.2, length: 11.5,
      angleBLDeg: 180, angleMDDeg: -10, systemId: 'alphabio-multineo-cs',
      guided: { enabled: true, sleeveOffset: 9, sleeveHeight: 5, drillLength: 11.5 } },
  ],
  anatomy: [
    { id: 'n1', name: 'Nerve 1', visible: true, type: 'nerve', color: '#ff5577', radius: 1.5,
      points: [[0, 0, 0], [10, 1, -2]] },
  ],
  measurements: [
    { id: 'm1', kind: 'canvas', tool: 'length', name: 'Length 1', visible: true, viewport: 'panoramic',
      points: [[0.1, 0.2], [0.3, 0.4]], value: '12.3 mm' },
  ],
  archCurveControlPoints: [[1, 2], [3, 4], [5, 6]],
  crossSectionPosition: 0.42,
  crossSectionTiltDeg: -3,
  panoramicSlabWidth: 25,
  panoramicProjection: 'MIP',
  panoramicResolution: 0.15,
  safety: { marginMm: 1.5, color: '#00ff00', nerveMm: 2, sinusMm: 1, neighborMm: 3 },
  guide: { wallMm: 1.5, baseWidthMm: 5, baseHeightMm: 4, channelTolMm: 0.1, segments: 48 },
  windowLevel: { wc: 749, ww: 3439 },
  report: { patientName: 'Teszt', patientAge: '45', quoteNumber: 'Q-7', statusDescription: 'felső 6-os' },
};

describe('serializePlan / planFromObject round-trip', () => {
  it('preserves every slice through JSON', () => {
    const file = serializePlan(sample, { savedAt: '2026-06-24T10:00:00Z', studyInstanceUID: 'S1', patientId: 'P1' });
    expect(file.version).toBe(PLAN_VERSION);
    expect(file.studyInstanceUID).toBe('S1');
    const restored = planFromObject(JSON.parse(JSON.stringify(file)));
    expect(restored).toEqual(extractPlan(sample));
  });
});

describe('planFromObject validation', () => {
  it('rejects non-objects and version-less input', () => {
    expect(planFromObject(null)).toBeNull();
    expect(planFromObject({})).toBeNull();
    expect(planFromObject({ implants: [] })).toBeNull(); // no version
  });

  it('fills defaults for a minimal/partial file', () => {
    const r = planFromObject({ version: 1 })!;
    expect(r.implants).toEqual([]);
    expect(r.anatomy).toEqual([]);
    expect(r.archCurveControlPoints).toBeNull();
    expect(r.panoramicProjection).toBe('AVG');
    expect(r.safety).toEqual({ marginMm: 1, color: '#ff3c3c', nerveMm: 2, sinusMm: 1, neighborMm: 3 });
    expect(r.guide).toEqual({ wallMm: 1.5, baseWidthMm: 5, baseHeightMm: 4, channelTolMm: 0.1, segments: 48 });
    expect(r.windowLevel).toEqual({ wc: 300, ww: 2500 });
    expect(r.report.patientName).toBe('');
  });

  it('coerces bad numeric fields to defaults', () => {
    const r = planFromObject({ version: 1, crossSectionPosition: 'x', panoramicResolution: null })!;
    expect(r.crossSectionPosition).toBe(0.5);
    expect(r.panoramicResolution).toBe(0.3);
  });
});
