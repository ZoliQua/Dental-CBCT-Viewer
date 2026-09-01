/**
 * 3-point landmark registration UI + click picking. Active while
 * state.registration is set. The user picks, per slot, a point on the CBCT
 * (Axial 2D → canvasToWorld) and the corresponding point on the scan surface
 * (3D → ray-cast). Three complete pairs → Kabsch aligns the scan.
 *
 * Best used in the 2×2 layout, where both the Axial and 3D panes are visible.
 */

import { useEffect, useState } from 'react';
import { getRenderingEngine } from '@cornerstonejs/core';
import { useViewer } from '@/context/ViewerContext';
import { useI18n } from '@/i18n/I18nContext';
import { RENDERING_ENGINE_ID, VP_AXIAL, VP_3D } from '@/core/constants';
import { kabschTransformWithRms, mul4, pickTriangleSoup } from '@/core/registration';
import { scanTriangleSoupWorld } from '@/core/scanMesh';
import type { Vec3 } from '@/core/implantGeometry';

export function RegistrationPanel() {
  const { state, dispatch } = useViewer();
  const { t } = useI18n();
  const reg = state.registration;
  const scan = reg ? state.scans.find(s => s.id === reg.scanId) : undefined;
  // Fit error (RMS mm) of the last completed registration, shown once the
  // panel closes. > 1 mm is highlighted as a likely mis-picked landmark pair.
  const [lastRms, setLastRms] = useState<number | null>(null);
  const regActive = !!reg;
  useEffect(() => { if (regActive) setLastRms(null); }, [regActive]);

  // Attach a one-shot click listener to the relevant viewport while picking
  useEffect(() => {
    if (!reg?.picking || !scan) return;
    const { slot, kind } = reg.picking;
    const engine = getRenderingEngine(RENDERING_ENGINE_ID);
    const vp = engine?.getViewport(kind === 'cbct' ? VP_AXIAL : VP_3D) as any;
    if (!vp) return;
    const el = vp.element as HTMLElement;

    const onClick = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const cp: [number, number] = [e.clientX - rect.left, e.clientY - rect.top];
      let point: Vec3 | null = null;
      if (kind === 'cbct') {
        const w = vp.canvasToWorld(cp);
        if (w) point = [w[0], w[1], w[2]];
      } else {
        const onPlane = vp.canvasToWorld(cp);
        const cam = vp.getCamera();
        if (onPlane && cam?.position) {
          const orig = cam.position as Vec3;
          const d: Vec3 = [onPlane[0] - orig[0], onPlane[1] - orig[1], onPlane[2] - orig[2]];
          const len = Math.hypot(d[0], d[1], d[2]) || 1;
          const dir: Vec3 = [d[0] / len, d[1] / len, d[2] / len];
          const soup = scanTriangleSoupWorld(scan.id, scan.transform);
          if (soup) point = pickTriangleSoup(orig, dir, soup);
        }
      }
      if (point) {
        e.preventDefault();
        e.stopPropagation();
        dispatch({ type: 'SET_REG_POINT', payload: { slot, kind, point } });
      }
    };

    el.addEventListener('click', onClick, true);
    const prevCursor = el.style.cursor;
    el.style.cursor = 'crosshair';
    return () => {
      el.removeEventListener('click', onClick, true);
      el.style.cursor = prevCursor;
    };
  }, [reg?.picking, scan, dispatch]);

  if (!reg || !scan) {
    // Post-registration fit readout (registration just ended).
    if (lastRms === null) return null;
    const high = lastRms > 1;
    return (
      <div className="absolute top-2 left-12 z-40 w-64 bg-white border border-gray-300 dark:bg-gray-800 dark:border-gray-600 rounded-lg shadow-xl p-3 space-y-1">
        <div className="flex items-center justify-between">
          <span className={`text-xs font-semibold font-mono ${high ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
            {t('reg.rms', { rms: lastRms.toFixed(2) })}
          </span>
          <button
            onClick={() => setLastRms(null)}
            className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-gray-900 hover:bg-gray-200 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-700 rounded"
          >
            ✕
          </button>
        </div>
        {high && <p className="text-[11px] text-red-600 dark:text-red-400">{t('reg.rmsHigh')}</p>}
      </div>
    );
  }

  const complete = reg.pairs.every(p => p.scan && p.cbct);

  const align = () => {
    const src = reg.pairs.map(p => p.scan!) as Vec3[];
    const tgt = reg.pairs.map(p => p.cbct!) as Vec3[];
    const res = kabschTransformWithRms(src, tgt);
    if (!res) return;
    dispatch({ type: 'UPDATE_SCAN', payload: { ...scan, transform: mul4(res.matrix, scan.transform) } });
    setLastRms(res.rmsMm);
    dispatch({ type: 'END_REGISTRATION' });
  };

  const pickBtn = (slot: number, kind: 'scan' | 'cbct', set: boolean) => {
    const active = reg.picking?.slot === slot && reg.picking?.kind === kind;
    return (
      <button
        onClick={() => dispatch({ type: 'SET_REG_PICKING', payload: active ? null : { slot, kind } })}
        className={`
          flex-1 px-1.5 py-1 text-[11px] rounded transition-colors border
          ${active
            ? 'bg-dental-600 text-white border-dental-700 animate-pulse'
            : set
              ? 'bg-green-100 text-green-700 border-green-300 dark:bg-green-900/40 dark:text-green-300 dark:border-green-700'
              : 'bg-gray-100 text-gray-600 border-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600'}
        `}
      >
        {kind === 'scan' ? t('reg.scanPoint') : t('reg.cbctPoint')} {set ? '✓' : ''}
      </button>
    );
  };

  return (
    <div className="absolute top-2 left-12 z-40 w-64 bg-white border border-gray-300 dark:bg-gray-800 dark:border-gray-600 rounded-lg shadow-xl p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-dental-600 dark:text-dental-400">{t('reg.title')}</span>
        <button
          onClick={() => dispatch({ type: 'END_REGISTRATION' })}
          className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-gray-900 hover:bg-gray-200 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-700 rounded"
        >
          ✕
        </button>
      </div>
      <p className="text-[11px] text-gray-500 dark:text-gray-400">{t('reg.hint')}</p>

      {reg.pairs.map((p, i) => (
        <div key={i} className="flex items-center gap-1">
          <span className="text-[11px] font-mono text-gray-500 w-4">{i + 1}</span>
          {pickBtn(i, 'cbct', !!p.cbct)}
          {pickBtn(i, 'scan', !!p.scan)}
        </div>
      ))}

      <button
        onClick={align}
        disabled={!complete}
        className={`
          w-full px-2 py-1.5 text-xs rounded transition-colors
          ${complete
            ? 'bg-dental-600 text-white hover:bg-dental-700'
            : 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500 cursor-not-allowed'}
        `}
      >
        {t('reg.align')}
      </button>
    </div>
  );
}
