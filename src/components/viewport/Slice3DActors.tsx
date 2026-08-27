/**
 * Syncs orthogonal CT slice-plane meshes into the Cornerstone VOLUME_3D scene,
 * so the axial/sagittal/coronal slices appear as textured planes intersecting
 * the 3D volume (voxel-viewer style). Renders nothing itself.
 *
 * The planes are textured vtkActor meshes (see core/slice3D) — safe alongside
 * the volume ray-caster. E1: shown at their center; E2: each plane follows its
 * MPR viewport's current slice (one-way MPR → 3D), rebuilding only on change.
 */

import { useEffect, useRef } from 'react';
import { getRenderingEngine, Enums, type Types } from '@cornerstonejs/core';
import { useViewer } from '@/context/ViewerContext';
import { RENDERING_ENGINE_ID, VP_3D, VP_AXIAL, VP_SAGITTAL, VP_CORONAL } from '@/core/constants';
import { getVolumeData } from '@/core/cprEngine';
import {
  SLICE_AXES, buildSliceActor, centerSliceIndex, sliceIndexAtWorld,
  type SliceAxis, type VolumeInfo,
} from '@/core/slice3D';

/** MPR viewport that drives each 3D slice plane. */
const AXIS_VP: Record<SliceAxis, string> = {
  AXIAL: VP_AXIAL,
  SAGITTAL: VP_SAGITTAL,
  CORONAL: VP_CORONAL,
};

export function Slice3DActors({ axes, preset, rebuildKey }: { axes: Record<SliceAxis, boolean>; preset?: string; rebuildKey?: number }) {
  const { state } = useViewer();
  const addedRef = useRef<string[]>([]);

  useEffect(() => {
    const engine = getRenderingEngine(RENDERING_ENGINE_ID);
    const viewport = engine?.getViewport(VP_3D) as Types.IVolumeViewport | undefined;
    if (!viewport) return;

    // Clear previously added slice actors
    if (addedRef.current.length) {
      try { viewport.removeActors(addedRef.current); } catch { /* viewport gone */ }
      addedRef.current = [];
    }

    let vi: VolumeInfo | null = null;
    try {
      const vd = state.volumeId ? getVolumeData(state.volumeId) : null;
      if (vd) {
        vi = {
          getVoxel: vd.getVoxel,
          dims: vd.dims,
          spacing: [1 / vd.invSx, 1 / vd.invSy, 1 / vd.invSz],
          origin: vd.origin,
        };
      }
    } catch (err) {
      console.error('[slice3d] volume info failed', err);
    }
    if (!vi) {
      console.warn('[slice3d] no volume data available');
      return;
    }

    const voi = { wc: state.windowLevel.wc, ww: state.windowLevel.ww };
    const activeAxes = SLICE_AXES.filter((a) => axes[a]);
    if (!activeAxes.length) return;
    const indexByAxis: Partial<Record<SliceAxis, number>> = {};

    const targetIndex = (axis: SliceAxis): number => {
      const mpr = engine?.getViewport(AXIS_VP[axis]) as Types.IVolumeViewport | undefined;
      const fp = mpr?.getCamera()?.focalPoint as [number, number, number] | undefined;
      return fp ? sliceIndexAtWorld(vi!, axis, fp) : centerSliceIndex(vi!, axis);
    };

    const addAxis = (axis: SliceAxis, index: number) => {
      const actor = buildSliceActor(vi!, axis, index, voi, state.display.sliceOpacity);
      const uid = `slice3d:${axis}`;
      viewport.addActor({ uid, actor });
      addedRef.current.push(uid);
      indexByAxis[axis] = index;
    };

    try {
      for (const axis of activeAxes) addAxis(axis, targetIndex(axis));
      viewport.render();
    } catch (err) {
      console.error('[slice3d] build failed', err);
    }

    // E2: follow MPR scrolling — rebuild only the plane whose slice changed
    let syncing = false;
    const syncAll = () => {
      if (syncing) return;
      syncing = true;
      try {
        let changed = false;
        for (const axis of activeAxes) {
          const idx = targetIndex(axis);
          if (indexByAxis[axis] === idx) continue;
          const uid = `slice3d:${axis}`;
          try { viewport.removeActors([uid]); } catch { /* gone */ }
          addedRef.current = addedRef.current.filter((u) => u !== uid);
          addAxis(axis, idx);
          changed = true;
        }
        if (changed) viewport.render();
      } catch (err) {
        console.error('[slice3d] sync failed', err);
      } finally {
        syncing = false;
      }
    };

    const cleanups: Array<() => void> = [];
    for (const axis of activeAxes) {
      const mpr = engine?.getViewport(AXIS_VP[axis]) as Types.IVolumeViewport | undefined;
      const el = mpr?.element;
      if (!el) continue;
      const handler = () => syncAll();
      el.addEventListener(Enums.Events.CAMERA_MODIFIED, handler);
      cleanups.push(() => el.removeEventListener(Enums.Events.CAMERA_MODIFIED, handler));
    }

    return () => {
      cleanups.forEach((fn) => fn());
      const eng = getRenderingEngine(RENDERING_ENGINE_ID);
      const vp = eng?.getViewport(VP_3D) as Types.IVolumeViewport | undefined;
      if (vp && addedRef.current.length) {
        try { vp.removeActors(addedRef.current); vp.render(); } catch { /* viewport gone */ }
        addedRef.current = [];
      }
    };
  }, [axes, state.windowLevel, state.volumeId, state.layoutMode, state.panel, state.display.sliceOpacity, preset, rebuildKey]);

  return null;
}
