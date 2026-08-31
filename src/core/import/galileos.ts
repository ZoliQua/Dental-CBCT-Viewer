/**
 * GALILEOS (Sirona CBCT) folder import. A GALILEOS export folder contains:
 *   - `*_vol_0`         — a gzip'd XML header (dimensions, voxel size, range)
 *   - `*_vol_0_000..N`  — gzip'd uint16 slice files (0–4095, 12-bit)
 *   - optional `*_proj_0` panorama XML (ignored here)
 *
 * Implemented from the documented format facts (not from any GPL/proprietary
 * source). GALILEOS volumes are the standard 512×512×N at 0.16 mm; the XML
 * field names are matched defensively and fall back to those defaults, so this
 * should be verified against a real export.
 */

import { gunzip, baseName } from './gzip';
import type { RawVolume } from './rawVolumeLoader';

const VOL0 = /_vol_0$/i;
const VOL0_SLICE = /_vol_0_(\d+)$/i;

/** True when the file list looks like a GALILEOS export. */
export function matchGalileos(files: File[]): boolean {
  return files.some((f) => VOL0.test(baseName(f))) && files.some((f) => VOL0_SLICE.test(baseName(f)));
}

function num(re: RegExp, xml: string, def: number): number {
  const m = xml.match(re);
  const v = m ? parseFloat(m[1]) : NaN;
  return Number.isFinite(v) ? v : def;
}

function parseHeader(xml: string, sliceCount: number) {
  // Try a few plausible tag/attribute spellings; fall back to GALILEOS defaults.
  const cols = Math.round(num(/(?:sizex|columns|width|dimx|nx)\D{0,4}(\d{2,4})/i, xml, 512));
  const rows = Math.round(num(/(?:sizey|rows|height|dimy|ny)\D{0,4}(\d{2,4})/i, xml, 512));
  const sp = num(/(?:voxelsize|spacing|resolution|pixelsize)\D{0,6}([0-9]*\.?[0-9]+)/i, xml, 0.16);
  const maxValue = Math.round(num(/(?:maxvalue|rangemax|max)\D{0,6}(\d{3,5})/i, xml, 4095));
  return { cols, rows, sp: sp > 0 && sp < 5 ? sp : 0.16, maxValue, depth: sliceCount };
}

export async function parseGalileos(files: File[], onProgress?: (pct: number) => void): Promise<RawVolume> {
  const header = files.find((f) => VOL0.test(baseName(f)));
  const slices = files
    .filter((f) => VOL0_SLICE.test(baseName(f)))
    .sort((a, b) => Number(baseName(a).match(VOL0_SLICE)![1]) - Number(baseName(b).match(VOL0_SLICE)![1]));
  if (!header || slices.length === 0) throw new Error('GALILEOS: missing *_vol_0 header or slice files');

  const xml = new TextDecoder().decode(await gunzip(await header.arrayBuffer()));
  const { cols, rows, sp, maxValue, depth } = parseHeader(xml, slices.length);
  const sliceLen = cols * rows;
  const data = new Int16Array(sliceLen * depth);

  for (let k = 0; k < slices.length; k++) {
    const buf = await gunzip(await slices[k].arrayBuffer());
    // 12-bit unsigned samples (0–4095) → fit directly into int16.
    const u16 = new Uint16Array(buf.byteLength >= sliceLen * 2 ? buf.slice(0, sliceLen * 2) : buf);
    data.set(u16.subarray(0, sliceLen), k * sliceLen);
    onProgress?.(Math.round((k / slices.length) * 85));
  }

  return {
    data,
    dimensions: [cols, rows, depth],
    spacing: [sp, sp, sp],
    windowCenter: Math.round(maxValue * 0.35),
    windowWidth: maxValue,
    modality: 'CT',
    minValue: 0,
    maxValue,
    seriesDescription: 'GALILEOS CBCT',
  };
}
