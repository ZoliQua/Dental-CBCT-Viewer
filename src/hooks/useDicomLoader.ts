import { useCallback } from 'react';
import { useViewer } from '@/context/ViewerContext';
import { useI18n } from '@/i18n/I18nContext';
import { parseDicomFiles } from '@/core/dicomLoader';
import { importNativeVolume } from '@/core/import';

export function useDicomLoader() {
  const { state, dispatch } = useViewer();
  const { t } = useI18n();

  const loadFiles = useCallback(
    async (files: File[]) => {
      dispatch({ type: 'SET_LOADING', payload: true });

      try {
        // Native (non-DICOM) CT exports first — GALILEOS / OneVolume folders.
        const native = await importNativeVolume(files, (pct) => {
          dispatch({ type: 'SET_LOAD_PROGRESS', payload: { loaded: pct, total: 100 } });
        });
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
          dispatch({ type: 'SET_LOAD_PROGRESS', payload: { loaded, total } });
        });
        if (study) {
          dispatch({ type: 'SET_STUDY', payload: study });
        } else {
          dispatch({ type: 'SET_ERROR', payload: t('error.processFailed') });
        }
      } catch (err) {
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
