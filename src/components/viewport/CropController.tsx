/**
 * Applies the crop box to the 3D volume as vtk clipping planes, so the volume
 * can be cut away to reveal internal structures and the slice planes. Renders
 * nothing. Clipping planes live on the volume mapper (getDefaultActor).
 */

import { useEffect } from 'react';
import { getRenderingEngine, type Types } from '@cornerstonejs/core';
import vtkPlane from '@kitware/vtk.js/Common/DataModel/Plane';
import { useViewer } from '@/context/ViewerContext';
import { RENDERING_ENGINE_ID, VP_3D } from '@/core/constants';
import { clipPlanes, type CropBox } from '@/core/cropBox';
import type { Vec3 } from '@/core/implantGeometry';

export function CropController({ crop, enabled }: { crop: CropBox; enabled: boolean }) {
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
  }, [crop, enabled, state.volumeId]);

  return null;
}
