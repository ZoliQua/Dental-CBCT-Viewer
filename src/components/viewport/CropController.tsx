/**
 * Applies the volume's clipping to the 3D view as vtk clipping planes: the crop
 * box (to cut away structures and reveal the slice planes) and the jaw filter
 * (to show one arch at a time so it can be turned around on its own). Both feed
 * the same mapper, so they are set together. Renders nothing.
 */

import { useEffect } from 'react';
import { getRenderingEngine, type Types } from '@cornerstonejs/core';
import vtkPlane from '@kitware/vtk.js/Common/DataModel/Plane';
import { useViewer } from '@/context/ViewerContext';
import { RENDERING_ENGINE_ID, VP_3D } from '@/core/constants';
import { clipPlanes, type ClipPlaneParam, type CropBox } from '@/core/cropBox';
import type { Vec3 } from '@/core/implantGeometry';

export function CropController({
  crop, enabled, jawPlane,
}: { crop: CropBox; enabled: boolean; jawPlane?: ClipPlaneParam | null }) {
  const { state } = useViewer();

  useEffect(() => {
    const engine = getRenderingEngine(RENDERING_ENGINE_ID);
    const vp = engine?.getViewport(VP_3D) as Types.IVolumeViewport | undefined;
    if (!vp) return;
    const actor = (vp as any).getDefaultActor?.()?.actor;
    const mapper = actor?.getMapper?.();
    if (!mapper) return;

    try {
      mapper.removeAllClippingPlanes();
      // The jaw cut is independent of the crop box — either can be on alone.
      if (jawPlane) {
        mapper.addClippingPlane(vtkPlane.newInstance({ origin: jawPlane.origin, normal: jawPlane.normal }));
      }
      if (enabled) {
        // Use the actor's real world AABB — the exact space the clipping planes
        // operate in — so the crop maps correctly regardless of the volume's
        // origin/direction (computing bounds by hand made the whole volume clip
        // away).
        const b = actor.getBounds?.() as [number, number, number, number, number, number] | undefined;
        if (b) {
          const bmin: Vec3 = [b[0], b[2], b[4]];
          const bmax: Vec3 = [b[1], b[3], b[5]];
          for (const p of clipPlanes(bmin, bmax, crop)) {
            mapper.addClippingPlane(vtkPlane.newInstance({ origin: p.origin, normal: p.normal }));
          }
        }
      }
      vp.render();
    } catch (err) {
      console.error('[crop] apply failed', err);
    }

    return () => {
      try { mapper.removeAllClippingPlanes(); vp.render(); } catch { /* viewport gone */ }
    };
  }, [crop, enabled, jawPlane, state.volumeId]);

  return null;
}
