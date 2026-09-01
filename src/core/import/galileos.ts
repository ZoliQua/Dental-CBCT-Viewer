/**
 * GALILEOS (Sirona CBCT) folder import. A GALILEOS export folder contains:
 *   - `*_vol_0`         — a gzip'd XML header (dimensions, voxel size, range)
 *   - `*_vol_0_000..N`  — gzip'd uint16 slice files (0–4095, 12-bit)
 *   - optional `*_proj_0` panorama XML (ignored here)
 *
 * Implemented from the documented format facts (not from any GPL/proprietary
 * source). GALILEOS volumes are the standard 512×512×N at 0.16 mm; the XML
 * field names are matched defensively and fall back to those defaults, so this
 * should be verified against a real export. Every fallback is reported in the
 * returned `warnings` so the assumption is never silent.
 */

import { gunzip, baseName } from './gzip';
import type { RawVolume } from './rawVolumeLoader';

const VOL0 = /_vol_0$/i;
const VOL0_SLICE = /_vol_0_(\d+)$/i;

// Sanity limits for declared geometry (validated before any allocation).
const MAX_AXIS = 2048;
const MAX_DEPTH = 2000;
const MAX_VOXELS = 2 ** 30;
const HEADER_BUDGET = 1024 * 1024; // 1 MB is generous for the XML header

/** True when the file list looks like a GALILEOS export. */
export function matchGalileos(files: File[]): boolean {
  return files.some((f) => VOL0.test(baseName(f))) && files.some((f) => VOL0_SLICE.test(baseName(f)));
}

function parseHeader(xml: string, sliceCount: number) {
  const warnings: string[] = [];
  // Try a few plausible tag/attribute spellings; fall back to GALILEOS defaults.
  const num = (re: RegExp, def: number, label: string): number => {
    const m = xml.match(re);
    const v = m ? parseFloat(m[1]) : NaN;
    if (!Number.isFinite(v)) {
      warnings.push(`${label} missing from header — assuming ${def}`);
      return def;
    }
    return v;
  };
  const cols = Math.round(num(/(?:sizex|columns|width|dimx|nx)\D{0,4}(\d{2,4})/i, 512, 'columns'));
  const rows = Math.round(num(/(?:sizey|rows|height|dimy|ny)\D{0,4}(\d{2,4})/i, 512, 'rows'));
  const sp = num(/(?:voxelsize|spacing|resolution|pixelsize)\D{0,6}([0-9]*\.?[0-9]+)/i, 0.16, 'voxel size');
  const maxValue = Math.round(num(/(?:maxvalue|rangemax|max)\D{0,6}(\d{3,5})/i, 4095, 'max value'));
  const spacing = sp > 0 && sp < 5 ? sp : 0.16;
  if (spacing !== sp) warnings.push(`implausible voxel size ${sp} — assuming 0.16 mm`);
  return { cols, rows, sp: spacing, maxValue, depth: sliceCount, warnings };
}

/** Tag-content text like `<patientName>DOE^JOHN</patientName>`, if present. */
function xmlText(xml: string, tag: RegExp): string | undefined {
  const m = xml.match(new RegExp(`<(?:${tag.source})[^>]*>\\s*([^<]+?)\\s*<`, 'i'));
  return m?.[1];
}

export async function parseGalileos(files: File[], onProgress?: (pct: number) => void): Promise<RawVolume> {
  const header = files.find((f) => VOL0.test(baseName(f)));
  const slices = files
    .filter((f) => VOL0_SLICE.test(baseName(f)))
    .sort((a, b) => Number(baseName(a).match(VOL0_SLICE)![1]) - Number(baseName(b).match(VOL0_SLICE)![1]));
  if (!header || slices.length === 0) throw new Error('GALILEOS: missing *_vol_0 header or slice files');

  const xml = new TextDecoder().decode(await gunzip(new Uint8Array(await header.arrayBuffer()), HEADER_BUDGET));
  const { cols, rows, sp, maxValue, depth, warnings } = parseHeader(xml, slices.length);

  // Validate declared geometry before allocating anything.
  if (cols < 1 || rows < 1 || cols > MAX_AXIS || rows > MAX_AXIS) {
    throw new Error(`GALILEOS: implausible dimensions ${cols}×${rows} (per-axis limit ${MAX_AXIS})`);
  }
  if (depth > MAX_DEPTH) throw new Error(`GALILEOS: implausible depth ${depth} (limit ${MAX_DEPTH})`);
  if (cols * rows * depth > MAX_VOXELS) {
    throw new Error(`GALILEOS: volume ${cols}×${rows}×${depth} exceeds the ${MAX_VOXELS} voxel limit`);
  }

  const sliceLen = cols * rows;
  const sliceBudget = sliceLen * 2 + 4096; // uint16 slice + slack for container padding
  const data = new Int16Array(sliceLen * depth);

  for (let k = 0; k < slices.length; k++) {
    const buf = await gunzip(new Uint8Array(await slices[k].arrayBuffer()), sliceBudget);
    // 12-bit unsigned samples (0–4095) → fit directly into int16.
    if (buf.byteLength < sliceLen * 2) {
      throw new Error(
        `GALILEOS: slice ${baseName(slices[k])} too short — header declares ${cols}×${rows} ` +
        `(${sliceLen * 2} bytes) but the decompressed payload has ${buf.byteLength} bytes`,
      );
    }
    data.set(new Uint16Array(buf.buffer, buf.byteOffset, sliceLen), k * sliceLen);
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
    patientName: xmlText(xml, /patient_?name/i),
    patientId: xmlText(xml, /patient_?id/i),
    seriesDescription: 'GALILEOS CBCT',
    warnings: warnings.length ? warnings : undefined,
  };
}
