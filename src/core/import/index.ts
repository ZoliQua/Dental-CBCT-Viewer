/**
 * Non-DICOM CT import: detect GALILEOS / OneVolume folder exports and decode
 * them into a Cornerstone volume on the same pipeline as DICOM. Returns null
 * when the file set is not one of these native formats (→ fall back to DICOM).
 */

import { matchGalileos, parseGalileos } from './galileos';
import { matchOneVolume, parseOneVolume } from './onevolume';
import { buildRawVolume } from './rawVolumeLoader';
import type { DicomStudyInfo } from '@/types/dicom';

export type ImportFormat = 'galileos' | 'onevolume';

export interface ImportedVolume {
  study: DicomStudyInfo;
  volumeId: string;
  windowLevel: { wc: number; ww: number };
}

/** Detect a native (non-DICOM) CT export from the selected file set. */
export function detectFormat(files: File[]): ImportFormat | null {
  if (matchOneVolume(files)) return 'onevolume';
  if (matchGalileos(files)) return 'galileos';
  return null;
}

/** Parse + build a GALILEOS / OneVolume export; null if the set isn't one. */
export async function importNativeVolume(
  files: File[],
  onProgress?: (pct: number) => void,
): Promise<ImportedVolume | null> {
  const fmt = detectFormat(files);
  if (!fmt) return null;
  onProgress?.(1);
  const raw = fmt === 'onevolume'
    ? await parseOneVolume(files, onProgress)
    : await parseGalileos(files, onProgress);
  return buildRawVolume(raw, onProgress);
}
