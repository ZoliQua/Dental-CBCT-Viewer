/**
 * Turns a decoded raw volume (int16 scalars + geometry) into a Cornerstone
 * streaming volume — the same "custom image loader + metadata provider" trick
 * the bundled sample uses, so non-DICOM sources (GALILEOS, OneVolume) render on
 * the identical pipeline as DICOM. The raw volume is stored slice-major:
 * slice k occupies data[k*cols*rows .. (k+1)*cols*rows).
 */

import { imageLoader, metaData, volumeLoader, type Types } from '@cornerstonejs/core';
import { VOLUME_ID_PREFIX } from '../constants';
import type { DicomStudyInfo } from '@/types/dicom';

const SCHEME = 'importvol';
const FRAME_OF_REF = 'importvol-frame-of-ref';

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
  seriesDescription?: string;
}

interface LoadedRaw {
  study: DicomStudyInfo;
  volumeId: string;
  windowLevel: { wc: number; ww: number };
}

let registered = false;
let store: RawVolume | null = null;
let counter = 0;

const sliceIdx = (imageId: string) => parseInt(imageId.split(':')[1], 10);

function loadImage(imageId: string): Types.IImageLoadObject {
  const promise = new Promise<any>((resolve, reject) => {
    if (!store) return reject(new Error('import volume not loaded'));
    const [cols, rows] = store.dimensions;
    const sliceLen = cols * rows;
    const i = sliceIdx(imageId);
    const pixelData = store.data.subarray(i * sliceLen, (i + 1) * sliceLen);
    resolve({
      imageId,
      getPixelData: () => pixelData,
      rows, columns: cols, height: rows, width: cols,
      color: false, numberOfComponents: 1, rgba: false,
      sliceThickness: store.spacing[2],
      columnPixelSpacing: store.spacing[1],
      rowPixelSpacing: store.spacing[0],
      slope: 1, intercept: 0,
      minPixelValue: store.minValue, maxPixelValue: store.maxValue,
      windowCenter: store.windowCenter, windowWidth: store.windowWidth,
      invert: false, sizeInBytes: pixelData.byteLength,
    });
  });
  return { promise } as Types.IImageLoadObject;
}

function provider(type: string, imageId: string): unknown {
  if (typeof imageId !== 'string' || !imageId.startsWith(`${SCHEME}:`) || !store) return undefined;
  const [cols, rows] = store.dimensions;
  const [sx, sy, sz] = store.spacing;
  const o = store.origin ?? [-(cols * sx) / 2, -(rows * sy) / 2, -(store.dimensions[2] * sz) / 2];
  const i = sliceIdx(imageId);
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
      return { windowCenter: store.windowCenter, windowWidth: store.windowWidth };
    case 'modalityLutModule':
      return { rescaleSlope: 1, rescaleIntercept: 0 };
    case 'generalSeriesModule':
      return { modality: store.modality, seriesInstanceUID: 'import-series' };
    default:
      return undefined;
  }
}

function register() {
  if (registered) return;
  imageLoader.registerImageLoader(SCHEME, loadImage as any);
  metaData.addProvider(provider as any, 10000);
  registered = true;
}

/** Build a Cornerstone volume + study from a decoded raw volume. */
export async function buildRawVolume(raw: RawVolume, onProgress?: (pct: number) => void): Promise<LoadedRaw> {
  register();
  store = raw;
  onProgress?.(90);

  const depth = raw.dimensions[2];
  const imageIds = Array.from({ length: depth }, (_, i) => `${SCHEME}:${i}`);
  const volumeId = `${VOLUME_ID_PREFIX}import${counter++}`;

  const volume = await volumeLoader.createAndCacheVolume(volumeId, { imageIds });
  onProgress?.(96);
  await new Promise<void>((resolve) => { (volume as any).load(() => resolve()); });
  onProgress?.(100);

  const study: DicomStudyInfo = {
    studyInstanceUID: `import-study-${counter}`,
    studyDescription: raw.seriesDescription ?? 'Imported CT',
    studyDate: '',
    patientName: raw.patientName ?? 'Imported',
    patientId: 'IMPORT',
    patientBirthDate: '',
    institution: '',
    series: [{
      seriesInstanceUID: 'import-series',
      seriesDescription: raw.seriesDescription ?? 'Imported CT',
      seriesNumber: 1,
      modality: raw.modality,
      imageCount: depth,
      imageIds: [],
    }],
  };

  return { study, volumeId, windowLevel: { wc: raw.windowCenter, ww: raw.windowWidth } };
}
