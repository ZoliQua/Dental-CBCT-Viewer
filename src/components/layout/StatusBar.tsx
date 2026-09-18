/**
 * Persistent bottom status bar (viewer only). Left: a "local processing" trust
 * line; right: modality/image count, WW/WL, live zoom, view mode and active
 * tool. Everything but zoom comes from ViewerState. Zoom always tracks the BIG
 * (centre) view of the current layout: Cornerstone fires CAMERA_MODIFIED on the
 * viewport's own element (not on the global eventTarget), so we attach to that
 * element. The panoramic / cross-section canvases are fit-to-pane → "Fit".
 */
import { useEffect, useState } from 'react';
import { Enums, getRenderingEngine } from '@cornerstonejs/core';
import { useViewer } from '@/context/ViewerContext';
import { useI18n } from '@/i18n/I18nContext';
import { RENDERING_ENGINE_ID } from '@/core/constants';
import { bigView, bigViewportId } from '@/core/bigView';

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

  const bigVp = bigViewportId(state.layoutMode, state.viewMode, state.panel);

  // Live zoom of the big view. The viewport may not exist yet right after a
  // layout switch, so retry briefly until its element is available.
  useEffect(() => {
    setZoom(null);
    if (!hasStudy || !bigVp) return;
    let el: HTMLElement | null = null;
    const onCamera = () => {
      const z = readZoom(bigVp);
      if (z != null) setZoom(z);
    };
    const attach = (): boolean => {
      const vp = getRenderingEngine(RENDERING_ENGINE_ID)?.getViewport(bigVp) as { element?: HTMLElement } | undefined;
      if (!vp?.element) return false;
      el = vp.element;
      el.addEventListener(Enums.Events.CAMERA_MODIFIED, onCamera);
      onCamera();
      return true;
    };
    let tries = 0;
    const id = setInterval(() => {
      if (attach() || ++tries > 40) clearInterval(id);
    }, 250);
    if (attach()) clearInterval(id);
    return () => {
      clearInterval(id);
      el?.removeEventListener(Enums.Events.CAMERA_MODIFIED, onCamera);
    };
  }, [hasStudy, bigVp, state.volumeId]);

  if (!state.study) return null;

  const activeSeries =
    state.study.series.find((s) => s.seriesInstanceUID === state.activeSeriesUID) ?? state.study.series[0];
  const modality = activeSeries?.modality ?? 'CT';
  const imageCount = activeSeries?.imageCount ?? state.totalSlices;
  const { ww, wc } = state.windowLevel;
  const zoomPct = !bigVp ? t('status.fit') : zoom != null ? `${Math.round(zoom * 100)}%` : '—';
  // Mode names the layout; only the single-view layout names the view itself.
  const big = bigView(state.layoutMode, state.viewMode, state.panel);
  const mode =
    state.layoutMode === '1+3' ? t('layout.view3d')
    : state.layoutMode === 'OPG2+1' ? t('layout.panoramic')
    : state.layoutMode === '2x2' ? t('layout.grid')
    : t(`view.${String(big).toLowerCase()}`);

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
        <Seg label={t('status.mode')} value={mode} />
        <Seg label={t('status.tool')} value={t(`tool.${state.activeTool}`)} />
      </div>
    </div>
  );
}
