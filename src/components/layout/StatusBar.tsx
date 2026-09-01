/**
 * Persistent bottom status bar (viewer only). Left: a "local processing" trust
 * line; right: modality/image count, WW/WL, live zoom, view mode and active
 * tool. Everything but zoom comes from ViewerState; zoom is read live from the
 * Cornerstone viewport that last emitted CAMERA_MODIFIED (and seeded on load).
 */
import { useEffect, useState } from 'react';
import { eventTarget, Enums, getRenderingEngine } from '@cornerstonejs/core';
import { useViewer } from '@/context/ViewerContext';
import { useI18n } from '@/i18n/I18nContext';
import { RENDERING_ENGINE_ID, VP_AXIAL, VP_3D, VIEWPORT_ID } from '@/core/constants';

const ZOOM_CANDIDATES = [VP_AXIAL, VP_3D, VIEWPORT_ID];

function readZoom(vpId: string): number | null {
  const vp = getRenderingEngine(RENDERING_ENGINE_ID)?.getViewport(vpId);
  if (vp && 'getZoom' in vp) {
    try {
      return (vp as { getZoom: () => number }).getZoom();
    } catch {
      /* viewport not ready */
    }
  }
  return null;
}

export function StatusBar() {
  const { state } = useViewer();
  const { t } = useI18n();
  const [zoom, setZoom] = useState<number | null>(null);

  const hasStudy = !!state.study;

  // Live zoom from whichever viewport last moved its camera.
  useEffect(() => {
    if (!hasStudy) {
      setZoom(null);
      return;
    }
    const onCamera = (evt: Event) => {
      const vpId = (evt as CustomEvent).detail?.viewportId as string | undefined;
      if (!vpId) return;
      const z = readZoom(vpId);
      if (z != null) setZoom(z);
    };
    eventTarget.addEventListener(Enums.Events.CAMERA_MODIFIED, onCamera);
    return () => eventTarget.removeEventListener(Enums.Events.CAMERA_MODIFIED, onCamera);
  }, [hasStudy]);

  // Seed an initial zoom once a viewport exists (CAMERA_MODIFIED may fire before
  // the listener attaches, so the bar would otherwise read "—" until interaction).
  useEffect(() => {
    if (!hasStudy) return;
    let tries = 0;
    const id = setInterval(() => {
      for (const vpId of ZOOM_CANDIDATES) {
        const z = readZoom(vpId);
        if (z != null) {
          setZoom(z);
          clearInterval(id);
          return;
        }
      }
      if (++tries > 20) clearInterval(id);
    }, 250);
    return () => clearInterval(id);
  }, [hasStudy, state.layoutMode, state.volumeId]);

  if (!state.study) return null;

  const activeSeries =
    state.study.series.find((s) => s.seriesInstanceUID === state.activeSeriesUID) ?? state.study.series[0];
  const modality = activeSeries?.modality ?? 'CT';
  const imageCount = activeSeries?.imageCount ?? state.totalSlices;
  const { ww, wc } = state.windowLevel;
  const zoomPct = zoom != null ? `${Math.round(zoom * 100)}%` : '—';

  const Seg = ({ label, value }: { label: string; value: string }) => (
    <span className="whitespace-nowrap">
      <span className="text-slate-400 dark:text-slate-500">{label}</span>{' '}
      <span className="text-slate-600 dark:text-slate-300 tabular-nums">{value}</span>
    </span>
  );

  return (
    <div className="flex items-center justify-between gap-4 px-4 h-7 shrink-0 text-[11px] bg-white/95 border-t border-slate-200 dark:bg-slate-900/95 dark:border-slate-800 backdrop-blur-sm select-none">
      <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        <span>{t('status.local')}</span>
      </div>
      <div className="flex items-center gap-4 overflow-x-auto">
        <Seg label={modality} value={t('status.images', { n: imageCount })} />
        <Seg label="WW/WL" value={`${Math.round(ww)}/${Math.round(wc)}`} />
        <Seg label={t('status.zoom')} value={zoomPct} />
        <Seg label={t('status.mode')} value={state.viewMode} />
        <Seg label={t('status.tool')} value={t(`tool.${state.activeTool}`)} />
      </div>
    </div>
  );
}
