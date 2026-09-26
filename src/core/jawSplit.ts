/**
 * Splitting a CBCT into its two jaws — pure, no Cornerstone (unit-testable).
 *
 * A dental CBCT images the maxilla and the mandible with a gap between the
 * arches, and the enamel of the two rows of crowns shows up as two sharp peaks
 * along the patient's z axis with a sparse valley between them. That valley is
 * the occlusal plane, and cutting there lets the 3D view show one jaw at a time
 * so it can be turned around without the other arch in the way.
 *
 * Plenty of scans hold only one arch (a mandible-only field of view, a segmented
 * export), and offering to hide "the other half" of those would just blank the
 * view. So detection also decides *which* arch is present, from the fact that
 * a jaw's bone extends away from its crowns: the mandible's body sits below its
 * teeth, the maxilla's sinus and nasal floor above.
 *
 * DICOM patient coordinates are assumed (+z superior), which is what every
 * loader in this app produces — see the identity-direction note in cprEngine.
 */

import { trilinear, type VolumeSamplingData } from './cprMath';
import type { ClipPlaneParam } from './cropBox';
import type { Vec3 } from './implantGeometry';

export type JawSide = 'both' | 'upper' | 'lower';
export const JAW_SIDES: JawSide[] = ['both', 'upper', 'lower'];

export interface JawSplit {
  /** World z of the occlusal gap, or null when there is nothing to split. */
  splitZ: number | null;
  hasUpper: boolean;
  hasLower: boolean;
}

/** Nothing detected — the view offers no jaw filter. */
export const NO_JAW_SPLIT: JawSplit = { splitZ: null, hasUpper: false, hasLower: false };

const ENAMEL_HU = 1500; // crowns only: well above cortical bone
const BONE_HU = 300; //    anything mineralised, for the "which arch" test
const BIN_MM = 1.5; //     z histogram resolution
const MAX_SAMPLES = 400_000; // keep one detection well under a frame

/** Rolling mean over `w` bins — smooths CBCT noise without shifting the peaks. */
function smooth(hist: number[], w: number): number[] {
  const out = new Array<number>(hist.length).fill(0);
  const h = Math.floor(w / 2);
  for (let i = 0; i < hist.length; i++) {
    let s = 0, n = 0;
    for (let k = -h; k <= h; k++) {
      const j = i + k;
      if (j >= 0 && j < hist.length) { s += hist[j]; n++; }
    }
    out[i] = s / n;
  }
  return out;
}

/**
 * Find the occlusal gap and which arches the volume holds.
 *
 * The scan is sampled on a coarse lattice (the split only has to be accurate to
 * a millimetre or two), binned along z by enamel-voxel count, and the deepest
 * valley between the two tallest peaks is taken as the split. A valley that is
 * not clearly a valley — no second peak, or a "gap" nearly as full as the peaks
 * around it — means one arch, and the bone's centre of mass relative to the
 * crowns says which one.
 */
export function detectJawSplit(vol: VolumeSamplingData): JawSplit {
  const [nx, ny, nz] = vol.dims;
  if (nx < 4 || ny < 4 || nz < 4) return NO_JAW_SPLIT;

  const sz = 1 / vol.invSz;
  const z0 = vol.origin[2];
  const nBins = Math.max(4, Math.ceil((nz * sz) / BIN_MM));
  const enamel = new Array<number>(nBins).fill(0);

  // Lattice step chosen so the whole sweep stays within the sample budget.
  const stride = Math.max(1, Math.ceil(Math.cbrt((nx * ny * nz) / MAX_SAMPLES)));
  let boneSum = 0, boneCount = 0;
  for (let k = 0; k < nz; k += stride) {
    const z = z0 + k * sz;
    const bin = Math.min(nBins - 1, Math.max(0, Math.floor((z - z0) / BIN_MM)));
    for (let j = 0; j < ny; j += stride) {
      for (let i = 0; i < nx; i += stride) {
        const v = vol.getVoxel(i, j, k);
        if (v > ENAMEL_HU) enamel[bin]++;
        if (v > BONE_HU) { boneSum += z; boneCount++; }
      }
    }
  }
  if (boneCount === 0) return NO_JAW_SPLIT;

  const hist = smooth(enamel, 3);
  const peak = hist.reduce((bi, v, i) => (v > hist[bi] ? i : bi), 0);
  const peakValue = hist[peak];
  if (peakValue <= 0) return NO_JAW_SPLIT; // no enamel at all — not a dental scan

  // Second peak: the tallest bin far enough from the first to be the other arch
  // (the arches are ~10 mm of crown each, so 8 mm is the closest they can be).
  const minSeparation = Math.ceil(8 / BIN_MM);
  let peak2 = -1;
  for (let i = 0; i < hist.length; i++) {
    if (Math.abs(i - peak) < minSeparation) continue;
    if (peak2 < 0 || hist[i] > hist[peak2]) peak2 = i;
  }

  const zOf = (bin: number) => z0 + (bin + 0.5) * BIN_MM;
  const single = (): JawSplit => {
    // One arch: the bone reaches away from the crowns, downwards for a mandible
    // and upwards for a maxilla.
    const lower = boneSum / boneCount < zOf(peak);
    return { splitZ: null, hasUpper: !lower, hasLower: lower };
  };

  if (peak2 < 0 || hist[peak2] < peakValue * 0.15) return single();

  const lo = Math.min(peak, peak2), hi = Math.max(peak, peak2);
  let valley = lo;
  for (let i = lo; i <= hi; i++) if (hist[i] < hist[valley]) valley = i;
  // A real occlusal gap is much emptier than the crowns on either side. If it
  // is not, the two "peaks" are one arch's enamel spread over a tilted scan.
  if (hist[valley] > Math.min(peakValue, hist[peak2]) * 0.45) return single();

  return { splitZ: zOf(valley), hasUpper: true, hasLower: true };
}

/**
 * The clipping plane that keeps one jaw, in vtk's convention (the half-space
 * where (p − origin) · normal ≥ 0 survives). `both` — or a volume with nothing
 * to split — clips nothing.
 */
export function jawClipPlane(split: JawSplit, side: JawSide): ClipPlaneParam | null {
  if (side === 'both' || split.splitZ == null) return null;
  const origin: Vec3 = [0, 0, split.splitZ];
  return side === 'upper'
    ? { origin, normal: [0, 0, 1] } //  keep z ≥ splitZ
    : { origin, normal: [0, 0, -1] }; // keep z ≤ splitZ
}

/** Whether the jaw filter is worth offering at all (both arches are present). */
export const canSplitJaws = (split: JawSplit): boolean =>
  split.splitZ != null && split.hasUpper && split.hasLower;

/**
 * World z range that survives a jaw selection — used to keep 3D picking
 * consistent with what is actually on screen.
 */
export function jawZRange(split: JawSplit, side: JawSide): [number, number] {
  if (side === 'both' || split.splitZ == null) return [-Infinity, Infinity];
  return side === 'upper' ? [split.splitZ, Infinity] : [-Infinity, split.splitZ];
}

/**
 * Enamel-weighted z histogram, exposed for tests and for anyone who wants to
 * check the detection against a real scan. Uses the same sampling as detection.
 */
export function enamelProfile(vol: VolumeSamplingData): { z: number; count: number }[] {
  const [nx, ny, nz] = vol.dims;
  const sz = 1 / vol.invSz;
  const z0 = vol.origin[2];
  const nBins = Math.max(1, Math.ceil((nz * sz) / BIN_MM));
  const bins = new Array<number>(nBins).fill(0);
  const stride = Math.max(1, Math.ceil(Math.cbrt((nx * ny * nz) / MAX_SAMPLES)));
  for (let k = 0; k < nz; k += stride) {
    const bin = Math.min(nBins - 1, Math.floor((k * sz) / BIN_MM));
    for (let j = 0; j < ny; j += stride) {
      for (let i = 0; i < nx; i += stride) if (vol.getVoxel(i, j, k) > ENAMEL_HU) bins[bin]++;
    }
  }
  return bins.map((count, i) => ({ z: z0 + (i + 0.5) * BIN_MM, count }));
}

/** Sample the volume at a world point (trilinear), for pick refinement. */
export function sampleWorld(vol: VolumeSamplingData, p: Vec3): number {
  return trilinear(
    vol.getVoxel, vol.dims,
    (p[0] - vol.origin[0]) * vol.invSx,
    (p[1] - vol.origin[1]) * vol.invSy,
    (p[2] - vol.origin[2]) * vol.invSz,
  );
}

// ── Per-volume cache ───────────────────────────────────────────

// Detection sweeps the whole volume, so it runs once per volume and is then
// read by both the 3D view (to clip) and landmark picking (to stay consistent
// with what is drawn). Keyed by volume id; cleared when a study is dropped.
const splitCache = new Map<string, JawSplit>();

/** Memoized detectJawSplit for a loaded volume. */
export function jawSplitFor(volumeId: string, vol: VolumeSamplingData | null | undefined): JawSplit {
  if (!vol) return NO_JAW_SPLIT;
  const cached = splitCache.get(volumeId);
  if (cached) return cached;
  const split = detectJawSplit(vol);
  splitCache.set(volumeId, split);
  return split;
}

export function clearJawSplitCache(volumeId?: string): void {
  if (volumeId) splitCache.delete(volumeId);
  else splitCache.clear();
}
