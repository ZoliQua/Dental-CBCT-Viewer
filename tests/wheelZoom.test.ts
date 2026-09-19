import { describe, it, expect } from 'vitest';
import { nextWheelZoom, WHEEL_ZOOM_MIN, WHEEL_ZOOM_MAX } from '../src/core/wheelZoom';

describe('nextWheelZoom', () => {
  it('wheel up zooms in, wheel down zooms out', () => {
    expect(nextWheelZoom(1, -100)).toBeGreaterThan(1);
    expect(nextWheelZoom(1, 100)).toBeLessThan(1);
  });

  it('is symmetric: in then out by the same delta returns to the start', () => {
    expect(nextWheelZoom(nextWheelZoom(1.7, -120), 120)).toBeCloseTo(1.7, 10);
  });

  it('many small trackpad deltas equal one large notch', () => {
    let z = 1;
    for (let i = 0; i < 10; i++) z = nextWheelZoom(z, -10);
    expect(z).toBeCloseTo(nextWheelZoom(1, -100), 10);
  });

  it('normalises line and page delta modes to pixels', () => {
    expect(nextWheelZoom(1, -1, 1)).toBeCloseTo(nextWheelZoom(1, -16, 0), 10);
    expect(nextWheelZoom(1, 0.1, 2)).toBeCloseTo(nextWheelZoom(1, 80, 0), 10);
  });

  it('clamps to the allowed range', () => {
    expect(nextWheelZoom(9.9, -100000)).toBe(WHEEL_ZOOM_MAX);
    expect(nextWheelZoom(0.3, 100000)).toBe(WHEEL_ZOOM_MIN);
  });

  it('recovers from a nonsensical current zoom', () => {
    expect(nextWheelZoom(0, -100)).toBe(1);
    expect(nextWheelZoom(Number.NaN, -100)).toBe(1);
  });
});
