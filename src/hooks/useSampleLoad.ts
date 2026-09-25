/**
 * Loading the two bundled demo data sets, from the landing page or the top bar.
 *
 *  - CT sample:        public/sample/    — a de-identified CBCT on its own.
 *  - CT + IO sample:   public/sample-io/ — a CBCT *and* the patient's upper and
 *                      lower intraoral scans, already paired to it (the 4×4
 *                      transforms were measured offline; see
 *                      scripts/register-scan-to-cbct.cjs), so the "3D IO view"
 *                      shows the arches sitting on the bone straight away.
 *
 * Both are kept out of the landing bundle: Cornerstone, the sample loader and
 * the mesh readers are all imported on demand.
 */

import { useCallback } from 'react';
import { useViewer } from '@/context/ViewerContext';
import { useI18n } from '@/i18n/I18nContext';
import { ensureCornerstone } from '@/core/ensureCornerstone';
import { publicUrl } from '@/utils/publicUrl';

export type SampleKind = 'ct' | 'ctIo';

const BASE: Record<SampleKind, string> = { ct: 'sample', ctIo: 'sample-io' };

export function useSampleLoad() {
  const { dispatch } = useViewer();
  const { t } = useI18n();

  /**
   * Load one of the samples. `onProgress` reports 0–100 across the whole job:
   * the volume download dominates, so the scans share the last few percent.
   */
  return useCallback(async (kind: SampleKind, onProgress?: (pct: number) => void): Promise<boolean> => {
    const base = publicUrl(BASE[kind]);
    try {
      await ensureCornerstone();
      const { loadSample } = await import('@/core/sampleLoader');
      const volumeShare = kind === 'ctIo' ? 0.88 : 1;
      const { study, volumeId, windowLevel } = await loadSample(base, (p) => onProgress?.(Math.round(p * volumeShare)));

      // The study has to land first: activating a new study resets the plan,
      // which would otherwise drop the scans we are about to add.
      dispatch({ type: 'SET_STUDY', payload: study });
      dispatch({ type: 'SET_WINDOW_LEVEL', payload: windowLevel });
      dispatch({ type: 'SET_VOLUME_ID', payload: volumeId });

      if (kind === 'ctIo') {
        const { loadSampleScans } = await import('@/core/sampleScans');
        const scans = await loadSampleScans(
          (key) => t(key),
          base,
          (f) => onProgress?.(Math.round(88 + f * 12)),
        );
        for (const scan of scans) dispatch({ type: 'ADD_SCAN', payload: scan });
        if (scans.length) dispatch({ type: 'SET_LAYOUT_MODE', payload: 'IO3D' });
      }
      onProgress?.(100);
      return true;
    } catch (err) {
      console.error(`[sample] ${kind} load failed`, err);
      window.alert(t('newload.sampleError'));
      return false;
    }
  }, [dispatch, t]);
}
