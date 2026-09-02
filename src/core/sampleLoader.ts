/**
 * Loads the bundled anonymized sample volume (public/sample/) as a Cornerstone
 * streaming volume — the same render path as real DICOM. Instead of parsing
 * DICOM files, a tiny custom "sample" image loader + metadata provider serve the
 * slices of a gzipped raw int16 (HU) volume (produced by scripts/make-sample).
 *
 * Each load gets its own image-id scheme (`sample<N>:`) and registry entry, so
 * re-loading never invalidates a sample volume that is still on screen.
 */

import { imageLoader, metaData, volumeLoader, type Types } from '@cornerstonejs/core';
import { VOLUME_ID_PREFIX } from './constants';
import { gunzip } from './import/gzip';
import type { DicomStudyInfo } from '@/types/dicom';

const SCHEME_BASE = 'sample';
const FRAME_OF_REF = 'sample-frame-of-ref';
const IMAGE_ID = /^sample(\d+):(\d+)$/;

interface SampleMeta {
  dimensions: [number, number, number];
  spacing: [number, number, number];
  origin: [number, number, number];
  direction: number[];
  modality: string;
  windowCenter: number;
  windowWidth: number;
  patientName: string;
  studyDate: string;
  institution: string;
  seriesDescription: string;
}

export interface LoadedSample {
  study: DicomStudyInfo;
  volumeId: string;
  windowLevel: { wc: number; ww: number };
}

interface StoredSample {
  data: Int16Array;
  meta: SampleMeta;
}

let providerRegistered = false;
let counter = 0;
// scheme key (`sample<N>`) → volume; volumeId → scheme key (for disposal)
const volumes = new Map<string, StoredSample>();
const schemeByVolumeId = new Map<string, string>();
const registeredSchemes = new Set<string>();

function parseImageId(imageId: string): { key: string; index: number } | null {
  if (typeof imageId !== 'string') return null;
  const m = imageId.match(IMAGE_ID);
  return m ? { key: `${SCHEME_BASE}${m[1]}`, index: parseInt(m[2], 10) } : null;
}

/** Custom image loader: one slice of the raw volume as a bare image object. */
function loadImage(imageId: string): Types.IImageLoadObject {
  const promise = new Promise<any>((resolve, reject) => {
    const parsed = parseImageId(imageId);
    const entry = parsed && volumes.get(parsed.key);
    if (!parsed || !entry) return reject(new Error(`sample volume not loaded: ${imageId}`));
    const { data, meta } = entry;
    const [cols, rows] = meta.dimensions;
    const sliceLen = cols * rows;
    const pixelData = data.subarray(parsed.index * sliceLen, (parsed.index + 1) * sliceLen);
    resolve({
      imageId,
      getPixelData: () => pixelData,
      rows,
      columns: cols,
      height: rows,
      width: cols,
      color: false,
      numberOfComponents: 1,
      rgba: false,
      sliceThickness: meta.spacing[2],
      // DICOM convention: row spacing = Δ between rows (column direction) = sy.
      columnPixelSpacing: meta.spacing[0],
      rowPixelSpacing: meta.spacing[1],
      slope: 1,
      intercept: 0,
      minPixelValue: -1024,
      maxPixelValue: 3071,
      windowCenter: meta.windowCenter,
      windowWidth: meta.windowWidth,
      invert: false,
      sizeInBytes: pixelData.byteLength,
    });
  });
  return { promise } as Types.IImageLoadObject;
}

/** Metadata provider for sample<N>: image ids (geometry + pixel + scaling). */
function provider(type: string, imageId: string): unknown {
  const parsed = parseImageId(imageId);
  const entry = parsed && volumes.get(parsed.key);
  if (!parsed || !entry) return undefined;
  const { meta } = entry;
  const [cols, rows] = meta.dimensions;
  const [sx, sy, sz] = meta.spacing;
  const [ox, oy, oz] = meta.origin;
  const i = parsed.index;
  switch (type) {
    case 'imagePixelModule':
      return { bitsAllocated: 16, bitsStored: 16, highBit: 15, samplesPerPixel: 1, pixelRepresentation: 1, photometricInterpretation: 'MONOCHROME2', rows, columns: cols };
    case 'imagePlaneModule':
      return {
        imageOrientationPatient: [1, 0, 0, 0, 1, 0],
        imagePositionPatient: [ox, oy, oz + i * sz],
        rows, columns: cols,
        rowCosines: [1, 0, 0], columnCosines: [0, 1, 0],
        pixelSpacing: [sy, sx], rowPixelSpacing: sy, columnPixelSpacing: sx,
        sliceThickness: sz, sliceLocation: oz + i * sz,
        frameOfReferenceUID: FRAME_OF_REF,
      };
    case 'voiLutModule':
      return { windowCenter: meta.windowCenter, windowWidth: meta.windowWidth };
    case 'modalityLutModule':
      return { rescaleSlope: 1, rescaleIntercept: 0 };
    case 'generalSeriesModule':
      return { modality: meta.modality, seriesInstanceUID: 'sample-series' };
    default:
      return undefined;
  }
}

/** Register the metadata provider once and the loader for this scheme. */
function register(scheme: string) {
  if (!registeredSchemes.has(scheme)) {
    imageLoader.registerImageLoader(scheme, loadImage as any);
    registeredSchemes.add(scheme);
  }
  if (providerRegistered) return;
  metaData.addProvider(provider as any, 10000);
  providerRegistered = true;
}

/** Drop a sample volume's pixel data (call when its Cornerstone volume is purged). */
export function disposeSampleVolume(volumeId: string): void {
  const scheme = schemeByVolumeId.get(volumeId) ?? volumeId; // also accepts the scheme key
  schemeByVolumeId.delete(volumeId);
  volumes.delete(scheme);
}

async function fetchOk(url: string): Promise<Response> {
  let resp: Response;
  try {
    resp = await fetch(url, { cache: 'no-store' });
  } catch (e) {
    throw new Error(`fetch failed for ${url}: ${(e as Error).message}`);
  }
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
  return resp;
}

/** Read the volume body, reporting download fraction (0–1) as bytes arrive. */
async function readVolumeWithProgress(
  resp: Response,
  maxBytes: number,
  onFrac?: (f: number) => void,
): Promise<Int16Array> {
  const total = Number(resp.headers.get('Content-Length')) || 0;
  const reader = resp.body?.getReader();
  if (!reader) {
    const buf = await gunzip(new Uint8Array(await resp.arrayBuffer()), maxBytes);
    return new Int16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2);
  }

  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (total) onFrac?.(Math.min(1, received / total));
  }
  const raw = new Uint8Array(received);
  let off = 0;
  for (const c of chunks) { raw.set(c, off); off += c.length; }
  onFrac?.(1);
  const buf = await gunzip(raw, maxBytes);
  return new Int16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2);
}

export async function loadSample(base = '/sample', onProgress?: (pct: number) => void): Promise<LoadedSample> {
  onProgress?.(0);
  const meta = (await (await fetchOk(`${base}/meta.json`)).json()) as SampleMeta;
  const gzResp = await fetchOk(`${base}/volume.raw.bin`);
  const [cols, rows, depth] = meta.dimensions;
  // Decompression budget: int16 voxels + slack for container padding.
  const maxBytes = cols * rows * depth * 2 + 4096;
  // Download is the slow part on a network → map it to 0–90%.
  const data = await readVolumeWithProgress(gzResp, maxBytes, (f) => onProgress?.(Math.round(f * 90)));
  onProgress?.(92);

  const n = counter++;
  const scheme = `${SCHEME_BASE}${n}`;
  register(scheme);
  volumes.set(scheme, { data, meta });

  const imageIds = Array.from({ length: depth }, (_, i) => `${scheme}:${i}`);
  const volumeId = `${VOLUME_ID_PREFIX}sample${n}`;
  schemeByVolumeId.set(volumeId, scheme);

  const volume = await volumeLoader.createAndCacheVolume(volumeId, { imageIds });
  onProgress?.(96);
  await new Promise<void>((resolve, reject) => {
    (volume as any).load((evt: any) => {
      if (evt && evt.success === false) {
        reject(new Error(`Failed to load sample volume (${evt.imageId ?? 'frame load error'})`));
      } else {
        resolve();
      }
    });
  });
  onProgress?.(100);

  const study: DicomStudyInfo = {
    studyInstanceUID: 'sample-study',
    studyDescription: 'CBCT sample',
    studyDate: meta.studyDate,
    patientName: meta.patientName,
    patientId: 'SAMPLE',
    patientBirthDate: '',
    institution: meta.institution,
    series: [{
      seriesInstanceUID: 'sample-series',
      seriesDescription: meta.seriesDescription,
      seriesNumber: 1,
      modality: meta.modality,
      imageCount: depth,
      imageIds: [], // volume is already built here; keep empty so the shell won't rebuild it
      columns: cols,
      rows,
      pixelSpacingMm: meta.spacing[0],
    }],
  };

  return { study, volumeId, windowLevel: { wc: meta.windowCenter, ww: meta.windowWidth } };
}
