/**
 * Left-panel folder/series tree for the loaded studies. Each loaded CT is a
 * collapsible "folder" whose series are children; selecting a series activates
 * that study (rebuilding its volume) and series. "+ Load" appends another CT,
 * and each study can be removed (closed) with its ✕.
 */
import { useRef, useState, type ChangeEvent } from 'react';
import { cache } from '@cornerstonejs/core';
import { useViewer } from '@/context/ViewerContext';
import { useI18n } from '@/i18n/I18nContext';
import { useDicomLoader } from '@/hooks/useDicomLoader';
import type { DicomStudyInfo, DicomSeriesInfo } from '@/types/dicom';

/** "512×512 · 0.3 mm" from a series' in-plane dimensions/spacing, when known. */
function seriesGeometry(s: DicomSeriesInfo): string | null {
  const parts: string[] = [];
  if (s.columns && s.rows) parts.push(`${s.columns}×${s.rows}`);
  if (s.pixelSpacingMm) parts.push(`${Number(s.pixelSpacingMm.toFixed(4))} mm`);
  return parts.length ? parts.join(' · ') : null;
}

export function StudyTree() {
  const { state, dispatch } = useViewer();
  const { t } = useI18n();
  const { loadFiles } = useDicomLoader();
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  if (state.studies.length === 0) return null;
  const activeStudyUid = state.study?.studyInstanceUID ?? null;

  const onLoad = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length) loadFiles(Array.from(files));
    e.target.value = ''; // allow re-selecting the same folder later
  };

  const selectSeries = (study: DicomStudyInfo, series: DicomSeriesInfo) => {
    if (study.studyInstanceUID !== activeStudyUid) {
      dispatch({ type: 'SET_ACTIVE_STUDY', payload: study.studyInstanceUID });
    }
    dispatch({ type: 'SET_ACTIVE_SERIES', payload: series.seriesInstanceUID });
  };

  const removeStudy = (study: DicomStudyInfo) => {
    // Free the study's volume from the Cornerstone cache before dropping it.
    const volumeId =
      study.studyInstanceUID === activeStudyUid
        ? state.volumeId
        : state.studyPlans[study.studyInstanceUID]?.volumeId ?? null;
    if (volumeId) {
      try { cache.removeVolumeLoadObject(volumeId); } catch { /* already gone */ }
    }
    dispatch({ type: 'REMOVE_STUDY', payload: study.studyInstanceUID });
  };

  return (
    <div className="flex flex-col gap-0.5 p-2">
      <div className="flex items-center justify-between px-1 mb-1.5">
        <h3 className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">{t('series.panel')}</h3>
        <button
          onClick={() => folderInputRef.current?.click()}
          className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border border-dental-500 text-dental-600 dark:text-dental-400 hover:bg-dental-50 dark:hover:bg-dental-900/30 transition-colors"
        >
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" strokeLinecap="round" /></svg>
          {t('series.load')}
        </button>
        <input
          ref={folderInputRef}
          type="file"
          onChange={onLoad}
          className="hidden"
          multiple
          {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
        />
      </div>

      {state.studies.map((study) => {
        const isActiveStudy = study.studyInstanceUID === activeStudyUid;
        const isCollapsed = collapsed[study.studyInstanceUID];
        return (
          <div key={study.studyInstanceUID} className="flex flex-col">
            {/* Study folder header + remove (✕) */}
            <div
              className={`group flex items-center gap-1 rounded-lg pr-1 transition-colors ${
                isActiveStudy ? '' : 'hover:bg-gray-200/70 dark:hover:bg-gray-700/50'
              }`}
            >
              <button
                onClick={() => {
                  if (!isActiveStudy) dispatch({ type: 'SET_ACTIVE_STUDY', payload: study.studyInstanceUID });
                  setCollapsed((c) => ({ ...c, [study.studyInstanceUID]: !c[study.studyInstanceUID] }));
                }}
                className={`flex items-center gap-1.5 flex-1 min-w-0 text-left px-2 py-1.5 text-sm ${
                  isActiveStudy ? 'text-dental-700 dark:text-dental-200 font-semibold' : 'text-gray-700 dark:text-gray-300'
                }`}
              >
                <svg className={`w-3 h-3 shrink-0 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <svg className="w-4 h-4 shrink-0 text-dental-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="truncate">{study.studyDescription || t('series.study')}</span>
              </button>
              <button
                onClick={() => removeStudy(study)}
                title={t('series.remove')}
                className="shrink-0 w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-red-500 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" /></svg>
              </button>
            </div>
            {(study.studyDate || study.series[0]?.modality) && (
              <div className="pl-8 -mt-0.5 mb-0.5 text-[10px] text-gray-400 dark:text-gray-500">
                {[study.studyDate, study.series[0]?.modality].filter(Boolean).join(' · ')}
              </div>
            )}

            {/* Series children */}
            {!isCollapsed && study.series.map((series) => {
              const isActiveSeries = isActiveStudy && series.seriesInstanceUID === state.activeSeriesUID;
              const geom = seriesGeometry(series);
              return (
                <button
                  key={series.seriesInstanceUID}
                  onClick={() => selectSeries(study, series)}
                  className={`ml-4 text-left px-2.5 py-1.5 rounded-lg text-sm transition-colors border ${
                    isActiveSeries
                      ? 'bg-dental-100 text-dental-800 border-dental-400 dark:bg-dental-700/50 dark:text-dental-200 dark:border-dental-600'
                      : 'text-gray-700 hover:bg-gray-200/70 dark:text-gray-300 dark:hover:bg-gray-700/50 border-transparent'
                  }`}
                >
                  <div className="font-medium truncate">{series.seriesDescription || `Series #${series.seriesNumber}`}</div>
                  <div className="text-[11px] text-gray-500 mt-0.5">{series.modality} · {t('series.images', { n: series.imageCount })}</div>
                  {geom && <div className="text-[10px] text-gray-400 dark:text-gray-500">{geom}</div>}
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
