/**
 * Importing surface scans (STL / OBJ / PLY) next to the loaded CT.
 *
 * Shared by the Series panel's "Load scan" button and the top bar's New load
 * menu, so both accept several files at once and treat them identically: the
 * arch is guessed from the file name (upper / lower), the geometry is parked in
 * the scanMesh registry and the mesh is dropped onto the volume's centre as a
 * starting position. That placement is deliberately crude — a scanner's
 * coordinate system has nothing to do with the CBCT's, so the scan still has to
 * be registered (Layers → Registration) or nudged into place by hand.
 */

import { useCallback } from 'react';
import { useViewer } from '@/context/ViewerContext';
import { useI18n } from '@/i18n/I18nContext';
import { detectScanType, SCAN_DEFAULTS, type ScanMesh } from '@/types/dicom';

export interface ScanImportResult {
  added: ScanMesh[];
  /** File names that could not be read as a mesh. */
  failed: string[];
}

export function useScanImport() {
  const { state, dispatch } = useViewer();
  const { t } = useI18n();

  return useCallback(async (files: File[]): Promise<ScanImportResult> => {
    // Cornerstone, vtk and the mesh readers are all heavy — pulled in only when
    // a scan is actually imported (see core/ensureCornerstone).
    const [{ loadScanPolyData, setScanPolyData, setScanBaseTransform, polyDataCenter, translation16, IDENTITY16, hasScanPolyData }, { getVolumeData }] =
      await Promise.all([import('@/core/scanMesh'), import('@/core/cprEngine')]);

    // Volume centre, computed once: every imported mesh starts there.
    const vol = state.volumeId ? getVolumeData(state.volumeId) : null;
    const volumeCenter = vol
      ? [
        vol.origin[0] + (vol.dims[0] - 1) / vol.invSx / 2,
        vol.origin[1] + (vol.dims[1] - 1) / vol.invSy / 2,
        vol.origin[2] + (vol.dims[2] - 1) / vol.invSz / 2,
      ]
      : null;

    const added: ScanMesh[] = [];
    const failed: string[] = [];

    for (const file of files) {
      const pd = await loadScanPolyData(file);
      if (!pd) {
        failed.push(file.name);
        continue;
      }
      // A loaded plan may already be waiting for this exact file, holding the
      // registration measured for it last time. Registering the geometry under
      // that entry's id revives it in place, which is the whole reason the plan
      // bothered to remember the file name.
      const awaiting = state.scans.find(
        (sc) => sc.fileName === file.name && !hasScanPolyData(sc.id));
      if (awaiting) {
        setScanPolyData(awaiting.id, pd);
        setScanBaseTransform(awaiting.id, awaiting.transform);
        dispatch({ type: 'UPDATE_SCAN', payload: { ...awaiting, visible: true } });
        added.push(awaiting);
        continue;
      }

      const id = `scan_${Date.now()}_${added.length}`;
      setScanPolyData(id, pd);

      let transform = IDENTITY16;
      if (volumeCenter) {
        const c = polyDataCenter(pd);
        transform = translation16(volumeCenter[0] - c[0], volumeCenter[1] - c[1], volumeCenter[2] - c[2]);
      }

      const type = detectScanType(file.name);
      const def = SCAN_DEFAULTS[type];
      const scan: ScanMesh = {
        id,
        name: file.name.replace(/\.[^.]+$/, ''),
        type,
        color: def.color,
        opacity: def.opacity,
        visible: true,
        transform,
        fileName: file.name,
      };
      setScanBaseTransform(id, transform); // the "reset" target for manual nudges
      dispatch({ type: 'ADD_SCAN', payload: scan });
      added.push(scan);
    }

    if (failed.length) window.alert(`${t('scan.invalid')}\n\n${failed.join('\n')}`);
    return { added, failed };
  }, [state.volumeId, state.scans, dispatch, t]);
}
