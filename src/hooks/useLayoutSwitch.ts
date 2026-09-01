/**
 * Layout switching logic (shared by the TopBar layout buttons): initializes
 * the arch curve for OPG layouts and picks the appropriate default tool.
 */

import { useCallback } from 'react';
import { cache } from '@cornerstonejs/core';
import { useViewer } from '@/context/ViewerContext';
import { setActiveTool } from '@/core/toolManager';
import { generateDefaultArchCurve } from '@/core/archCurve';
import type { LayoutMode } from '@/types/dicom';

export function useLayoutSwitch() {
  const { state, dispatch } = useViewer();

  return useCallback((layout: LayoutMode) => {
    dispatch({ type: 'SET_LAYOUT_MODE', payload: layout });

    if (layout === 'OPG2+1') {
      // Initialize default arch curve if not yet drawn
      if (!state.archCurveControlPoints && state.volumeId) {
        const volume = cache.getVolume(state.volumeId);
        if (volume) {
          const o = volume.origin as [number, number, number];
          const d = volume.dimensions as [number, number, number];
          const s = volume.spacing as [number, number, number];
          const center: [number, number] = [
            o[0] + (d[0] * s[0]) / 2,
            o[1] + (d[1] * s[1]) / 2,
          ];
          const size: [number, number] = [d[0] * s[0], d[1] * s[1]];
          dispatch({ type: 'SET_ARCH_CURVE', payload: generateDefaultArchCurve(center, size) });
        }
      }
      // W/L is the default tool in OPG mode
      setActiveTool('windowLevel');
      dispatch({ type: 'SET_ACTIVE_TOOL', payload: 'windowLevel' });
    } else if (layout === '2x2' || layout === '1+3') {
      // Auto-activate crosshairs in multi-view mode (slight delay for viewports to mount)
      setTimeout(() => {
        setActiveTool('crosshairs');
        dispatch({ type: 'SET_ACTIVE_TOOL', payload: 'crosshairs' });
      }, 150);
    } else if (state.activeTool === 'crosshairs') {
      // Switch back to W/L when going to 1x1
      setActiveTool('windowLevel');
      dispatch({ type: 'SET_ACTIVE_TOOL', payload: 'windowLevel' });
    }
  }, [state.archCurveControlPoints, state.volumeId, state.activeTool, dispatch]);
}
