/**
 * Turns a decoded raw volume (int16 scalars + geometry) into a Cornerstone
 * streaming volume — the same "custom image loader + metadata provider" trick
 * the bundled sample uses, so non-DICOM sources (GALILEOS, OneVolume) render on
 * the identical pipeline as DICOM. The raw volume is stored slice-major:
 * slice k occupies data[k*cols*rows .. (k+1)*cols*rows).
 *
 * Each imported volume gets its own image-id scheme (`importvol<N>:`) and its
 * own registry entry, so re-importing never invalidates a volume that is still
 * on screen. Call `disposeRawVolume(volumeId)` when a volume is purged.
 */

import { imageLoader, metaData, volumeLoader, type Types } from '@cornerstonejs/core';
import { VOLUME_ID_PREFIX } from '../constants';
import type { DicomStudyInfo } from '@/types/dicom';

const SCHEME_BASE = 'importvol';
const FRAME_OF_REF = 'importvol-frame-of-ref';
const IMAGE_ID = /^importvol(\d+):(\d+)$/;

export interface RawVolume {
  /** int16 scalars, slice-major (k outer, then row j, then col i). */
  data: Int16Array;
  /** [cols, rows, depth] */
  dimensions: [number, number, number];
  /** [sx, sy, sz] mm */
  spacing: [number, number, number];
  /** [ox, oy, oz] mm — defaults to a centered volume if omitted */
  origin?: [number, number, number];
  windowCenter: number;
  windowWidth: number;
  modality: string;
  minValue: number;
  maxValue: number;
  patientName?: string;
  patientId?: string;
  seriesDescription?: string;
  /** Non-fatal assumptions made while decoding (e.g. header fallbacks). */
  warnings?: string[];
}

interface LoadedRaw {
  study: DicomStudyInfo;
  volumeId: string;
  windowLevel: { wc: number; ww: number };
}

let providerRegistered = false;
let counter = 0;
// scheme key (`importvol<N>`) → volume; volumeId → scheme key (for disposal)
const volumes = new Map<string, RawVolume>();
const schemeByVolumeId = new Map<string, string>();
const registeredSchemes = new Set<string>();

function parseImageId(imageId: string): { key: string; index: number } | null {
  if (typeof imageId !== 'string') return null;
  const m = imageId.match(IMAGE_ID);
  return m ? { key: `${SCHEME_BASE}${m[1]}`, index: parseInt(m[2], 10) } : null;
}

function loadImage(imageId: string): Types.IImageLoadObject {
  const promise = new Promise<any>((resolve, reject) => {
    const parsed = parseImageId(imageId);
    const vol = parsed && volumes.get(parsed.key);
    if (!parsed || !vol) return reject(new Error(`import volume not loaded: ${imageId}`));
    const [cols, rows] = vol.dimensions;
    const sliceLen = cols * rows;
    const pixelData = vol.data.subarray(parsed.index * sliceLen, (parsed.index + 1) * sliceLen);
    resolve({
      imageId,
      getPixelData: () => pixelData,
      rows, columns: cols, height: rows, width: cols,
      color: false, numberOfComponents: 1, rgba: false,
      sliceThickness: vol.spacing[2],
      // DICOM convention: row spacing = Δ between rows (column direction) = sy.
      columnPixelSpacing: vol.spacing[0],
      rowPixelSpacing: vol.spacing[1],
      slope: 1, intercept: 0,
      minPixelValue: vol.minValue, maxPixelValue: vol.maxValue,
      windowCenter: vol.windowCenter, windowWidth: vol.windowWidth,
      invert: false, sizeInBytes: pixelData.byteLength,
    });
  });
  return { promise } as Types.IImageLoadObject;
}

function provider(type: string, imageId: string): unknown {
  const parsed = parseImageId(imageId);
  const vol = parsed && volumes.get(parsed.key);
  if (!parsed || !vol) return undefined;
  const [cols, rows] = vol.dimensions;
  const [sx, sy, sz] = vol.spacing;
  const o = vol.origin ?? [-(cols * sx) / 2, -(rows * sy) / 2, -(vol.dimensions[2] * sz) / 2];
  const i = parsed.index;
  switch (type) {
    case 'imagePixelModule':
      return { bitsAllocated: 16, bitsStored: 16, highBit: 15, samplesPerPixel: 1, pixelRepresentation: 1, photometricInterpretation: 'MONOCHROME2', rows, columns: cols };
    case 'imagePlaneModule':
      return {
        imageOrientationPatient: [1, 0, 0, 0, 1, 0],
        imagePositionPatient: [o[0], o[1], o[2] + i * sz],
        rows, columns: cols,
        rowCosines: [1, 0, 0], columnCosines: [0, 1, 0],
        pixelSpacing: [sy, sx], rowPixelSpacing: sy, columnPixelSpacing: sx,
        sliceThickness: sz, sliceLocation: o[2] + i * sz,
        frameOfReferenceUID: FRAME_OF_REF,
      };
    case 'voiLutModule':
      return { windowCenter: vol.windowCenter, windowWidth: vol.windowWidth };
    case 'modalityLutModule':
      return { rescaleSlope: 1, rescaleIntercept: 0 };
    case 'generalSeriesModule':
      return { modality: vol.modality, seriesInstanceUID: 'import-series' };
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

/** Drop a raw volume's pixel data (call when its Cornerstone volume is purged). */
export function disposeRawVolume(volumeId: string): void {
  const scheme = schemeByVolumeId.get(volumeId) ?? volumeId; // also accepts the scheme key
  schemeByVolumeId.delete(volumeId);
  volumes.delete(scheme);
}

/** Build a Cornerstone volume + study from a decoded raw volume. */
export async function buildRawVolume(raw: RawVolume, onProgress?: (pct: number) => void): Promise<LoadedRaw> {
  const n = counter++;
  const scheme = `${SCHEME_BASE}${n}`;
  register(scheme);
  volumes.set(scheme, raw);
  onProgress?.(90);

  const depth = raw.dimensions[2];
  const imageIds = Array.from({ length: depth }, (_, i) => `${scheme}:${i}`);
  const volumeId = `${VOLUME_ID_PREFIX}import${n}`;
  schemeByVolumeId.set(volumeId, scheme);

  if (raw.warnings?.length) {
    for (const w of raw.warnings) console.warn(`[DQ-DICOM] Import: ${w}`);
  }

  const volume = await volumeLoader.createAndCacheVolume(volumeId, { imageIds });
  onProgress?.(96);
  await new Promise<void>((resolve, reject) => {
    (volume as any).load((evt: any) => {
      if (evt && evt.success === false) {
        reject(new Error(`Failed to load imported volume (${evt.imageId ?? 'frame load error'})`));
      } else {
        resolve();
      }
    });
  });
  onProgress?.(100);

  // Surface decoding assumptions where the user can actually see them.
  const baseDescription = raw.seriesDescription ?? 'Imported CT';
  const studyDescription = raw.warnings?.length
    ? `${baseDescription} [warning: ${raw.warnings.join('; ')}]`
    : baseDescription;

  const study: DicomStudyInfo = {
    studyInstanceUID: `import-study-${n}`,
    studyDescription,
    studyDate: '',
    patientName: raw.patientName ?? 'Imported',
    patientId: raw.patientId ?? 'IMPORT',
    patientBirthDate: '',
    institution: '',
    series: [{
      seriesInstanceUID: 'import-series',
      seriesDescription: studyDescription,
      seriesNumber: 1,
      modality: raw.modality,
      imageCount: depth,
      imageIds: [],
    }],
  };

  return { study, volumeId, windowLevel: { wc: raw.windowCenter, ww: raw.windowWidth } };
}
