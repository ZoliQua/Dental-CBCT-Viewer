/**
 * Syncs imported scan-mesh actors into the Cornerstone VOLUME_3D viewport.
 * Geometry comes from the scanMesh registry (by id); this component only
 * mirrors the ScanMesh metadata (color / opacity / visibility / transform)
 * onto vtk actors, rebuilding them when the scans change.
 */

import { useEffect, useRef } from 'react';
import { getRenderingEngine, type Types } from '@cornerstonejs/core';
import { useViewer } from '@/context/ViewerContext';
import { RENDERING_ENGINE_ID, VP_3D } from '@/core/constants';
import { getScanPolyData, buildScanActor, updateScanActor } from '@/core/scanMesh';

export function ScanActors() {
  const { state } = useViewer();
  // While a CBCT landmark is being picked in 3D, the scan being registered is
  // sitting on top of the very teeth the user has to click. The ray only ever
  // queries the volume, so the pick would still work — but you cannot aim at
  // what you cannot see, so the scan steps out of the way until the click lands.
  const pickingCbct = state.registration?.picking?.kind === 'cbct';
  const hiddenId = pickingCbct ? state.registration?.scanId : null;

  // Actors are kept per scan id and updated in place: an opacity drag or a
  // transform nudge must not re-upload every scan's vertices on each tick.
  // Only a scan whose geometry changed (or that appears) gets a new actor.
  const actorsRef = useRef(new Map<string, { actor: any; pd: unknown }>());

  useEffect(() => {
    const engine = getRenderingEngine(RENDERING_ENGINE_ID);
    const viewport = engine?.getViewport(VP_3D) as Types.IVolumeViewport | undefined;
    if (!viewport) return;
    const actors = actorsRef.current;
    const wanted = new Set<string>();

    for (const scan of state.scans) {
      if (!scan.visible || scan.id === hiddenId) continue;
      const pd = getScanPolyData(scan.id);
      if (!pd) continue; // geometry not loaded this session (needs re-import)
      wanted.add(scan.id);
      const uid = `scan3d:${scan.id}`;
      const have = actors.get(scan.id);
      if (have && have.pd === pd) {
        updateScanActor(have.actor, scan.color, scan.opacity, scan.transform);
        continue;
      }
      if (have) { try { viewport.removeActors([uid]); } catch { /* gone */ } }
      const actor = buildScanActor(pd, scan.color, scan.opacity, scan.transform);
      viewport.addActor({ uid, actor });
      actors.set(scan.id, { actor, pd });
    }
    for (const id of [...actors.keys()]) {
      if (wanted.has(id)) continue;
      try { viewport.removeActors([`scan3d:${id}`]); } catch { /* gone */ }
      actors.delete(id);
    }
    viewport.render();
  }, [state.scans, hiddenId]);

  // Remove them all when the component goes away.
  useEffect(() => () => {
    const vp = getRenderingEngine(RENDERING_ENGINE_ID)?.getViewport(VP_3D) as Types.IVolumeViewport | undefined;
    const uids = [...actorsRef.current.keys()].map((id) => `scan3d:${id}`);
    actorsRef.current.clear();
    if (vp && uids.length) {
      try { vp.removeActors(uids); vp.render(); } catch { /* viewport gone */ }
    }
  }, []);

  return null;
}
