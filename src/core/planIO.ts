/**
 * Plan (case) persistence — serialize the full planning state to a portable
 * JSON file and validate it back. Pure, no Cornerstone (unit-testable).
 *
 * Coordinates are world mm tied to a specific volume, so the file records the
 * studyInstanceUID; loading onto a different scan should be confirmed first.
 */

import type { ImplantData, AnatomyMarker, MeasurementLayer, ProjectionMode, GuideParams, GuidedPlan, ScanMesh, ScanType } from '@/types/dicom';
import { GUIDE_DEFAULTS, SCAN_TYPES, SCAN_DEFAULTS } from '@/types/dicom';
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
  /**
   * Imported surface scans — descriptors only. The mesh itself is megabytes
   * and stays in memory, but the transform is the expensive part to recreate:
   * it is the registration, minutes of landmark picking. Saving it means a
   * reopened plan needs the file back, not the work.
   */
  scans: ScanMesh[];
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
    scans: s.scans,
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
/**
 * A finite number inside [lo, hi] (clamped), else the fallback. Plan files are
 * untrusted: sizes such as the panoramic resolution or slab width drive
 * allocations and loops, so an absurd value must not reach them — and a
 * negative safety threshold would silently switch the clearance warnings off.
 */
const clamp = (v: unknown, fallback: number, lo: number, hi: number): number =>
  (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback);

// ── Array shape validation (untrusted plan files) ─────────────
// Cap list sizes so a crafted file cannot exhaust memory, and drop entries
// whose coordinates/sizes are not finite numbers (they would corrupt geometry).

/** Largest plan file the UI reads (a real plan is well under 1 MB). */
export const MAX_PLAN_FILE_BYTES = 20 * 1024 * 1024;

const MAX_IMPLANTS = 100;
const MAX_MEASUREMENTS = 500;
const MAX_ANATOMY = 50;
const MAX_ANATOMY_POINTS = 2000;
const MAX_ARCH_POINTS = 200;
const MAX_SCANS = 20;
const MAX_PROFILE_SAMPLES = 512;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isNumTuple = (v: unknown, n: number): boolean => Array.isArray(v) && v.length === n && v.every(isFiniteNum);

/** World coordinates beyond this (mm) cannot belong to a dental scan. */
const MAX_COORD_MM = 10_000;
const inRange = (p: unknown, n: number): boolean =>
  isNumTuple(p, n) && (p as number[]).every((x) => Math.abs(x) <= MAX_COORD_MM);

function validateGuided(v: unknown): GuidedPlan | undefined {
  if (!isObj(v)) return undefined;
  return {
    enabled: bool(v.enabled, false),
    sleeveOffset: clamp(v.sleeveOffset, 9, 0, 50),
    sleeveHeight: clamp(v.sleeveHeight, 5, 0, 30),
    drillLength: clamp(v.drillLength, 10, 0, 50),
  };
}

function validateImplants(v: unknown): ImplantData[] {
  if (!Array.isArray(v)) return [];
  const out: ImplantData[] = [];
  for (const i of v) {
    if (!isObj(i) || typeof i.id !== 'string' || !inRange(i.position, 3)) continue;
    if (!isFiniteNum(i.diameter) || !isFiniteNum(i.length)) continue;
    // Angles, sizes and the sleeve feed the geometry of every view and the
    // printable guide: coerce them rather than let NaN or a string through.
    const imp: ImplantData = {
      ...(i as unknown as ImplantData),
      name: str(i.name, i.id),
      visible: bool(i.visible, true),
      diameter: clamp(i.diameter, 4, 1, 30),
      length: clamp(i.length, 10, 1, 40),
      angleBLDeg: clamp(i.angleBLDeg, 0, -180, 180),
      angleMDDeg: clamp(i.angleMDDeg, 0, -90, 90),
      systemId: typeof i.systemId === 'string' ? i.systemId : undefined,
      guided: validateGuided(i.guided),
    };
    if (!imp.systemId) delete imp.systemId;
    if (!imp.guided) delete imp.guided;
    out.push(imp);
    if (out.length >= MAX_IMPLANTS) break;
  }
  return out;
}

function validateAnatomy(v: unknown): AnatomyMarker[] {
  if (!Array.isArray(v)) return [];
  return v.filter((a): a is AnatomyMarker =>
    isObj(a) && typeof a.id === 'string' && isFiniteNum(a.radius) && a.radius > 0 && a.radius <= 20
    && Array.isArray(a.points) && a.points.length <= MAX_ANATOMY_POINTS
    && a.points.every(p => inRange(p, 3))).slice(0, MAX_ANATOMY);
}

function validateMeasurements(v: unknown): MeasurementLayer[] {
  if (!Array.isArray(v)) return [];
  return v.filter((m): m is MeasurementLayer =>
    isObj(m) && typeof m.id === 'string'
    && (m.points === undefined || (Array.isArray(m.points) && m.points.every(p => isNumTuple(p, 2))))
    // The HU profile is drawn straight into an SVG polyline — non-numeric or
    // unbounded samples would render NaN coordinates / an enormous points string.
    && (m.profile === undefined
      || (Array.isArray(m.profile) && m.profile.length <= MAX_PROFILE_SAMPLES && m.profile.every(isFiniteNum)))
  ).slice(0, MAX_MEASUREMENTS);
}

/**
 * Scan descriptors out of an untrusted plan file.
 *
 * The transform is the point of saving these, and a malformed one would put a
 * mesh somewhere arbitrary in the patient's anatomy rather than fail visibly,
 * so an entry without a complete, finite 4x4 is dropped rather than patched.
 * The colour reaches a CSS swatch, so only a plain hex literal is accepted.
 */
function validateScans(v: unknown): ScanMesh[] {
  if (!Array.isArray(v)) return [];
  const out: ScanMesh[] = [];
  for (const e of v) {
    if (!isObj(e) || typeof e.id !== 'string' || !e.id) continue;
    if (!isNumTuple(e.transform, 16)) continue;
    const type: ScanType = SCAN_TYPES.includes(e.type as ScanType) ? (e.type as ScanType) : 'oral';
    const color = typeof e.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(e.color)
      ? e.color : SCAN_DEFAULTS[type].color;
    out.push({
      id: e.id,
      name: str(e.name, type),
      type,
      color,
      opacity: Math.min(1, Math.max(0, num(e.opacity, SCAN_DEFAULTS[type].opacity))),
      visible: bool(e.visible, true),
      transform: (e.transform as number[]).slice(),
      fileName: str(e.fileName, ''),
    });
    if (out.length >= MAX_SCANS) break;
  }
  return out;
}

function validateArchCurve(v: unknown): [number, number][] | null {
  if (!Array.isArray(v)) return null;
  return v.filter(p => inRange(p, 2)).slice(0, MAX_ARCH_POINTS) as [number, number][];
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
    scans: validateScans(obj.scans),
    anatomy: validateAnatomy(obj.anatomy),
    measurements: validateMeasurements(obj.measurements),
    archCurveControlPoints: validateArchCurve(obj.archCurveControlPoints),
    crossSectionPosition: clamp(obj.crossSectionPosition, 0.5, 0, 1),
    crossSectionTiltDeg: clamp(obj.crossSectionTiltDeg, 0, -30, 30),
    panoramicSlabWidth: clamp(obj.panoramicSlabWidth, 20, 0, 60),
    panoramicProjection: obj.panoramicProjection === 'MIP' ? 'MIP' : 'AVG',
    panoramicResolution: clamp(obj.panoramicResolution, 0.3, 0.1, 5),
    safety: {
      marginMm: clamp(s.marginMm, 1, 0, 10),
      color: str(s.color, '#ff3c3c'),
      nerveMm: clamp(s.nerveMm, 2, 0, 20),
      sinusMm: clamp(s.sinusMm, 1, 0, 20),
      neighborMm: clamp(s.neighborMm, 3, 0, 20),
    },
    guide: {
      wallMm: clamp(g.wallMm, GUIDE_DEFAULTS.wallMm, 0.3, 10),
      baseWidthMm: clamp(g.baseWidthMm, GUIDE_DEFAULTS.baseWidthMm, 1, 30),
      baseHeightMm: clamp(g.baseHeightMm, GUIDE_DEFAULTS.baseHeightMm, 1, 30),
      channelTolMm: clamp(g.channelTolMm, GUIDE_DEFAULTS.channelTolMm, 0, 2),
      segments: Math.round(clamp(g.segments, GUIDE_DEFAULTS.segments, 8, 128)),
      sleeveSeat: typeof g.sleeveSeat === 'boolean' ? g.sleeveSeat : GUIDE_DEFAULTS.sleeveSeat,
      seatClearanceMm: clamp(g.seatClearanceMm, GUIDE_DEFAULTS.seatClearanceMm, 0, 2),
      sleeveWallMm: clamp(g.sleeveWallMm, GUIDE_DEFAULTS.sleeveWallMm, 0.1, 5),
    },
    windowLevel: { wc: clamp(wl.wc, 300, -10_000, 40_000), ww: clamp(wl.ww, 2500, 1, 70_000) },
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
      labelSizeMain: clamp(d2.labelSizeMain, clamp(d2.labelSize, DISPLAY_DEFAULTS.labelSizeMain, 6, 60), 6, 60),
      labelSizeSide: clamp(d2.labelSizeSide, DISPLAY_DEFAULTS.labelSizeSide, 6, 60),
      labelAlign: d2.labelAlign === 'left' || d2.labelAlign === 'right' ? d2.labelAlign : 'center',
      showSeries: bool(d2.showSeries, DISPLAY_DEFAULTS.showSeries),
      showModality: bool(d2.showModality, DISPLAY_DEFAULTS.showModality),
      showSlice: bool(d2.showSlice, DISPLAY_DEFAULTS.showSlice),
      scope: d2.scope === 'main' ? 'main' : 'all',
      sliceOpacity: clamp(d2.sliceOpacity, DISPLAY_DEFAULTS.sliceOpacity, 0.05, 1),
      preset3d: str(d2.preset3d, DISPLAY_DEFAULTS.preset3d),
      quality3d: d2.quality3d === 'low' || d2.quality3d === 'high' ? d2.quality3d : DISPLAY_DEFAULTS.quality3d,
      colormap3d: (['grayscale', 'cool', 'warm', 'spectral', 'inverted'] as string[]).includes(d2.colormap3d)
        ? (d2.colormap3d as DisplayConfig['colormap3d'])
        : DISPLAY_DEFAULTS.colormap3d,
    },
  };
}
