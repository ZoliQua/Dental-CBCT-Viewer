/**
 * How far the registration can be off *where it matters* — pure math, no
 * Cornerstone/vtk (unit-testable).
 *
 * The registration panel can already show the residual at each landmark pair:
 * the fiducial registration error, FRE. It is the obvious number and it is the
 * wrong one. Fitzpatrick, West & Maurer (IEEE TMI 17(5), 1998) showed that FRE
 * is essentially uncorrelated with the error at a target away from the markers
 * — the quantity a surgeon actually cares about, the target registration error
 * or TRE. A constellation of beads clustered on one side of the arch can fit
 * with a beautiful 0.1 mm residual and still be over a millimetre out at a
 * molar on the far side, because the markers pin down translation well and the
 * rotation about them hardly at all. Nothing in the fit announces this.
 *
 * Their result also gives a closed form for it, which is what this module
 * implements:
 *
 *   FLE² ≈ FRE² / (1 − 2/N)                        (localisation error per point)
 *   TRE²(r) ≈ (FLE²/N) · (1 + ⅓ · Σₖ dₖ²/fₖ²)       (error at the target r)
 *
 * where dₖ is the target's distance from the k-th principal axis of the marker
 * cloud and fₖ the RMS distance of the markers from that same axis. The ratio
 * is what carries the geometry: a target far from an axis the markers sit
 * close to is a target held only by a long lever arm.
 *
 * These are expectations over many registrations, not a bound on this one. They
 * are worth reporting because the failure they predict — a confident fit that
 * is wrong far from the markers — is invisible otherwise, and because the
 * useful part is comparative: it says *which* target is poorly held and that
 * moving a marker would help.
 */

import type { Vec3 } from './implantGeometry';
import { jacobiEigenSymmetric } from './registration';

/**
 * A marker cloud reduced to what the TRE formula needs: where it sits and how
 * it is spread about each of its own principal axes.
 */
export interface FiducialSpread {
  /** How many markers the fit used. */
  count: number;
  centroid: Vec3;
  /** Principal axes of the marker cloud, unit length. */
  axes: [Vec3, Vec3, Vec3];
  /** RMS distance of the markers from each principal axis, mm. */
  axisRms: [number, number, number];
}

/**
 * Below this an axis counts as having no spread at all: the markers are
 * collinear (or coincident) and rotation about that line is unconstrained.
 */
const DEGENERATE_MM = 1e-3;

/**
 * Floor on the estimated localisation error. Three points can happen to fit a
 * rigid transform almost exactly, which drives the FRE — and with it the whole
 * estimate — to zero and would report a perfect registration from a fluke.
 * Nobody picks a cusp tip, or centres a bead, better than this, so the floor
 * keeps the estimate from claiming they did. It bounds the *estimate*; it is
 * not a measurement of this operator or this scanner.
 */
export const MIN_FLE_MM = 0.1;

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Squared distance of `q` (already relative to the centroid) from a unit axis. */
function sqDistToAxis(q: Vec3, axis: Vec3): number {
  const along = dot(q, axis);
  // Clamped: with near-degenerate input this can come out a hair below zero.
  return Math.max(0, dot(q, q) - along * along);
}

/**
 * Reduce a marker cloud to its centroid, principal axes and per-axis spread.
 * Returns null below three markers, where a rigid fit has nothing to spare and
 * the error model does not apply.
 */
export function fiducialSpread(points: Vec3[]): FiducialSpread | null {
  const n = points.length;
  if (n < 3) return null;

  const centroid: Vec3 = [0, 0, 0];
  for (const p of points) { centroid[0] += p[0]; centroid[1] += p[1]; centroid[2] += p[2]; }
  centroid[0] /= n; centroid[1] /= n; centroid[2] /= n;

  const rel = points.map((p) => sub(p, centroid));
  const cov = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const q of rel) {
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) cov[r][c] += q[r] * q[c];
  }
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) cov[r][c] /= n;

  const { vectors } = jacobiEigenSymmetric(cov, 3);
  const axes = [0, 1, 2].map((c) => {
    const v: Vec3 = [vectors[0][c], vectors[1][c], vectors[2][c]];
    const len = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / len, v[1] / len, v[2] / len] as Vec3;
  }) as [Vec3, Vec3, Vec3];

  const axisRms = axes.map((axis) => {
    let sum = 0;
    for (const q of rel) sum += sqDistToAxis(q, axis);
    return Math.sqrt(sum / n);
  }) as [number, number, number];

  return { count: n, centroid, axes, axisRms };
}

/**
 * Per-marker localisation error implied by the observed fit residual.
 *
 * A rigid fit absorbs part of every click error, so the residual it leaves
 * understates how badly each point was placed — by a factor that depends only
 * on how many points shared the work.
 */
export function estimateFle(freMm: number, count: number): number {
  if (!Number.isFinite(freMm) || freMm < 0 || count < 3) return MIN_FLE_MM;
  return Math.max(MIN_FLE_MM, freMm / Math.sqrt(1 - 2 / count));
}

/**
 * Expected registration error at a world point, in mm.
 *
 * Infinite when the markers are collinear and the target is off that line:
 * that is not a numerical accident but the honest answer, since nothing in the
 * fit determines rotation about the line the markers lie on.
 */
export function predictTre(target: Vec3, spread: FiducialSpread, fleMm: number): number {
  const q = sub(target, spread.centroid);
  let sum = 0;
  for (let k = 0; k < 3; k++) {
    const sqDist = sqDistToAxis(q, spread.axes[k]);
    const f = spread.axisRms[k];
    if (f < DEGENERATE_MM) {
      // No spread about this axis. A target on it is still held; anything off
      // it is held by nothing.
      if (sqDist > DEGENERATE_MM * DEGENERATE_MM) return Infinity;
      continue;
    }
    sum += sqDist / (f * f);
  }
  return Math.sqrt((fleMm * fleMm / spread.count) * (1 + sum / 3));
}

/** One target's predicted error, carried with whatever named it. */
export interface TargetError<T = string> {
  target: T;
  treMm: number;
}

export interface RegistrationAccuracy<T = string> {
  /** Localisation error per marker implied by the residual, mm. */
  fleMm: number;
  /** Predicted error at each target, worst first. */
  targets: TargetError<T>[];
  /** The worst predicted error, or null when there was nothing to evaluate. */
  worstMm: number | null;
  /** True when the markers are collinear, so rotation about that line is free. */
  degenerate: boolean;
}

/**
 * Predict the error at every target of a registration in one call: the shape
 * the UI wants, since it reports the worst case and names which target it is.
 */
export function registrationAccuracy<T = string>(
  fiducials: Vec3[],
  freMm: number,
  targets: { target: T; point: Vec3 }[],
): RegistrationAccuracy<T> | null {
  const spread = fiducialSpread(fiducials);
  if (!spread) return null;
  const fleMm = estimateFle(freMm, spread.count);
  const out = targets
    .map(({ target, point }) => ({ target, treMm: predictTre(point, spread, fleMm) }))
    .sort((a, b) => b.treMm - a.treMm);
  return {
    fleMm,
    targets: out,
    worstMm: out.length ? out[0].treMm : null,
    degenerate: spread.axisRms.some((f) => f < DEGENERATE_MM),
  };
}
