/**
 * Loads the bundled sample's intraoral scans (public/sample-io/).
 *
 * The meshes ship as gzipped binary PLY next to the sample volume, each with
 * the 4×4 transform that puts it into that CBCT's patient frame — the pairing
 * is measured offline by scripts/register-scan-to-cbct.cjs and simply read back
 * here, so the sample opens already registered.
 *
 * The geometry itself goes straight into the scanMesh registry (it is far too
 * large for React state); only the ScanMesh descriptors are returned.
 */

import { gunzip } from './import/gzip';
import { parseScanMesh, setScanPolyData, setScanBaseTransform } from './scanMesh';
import { SCAN_DEFAULTS, type ScanMesh, type ScanType } from '@/types/dicom';
import { publicUrl } from '@/utils/publicUrl';

interface SampleScanEntry {
  file: string;
  type: ScanType;
  nameKey: string;
  transform: number[];
  triangles?: number;
  fileBytes?: number;
  registration?: { trimmedRmsMm: number; within03mmPct: number };
}

/** Decompression budget: a PLY of `triangles` faces cannot plausibly exceed this. */
const plyBudget = (triangles: number | undefined) => Math.max(4 << 20, (triangles ?? 0) * 64 + (1 << 20));

async function fetchOk(url: string): Promise<Response> {
  const resp = await fetch(url, { cache: 'no-store' });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
  return resp;
}

/**
 * Fetch, decompress and register the sample's scan meshes.
 * `label` turns a manifest nameKey into the display name (an i18n lookup).
 * Returns the ScanMesh descriptors, ready to dispatch as ADD_SCAN.
 */
export async function loadSampleScans(
  label: (nameKey: string) => string,
  base = publicUrl('sample-io'),
  onProgress?: (frac: number) => void,
): Promise<ScanMesh[]> {
  const manifest = (await (await fetchOk(`${base}/scans.json`)).json()) as { scans?: SampleScanEntry[] };
  const entries = Array.isArray(manifest.scans) ? manifest.scans : [];
  const out: ScanMesh[] = [];

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const bytes = new Uint8Array(await (await fetchOk(`${base}/${e.file}`)).arrayBuffer());
    const pd = parseScanMesh(e.file.replace(/\.gz$/, ''), (await gunzip(bytes, plyBudget(e.triangles))).buffer as ArrayBuffer);
    if (!pd) {
      console.warn(`[DQ-DICOM] sample scan "${e.file}" could not be parsed — skipped`);
      continue;
    }
    const id = `scan_sample_${e.type}_${Date.now()}_${i}`;
    setScanPolyData(id, pd);
    setScanBaseTransform(id, e.transform); // manual nudges can be reset back to the measured pairing
    const def = SCAN_DEFAULTS[e.type] ?? SCAN_DEFAULTS.oral;
    out.push({
      id,
      name: label(e.nameKey),
      type: e.type,
      color: def.color,
      opacity: def.opacity,
      visible: true,
      transform: e.transform,
      fileName: e.file,
    });
    onProgress?.((i + 1) / entries.length);
  }
  return out;
}
