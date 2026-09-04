/**
 * Drill-guide printability & safety validation — pure, no WASM/vtk, so it runs
 * before the (heavy) CSG build and is unit-testable. Catches problems a printed
 * guide would otherwise hide:
 *
 *  - walls thinner than the printer can reliably reproduce
 *  - a drill channel too narrow for the guided drill
 *  - two drill bores so close the web between them is fragile
 *  - a drill path (which overshoots past the implant apex) that collides with a
 *    marked nerve / sinus even when the implant body itself clears it
 *
 * The drill-path check is the guide-specific one: `evaluateImplant` (safety.ts)
 * checks the implant body, but the guide drills DEEPER than the implant, so the
 * bur can reach anatomy the implant misses.
 */

import type { Vec3 } from './implantGeometry';
import { distSegmentToPolyline3 } from './safety';
import type { GuideParams, AnatomyMarker } from '@/types/dicom';

/** Minimum printable wall thickness (mm) for a typical SLA/DLP dental resin. */
export const MIN_WALL_MM = 1.0;
/** Smallest sensible guided-drill diameter (mm). */
export const MIN_DRILL_MM = 1.8;
/** Extra depth (mm) the drill travels past the implant apex. */
export const DRILL_OVERSHOOT_MM = 2;

export interface GuideCheckImplant {
  entry: Vec3;
  /** Unit axis, entry → apex. */
  axis: Vec3;
  length: number;
  sleeveDiameter: number;
  sleeveOffset: number;
  sleeveHeight: number;
}

export interface GuideCheckInput {
  implants: GuideCheckImplant[];
  params: GuideParams;
  /** Marked anatomy (world polylines with a safety radius). */
  anatomy?: AnatomyMarker[];
  /** Clearance thresholds (mm). */
  thresholds?: { nerve: number; sinus: number };
}

export type GuideIssueSeverity = 'error' | 'warning';

export interface GuideIssue {
  /** i18n key suffix: guideCheck.<code> */
  code: string;
  severity: GuideIssueSeverity;
  /** Human-readable measured detail (already formatted), e.g. "0.6 mm". */
  detail?: string;
}

const f1 = (x: number) => (Math.round(x * 10) / 10).toFixed(1);
const at = (imp: GuideCheckImplant, t: number): Vec3 => [
  imp.entry[0] + imp.axis[0] * t,
  imp.entry[1] + imp.axis[1] * t,
  imp.entry[2] + imp.axis[2] * t,
];

/** Inner drill-channel radius for an implant, honouring the sleeve-seat mode. */
function drillRadius(imp: GuideCheckImplant, params: GuideParams): number {
  if (params.sleeveSeat) {
    const innerD = Math.max(0.5, imp.sleeveDiameter - 2 * params.sleeveWallMm);
    return innerD / 2 + params.channelTolMm;
  }
  return (imp.sleeveDiameter + params.channelTolMm) / 2;
}

/**
 * Validate a guide plan. Returns issues sorted errors-first; an empty array
 * means no problem was detected (not a guarantee of clinical fitness).
 */
export function validateGuide(input: GuideCheckInput): GuideIssue[] {
  const { implants, params } = input;
  const thr = input.thresholds ?? { nerve: 2, sinus: 1 };
  const issues: GuideIssue[] = [];

  // 1. Housing wall thickness (radial resin around each sleeve seat).
  if (params.wallMm < MIN_WALL_MM) {
    issues.push({ code: 'thinWall', severity: 'warning', detail: `${f1(params.wallMm)} mm` });
  }

  // 2. Drill channel wide enough for a real bur.
  for (const imp of implants) {
    const d = drillRadius(imp, params) * 2;
    if (d < MIN_DRILL_MM) {
      issues.push({ code: 'narrowChannel', severity: 'warning', detail: `${f1(d)} mm` });
      break; // one note is enough
    }
  }

  // 3. Web between two adjacent drill bores. Each drill runs entry → apex (+
  //    overshoot); if the gap between two such cylinders is below MIN_WALL_MM
  //    the printed wall between the channels is fragile.
  for (let i = 0; i < implants.length; i++) {
    for (let j = i + 1; j < implants.length; j++) {
      const A = implants[i], B = implants[j];
      const aTip = at(A, A.length + DRILL_OVERSHOOT_MM);
      const bTip = at(B, B.length + DRILL_OVERSHOOT_MM);
      const gap = distSegmentToPolyline3(A.entry, aTip, [B.entry, bTip])
        - drillRadius(A, params) - drillRadius(B, params);
      if (gap < MIN_WALL_MM) {
        issues.push({ code: 'boresClose', severity: gap < 0 ? 'error' : 'warning', detail: `${f1(Math.max(0, gap))} mm` });
      }
    }
  }

  // 4. Drill-path collision with marked anatomy (drill overshoots the apex).
  const markers = (input.anatomy ?? []).filter((m) => m.points.length > 0);
  for (const imp of implants) {
    const tip = at(imp, imp.length + DRILL_OVERSHOOT_MM);
    const dr = drillRadius(imp, params);
    for (const m of markers) {
      const clearance = distSegmentToPolyline3(imp.entry, tip, m.points) - m.radius - dr;
      const limit = m.type === 'nerve' ? thr.nerve : thr.sinus;
      if (clearance < limit) {
        issues.push({
          code: m.type === 'nerve' ? 'drillNerve' : 'drillSinus',
          severity: clearance < 0 ? 'error' : 'warning',
          detail: `${f1(clearance)} mm`,
        });
      }
    }
  }

  // Errors first, then warnings; stable within a severity.
  return issues.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1));
}
