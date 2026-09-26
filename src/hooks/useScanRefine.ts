/**
 * "Refine to CT": fit a scan onto the CBCT's bone surface, starting from
 * wherever it currently sits.
 *
 * Three picked landmarks get a scan to roughly a millimetre — about as good as
 * clicking cusp tips by hand can be. This closes the gap: it pulls the dense
 * surface out of the volume around the scan and runs a trimmed ICP onto it
 * (core/scanRegister). The result is reported in millimetres so the operator
 * can see whether it actually helped, and it is a normal scan transform, so
 * "Reset placement" undoes it like any other correction.
 */

import { useCallback } from 'react';
import { useViewer } from '@/context/ViewerContext';
import type { ScanMesh } from '@/types/dicom';
import type { RefineResult } from '@/core/scanRegister';

export type RefineOutcome =
  | { ok: true; result: RefineResult }
  /** 'no-volume' — no CT open; 'no-mesh' — geometry not loaded this session;
   *  'no-target' — no bone where the scan is sitting, i.e. it is too far off
   *  for a surface fit and needs landmarks first. */
  | { ok: false; reason: 'no-volume' | 'no-mesh' | 'no-target' };

export function useScanRefine() {
  const { state, dispatch } = useViewer();

  return useCallback(async (scan: ScanMesh): Promise<RefineOutcome> => {
    if (!state.volumeId) return { ok: false, reason: 'no-volume' };
    const [{ getVolumeData }, { scanLocalPoints }, { refineScanToVolume }] = await Promise.all([
      import('@/core/cprEngine'),
      import('@/core/scanMesh'),
      import('@/core/scanRegister'),
    ]);

    const vol = getVolumeData(state.volumeId);
    if (!vol) return { ok: false, reason: 'no-volume' };
    const points = scanLocalPoints(scan.id);
    if (points.length < 32) return { ok: false, reason: 'no-mesh' };

    const result = refineScanToVolume(vol, points, scan.transform);
    if (!result) return { ok: false, reason: 'no-target' };

    dispatch({ type: 'UPDATE_SCAN', payload: { ...scan, transform: result.transform } });
    return { ok: true, result };
  }, [state.volumeId, dispatch]);
}
