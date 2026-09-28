/**
 * Draws the detected radiopaque markers into the 3D scene while a registration
 * is running. Renders nothing itself.
 *
 * Without them the operator would be told "six markers found" and have no way
 * to aim at one. With them, picking the CBCT side of a pair stops being "click
 * the right voxel of a translucent volume" and becomes "click the bead you can
 * see" — which is the whole point of detecting them.
 *
 * A candidate that has already been assigned to a pair is drawn in the accent
 * colour, so what is left to do is obvious at a glance.
 */

import { useEffect, useRef } from 'react';
import { getRenderingEngine, type Types } from '@cornerstonejs/core';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkSphereSource from '@kitware/vtk.js/Filters/Sources/SphereSource';
import { useViewer } from '@/context/ViewerContext';
import { RENDERING_ENGINE_ID, VP_3D } from '@/core/constants';
import type { Fiducial } from '@/core/fiducials';
import type { Vec3 } from '@/core/implantGeometry';

/** Drawn a little larger than the bead so it reads as a target, not as anatomy. */
const HALO = 1.6;
const MIN_RADIUS_MM = 0.7;

function sphereActor(center: Vec3, radius: number, color: [number, number, number], opacity: number) {
  const source = vtkSphereSource.newInstance({
    center: [center[0], center[1], center[2]],
    radius,
    phiResolution: 16,
    thetaResolution: 16,
  });
  const mapper = vtkMapper.newInstance();
  mapper.setInputConnection(source.getOutputPort());
  const actor = vtkActor.newInstance();
  actor.setMapper(mapper);
  const prop = actor.getProperty();
  prop.setColor(...color);
  prop.setOpacity(opacity);
  // Flat and bright: this is a marker, and it has to stay readable against a
  // translucent X-ray volume rather than blend into it.
  prop.setAmbient(1);
  prop.setDiffuse(0);
  return actor;
}

/** Which candidates already sit in a pair, so they can be drawn as done. */
function assignedCenters(pairs: { cbct: [number, number, number] | null }[]): Vec3[] {
  return pairs.map((p) => p.cbct).filter(Boolean) as Vec3[];
}

const isAssigned = (f: Fiducial, taken: Vec3[]) => taken.some((t) =>
  Math.hypot(t[0] - f.center[0], t[1] - f.center[1], t[2] - f.center[2]) < 0.4);

export function FiducialActors() {
  const { state } = useViewer();
  const addedRef = useRef<string[]>([]);
  const reg = state.registration;
  const fiducials = reg?.fiducials ?? [];
  // Serialized so the effect only re-runs when what is drawn actually changes.
  const key = JSON.stringify([fiducials.map((f) => f.center), assignedCenters(reg?.pairs ?? [])]);

  useEffect(() => {
    const engine = getRenderingEngine(RENDERING_ENGINE_ID);
    const viewport = engine?.getViewport(VP_3D) as Types.IVolumeViewport | undefined;
    if (!viewport) return;

    if (addedRef.current.length) {
      try { viewport.removeActors(addedRef.current); } catch { /* viewport gone */ }
      addedRef.current = [];
    }

    const taken = assignedCenters(reg?.pairs ?? []);
    fiducials.forEach((f, i) => {
      const radius = Math.max(MIN_RADIUS_MM, (f.diameterMm / 2) * HALO);
      const done = isAssigned(f, taken);
      const actor = sphereActor(f.center, radius, done ? [0.25, 0.8, 0.45] : [1, 0.85, 0.2], done ? 0.85 : 0.95);
      const uid = `fiducial3d:${i}`;
      viewport.addActor({ uid, actor });
      addedRef.current.push(uid);
    });
    viewport.render();

    return () => {
      const eng = getRenderingEngine(RENDERING_ENGINE_ID);
      const vp = eng?.getViewport(VP_3D) as Types.IVolumeViewport | undefined;
      if (vp && addedRef.current.length) {
        try { vp.removeActors(addedRef.current); vp.render(); } catch { /* viewport gone */ }
        addedRef.current = [];
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` covers the contents
  }, [key, state.volumeId]);

  return null;
}
