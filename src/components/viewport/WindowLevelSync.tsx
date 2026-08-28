/**
 * Links window/level (contrast) across all views. The panoramic and
 * cross-section already read state.windowLevel; this keeps the three Cornerstone
 * MPR viewports in sync with it both ways. Loop-safe: an `applying` flag blocks
 * the echo from our own updates, listeners attach once per volume/layout (not on
 * every W/L change), and a threshold ignores sub-2 HU jitter.
 */

import { useEffect, useRef } from 'react';
import { getRenderingEngine, Enums } from '@cornerstonejs/core';
import { useViewer } from '@/context/ViewerContext';
import { RENDERING_ENGINE_ID, VP_AXIAL, VP_SAGITTAL, VP_CORONAL } from '@/core/constants';

const MPR_IDS = [VP_AXIAL, VP_SAGITTAL, VP_CORONAL];

export function WindowLevelSync() {
  const { state, dispatch } = useViewer();
  const wlRef = useRef(state.windowLevel);
  wlRef.current = state.windowLevel;
  const applyingRef = useRef(false);

  // state.windowLevel → MPR viewports
  useEffect(() => {
    const engine = getRenderingEngine(RENDERING_ENGINE_ID);
    if (!engine) return;
    const { wc, ww } = state.windowLevel;
    applyingRef.current = true;
    const range = { lower: wc - ww / 2, upper: wc + ww / 2 };
    for (const id of MPR_IDS) {
      const vp = engine.getViewport(id) as any;
      try { vp?.setProperties?.({ voiRange: range }); vp?.render?.(); } catch { /* not ready */ }
    }
    const t = window.setTimeout(() => { applyingRef.current = false; }, 60);
    return () => window.clearTimeout(t);
  }, [state.windowLevel.wc, state.windowLevel.ww]);

  // MPR viewport W/L drag → state.windowLevel (listeners attach once per volume)
  useEffect(() => {
    const engine = getRenderingEngine(RENDERING_ENGINE_ID);
    if (!engine) return;
    const cleanups: Array<() => void> = [];
    for (const id of MPR_IDS) {
      const vp = engine.getViewport(id) as any;
      const el = vp?.element as HTMLElement | undefined;
      if (!el) continue;
      const handler = () => {
        if (applyingRef.current) return;
        const voi = vp.getProperties?.().voiRange;
        if (!voi) return;
        const nWw = voi.upper - voi.lower;
        const nWc = (voi.upper + voi.lower) / 2;
        const cur = wlRef.current;
        if (Math.abs(nWw - cur.ww) > 2 || Math.abs(nWc - cur.wc) > 2) {
          applyingRef.current = true; // block the echo from the resulting apply
          dispatch({ type: 'SET_WINDOW_LEVEL', payload: { wc: nWc, ww: nWw } });
          window.setTimeout(() => { applyingRef.current = false; }, 60);
        }
      };
      el.addEventListener(Enums.Events.VOI_MODIFIED, handler);
      cleanups.push(() => el.removeEventListener(Enums.Events.VOI_MODIFIED, handler));
    }
    return () => cleanups.forEach((f) => f());
  }, [dispatch, state.volumeId, state.layoutMode]);

  return null;
}
