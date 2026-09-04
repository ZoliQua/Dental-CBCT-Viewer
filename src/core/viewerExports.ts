/**
 * Reusable export actions (PDF report, printable drill-guide STL) built from a
 * ViewerState snapshot — shared by the TopBar UI and the component's imperative
 * ref API, so both trigger exactly the same output. Not part of `/core` (this
 * touches the Cornerstone volume + jsPDF), only the component bundle.
 */

import type { PdfConfig } from './pdfExport';
import { getVolumeData } from './cprEngine';
import { implantWorldAxis } from './implantGeometry';
import { sampleImplantBoneHU } from './boneQuality';
import { getImplantSystem } from '@/types/dicom';
import { scanTriangleSoupWorld } from './scanMesh';
import { validateGuide, type GuideCheckImplant, type GuideIssue } from './guideValidate';
import { formatDicomDate } from '@/utils/dicomUtils';
import type { OverlayData } from './viewCapture';
import type { ViewerState } from '@/context/ViewerContext';

export type { GuideIssue };

type TFn = (key: string, params?: Record<string, string | number>) => string;

/** Resolve the on-image overlay strings (name, clinic, …) from viewer state. */
export function overlayDataFromState(state: ViewerState): OverlayData {
  const st = state.study;
  const rep = state.report;
  const birthRaw = rep.patientBirthDate || st?.patientBirthDate || '';
  return {
    name: rep.patientName || st?.patientName || '',
    birth: birthRaw ? formatDicomDate(birthRaw) : '',
    date: st?.studyDate ? formatDicomDate(st.studyDate) : '',
    clinic: rep.clinic || st?.institution || '',
    series: st?.series.find((s) => s.seriesInstanceUID === state.activeSeriesUID)?.seriesDescription || '',
    modality: st?.series[0]?.modality || '',
    color: state.display.labelColor,
  };
}

/** Compute per-implant bone-quality labels sampled from the volume. */
function boneQualityLabels(state: ViewerState): Record<string, string> {
  const out: Record<string, string> = {};
  const cps = state.archCurveControlPoints;
  const vol = state.volumeId ? getVolumeData(state.volumeId) : null;
  if (!cps || !vol) return out;
  for (const imp of state.implants) {
    const wa = implantWorldAxis(cps, imp);
    if (!wa) continue;
    const b = sampleImplantBoneHU(vol, wa.entry, wa.apex, imp.diameter / 2);
    // CBCT gray values are uncalibrated — label as GV, not HU (see boneQuality.ts).
    if (b) out[imp.id] = `${b.bone} · ${Math.round(b.meanHU)} GV`;
  }
  return out;
}

/** Build and download the multi-view implant-planning PDF report. */
export async function exportPlanPdf(state: ViewerState, t: TFn, lang: string, config?: Partial<PdfConfig>): Promise<void> {
  // Dynamic import: jsPDF + html2canvas (~0.6 MB) load only when a PDF is
  // actually exported, keeping them out of the initial app bundle.
  const { exportViewPdf } = await import('./pdfExport');
  await exportViewPdf({
    t,
    study: state.study,
    implants: state.implants,
    measurements: state.measurements,
    report: state.report,
    anatomy: state.anatomy,
    archCurve: state.archCurveControlPoints,
    thresholds: { nerve: state.safety.nerveMm, sinus: state.safety.sinusMm, neighbor: state.safety.neighborMm },
    boneQuality: boneQualityLabels(state),
    lang,
    config,
    overlayData: overlayDataFromState(state),
  });
}

/** Build the guided-implant inputs (world entry + axis) for the drill guide. */
function guideImplantInputs(state: ViewerState): GuideCheckImplant[] {
  const cps = state.archCurveControlPoints;
  const guided = state.implants.filter((i) => i.guided?.enabled);
  if (!cps || guided.length === 0) return [];
  return guided.flatMap((imp) => {
    const wa = implantWorldAxis(cps, imp);
    if (!wa) return [];
    const sys = getImplantSystem(imp.systemId);
    return [{
      entry: wa.entry,
      axis: wa.axis,
      length: imp.length,
      sleeveDiameter: sys.sleeveDiameter,
      sleeveOffset: imp.guided!.sleeveOffset,
      sleeveHeight: imp.guided!.sleeveHeight,
    }];
  });
}

/** Pure printability/safety pre-check for the current guide plan (no CSG). */
export function checkGuide(state: ViewerState): GuideIssue[] {
  const implants = guideImplantInputs(state);
  if (implants.length === 0) return [];
  return validateGuide({
    implants,
    params: state.guide,
    anatomy: state.anatomy,
    thresholds: { nerve: state.safety.nerveMm, sinus: state.safety.sinusMm },
  });
}

/** Build the printable drill guide via CSG and download it as a binary STL.
 *  `ok` is false when there is no arch curve or no guided implant; `warnings`
 *  carries build warnings (e.g. a non-watertight scan). */
export async function exportDrillGuideStl(state: ViewerState): Promise<{ ok: boolean; warnings: string[] }> {
  const cps = state.archCurveControlPoints;
  const implants = guideImplantInputs(state);
  if (!cps || implants.length === 0) return { ok: false, warnings: [] };

  const { buildDrillGuide } = await import('./guideBuilder');
  const { triMeshToBinarySTL } = await import('./guideExport');

  const scanSoups = state.scans
    .filter((s) => s.visible)
    .map((s) => scanTriangleSoupWorld(s.id, s.transform))
    .filter((x): x is Float32Array => !!x);

  const result = await buildDrillGuide({ controlPoints: cps, implants, scanSoups, params: state.guide });
  const stl = triMeshToBinarySTL(result.mesh);
  const blob = new Blob([stl], { type: 'model/stl' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = `guide_${new Date().toISOString().slice(0, 10)}.stl`;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
  return { ok: true, warnings: result.warnings };
}
