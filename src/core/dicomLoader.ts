import dicomParser from 'dicom-parser';
import type { DicomSeriesInfo, DicomStudyInfo } from '@/types/dicom';

interface ParsedDicomFile {
  imageId: string;
  seriesInstanceUID: string;
  studyInstanceUID: string;
  instanceNumber: number;
  sliceLocation: number;
  ippZ: number; // ImagePositionPatient Z coordinate
  iop: string; // ImageOrientationPatient, raw "r\x\c\..." string
  seriesDescription: string;
  seriesNumber: number;
  modality: string;
  patientName: string;
  patientId: string;
  patientBirthDate: string;
  studyDescription: string;
  studyDate: string;
  institution: string;
}

const utf8Decoder = new TextDecoder('utf-8');

// Every object URL handed to the cornerstone wadouri loader. They must stay
// alive while the study is open; revokeAllBlobUrls() releases them on purge.
const blobUrls: string[] = [];

/** Revoke every object URL created by parseDicomFiles and clear the list. */
export function revokeAllBlobUrls(): void {
  while (blobUrls.length) {
    URL.revokeObjectURL(blobUrls.pop()!);
  }
}

/**
 * Read a DICOM string, respecting SpecificCharacterSet.
 * dicom-parser decodes bytes as Latin-1 by default, which garbles
 * multi-byte encodings like UTF-8 (ISO_IR 192).  When the dataset
 * uses UTF-8 we re-decode the raw bytes with TextDecoder.
 */
function getString(dataSet: dicomParser.DataSet, tag: string, isUtf8 = false): string {
  if (isUtf8) {
    const el = dataSet.elements[tag];
    if (!el || el.length === 0) return '';
    const bytes = new Uint8Array(dataSet.byteArray.buffer, dataSet.byteArray.byteOffset + el.dataOffset, el.length);
    return utf8Decoder.decode(bytes).trim();
  }
  const value = dataSet.string(tag);
  return value ? value.trim() : '';
}

function getInt(dataSet: dicomParser.DataSet, tag: string, fallback = 0): number {
  const value = dataSet.intString(tag);
  return value !== undefined ? value : fallback;
}

function getFloat(dataSet: dicomParser.DataSet, tag: string, fallback = 0): number {
  const value = dataSet.floatString(tag);
  return value !== undefined ? value : fallback;
}

function getIPPz(dataSet: dicomParser.DataSet): number {
  const ipp = dataSet.string('x00200032'); // ImagePositionPatient
  if (!ipp) return 0;
  const parts = ipp.split('\\');
  return parts.length >= 3 ? parseFloat(parts[2]) : 0;
}

/**
 * Warn (never reject) when a series' geometry looks unreliable:
 * inconsistent ImageOrientationPatient between slices, or irregular
 * slice spacing (gaps/overlaps in an axial stack).
 */
function validateSeriesGeometry(uid: string, items: ParsedDicomFile[]): void {
  const iop0 = items[0].iop;
  if (iop0 && items.some((it) => it.iop && it.iop !== iop0)) {
    console.warn(
      `[DQ-DICOM] Series ${uid}: inconsistent ImageOrientationPatient across slices — slice order may be unreliable`,
    );
  }
  if (items.length < 3) return;
  const deltas: number[] = [];
  for (let k = 1; k < items.length; k++) {
    deltas.push(Math.abs(items[k].ippZ - items[k - 1].ippZ));
  }
  const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  if (mean <= 0) return; // all slices share one position — nothing to judge
  const maxDev = Math.max(...deltas.map((d) => Math.abs(d - mean)));
  if (maxDev > Math.max(0.01, mean * 0.05)) {
    console.warn(
      `[DQ-DICOM] Series ${uid}: irregular slice spacing (mean ${mean.toFixed(3)} mm, max deviation ${maxDev.toFixed(3)} mm) — possible missing slices`,
    );
  }
}

export async function parseDicomFiles(
  files: File[],
  onProgress?: (loaded: number, total: number) => void,
): Promise<DicomStudyInfo | null> {
  const parsed: ParsedDicomFile[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    onProgress?.(i, files.length);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const byteArray = new Uint8Array(arrayBuffer);
      const dataSet = dicomParser.parseDicom(byteArray);

      // Create blob URL for cornerstone wadouri loader
      const blob = new Blob([byteArray], { type: 'application/dicom' });
      const url = URL.createObjectURL(blob);
      blobUrls.push(url);
      const imageId = `wadouri:${url}`;

      // Check character set — ISO_IR 192 = UTF-8
      const charset = dataSet.string('x00080005') || '';
      const utf8 = charset.indexOf('ISO_IR 192') !== -1;

      parsed.push({
        imageId,
        seriesInstanceUID: getString(dataSet, 'x0020000e'),
        studyInstanceUID: getString(dataSet, 'x0020000d'),
        instanceNumber: getInt(dataSet, 'x00200013'),
        sliceLocation: getFloat(dataSet, 'x00201041'),
        ippZ: getIPPz(dataSet),
        iop: getString(dataSet, 'x00200037'),
        seriesDescription: getString(dataSet, 'x0008103e', utf8),
        seriesNumber: getInt(dataSet, 'x00200011'),
        modality: getString(dataSet, 'x00080060'),
        patientName: getString(dataSet, 'x00100010', utf8),
        patientId: getString(dataSet, 'x00100020', utf8),
        patientBirthDate: getString(dataSet, 'x00100030', utf8),
        studyDescription: getString(dataSet, 'x00081030', utf8),
        studyDate: getString(dataSet, 'x00080020'),
        institution: getString(dataSet, 'x00080080', utf8),
      });
    } catch (err) {
      console.warn(`[DQ-DICOM] Skipping ${file.name}:`, err);
    }
  }

  onProgress?.(files.length, files.length);

  if (parsed.length === 0) {
    console.warn(`[DQ-DICOM] No readable DICOM files — all ${files.length} file(s) were skipped`);
    return null;
  }
  if (parsed.length < files.length) {
    console.warn(`[DQ-DICOM] Loaded ${parsed.length}/${files.length} files — ${files.length - parsed.length} skipped`);
  }

  // Mixed-patient drops: keep loading (metadata from the first file), but say so.
  const patientIds = new Set(parsed.map((p) => p.patientId).filter(Boolean));
  const multiPatient = patientIds.size > 1;
  if (multiPatient) {
    console.warn(
      `[DQ-DICOM] Dropped files contain ${patientIds.size} different PatientIDs — ` +
      'loading anyway; study metadata comes from the first parsed file',
    );
  }

  // Group by SeriesInstanceUID
  const seriesMap = new Map<string, ParsedDicomFile[]>();
  for (const p of parsed) {
    const key = p.seriesInstanceUID || 'unknown';
    if (!seriesMap.has(key)) seriesMap.set(key, []);
    seriesMap.get(key)!.push(p);
  }

  // Build series list, sort images within each series
  const series: DicomSeriesInfo[] = [];
  for (const [uid, items] of seriesMap) {
    items.sort((a, b) => {
      // Prefer ImagePositionPatient Z, then SliceLocation, then InstanceNumber
      if (a.ippZ !== b.ippZ) return a.ippZ - b.ippZ;
      if (a.sliceLocation !== b.sliceLocation) return a.sliceLocation - b.sliceLocation;
      return a.instanceNumber - b.instanceNumber;
    });
    validateSeriesGeometry(uid, items);

    series.push({
      seriesInstanceUID: uid,
      seriesDescription: items[0].seriesDescription || `Series #${items[0].seriesNumber}`,
      seriesNumber: items[0].seriesNumber,
      modality: items[0].modality,
      imageCount: items.length,
      imageIds: items.map((i) => i.imageId),
    });
  }

  series.sort((a, b) => a.seriesNumber - b.seriesNumber);

  const first = parsed[0];
  const baseDescription = first.studyDescription || 'DICOM study';
  return {
    studyInstanceUID: first.studyInstanceUID,
    studyDescription: multiPatient
      ? `${baseDescription} [warning: ${patientIds.size} PatientIDs in file set]`
      : first.studyDescription,
    studyDate: first.studyDate,
    patientName: first.patientName.replace(/\^/g, ' '),
    patientId: first.patientId,
    patientBirthDate: first.patientBirthDate,
    institution: first.institution,
    series,
  };
}
