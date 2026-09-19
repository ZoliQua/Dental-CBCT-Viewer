/**
 * Mouse-wheel zoom for the 3D view. Cornerstone's ZoomTool has no wheel handler
 * (only drag), so a Wheel binding on it does nothing — the 3D viewport installs
 * its own listener and uses this to compute the next zoom. Pure → unit-testable.
 */

export const WHEEL_ZOOM_MIN = 0.2;
export const WHEEL_ZOOM_MAX = 10;
/** Zoom change per pixel of wheel delta (a mouse notch ≈ 100 px → ~14 %). */
const SENSITIVITY = 0.0015;
/** Pixels per line / page when the browser reports the delta in those units. */
const LINE_PX = 16;
const PAGE_PX = 800;

/**
 * Next zoom for a wheel event. Exponential in the delta so a trackpad's many
 * small deltas and a mouse's few large notches zoom at the same overall rate,
 * and zooming in then out by the same amount returns to the start. Wheel up
 * (negative deltaY) zooms in. Clamped to [WHEEL_ZOOM_MIN, WHEEL_ZOOM_MAX].
 */
export function nextWheelZoom(current: number, deltaY: number, deltaMode = 0): number {
  if (!Number.isFinite(current) || current <= 0) return 1;
  const px = deltaMode === 1 ? deltaY * LINE_PX : deltaMode === 2 ? deltaY * PAGE_PX : deltaY;
  const next = current * Math.exp(-px * SENSITIVITY);
  return Math.min(WHEEL_ZOOM_MAX, Math.max(WHEEL_ZOOM_MIN, next));
}
