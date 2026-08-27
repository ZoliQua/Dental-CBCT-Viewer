import { useViewer } from '@/context/ViewerContext';
import { useI18n } from '@/i18n/I18nContext';
import { formatDicomDate } from '@/utils/dicomUtils';

interface ViewportOverlayProps {
  sliceIndex?: number;
  totalSlices?: number;
  /** Which view this overlay is on — used for the "main view only" scope */
  viewKey?: string;
}

export function ViewportOverlay({ sliceIndex, totalSlices, viewKey }: ViewportOverlayProps = {}) {
  const { t } = useI18n();
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
  if (disp.scope === 'main' && !isMain) return null;

  const activeSeries = study.series.find((s) => s.seriesInstanceUID === activeSeriesUID);
  const showSeriesBlock = (disp.showSeries || disp.showModality || disp.showSlice) && activeSeries;

  // On-image text: editable override (Settings) wins over the DICOM value
  const r = state.report;
  const vName = r.patientName.trim() || study.patientName;
  const vBirth = r.patientBirthDate.trim() || (study.patientBirthDate ? formatDicomDate(study.patientBirthDate) : '');
  const vDate = r.studyDate.trim() || (study.studyDate ? formatDicomDate(study.studyDate) : '');
  const vClinic = r.clinic.trim() || study.institution || '';
  const vSeries = r.seriesName.trim() || activeSeries?.seriesDescription || '';

  return (
    <>
      {/* Top-left: patient info */}
      {(disp.showName || disp.showBirth) && (
        <div className="absolute top-2 left-2 text-white text-xs font-mono pointer-events-none select-none [text-shadow:_0_1px_2px_rgb(0_0_0_/_80%)]">
          {disp.showName && <div className="font-semibold">{vName}</div>}
          {disp.showBirth && vBirth && <div>{vBirth}</div>}
        </div>
      )}

      {/* Top-right: study info */}
      {(disp.showDate || disp.showClinic) && (
        <div className="absolute top-2 right-2 text-white text-xs font-mono text-right pointer-events-none select-none [text-shadow:_0_1px_2px_rgb(0_0_0_/_80%)]">
          {disp.showDate && vDate && <div>{vDate}</div>}
          {disp.showClinic && vClinic && <div>{vClinic}</div>}
        </div>
      )}

      {/* Bottom-left: series info */}
      {showSeriesBlock && (
        <div className="absolute bottom-2 left-2 text-white text-xs font-mono pointer-events-none select-none [text-shadow:_0_1px_2px_rgb(0_0_0_/_80%)]">
          {disp.showSeries && vSeries && <div>{vSeries}</div>}
          {(disp.showModality || disp.showSlice) && (
            <div>
              {disp.showModality && activeSeries!.modality}
              {disp.showModality && disp.showSlice && ' · '}
              {disp.showSlice && `${displayTotal > 0 ? `${displayIndex + 1} / ${displayTotal}` : activeSeries!.imageCount} ${t('viewport.slices')}`}
            </div>
          )}
        </div>
      )}
    </>
  );
}
