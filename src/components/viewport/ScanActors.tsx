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
import { getScanPolyData, buildScanActor } from '@/core/scanMesh';

export function ScanActors() {
  const { state } = useViewer();
  const addedRef = useRef<string[]>([]);

  useEffect(() => {
    const engine = getRenderingEngine(RENDERING_ENGINE_ID);
    const viewport = engine?.getViewport(VP_3D) as Types.IVolumeViewport | undefined;
    if (!viewport) return;

    if (addedRef.current.length) {
      try { viewport.removeActors(addedRef.current); } catch { /* viewport gone */ }
      addedRef.current = [];
    }

    for (const scan of state.scans) {
      if (!scan.visible) continue;
      const pd = getScanPolyData(scan.id);
      if (!pd) continue; // geometry not loaded this session (needs re-import)
      const actor = buildScanActor(pd, scan.color, scan.opacity, scan.transform);
      const uid = `scan3d:${scan.id}`;
      viewport.addActor({ uid, actor });
      addedRef.current.push(uid);
    }

    viewport.render();

    return () => {
      const eng = getRenderingEngine(RENDERING_ENGINE_ID);
      const vp = eng?.getViewport(VP_3D) as Types.IVolumeViewport | undefined;
      if (vp && addedRef.current.length) {
        try { vp.removeActors(addedRef.current); vp.render(); } catch { /* viewport gone */ }
        addedRef.current = [];
      }
    };
  }, [state.scans]);

  return null;
}
