import { useViewer } from '@/context/ViewerContext';
import { formatDicomDate } from '@/utils/dicomUtils';

interface ViewportOverlayProps {
  sliceIndex?: number;
  totalSlices?: number;
  /** Which view this overlay is on — used for the "main view only" scope */
  viewKey?: string;
}

export function ViewportOverlay({ sliceIndex, totalSlices, viewKey }: ViewportOverlayProps = {}) {
  const { state } = useViewer();
  const { study, activeSeriesUID } = state;
  const disp = state.display;

  const displayIndex = sliceIndex ?? state.currentSliceIndex;
  const displayTotal = totalSlices ?? state.totalSlices;

  if (!study) return null;

  // "main view only" scope: is this the big/active view in the current layout?
  let isMain = true;
  if (state.layoutMode === '1x1') isMain = viewKey === state.viewMode;
  else if (state.layoutMode === '1+3') isMain = state.panel.grid === '2x2' ? true : viewKey === state.panel.big;
  else if (state.layoutMode === 'OPG2+1') isMain = false; // the panoramic (no overlay here) is the main view

  // Patient / study info respects the scope; the slice number always shows.
  const infoAllowed = disp.scope !== 'main' || isMain;

  const activeSeries = study.series.find((s) => s.seriesInstanceUID === activeSeriesUID);

  // Slice number as "X / max" (no unit word). Only real slice views have a
  // total (the 3D view passes 0) — so it never shows on 3D.
  const sliceText = disp.showSlice && displayTotal > 0 ? `${displayIndex + 1} / ${displayTotal}` : null;

  // On-image text: editable override (Settings) wins over the DICOM value
  const r = state.report;
  const vName = r.patientName.trim() || study.patientName;
  const vBirth = r.patientBirthDate.trim() || (study.patientBirthDate ? formatDicomDate(study.patientBirthDate) : '');
  const vDate = r.studyDate.trim() || (study.studyDate ? formatDicomDate(study.studyDate) : '');
  const vClinic = r.clinic.trim() || study.institution || '';
  const vSeries = r.seriesName.trim() || activeSeries?.seriesDescription || '';

  const showSeriesBlock = infoAllowed && (disp.showSeries || disp.showModality) && activeSeries;

  return (
    <>
      {/* Top-left: patient info */}
      {infoAllowed && (disp.showName || disp.showBirth) && (
        <div className="absolute top-2 left-2 text-white text-xs font-mono pointer-events-none select-none [text-shadow:_0_1px_2px_rgb(0_0_0_/_80%)]">
          {disp.showName && <div className="font-semibold">{vName}</div>}
          {disp.showBirth && vBirth && <div>{vBirth}</div>}
        </div>
      )}

      {/* Top-right: study info */}
      {infoAllowed && (disp.showDate || disp.showClinic) && (
        <div className="absolute top-2 right-2 text-white text-xs font-mono text-right pointer-events-none select-none [text-shadow:_0_1px_2px_rgb(0_0_0_/_80%)]">
          {disp.showDate && vDate && <div>{vDate}</div>}
          {disp.showClinic && vClinic && <div>{vClinic}</div>}
        </div>
      )}

      {/* Bottom-left: series / modality (+ slice number on the main view) */}
      {(showSeriesBlock || (sliceText && isMain)) && (
        <div className="absolute bottom-2 left-2 text-white text-xs font-mono pointer-events-none select-none [text-shadow:_0_1px_2px_rgb(0_0_0_/_80%)]">
          {showSeriesBlock && disp.showSeries && vSeries && <div>{vSeries}</div>}
          {(showSeriesBlock && disp.showModality) || (sliceText && isMain) ? (
            <div>
              {showSeriesBlock && disp.showModality && activeSeries!.modality}
              {showSeriesBlock && disp.showModality && sliceText && isMain && ' · '}
              {sliceText && isMain && sliceText}
            </div>
          ) : null}
        </div>
      )}

      {/* Slice number on the smaller views: bottom-left, independent of scope */}
      {sliceText && !isMain && (
        <div className="absolute bottom-2 left-2 text-white text-xs font-mono pointer-events-none select-none [text-shadow:_0_1px_2px_rgb(0_0_0_/_80%)]">
          {sliceText}
        </div>
      )}
    </>
  );
}
