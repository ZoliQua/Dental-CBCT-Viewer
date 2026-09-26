/**
 * 3-point landmark registration UI + click picking. Active while
 * state.registration is set. The user picks, per slot, a point on the CBCT and
 * the matching point on the scan surface; three complete pairs let Kabsch align
 * the scan, and a surface fit then polishes the result.
 *
 * CBCT landmarks can be picked either on the Axial slice (canvasToWorld) or
 * straight on the 3D rendering, which ray-casts into the volume and stops at
 * the first bone/enamel it meets. The 3D route is what cusp tips want: finding
 * a tip on a slice means scrubbing until it happens to lie in the plane,
 * whereas on the rendering it is simply the point you can see. Picking honours
 * the jaw filter, so a clipped-away arch can never be clicked by accident.
 *
 * Best used in the 2×2 layout, where both the Axial and 3D panes are visible.
 */

import { useEffect, useState } from 'react';
import { getRenderingEngine } from '@cornerstonejs/core';
import { useViewer, MIN_REG_PAIRS, MAX_REG_PAIRS } from '@/context/ViewerContext';
import { useI18n } from '@/i18n/I18nContext';
import { RENDERING_ENGINE_ID, VP_AXIAL, VP_3D } from '@/core/constants';
import { kabschTransformWithRms, mul4, applyMat4, pickTriangleSoup } from '@/core/registration';
import { scanTriangleSoupWorld } from '@/core/scanMesh';
import { pickVolumeSurface } from '@/core/volumePick';
import { jawSplitFor, jawClipPlane } from '@/core/jawSplit';
import { getVolumeData } from '@/core/cprEngine';
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


  // Attach a click listener to every viewport this slot can be picked in: the
  // scan side is the 3D surface, the CBCT side is the Axial slice *or* the 3D
  // rendering.
  useEffect(() => {
    if (!reg?.picking || !scan) return;
    const { slot, kind } = reg.picking;
    const engine = getRenderingEngine(RENDERING_ENGINE_ID);
    const ids = kind === 'cbct' ? [VP_AXIAL, VP_3D] : [VP_3D];

    /** Camera ray through a canvas point, for the 3D viewport. */
    const cameraRay = (vp: any, cp: [number, number]): { origin: Vec3; dir: Vec3 } | null => {
      const onPlane = vp.canvasToWorld(cp);
      const cam = vp.getCamera?.();
      if (!onPlane || !cam?.position) return null;
      const origin = cam.position as Vec3;
      const d: Vec3 = [onPlane[0] - origin[0], onPlane[1] - origin[1], onPlane[2] - origin[2]];
      const len = Math.hypot(d[0], d[1], d[2]) || 1;
      return { origin, dir: [d[0] / len, d[1] / len, d[2] / len] };
    };

    const cleanups: (() => void)[] = [];
    for (const id of ids) {
      const vp = engine?.getViewport(id) as any;
      if (!vp?.element) continue;
      const el = vp.element as HTMLElement;

      const onClick = (e: MouseEvent) => {
        const rect = el.getBoundingClientRect();
        const cp: [number, number] = [e.clientX - rect.left, e.clientY - rect.top];
        let point: Vec3 | null = null;

        if (kind === 'cbct' && id === VP_AXIAL) {
          const w = vp.canvasToWorld(cp);
          if (w) point = [w[0], w[1], w[2]];
        } else if (kind === 'cbct') {
          // 3D: walk the camera ray until the volume turns to bone, stopping at
          // the same cut the view is drawing.
          const ray = cameraRay(vp, cp);
          const vol = state.volumeId ? getVolumeData(state.volumeId) : null;
          if (ray && vol) {
            const plane = jawClipPlane(jawSplitFor(state.volumeId!, vol), state.jawSide);
            point = pickVolumeSurface(vol, ray.origin, ray.dir, { clipPlanes: plane ? [plane] : undefined });
          }
        } else {
          const ray = cameraRay(vp, cp);
          const soup = ray && scanTriangleSoupWorld(scan.id, scan.transform);
          if (ray && soup) point = pickTriangleSoup(ray.origin, ray.dir, soup);
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
      cleanups.push(() => {
        el.removeEventListener('click', onClick, true);
        el.style.cursor = prevCursor;
      });
    }
    return () => { for (const c of cleanups) c(); };
  }, [reg?.picking, scan, state.volumeId, state.jawSide, dispatch]);

  if (!reg || !scan) {
    // Post-registration fit readout (registration just ended).
    if (lastRms === null) return null;
    const high = lastRms > 1;
    return (
      <div className="absolute top-2 left-12 z-40 w-64 bg-white border border-gray-300 dark:bg-gray-800 dark:border-gray-600 rounded-lg shadow-xl p-3 space-y-1.5">
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

  // Only fully-picked pairs take part; half-filled rows are work in progress.
  const filled = reg.pairs.map((p, i) => ({ ...p, i })).filter((p) => p.scan && p.cbct);
  const complete = filled.length >= MIN_REG_PAIRS;

  const solve = () => {
    if (!complete) return null;
    return kabschTransformWithRms(
      filled.map((p) => p.scan!) as Vec3[],
      filled.map((p) => p.cbct!) as Vec3[],
    );
  };

  /**
   * Per-pair residual under the current fit, shown live. A rigid transform
   * cannot satisfy every pair exactly, so one landmark that is several
   * millimetres out is not noise — it is a mis-click, and seeing which one it
   * is means re-picking that pair instead of starting over.
   */
  const fit = solve();
  const residuals = new Map<number, number>();
  if (fit) {
    for (const p of filled) {
      const moved = applyMat4(fit.matrix, p.scan as Vec3);
      const t = p.cbct as Vec3;
      residuals.set(p.i, Math.hypot(moved[0] - t[0], moved[1] - t[1], moved[2] - t[2]));
    }
  }
  const worst = residuals.size ? Math.max(...residuals.values()) : 0;

  const align = () => {
    const res = solve();
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

      {reg.pairs.map((p, i) => {
        const err = residuals.get(i);
        // Flag the pair that is pulling the fit apart, not just a high total.
        const bad = err != null && err > 0.8 && err >= worst - 1e-9 && worst > 0.8;
        return (
          <div key={i} className="flex items-center gap-1">
            <span className="text-[11px] font-mono text-gray-500 w-4">{i + 1}</span>
            {pickBtn(i, 'cbct', !!p.cbct)}
            {pickBtn(i, 'scan', !!p.scan)}
            <span className={`w-10 text-right text-[10px] font-mono ${bad ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-gray-400'}`}>
              {err != null ? `${err.toFixed(2)}` : ''}
            </span>
            <button
              onClick={() => dispatch({ type: 'REMOVE_REG_PAIR', payload: i })}
              disabled={reg.pairs.length <= MIN_REG_PAIRS}
              title={t('reg.removePair')}
              className="w-4 h-5 flex items-center justify-center text-gray-400 hover:text-red-500 disabled:opacity-0 transition-colors"
            >
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" /></svg>
            </button>
          </div>
        );
      })}

      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => dispatch({ type: 'ADD_REG_PAIR' })}
          disabled={reg.pairs.length >= MAX_REG_PAIRS}
          title={t('reg.addPairHint')}
          className="px-2 py-1 text-[11px] rounded border border-gray-300 text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors disabled:opacity-40"
        >
          + {t('reg.addPair')}
        </button>
        {fit && (
          <span className={`text-[11px] font-mono ${fit.rmsMm > 1 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
            {t('reg.rms', { rms: fit.rmsMm.toFixed(2) })}
          </span>
        )}
      </div>

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
