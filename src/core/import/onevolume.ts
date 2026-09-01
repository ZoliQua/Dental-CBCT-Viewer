/**
 * OneVolume (Morita CBCT) native `CT_0.vol` import. The container is:
 *   - 4-byte prefix
 *   - `JmVolumeVersion=1` marker
 *   - 4-byte little-endian XML length
 *   - XML payload (dimensions, grid spacing, slope/intercept)
 *   - 36-byte `CArray3D` bounds block
 *   - raw signed int16 voxel payload (−32768 = background sentinel)
 *
 * Implemented from the documented format facts (not from any GPL/proprietary
 * source). The XML field names are matched defensively; verify against a real
 * `CT_0.vol` export.
 */

import { baseName } from './gzip';
import type { RawVolume } from './rawVolumeLoader';

const CT_VOL = /(^|\/)CT_0\.vol$/i;
const SENTINEL = -32768;
const VERSION = 'JmVolumeVersion=1';

// Sanity limits for declared geometry (validated before any allocation).
const MAX_AXIS = 2048;
const MAX_DEPTH = 2000;
const MAX_VOXELS = 2 ** 30;

export function matchOneVolume(files: File[]): boolean {
  return files.some((f) => CT_VOL.test(baseName(f)) || CT_VOL.test((f as any).webkitRelativePath || ''));
}

function num(re: RegExp, xml: string, def: number): number {
  const m = xml.match(re);
  const v = m ? parseFloat(m[1]) : NaN;
  return Number.isFinite(v) ? v : def;
}

export async function parseOneVolume(files: File[], onProgress?: (pct: number) => void): Promise<RawVolume> {
  const file = files.find((f) => CT_VOL.test(baseName(f)) || CT_VOL.test((f as any).webkitRelativePath || ''));
  if (!file) throw new Error('OneVolume: CT_0.vol not found');

  const buf = await file.arrayBuffer();
  const dv = new DataView(buf);

  // Locate the version marker, then the 4-byte XML length + XML payload.
  const headText = new TextDecoder('latin1').decode(new Uint8Array(buf, 0, Math.min(512, buf.byteLength)));
  const vIdx = headText.indexOf(VERSION);
  if (vIdx < 0) throw new Error('OneVolume: version marker not found');
  let off = vIdx + VERSION.length;
  if (dv.getUint8(off) === 0) off += 1; // optional null terminator
  const xmlLen = dv.getUint32(off, true); off += 4;
  if (xmlLen <= 0 || off + xmlLen > buf.byteLength) throw new Error('OneVolume: bad XML length');
  const xml = new TextDecoder().decode(new Uint8Array(buf, off, xmlLen)); off += xmlLen;
  off += 36; // CArray3D bounds block

  // Geometry + scaling from the XML (defensive field matching).
  const cols = Math.round(num(/(?:sizex|columns|width|dimx|nx)\D{0,4}(\d{2,4})/i, xml, 0));
  const rows = Math.round(num(/(?:sizey|rows|height|dimy|ny)\D{0,4}(\d{2,4})/i, xml, 0));
  let depth = Math.round(num(/(?:sizez|slices|depth|dimz|nz)\D{0,4}(\d{2,4})/i, xml, 0));
  const sp = num(/(?:voxelsize|spacing|gridspacing|resolution|pixelsize)\D{0,6}([0-9]*\.?[0-9]+)/i, xml, 0.125);
  const slope = num(/(?:slope|rescaleslope)\D{0,6}([0-9]*\.?[0-9]+)/i, xml, 1);
  const intercept = num(/(?:intercept|rescaleintercept)\D{0,6}(-?[0-9]*\.?[0-9]+)/i, xml, 0);

  // Aligned int16 view of the remaining payload.
  const payload = new Int16Array(buf.slice(off));
  if (!cols || !rows) throw new Error('OneVolume: could not read dimensions from header');
  // Validate declared geometry before allocating anything.
  if (cols > MAX_AXIS || rows > MAX_AXIS) {
    throw new Error(`OneVolume: implausible dimensions ${cols}×${rows} (per-axis limit ${MAX_AXIS})`);
  }
  if (!depth) depth = Math.floor(payload.length / (cols * rows));
  if (depth < 1) throw new Error('OneVolume: no slice data in payload');
  if (depth > MAX_DEPTH) throw new Error(`OneVolume: implausible depth ${depth} (limit ${MAX_DEPTH})`);
  const voxels = cols * rows * depth;
  if (voxels > MAX_VOXELS) {
    throw new Error(`OneVolume: volume ${cols}×${rows}×${depth} exceeds the ${MAX_VOXELS} voxel limit`);
  }
  if (payload.length < voxels) {
    throw new Error(
      `OneVolume: payload too short — header declares ${cols}×${rows}×${depth} ` +
      `(${voxels} voxels) but only ${payload.length} samples remain`,
    );
  }

  // Scale into viewer units; map the background sentinel to a low value.
  const spacing = sp > 0 && sp < 5 ? sp : 0.125;
  const out = new Int16Array(voxels);
  let min = 32767, max = -32768;
  for (let i = 0; i < voxels; i++) {
    const raw = payload[i];
    let v = raw === SENTINEL ? -1000 : Math.round(raw * slope + intercept);
    if (v < -32768) v = -32768; else if (v > 32767) v = 32767;
    out[i] = v;
    if (raw !== SENTINEL) { if (v < min) min = v; if (v > max) max = v; }
    if ((i & 0x3fffff) === 0) onProgress?.(Math.round((i / voxels) * 85));
  }

  return {
    data: out,
    dimensions: [cols, rows, depth],
    spacing: [spacing, spacing, spacing],
    windowCenter: 300,
    windowWidth: 2500,
    modality: 'CT',
    minValue: min,
    maxValue: max,
    seriesDescription: 'OneVolume CT',
  };
}
