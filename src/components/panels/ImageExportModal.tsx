/**
 * "Save Image" modal: pick a format (PNG/JPG) + quality, a resolution scale,
 * which of the current layout's views to export, whether to burn in on-image
 * info (name, clinic, orientation …), and — for the 3D view — its preset, slice
 * planes and slice position (driven live). Exports as separate files or one grid.
 */
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { getRenderingEngine, utilities } from '@cornerstonejs/core';
import { useViewer } from '@/context/ViewerContext';
import { useI18n } from '@/i18n/I18nContext';
import { useTheme } from '@/context/ThemeContext';
import { RENDERING_ENGINE_ID, VP_3D, VP_AXIAL } from '@/core/constants';
import { captureView, burnOverlays, composeGrid, downloadCanvas, type OverlayContent, type OverlayData } from '@/core/viewCapture';
import { applyVolumeStyle, XRAY_PRESET_ID } from '@/core/volume3DPreset';
import { VOLUME_3D_PRESETS } from '@/types/dicom';
import { formatDicomDate } from '@/utils/dicomUtils';

interface ViewInfo { key: string; title: string; }

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer select-none">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-dental-500 w-3.5 h-3.5" />
      {label}
    </label>
  );
}

export function ImageExportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, dispatch } = useViewer();
  const { t } = useI18n();
  const { theme } = useTheme();

  const views: ViewInfo[] = useMemo(() => {
    if (!open) return [];
    return (Array.from(document.querySelectorAll('[data-vp]')) as HTMLElement[]).map((el) => ({
      key: el.getAttribute('data-vp') || '',
      title: el.getAttribute('data-vp-title') || el.getAttribute('data-vp') || '',
    }));
  }, [open]);

  const [format, setFormat] = useState<'png' | 'jpg'>('png');
  const [quality, setQuality] = useState(0.92);
  const [scale, setScale] = useState(2);
  const [outputMode, setOutputMode] = useState<'files' | 'grid'>('files');
  const [gridCols, setGridCols] = useState(2);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [content, setContent] = useState<OverlayContent>({
    name: state.display.showName, birth: state.display.showBirth, date: state.display.showDate, clinic: state.display.showClinic,
    series: false, modality: false, viewTitle: true, orientation: true, slice: true,
  });
  const [slicePlanesOn, setSlicePlanesOn] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setSelected(Object.fromEntries(views.map((v) => [v.key, true])));
  }, [open, views]);

  if (!open) return null;

  const has3D = views.some((v) => v.key === '3D');
  const setC = (p: Partial<OverlayContent>) => setContent((c) => ({ ...c, ...p }));

  const vp3d = () => getRenderingEngine(RENDERING_ENGINE_ID)?.getViewport(VP_3D);
  const set3DPreset = (p: string) => {
    dispatch({ type: 'SET_DISPLAY', payload: { preset3d: p } });
    const vp = vp3d();
    if (vp) applyVolumeStyle(vp, { preset: p, colormap: state.display.colormap3d, quality: state.display.quality3d, wl: state.windowLevel });
  };
  const toggleSlicePlanes = (on: boolean) => {
    setSlicePlanesOn(on);
    const vp = vp3d() as any;
    if (vp?.getActors) {
      for (const e of vp.getActors()) if (typeof e.uid === 'string' && e.uid.startsWith('slice3d:')) e.actor?.setVisibility?.(on);
      vp.render();
    }
  };
  const scrubSlice = (target: number) => {
    const vp = getRenderingEngine(RENDERING_ENGINE_ID)?.getViewport(VP_AXIAL) as any;
    if (vp?.getSliceIndex) utilities.scroll(vp, { delta: target - vp.getSliceIndex() });
  };

  const doExport = async () => {
    setBusy(true);
    try {
      await new Promise((r) => setTimeout(r, 30));
      const els = Array.from(document.querySelectorAll('[data-vp]')) as HTMLElement[];
      const rep = state.report;
      const st = state.study;
      const data: OverlayData = {
        name: rep.patientName || st?.patientName || '',
        birth: (rep.patientBirthDate || st?.patientBirthDate) ? formatDicomDate(rep.patientBirthDate || st!.patientBirthDate) : '',
        date: st?.studyDate ? formatDicomDate(st.studyDate) : '',
        clinic: rep.clinic || st?.institution || '',
        series: st?.series.find((s) => s.seriesInstanceUID === state.activeSeriesUID)?.seriesDescription || '',
        modality: st?.series[0]?.modality || '',
        color: state.display.labelColor,
      };
      const shots: HTMLCanvasElement[] = [];
      const titles: string[] = [];
      for (const el of els) {
        const key = el.getAttribute('data-vp') || '';
        if (!selected[key]) continue;
        const canvas = await captureView(el, scale);
        if (!canvas) continue;
        burnOverlays(canvas, el, key, content, data, el.getAttribute('data-vp-title') || key);
        shots.push(canvas);
        titles.push(el.getAttribute('data-vp-title') || key);
      }
      if (shots.length === 0) return;
      const stamp = new Date().toISOString().slice(0, 10);
      if (outputMode === 'grid' && shots.length > 1) {
        downloadCanvas(composeGrid(shots, gridCols), `views_${stamp}.${format}`, format, quality);
      } else {
        shots.forEach((c, i) => downloadCanvas(c, `${(titles[i] || 'view').replace(/[^\w-]+/g, '_')}_${stamp}.${format}`, format, quality));
      }
      onClose();
    } catch (e) {
      console.error('[image export] failed', e);
    } finally {
      setBusy(false);
    }
  };

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="space-y-2">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{title}</div>
      {children}
    </div>
  );
  const seg = 'px-3 py-1 text-xs rounded-md border transition-colors';
  const segOn = 'border-dental-500 bg-dental-600 text-white';
  const segOff = 'border-slate-200 dark:border-slate-700/60 bg-slate-100/60 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700';

  return createPortal(
    <div className={`dcv-root ${theme === 'dark' ? 'dark' : ''} fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4`} onClick={onClose}>
      <div
        className="w-full max-w-md max-h-[88vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xl p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">{t('imgexport.title')}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-xl leading-none">×</button>
        </div>

        <Section title={t('imgexport.format')}>
          <div className="flex items-center gap-2">
            <button className={`${seg} ${format === 'png' ? segOn : segOff}`} onClick={() => setFormat('png')}>PNG</button>
            <button className={`${seg} ${format === 'jpg' ? segOn : segOff}`} onClick={() => setFormat('jpg')}>JPG</button>
            {format === 'jpg' && (
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-[11px] text-slate-500">{t('imgexport.quality')}</span>
                <input type="range" min={0.5} max={1} step={0.02} value={quality} onChange={(e) => setQuality(Number(e.target.value))} className="w-24 accent-dental-500" />
                <span className="text-[11px] tabular-nums w-8 text-slate-600 dark:text-slate-300">{Math.round(quality * 100)}%</span>
              </div>
            )}
          </div>
        </Section>

        <Section title={t('imgexport.resolution')}>
          <div className="flex items-center gap-2">
            {[1, 2, 3].map((s) => (
              <button key={s} className={`${seg} ${scale === s ? segOn : segOff}`} onClick={() => setScale(s)}>{s}×</button>
            ))}
          </div>
        </Section>

        <Section title={t('imgexport.views')}>
          <div className="grid grid-cols-2 gap-1.5">
            {views.map((v) => (
              <Check key={v.key} label={v.title} checked={!!selected[v.key]} onChange={(on) => setSelected((s) => ({ ...s, [v.key]: on }))} />
            ))}
          </div>
        </Section>

        {has3D && (
          <Section title={t('imgexport.threeD')}>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-500">{t('view3d.preset')}</span>
              <select value={state.display.preset3d} onChange={(e) => set3DPreset(e.target.value)} className="flex-1 text-xs rounded-md border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-900 px-2 py-1">
                {VOLUME_3D_PRESETS.map((p) => (<option key={p.id} value={p.id}>{t(p.labelKey)}</option>))}
                <option value={XRAY_PRESET_ID}>{t('preset3d.xray')}</option>
              </select>
            </div>
            <Check label={t('view3d.slices')} checked={slicePlanesOn} onChange={toggleSlicePlanes} />
            {state.totalSlices > 1 && (
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-500">{t('imgexport.slice')}</span>
                <input type="range" min={0} max={state.totalSlices - 1} value={Math.min(state.currentSliceIndex, state.totalSlices - 1)} onChange={(e) => scrubSlice(Number(e.target.value))} className="flex-1 accent-dental-500" />
                <span className="text-[11px] tabular-nums text-slate-600 dark:text-slate-300">{state.currentSliceIndex + 1}/{state.totalSlices}</span>
              </div>
            )}
          </Section>
        )}

        <Section title={t('imgexport.content')}>
          <div className="grid grid-cols-2 gap-1.5">
            <Check label={t('report.patientName')} checked={content.name} onChange={(v) => setC({ name: v })} />
            <Check label={t('report.birthDate')} checked={content.birth} onChange={(v) => setC({ birth: v })} />
            <Check label={t('settings.studyDate')} checked={content.date} onChange={(v) => setC({ date: v })} />
            <Check label={t('settings.clinic')} checked={content.clinic} onChange={(v) => setC({ clinic: v })} />
            <Check label={t('imgexport.cSeries')} checked={content.series} onChange={(v) => setC({ series: v })} />
            <Check label={t('imgexport.cModality')} checked={content.modality} onChange={(v) => setC({ modality: v })} />
            <Check label={t('imgexport.cViewTitle')} checked={content.viewTitle} onChange={(v) => setC({ viewTitle: v })} />
            <Check label={t('imgexport.cOrientation')} checked={content.orientation} onChange={(v) => setC({ orientation: v })} />
            <Check label={t('imgexport.cSlice')} checked={content.slice} onChange={(v) => setC({ slice: v })} />
          </div>
        </Section>

        <Section title={t('imgexport.output')}>
          <div className="flex items-center gap-2">
            <button className={`${seg} ${outputMode === 'files' ? segOn : segOff}`} onClick={() => setOutputMode('files')}>{t('imgexport.files')}</button>
            <button className={`${seg} ${outputMode === 'grid' ? segOn : segOff}`} onClick={() => setOutputMode('grid')}>{t('imgexport.grid')}</button>
            {outputMode === 'grid' && (
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-[11px] text-slate-500">{t('imgexport.columns')}</span>
                <input type="number" min={1} max={4} value={gridCols} onChange={(e) => setGridCols(Math.max(1, Math.min(4, Number(e.target.value))))} className="w-12 text-xs rounded-md border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-900 px-2 py-1" />
              </div>
            )}
          </div>
        </Section>

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-4 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">{t('common.cancel')}</button>
          <button
            onClick={doExport}
            disabled={busy || !Object.values(selected).some(Boolean)}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-dental-600 text-white hover:bg-dental-700 disabled:opacity-50"
          >
            {busy ? '…' : t('imgexport.export')}
          </button>
        </div>
      </div>
    </div>,
    // Portal into the app root (not document.body) so React event delegation
    // still fires and the theme applies; .dcv-root has no containing block, so
    // `fixed` anchors to the viewport (escaping the top bar's backdrop-filter).
    document.querySelector('.dcv-root') ?? document.body,
  );
}
