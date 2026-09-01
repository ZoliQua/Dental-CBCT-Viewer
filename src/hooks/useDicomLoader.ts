import { useCallback, useRef } from 'react';
import { useViewer } from '@/context/ViewerContext';
import { useI18n } from '@/i18n/I18nContext';
import { parseDicomFiles } from '@/core/dicomLoader';
import { importNativeVolume } from '@/core/import';

export function useDicomLoader() {
  const { state, dispatch } = useViewer();
  const { t } = useI18n();
  // Generation counter: progress/results from a superseded load are ignored
  // (last-started load wins).
  const loadTokenRef = useRef(0);

  const loadFiles = useCallback(
    async (files: File[]) => {
      const token = ++loadTokenRef.current;
      const stale = () => loadTokenRef.current !== token;
      dispatch({ type: 'SET_LOADING', payload: true });

      try {
        // Native (non-DICOM) CT exports first — GALILEOS / OneVolume folders.
        const native = await importNativeVolume(files, (pct) => {
          if (!stale()) dispatch({ type: 'SET_LOAD_PROGRESS', payload: { loaded: pct, total: 100 } });
        });
        if (stale()) return;
        if (native) {
          dispatch({ type: 'SET_STUDY', payload: native.study });
          dispatch({ type: 'SET_WINDOW_LEVEL', payload: native.windowLevel });
          dispatch({ type: 'SET_VOLUME_ID', payload: native.volumeId });
          return;
        }

        // Otherwise treat the selection as DICOM (.dcm, .dicom, or no extension).
        const dicomFiles = files.filter((f) => {
          const name = f.name.toLowerCase();
          return name.endsWith('.dcm') || name.endsWith('.dicom') || !name.includes('.');
        });
        if (dicomFiles.length === 0) {
          dispatch({ type: 'SET_ERROR', payload: t('error.noDicom') });
          return;
        }

        const study = await parseDicomFiles(dicomFiles, (loaded, total) => {
          if (!stale()) dispatch({ type: 'SET_LOAD_PROGRESS', payload: { loaded, total } });
        });
        if (stale()) return;
        if (study) {
          dispatch({ type: 'SET_STUDY', payload: study });
        } else {
          // Every file failed to parse — say so plainly instead of the generic failure.
          dispatch({
            type: 'SET_ERROR',
            payload: t('error.loadError', {
              msg: `no readable DICOM files (${dicomFiles.length} skipped)`,
            }),
          });
        }
      } catch (err) {
        if (stale()) return;
        dispatch({
          type: 'SET_ERROR',
          payload: t('error.loadError', { msg: err instanceof Error ? err.message : String(err) }),
        });
      }
    },
    [dispatch, t],
  );

  return {
    loadFiles,
    isLoading: state.isLoading,
    loadProgress: state.loadProgress,
    error: state.error,
    study: state.study,
  };
}
