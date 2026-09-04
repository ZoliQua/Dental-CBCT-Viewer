/**
 * Plan (case) persistence — serialize the full planning state to a portable
 * JSON file and validate it back. Pure, no Cornerstone (unit-testable).
 *
 * Coordinates are world mm tied to a specific volume, so the file records the
 * studyInstanceUID; loading onto a different scan should be confirmed first.
 */

import type { ImplantData, AnatomyMarker, MeasurementLayer, ProjectionMode, GuideParams } from '@/types/dicom';
import { GUIDE_DEFAULTS } from '@/types/dicom';
import type { ReportFields, DisplayConfig } from '@/context/ViewerContext';
import { DISPLAY_DEFAULTS } from '@/context/ViewerContext';

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
  display: DisplayConfig;
}

export interface PlanFile extends PlanData {
  version: number;
  savedAt: string;
  studyInstanceUID: string | null;
  patientId: string | null;
}

/**
 * Result of planFromObject: the validated plan plus the studyInstanceUID it was
 * recorded against, so the caller can detect a study mismatch before applying.
 * Optional so plain PlanData values (e.g. imperative-handle loads) remain
 * assignable to it.
 */
export interface ParsedPlan extends PlanData {
  studyInstanceUID?: string | null;
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
    display: s.display,
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
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);

// ── Array shape validation (untrusted plan files) ─────────────
// Cap list sizes so a crafted file cannot exhaust memory, and drop entries
// whose coordinates/sizes are not finite numbers (they would corrupt geometry).

const MAX_IMPLANTS = 100;
const MAX_MEASUREMENTS = 500;
const MAX_ANATOMY = 50;
const MAX_ANATOMY_POINTS = 2000;
const MAX_ARCH_POINTS = 200;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isNumTuple = (v: unknown, n: number): boolean => Array.isArray(v) && v.length === n && v.every(isFiniteNum);

function validateImplants(v: unknown): ImplantData[] {
  if (!Array.isArray(v)) return [];
  return v.filter((i): i is ImplantData =>
    isObj(i) && typeof i.id === 'string' && isNumTuple(i.position, 3)
    && isFiniteNum(i.diameter) && isFiniteNum(i.length)).slice(0, MAX_IMPLANTS);
}

function validateAnatomy(v: unknown): AnatomyMarker[] {
  if (!Array.isArray(v)) return [];
  return v.filter((a): a is AnatomyMarker =>
    isObj(a) && typeof a.id === 'string' && isFiniteNum(a.radius)
    && Array.isArray(a.points) && a.points.length <= MAX_ANATOMY_POINTS
    && a.points.every(p => isNumTuple(p, 3))).slice(0, MAX_ANATOMY);
}

function validateMeasurements(v: unknown): MeasurementLayer[] {
  if (!Array.isArray(v)) return [];
  return v.filter((m): m is MeasurementLayer =>
    isObj(m) && typeof m.id === 'string'
    && (m.points === undefined || (Array.isArray(m.points) && m.points.every(p => isNumTuple(p, 2))))
  ).slice(0, MAX_MEASUREMENTS);
}

function validateArchCurve(v: unknown): [number, number][] | null {
  if (!Array.isArray(v)) return null;
  return v.filter(p => isNumTuple(p, 2)).slice(0, MAX_ARCH_POINTS) as [number, number][];
}

/** Validate + coerce a parsed JSON object into PlanData (best-effort). */
export function planFromObject(obj: any): ParsedPlan | null {
  if (!obj || typeof obj !== 'object' || typeof obj.version !== 'number') return null;
  const s = obj.safety ?? {};
  const g = obj.guide ?? {};
  const wl = obj.windowLevel ?? {};
  const r = obj.report ?? {};
  const d2 = obj.display ?? {};
  return {
    studyInstanceUID: typeof obj.studyInstanceUID === 'string' ? obj.studyInstanceUID : null,
    implants: validateImplants(obj.implants),
    anatomy: validateAnatomy(obj.anatomy),
    measurements: validateMeasurements(obj.measurements),
    archCurveControlPoints: validateArchCurve(obj.archCurveControlPoints),
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
      sleeveSeat: typeof g.sleeveSeat === 'boolean' ? g.sleeveSeat : GUIDE_DEFAULTS.sleeveSeat,
      seatClearanceMm: num(g.seatClearanceMm, GUIDE_DEFAULTS.seatClearanceMm),
      sleeveWallMm: num(g.sleeveWallMm, GUIDE_DEFAULTS.sleeveWallMm),
    },
    windowLevel: { wc: num(wl.wc, 300), ww: num(wl.ww, 2500) },
    report: {
      patientName: str(r.patientName, ''),
      patientAge: str(r.patientAge, ''),
      patientBirthDate: str(r.patientBirthDate, ''),
      quoteNumber: str(r.quoteNumber, ''),
      statusDescription: str(r.statusDescription, ''),
      clinic: str(r.clinic, ''),
      studyDate: str(r.studyDate, ''),
      seriesName: str(r.seriesName, ''),
    },
    display: {
      showName: bool(d2.showName, DISPLAY_DEFAULTS.showName),
      showBirth: bool(d2.showBirth, DISPLAY_DEFAULTS.showBirth),
      showDate: bool(d2.showDate, DISPLAY_DEFAULTS.showDate),
      showClinic: bool(d2.showClinic, DISPLAY_DEFAULTS.showClinic),
      labelColor: str(d2.labelColor, DISPLAY_DEFAULTS.labelColor),
      labelSizeMain: num(d2.labelSizeMain, num(d2.labelSize, DISPLAY_DEFAULTS.labelSizeMain)),
      labelSizeSide: num(d2.labelSizeSide, DISPLAY_DEFAULTS.labelSizeSide),
      labelAlign: d2.labelAlign === 'left' || d2.labelAlign === 'right' ? d2.labelAlign : 'center',
      showSeries: bool(d2.showSeries, DISPLAY_DEFAULTS.showSeries),
      showModality: bool(d2.showModality, DISPLAY_DEFAULTS.showModality),
      showSlice: bool(d2.showSlice, DISPLAY_DEFAULTS.showSlice),
      scope: d2.scope === 'main' ? 'main' : 'all',
      sliceOpacity: num(d2.sliceOpacity, DISPLAY_DEFAULTS.sliceOpacity),
      preset3d: str(d2.preset3d, DISPLAY_DEFAULTS.preset3d),
      quality3d: d2.quality3d === 'low' || d2.quality3d === 'high' ? d2.quality3d : DISPLAY_DEFAULTS.quality3d,
      colormap3d: (['grayscale', 'cool', 'warm', 'spectral', 'inverted'] as string[]).includes(d2.colormap3d)
        ? (d2.colormap3d as DisplayConfig['colormap3d'])
        : DISPLAY_DEFAULTS.colormap3d,
    },
  };
}
