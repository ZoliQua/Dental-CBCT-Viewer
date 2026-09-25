/**
 * Guessing the arch from a scan's file name. This is the "pairing" step the
 * user sees first — get it wrong and both arches land in the same slot — so the
 * naming conventions of the common exporters are pinned down here.
 */

import { describe, it, expect } from 'vitest';
import { detectScanType, isIoScan, SCAN_TYPES, SCAN_DEFAULTS } from '../src/types/dicom';

describe('detectScanType', () => {
  it('recognises the upper arch across exporters and languages', () => {
    for (const name of [
      '2026-09-18_100_001-UpperJaw.stl',
      'patient_maxilla.ply',
      'Oberkiefer-scan.obj',
      'felso_allcsont.stl',
      'case12_U.stl',
    ]) expect(detectScanType(name)).toBe('upperJaw');
  });

  it('recognises the lower arch across exporters and languages', () => {
    for (const name of [
      '2026-09-18_100_001-LowerJaw.stl',
      'patient_mandibular.ply',
      'Unterkiefer.obj',
      'also_allcsont.stl',
      'case12_L.stl',
    ]) expect(detectScanType(name)).toBe('lowerJaw');
  });

  it('does not read an arch out of an ordinary English word', () => {
    // "also" is the Hungarian "lower" without its accent, but only as a word.
    expect(detectScanType('scan_alsofinal.stl')).toBe('oral');
    expect(detectScanType('unsorted.stl')).toBe('oral');
  });

  it('classifies the other scan kinds', () => {
    expect(detectScanType('buccal_bite_left.stl')).toBe('bite');
    expect(detectScanType('waxup_setup.ply')).toBe('toothSetup');
    expect(detectScanType('antagonist.stl')).toBe('antagonist');
  });

  it('falls back to a generic oral scan when nothing matches', () => {
    expect(detectScanType('model.stl')).toBe('oral');
    expect(detectScanType('')).toBe('oral');
  });

  it('only counts the two arches as intraoral-scan layers', () => {
    expect(isIoScan('upperJaw')).toBe(true);
    expect(isIoScan('lowerJaw')).toBe(true);
    for (const t of ['oral', 'bite', 'antagonist', 'toothSetup'] as const) expect(isIoScan(t)).toBe(false);
  });

  it('gives every scan type a default colour and opacity', () => {
    for (const t of SCAN_TYPES) {
      expect(SCAN_DEFAULTS[t].color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(SCAN_DEFAULTS[t].opacity).toBeGreaterThan(0);
      expect(SCAN_DEFAULTS[t].opacity).toBeLessThanOrEqual(1);
    }
  });

  it('always returns a type that the Layers dropdown can offer', () => {
    for (const name of ['UpperJaw.stl', 'x.ply', 'bite.obj']) {
      expect(SCAN_TYPES).toContain(detectScanType(name));
    }
  });
});
