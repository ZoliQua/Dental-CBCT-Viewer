/**
 * Plan (case) persistence — serialize the full planning state to a portable
 * JSON file and validate it back. Pure, no Cornerstone (unit-testable).
 *
 * Coordinates are world mm tied to a specific volume, so the file records the
 * studyInstanceUID; loading onto a different scan should be confirmed first.
 */

import type { ImplantData, AnatomyMarker, MeasurementLayer, ProjectionMode, GuideParams } from '@/types/dicom';
import { GUIDE_DEFAULTS } from '@/types/dicom';
import type { ReportFields } from '@/context/ViewerContext';

export const PLAN_VERSION = 1;

/** The persistable slices of the viewer state. */
export interface PlanData {
  implants: ImplantData[];
  anatomy: AnatomyMarker[];
  measurements: MeasurementLayer[];
  archCurveControlPoints: [number, number][] | null;
  crossSectionPosition: number;
  crossSectionTiltDeg: number;
  panoramicSlabWidth: number;
  panoramicProjection: ProjectionMode;
  panoramicResolution: number;
  safety: { marginMm: number; color: string; nerveMm: number; sinusMm: number; neighborMm: number };
  guide: GuideParams;
  windowLevel: { wc: number; ww: number };
  report: ReportFields;
}

export interface PlanFile extends PlanData {
  version: number;
  savedAt: string;
  studyInstanceUID: string | null;
  patientId: string | null;
}

/** Pull the persistable slices out of a state-like object. */
export function extractPlan(s: PlanData): PlanData {
  return {
    implants: s.implants,
    anatomy: s.anatomy,
    measurements: s.measurements,
    archCurveControlPoints: s.archCurveControlPoints,
    crossSectionPosition: s.crossSectionPosition,
    crossSectionTiltDeg: s.crossSectionTiltDeg,
    panoramicSlabWidth: s.panoramicSlabWidth,
    panoramicProjection: s.panoramicProjection,
    panoramicResolution: s.panoramicResolution,
    safety: s.safety,
    guide: s.guide,
    windowLevel: s.windowLevel,
    report: s.report,
  };
}

export function serializePlan(
  s: PlanData,
  meta: { savedAt: string; studyInstanceUID: string | null; patientId: string | null },
): PlanFile {
  return { version: PLAN_VERSION, ...meta, ...extractPlan(s) };
}

const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const str = (v: unknown, fallback: string): string => (typeof v === 'string' ? v : fallback);

/** Validate + coerce a parsed JSON object into PlanData (best-effort). */
export function planFromObject(obj: any): PlanData | null {
  if (!obj || typeof obj !== 'object' || typeof obj.version !== 'number') return null;
  const s = obj.safety ?? {};
  const g = obj.guide ?? {};
  const wl = obj.windowLevel ?? {};
  const r = obj.report ?? {};
  return {
    implants: Array.isArray(obj.implants) ? obj.implants : [],
    anatomy: Array.isArray(obj.anatomy) ? obj.anatomy : [],
    measurements: Array.isArray(obj.measurements) ? obj.measurements : [],
    archCurveControlPoints: Array.isArray(obj.archCurveControlPoints) ? obj.archCurveControlPoints : null,
    crossSectionPosition: num(obj.crossSectionPosition, 0.5),
    crossSectionTiltDeg: num(obj.crossSectionTiltDeg, 0),
    panoramicSlabWidth: num(obj.panoramicSlabWidth, 20),
    panoramicProjection: obj.panoramicProjection === 'MIP' ? 'MIP' : 'AVG',
    panoramicResolution: num(obj.panoramicResolution, 0.3),
    safety: {
      marginMm: num(s.marginMm, 1),
      color: str(s.color, '#ff3c3c'),
      nerveMm: num(s.nerveMm, 2),
      sinusMm: num(s.sinusMm, 1),
      neighborMm: num(s.neighborMm, 3),
    },
    guide: {
      wallMm: num(g.wallMm, GUIDE_DEFAULTS.wallMm),
      baseWidthMm: num(g.baseWidthMm, GUIDE_DEFAULTS.baseWidthMm),
      baseHeightMm: num(g.baseHeightMm, GUIDE_DEFAULTS.baseHeightMm),
      channelTolMm: num(g.channelTolMm, GUIDE_DEFAULTS.channelTolMm),
      segments: num(g.segments, GUIDE_DEFAULTS.segments),
    },
    windowLevel: { wc: num(wl.wc, 300), ww: num(wl.ww, 2500) },
    report: {
      patientName: str(r.patientName, ''),
      patientAge: str(r.patientAge, ''),
      quoteNumber: str(r.quoteNumber, ''),
      statusDescription: str(r.statusDescription, ''),
    },
  };
}
