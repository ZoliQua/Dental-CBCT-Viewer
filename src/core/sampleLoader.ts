/**
 * Loads the bundled anonymized sample volume (public/sample/) as a Cornerstone
 * streaming volume — the same render path as real DICOM. Instead of parsing
 * DICOM files, a tiny custom "sample" image loader + metadata provider serve the
 * slices of a gzipped raw int16 (HU) volume (produced by scripts/make-sample).
 */

import { imageLoader, metaData, volumeLoader, type Types } from '@cornerstonejs/core';
import { VOLUME_ID_PREFIX } from './constants';
import type { DicomStudyInfo } from '@/types/dicom';

const SCHEME = 'sample';
const FRAME_OF_REF = 'sample-frame-of-ref';

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

let registered = false;
let store: { data: Int16Array; meta: SampleMeta } | null = null;
let counter = 0;

const sliceIdx = (imageId: string) => parseInt(imageId.split(':')[1], 10);

/** Custom image loader: one slice of the raw volume as a bare image object. */
function loadImage(imageId: string): Types.IImageLoadObject {
  const promise = new Promise<any>((resolve, reject) => {
    if (!store) return reject(new Error('sample not loaded'));
    const { data, meta } = store;
    const [cols, rows] = meta.dimensions;
    const sliceLen = cols * rows;
    const i = sliceIdx(imageId);
    const pixelData = data.subarray(i * sliceLen, (i + 1) * sliceLen);
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
      columnPixelSpacing: meta.spacing[1],
      rowPixelSpacing: meta.spacing[0],
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

/** Metadata provider for sample: image ids (geometry + pixel + scaling). */
function provider(type: string, imageId: string): unknown {
  if (typeof imageId !== 'string' || !imageId.startsWith(`${SCHEME}:`) || !store) return undefined;
  const { meta } = store;
  const [cols, rows] = meta.dimensions;
  const [sx, sy, sz] = meta.spacing;
  const [ox, oy, oz] = meta.origin;
  const i = sliceIdx(imageId);
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

function register() {
  if (registered) return;
  imageLoader.registerImageLoader(SCHEME, loadImage as any);
  metaData.addProvider(provider as any, 10000);
  registered = true;
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

/** Read the volume buffer; gunzip only if the payload is really gzip (1f 8b). */
async function readVolume(resp: Response): Promise<ArrayBuffer> {
  const raw = await resp.arrayBuffer();
  const head = new Uint8Array(raw.slice(0, 2));
  const isGzip = head[0] === 0x1f && head[1] === 0x8b;
  if (!isGzip) return raw; // server already decompressed it (Content-Encoding: gzip)
  if (typeof DecompressionStream === 'undefined') throw new Error('gzip payload but no DecompressionStream');
  const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

export async function loadSample(base = '/sample'): Promise<LoadedSample> {
  register();
  const meta = (await (await fetchOk(`${base}/meta.json`)).json()) as SampleMeta;
  const gzResp = await fetchOk(`${base}/volume.raw.bin`);
  const buf = await readVolume(gzResp);
  store = { data: new Int16Array(buf), meta };

  const depth = meta.dimensions[2];
  const imageIds = Array.from({ length: depth }, (_, i) => `${SCHEME}:${i}`);
  const volumeId = `${VOLUME_ID_PREFIX}sample${counter++}`;

  const volume = await volumeLoader.createAndCacheVolume(volumeId, { imageIds });
  await new Promise<void>((resolve) => { (volume as any).load(() => resolve()); });

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
    }],
  };

  return { study, volumeId, windowLevel: { wc: meta.windowCenter, ww: meta.windowWidth } };
}
