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
import { getVolumeData } from '@/core/cprEngine';
import { clipPlanes, type CropBox } from '@/core/cropBox';
import type { Vec3 } from '@/core/implantGeometry';

export function CropController({ crop, enabled }: { crop: CropBox; enabled: boolean }) {
  const { state } = useViewer();

  useEffect(() => {
    const engine = getRenderingEngine(RENDERING_ENGINE_ID);
    const vp = engine?.getViewport(VP_3D) as Types.IVolumeViewport | undefined;
    if (!vp) return;
    const mapper = (vp as any).getDefaultActor?.()?.actor?.getMapper?.();
    if (!mapper) return;

    try {
      mapper.removeAllClippingPlanes();
      if (enabled) {
        const vd = state.volumeId ? getVolumeData(state.volumeId) : null;
        if (vd) {
          const bmin = vd.origin as Vec3;
          const bmax: Vec3 = [
            vd.origin[0] + (vd.dims[0] - 1) / vd.invSx,
            vd.origin[1] + (vd.dims[1] - 1) / vd.invSy,
            vd.origin[2] + (vd.dims[2] - 1) / vd.invSz,
          ];
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
