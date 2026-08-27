/**
 * Links window/level (contrast) across all views. The panoramic and
 * cross-section already read state.windowLevel; this component keeps the three
 * Cornerstone MPR viewports in sync with it in both directions:
 *   - state.windowLevel → applied to the MPR viewports (presets, sliders)
 *   - dragging W/L on an MPR viewport → written back to state.windowLevel
 * A guard flag + change threshold prevent feedback loops.
 */

import { useEffect, useRef } from 'react';
import { getRenderingEngine, Enums } from '@cornerstonejs/core';
import { useViewer } from '@/context/ViewerContext';
import { RENDERING_ENGINE_ID, VP_AXIAL, VP_SAGITTAL, VP_CORONAL } from '@/core/constants';

const MPR_IDS = [VP_AXIAL, VP_SAGITTAL, VP_CORONAL];

export function WindowLevelSync() {
  const { state, dispatch } = useViewer();
  const { wc, ww } = state.windowLevel;
  const applyingRef = useRef(false);

  // state.windowLevel → MPR viewports
  useEffect(() => {
    const engine = getRenderingEngine(RENDERING_ENGINE_ID);
    if (!engine) return;
    applyingRef.current = true;
    const range = { lower: wc - ww / 2, upper: wc + ww / 2 };
    for (const id of MPR_IDS) {
      const vp = engine.getViewport(id) as any;
      try { vp?.setProperties?.({ voiRange: range }); vp?.render?.(); } catch { /* not ready */ }
    }
    const raf = requestAnimationFrame(() => { applyingRef.current = false; });
    return () => cancelAnimationFrame(raf);
  }, [wc, ww]);

  // MPR viewport W/L drag → state.windowLevel
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
        if (Math.abs(nWw - ww) > 1 || Math.abs(nWc - wc) > 1) {
          dispatch({ type: 'SET_WINDOW_LEVEL', payload: { wc: nWc, ww: nWw } });
        }
      };
      el.addEventListener(Enums.Events.VOI_MODIFIED, handler);
      cleanups.push(() => el.removeEventListener(Enums.Events.VOI_MODIFIED, handler));
    }
    return () => cleanups.forEach((f) => f());
  }, [dispatch, wc, ww, state.layoutMode, state.volumeId]);

  return null;
}
