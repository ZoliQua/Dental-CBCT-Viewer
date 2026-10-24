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
 * The panel reports the predicted error at the planned implants, not only
 * the residual at the landmarks: the residual says how well the pairs agree
 * with each other, which is not the same question as how well the scan is
 * held where the implant goes. See core/registrationError.
 *
 * Best used in the 2×2 layout, where both the Axial and 3D panes are visible.
 */

import { useEffect, useMemo, useState } from 'react';
import { getRenderingEngine } from '@cornerstonejs/core';
import { useViewer, MIN_REG_PAIRS, MAX_REG_PAIRS } from '@/context/ViewerContext';
import { useI18n } from '@/i18n/I18nContext';
import { RENDERING_ENGINE_ID, VP_AXIAL, VP_3D } from '@/core/constants';
import { kabschTransformWithRms, mul4, applyMat4, pickTriangleSoup } from '@/core/registration';
import { scanTriangleSoupWorld } from '@/core/scanMesh';
import { registrationAccuracy } from '@/core/registrationError';
import { pickVolumeSurface } from '@/core/volumePick';
import { detectFiducials, nearestFiducialToRay, snapToSphere, matchConstellations } from '@/core/fiducials';
import { jawSplitFor, jawClipPlane } from '@/core/jawSplit';
import { assessMetal, type MetalReport } from '@/core/metalArtifact';
import { getVolumeData } from '@/core/cprEngine';
import { implantWorldAxis, type Vec3 } from '@/core/implantGeometry';

/**
 * Sub-millimetre is the scale guided surgery is planned at, so half a
 * millimetre reads as good, a whole one as worth a second look, and anything
 * beyond as a registration to redo.
 */
function treTone(mm: number): string {
  if (!Number.isFinite(mm) || mm > 1) return 'text-red-600 dark:text-red-400';
  if (mm > 0.5) return 'text-amber-600 dark:text-amber-400';
  return 'text-green-600 dark:text-green-400';
}

const treText = (mm: number) => (Number.isFinite(mm) ? `±${mm.toFixed(2)} mm` : '—');

export function RegistrationPanel() {
  const { state, dispatch } = useViewer();
  const { t } = useI18n();
  const reg = state.registration;
  const scan = reg ? state.scans.find(s => s.id === reg.scanId) : undefined;
  // Fit error (RMS mm) of the last completed registration, shown once the
  // panel closes. > 1 mm is highlighted as a likely mis-picked landmark pair.
  const [lastRms, setLastRms] = useState<number | null>(null);
  // Predicted error at the target, kept past END_REGISTRATION so the
  // closing readout can show what the fit is actually worth.
  const [lastTre, setLastTre] = useState<number | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [detectMsg, setDetectMsg] = useState<string | null>(null);
  // Metal in the CT, measured once per volume. Streaking around restorations
  // moves the apparent tooth surfaces, which is why a surface fit on such a
  // scan cannot be trusted — the operator needs to know before they rely on it.
  const [metal, setMetal] = useState<MetalReport | null>(null);
  const regActive = !!reg;
  useEffect(() => { if (regActive) { setLastRms(null); setLastTre(null); setDetectMsg(null); } }, [regActive]);

  useEffect(() => {
    if (!regActive || !state.volumeId) { setMetal(null); return; }
    const vol = getVolumeData(state.volumeId);
    // A coarse lattice sweep, well under a frame — no busy state needed.
    setMetal(vol ? assessMetal(vol) : null);
  }, [regActive, state.volumeId]);

  /**
   * Look for radiopaque markers in the CT. A sweep of the whole field of view
   * takes a second or two and runs on the main thread, so the button shows it
   * is working — and it is one click, not something that happens while typing.
   */
  const detect = async () => {
    if (!state.volumeId) return;
    setDetecting(true);
    setDetectMsg(null);
    try {
      // Yield first, so the busy state paints before the sweep blocks.
      await new Promise((r) => setTimeout(r, 30));
      const vol = getVolumeData(state.volumeId);
      if (!vol) return;
      const found = detectFiducials(vol);
      dispatch({ type: 'SET_REG_FIDUCIALS', payload: found });
      setDetectMsg(found.length ? t('reg.fid.found', { n: found.length }) : t('reg.fid.none'));
    } finally {
      setDetecting(false);
    }
  };

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
          const ray = cameraRay(vp, cp);
          const vol = state.volumeId ? getVolumeData(state.volumeId) : null;
          if (ray) {
            // A detected bead wins over the surface under the cursor: its
            // centre is known to sub-voxel accuracy, which is the entire
            // reason for detecting it.
            const bead = nearestFiducialToRay(reg.fiducials, ray.origin, ray.dir);
            if (bead) point = bead.center;
            else if (vol) {
              // Otherwise walk the camera ray until the volume turns to bone,
              // stopping at the same cut the view is drawing.
              const plane = jawClipPlane(jawSplitFor(state.volumeId!, vol), state.jawSide);
              point = pickVolumeSurface(vol, ray.origin, ray.dir, { clipPlanes: plane ? [plane] : undefined });
            }
          }
        } else {
          const ray = cameraRay(vp, cp);
          const soup = ray && scanTriangleSoupWorld(scan.id, scan.transform);
          const hit = ray && soup ? pickTriangleSoup(ray.origin, ray.dir, soup) : null;
          if (hit && soup) {
            // A marker on the scan is a bump, and the centre of a sphere is
            // fixed by its surface — so fitting the geometry around the click
            // beats the click. Flat surface leaves it where it landed.
            const verts: Vec3[] = [];
            for (let i = 0; i < soup.length; i += 3) verts.push([soup[i], soup[i + 1], soup[i + 2]]);
            point = snapToSphere(verts, hit).point;
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
      cleanups.push(() => {
        el.removeEventListener('click', onClick, true);
        el.style.cursor = prevCursor;
      });
    }
    return () => { for (const c of cleanups) c(); };
  }, [reg?.picking, scan, state.volumeId, state.jawSide, dispatch]);

  /**
   * Where the registration's accuracy is worth knowing. The planned implants
   * first — the apex is the deepest consequence of a bad pose, and it is the
   * point a surgeon would name. With nothing planned yet the honest stand-in
   * is the scan's own extent: the corners of what is being registered bound
   * how far wrong the far end of the arch can be.
   */
  const scanId = scan?.id;
  const scanTransform = scan?.transform;
  const treTargets = useMemo(() => {
    const out: { target: string; point: Vec3 }[] = [];
    for (const imp of state.implants) {
      const ax = implantWorldAxis(state.archCurveControlPoints ?? [], imp);
      if (ax) out.push({ target: imp.name, point: ax.apex });
    }
    if (out.length || !scanId || !scanTransform) return out;
    const soup = scanTriangleSoupWorld(scanId, scanTransform);
    if (!soup?.length) return out;
    const lo: Vec3 = [Infinity, Infinity, Infinity];
    const hi: Vec3 = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < soup.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        const v = soup[i + k];
        if (v < lo[k]) lo[k] = v;
        if (v > hi[k]) hi[k] = v;
      }
    }
    for (let c = 0; c < 8; c++) {
      out.push({
        target: '',
        point: [c & 1 ? hi[0] : lo[0], c & 2 ? hi[1] : lo[1], c & 4 ? hi[2] : lo[2]],
      });
    }
    return out;
  }, [state.implants, state.archCurveControlPoints, scanId, scanTransform]);

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
        {lastTre !== null && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-gray-500 dark:text-gray-400">{t('reg.tre.short')}</span>
            <span className={`text-[11px] font-mono font-semibold ${treTone(lastTre)}`}>{treText(lastTre)}</span>
          </div>
        )}
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

  /**
   * What the fit is worth at the target. The residual above is the error at
   * the landmarks, where the fit was free to minimise it; the number that
   * decides whether a guide drilled off this pose lands where it was planned
   * is the error somewhere else entirely, and the two are not the same — a
   * constellation bunched on one side of the arch fits beautifully and still
   * swings the far end. Predicted from the CBCT-side points, since the
   * targets live in that space.
   */
  const accuracy = fit
    ? registrationAccuracy(filled.map((p) => p.cbct!) as Vec3[], fit.rmsMm, treTargets)
    : null;
  const treMm = accuracy?.worstMm ?? null;
  const treWorstName = accuracy?.targets[0]?.target ?? '';
  // The warning worth making loudly: the fit looks tight and is not. Only
  // when the residual itself looks acceptable — saying "the residual is small"
  // over a visibly bad one would be nonsense, and a bad residual already has
  // its own warning.
  const treMisleading = fit != null && treMm != null && Number.isFinite(treMm)
    && fit.rmsMm <= 1 && treMm > 3 * Math.max(fit.rmsMm, 0.05) && treMm > 0.5;

  /**
   * Pairing marker 2 with marker 3 is the classic fiducial blunder, and it does
   * not announce itself — the fit just comes out wrong. The markers form a
   * rigid constellation, so the right assignment is the one whose inter-point
   * distances agree, and that can be found. Offered, not applied: the operator
   * decides.
   */
  const reorder = (() => {
    if (filled.length < MIN_REG_PAIRS || !fit || fit.rmsMm < 0.5) return null;
    const perm = matchConstellations(
      filled.map((p) => p.scan!) as Vec3[],
      filled.map((p) => p.cbct!) as Vec3[],
    );
    if (!perm || perm.every((v, i) => v === i)) return null;
    const better = kabschTransformWithRms(
      filled.map((p) => p.scan!) as Vec3[],
      perm.map((j) => filled[j].cbct!) as Vec3[],
    );
    return better && better.rmsMm < fit.rmsMm * 0.6 ? perm : null;
  })();

  const applyReorder = (perm: number[]) => {
    // Rewrite the CBCT side into the order the constellation says it belongs in.
    const cbct = perm.map((j) => filled[j].cbct!);
    filled.forEach((p, i) => {
      dispatch({ type: 'SET_REG_POINT', payload: { slot: p.i, kind: 'cbct', point: cbct[i] } });
    });
    dispatch({ type: 'SET_REG_PICKING', payload: null });
  };

  const align = () => {
    const res = solve();
    if (!res) return;
    dispatch({ type: 'UPDATE_SCAN', payload: { ...scan, transform: mul4(res.matrix, scan.transform) } });
    setLastRms(res.rmsMm);
    setLastTre(treMm);
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

      {metal && metal.severity !== 'none' && (
        <div className={`rounded px-2 py-1.5 text-[10px] leading-snug ${
          metal.severity === 'severe'
            ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
            : 'bg-gray-100 text-gray-600 dark:bg-gray-700/60 dark:text-gray-300'
        }`}>
          <span className="font-semibold">
            {t('reg.metal.found', { mm3: Math.round(metal.volumeMm3), n: metal.sites.length })}
          </span>{' '}
          {t(metal.severity === 'severe' ? 'reg.metal.severe' : 'reg.metal.minor')}
        </div>
      )}

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

      {/* Marker detection: turns CBCT picking from "find the right voxel" into
          "click the bead", and is the only route to a registration that can be
          trusted at the sub-millimetre scale. */}
      <div className="flex items-center gap-2 pt-0.5">
        <button
          onClick={detect}
          disabled={detecting || !state.volumeId}
          title={t('reg.fid.hint')}
          className="px-2 py-1 text-[11px] rounded bg-dental-600 text-white hover:bg-dental-700 transition-colors disabled:opacity-50"
        >
          {detecting ? t('reg.fid.busy') : t('reg.fid.detect')}
        </button>
        {detectMsg && <span className="text-[10px] text-gray-500 dark:text-gray-400">{detectMsg}</span>}
      </div>

      {reorder && (
        <button
          onClick={() => applyReorder(reorder)}
          className="w-full px-2 py-1 text-[11px] rounded bg-amber-500 text-white hover:bg-amber-600 transition-colors"
        >
          {t('reg.fixOrder')}
        </button>
      )}

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

      {accuracy && treMm !== null && (
        <div className="rounded px-2 py-1.5 bg-gray-50 dark:bg-gray-700/50 space-y-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[10px] leading-tight text-gray-500 dark:text-gray-400">
              {treWorstName ? t('reg.tre.atImplant') : t('reg.tre.atScan')}
            </span>
            <span className={`text-[11px] font-mono font-semibold whitespace-nowrap ${treTone(treMm)}`}>
              {treText(treMm)}
            </span>
          </div>
          {treWorstName && (
            <p className="text-[10px] font-mono truncate text-gray-400 dark:text-gray-500" title={treWorstName}>
              {t('reg.tre.worst', { name: treWorstName })}
            </p>
          )}
          {accuracy.degenerate ? (
            <p className="text-[10px] leading-snug text-red-600 dark:text-red-400">{t('reg.tre.collinear')}</p>
          ) : treMisleading ? (
            <p className="text-[10px] leading-snug text-amber-700 dark:text-amber-400">{t('reg.tre.spread')}</p>
          ) : null}
        </div>
      )}

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
