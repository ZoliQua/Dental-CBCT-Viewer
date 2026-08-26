import { useViewer } from '@/context/ViewerContext';
import { useI18n } from '@/i18n/I18nContext';
import { formatDicomDate } from '@/utils/dicomUtils';

interface ViewportOverlayProps {
  sliceIndex?: number;
  totalSlices?: number;
}

export function ViewportOverlay({ sliceIndex, totalSlices }: ViewportOverlayProps = {}) {
  const { t } = useI18n();
  const { state } = useViewer();
  const { study, activeSeriesUID } = state;

  const displayIndex = sliceIndex ?? state.currentSliceIndex;
  const displayTotal = totalSlices ?? state.totalSlices;

  if (!study) return null;

  const activeSeries = study.series.find((s) => s.seriesInstanceUID === activeSeriesUID);
  const disp = state.display;

  return (
    <>
      {/* Top-left: Patient info (toggle in Settings → General) */}
      {(disp.showName || disp.showBirth) && (
        <div className="absolute top-2 left-2 text-white text-xs font-mono pointer-events-none select-none [text-shadow:_0_1px_2px_rgb(0_0_0_/_80%)]">
          {disp.showName && <div className="font-semibold">{study.patientName}</div>}
          {disp.showBirth && study.patientBirthDate && <div>{formatDicomDate(study.patientBirthDate)}</div>}
        </div>
      )}

      {/* Top-right: Study info */}
      {(disp.showDate || disp.showClinic) && (
        <div className="absolute top-2 right-2 text-white text-xs font-mono text-right pointer-events-none select-none [text-shadow:_0_1px_2px_rgb(0_0_0_/_80%)]">
          {disp.showDate && <div>{formatDicomDate(study.studyDate)}</div>}
          {disp.showClinic && study.institution && <div>{study.institution}</div>}
        </div>
      )}

      {/* Bottom-left: Series info */}
      {activeSeries && (
        <div className="absolute bottom-2 left-2 text-white text-xs font-mono pointer-events-none select-none [text-shadow:_0_1px_2px_rgb(0_0_0_/_80%)]">
          <div>{activeSeries.seriesDescription}</div>
          <div>
            {activeSeries.modality} &middot; {displayTotal > 0 ? `${displayIndex + 1} / ${displayTotal}` : activeSeries.imageCount} {t('viewport.slices')}
          </div>
        </div>
      )}
    </>
  );
}
