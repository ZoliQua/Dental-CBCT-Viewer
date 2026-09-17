/**
 * Draws the cross-section cut plane inside the Cornerstone VOLUME_3D scene, so
 * the 3D view shows WHERE the panoramic cross-section is slicing. Renders
 * nothing itself — it just syncs a vtk actor into the 3D viewport.
 *
 * The quad follows the arch curve, the cross-section position and its tilt, so
 * dragging the cut on the panoramic moves this marker live.
 */

import { useEffect } from 'react';
import { getRenderingEngine, type Types } from '@cornerstonejs/core';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkPlaneSource from '@kitware/vtk.js/Filters/Sources/PlaneSource';
import { useViewer } from '@/context/ViewerContext';
import { RENDERING_ENGINE_ID, VP_3D } from '@/core/constants';
import { getVolumeData } from '@/core/cprEngine';
import { crossSectionFrame, crossSectionPlaneCorners } from '@/core/cprMath';

const UID = 'crossSection3d';
/** Half-width (mm) of the marker along the buccolingual axis. */
const HALF_WIDTH_MM = 25;

export function CrossSection3DActor() {
  const { state } = useViewer();
  const cps = state.archCurveControlPoints;
  const { crossSectionPosition, crossSectionTiltDeg, volumeId } = state;

  useEffect(() => {
    const engine = getRenderingEngine(RENDERING_ENGINE_ID);
    const viewport = engine?.getViewport(VP_3D) as Types.IVolumeViewport | undefined;
    if (!viewport) return;

    const remove = () => {
      try { viewport.removeActors([UID]); } catch { /* viewport gone */ }
    };
    remove(); // replace any previous marker

    const vol = volumeId ? getVolumeData(volumeId) : null;
    if (!cps || !vol) { viewport.render(); return; }
    const frame = crossSectionFrame(cps, crossSectionPosition, crossSectionTiltDeg, vol.zMin, vol.zMax);
    if (!frame) { viewport.render(); return; }

    const c = crossSectionPlaneCorners(frame, HALF_WIDTH_MM, (vol.zMax - vol.zMin) / 2);
    const plane = vtkPlaneSource.newInstance({ xResolution: 1, yResolution: 1 });
    plane.setOrigin(c.origin as any);
    plane.setPoint1(c.point1 as any);
    plane.setPoint2(c.point2 as any);

    const mapper = vtkMapper.newInstance();
    mapper.setInputConnection(plane.getOutputPort());
    mapper.setScalarVisibility(false);

    const actor = vtkActor.newInstance();
    actor.setMapper(mapper);
    const prop = actor.getProperty();
    // Match the cyan cross-section indicator used on the axial / panoramic.
    prop.setColor(0.39, 0.78, 1);
    prop.setOpacity(0.22);
    prop.setAmbient(1);
    prop.setDiffuse(0);
    // Outline the quad so the cut stays readable against the volume.
    prop.setEdgeVisibility(true);
    prop.setEdgeColor(0.39, 0.78, 1);
    prop.setLineWidth(2);

    try {
      viewport.addActor({ uid: UID, actor: actor as any });
      viewport.render();
    } catch { /* viewport not ready */ }

    return remove;
  }, [cps, crossSectionPosition, crossSectionTiltDeg, volumeId]);

  return null;
}
