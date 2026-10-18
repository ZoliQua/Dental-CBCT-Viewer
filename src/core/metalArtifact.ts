/**
 * Finds metal restorations in a CT volume — pure, no Cornerstone/vtk
 * (unit-testable).
 *
 * Why a viewer should care. Metal (amalgam, gold, cobalt-chrome, titanium)
 * absorbs far more X-ray than any tissue, so the reconstruction cannot solve
 * for it. What comes out is a bright core surrounded by dark bands and bright
 * streaks that reach centimetres into the neighbouring anatomy. Those streaks
 * sit exactly where the tooth surfaces are, and they move where the apparent
 * enamel boundary lies.
 *
 * This matters for one thing in particular: pairing an intraoral scan to the
 * CBCT by matching their surfaces. That only works if the CBCT's tooth
 * surfaces are where the teeth are. Measured on this project's own sample —
 * 620 mm³ of metal in six lumps, with half the crown surface within 4 mm of it
 * — a surface fit has no single minimum: repeated runs from nearby starts land
 * on poses a millimetre apart, and different parts of the arch pull in
 * different directions. The method is not at fault; the density field is.
 *
 * So the honest thing a viewer can do is say so. Detecting metal is easy and
 * unambiguous, unlike correcting for it, and knowing it is there tells the
 * operator to register on markers or landmarks instead of trusting a surface
 * fit — which is a decision they can only make if someone mentions it.
 */

import type { VolumeSamplingData } from './cprMath';
import type { Vec3 } from './implantGeometry';

export interface MetalSite {
  /** World-mm centre of the lump. */
  center: Vec3;
  /** Its volume, mm³. */
  volumeMm3: number;
}

export interface MetalReport {
  /** Total high-density material found, mm³. */
  volumeMm3: number;
  /** Largest lumps first; small scatter is merged into the totals, not listed. */
  sites: MetalSite[];
  /**
   * `none` — nothing above the threshold worth mentioning.
   * `minor` — a filling or two; surfaces away from them are still usable.
   * `severe` — enough metal that surface-based registration should not be
   *            trusted anywhere in the arch.
   */
  severity: 'none' | 'minor' | 'severe';
}

export interface MetalOptions {
  /**
   * Density above which material is metal rather than tissue. Enamel, the
   * densest tissue in the scan, tops out around 2500 HU in CBCT, so 3000 sits
   * clear of it. Raise it for a scanner that reads enamel high.
   */
  threshold?: number;
  /** Sampling lattice, mm. Restorations are millimetres across. */
  latticeMm?: number;
  /** Lumps smaller than this are scatter noise, counted but not listed. */
  minSiteMm3?: number;
  /** At most this many sites are returned. */
  maxSites?: number;
}

const DEFAULTS = { threshold: 3000, latticeMm: 1, minSiteMm3: 10, maxSites: 8 };

/** A filling or two. Below this, metal is incidental. */
const MINOR_MM3 = 20;
/**
 * Above this, streaking reaches across the arch rather than staying local.
 * Anchored on the measured sample: 620 mm³ left no crown surface clean enough
 * to register against.
 */
const SEVERE_MM3 = 200;

/**
 * Sweep the volume for material denser than any tissue and group it into lumps.
 *
 * Cost is set by the lattice, not the volume's resolution: at the 1 mm default
 * a full head field of view is a few hundred thousand samples.
 */
export function assessMetal(vol: VolumeSamplingData, opts: MetalOptions = {}): MetalReport {
  const { threshold, latticeMm, minSiteMm3, maxSites } = { ...DEFAULTS, ...opts };
  const [dimX, dimY, dimZ] = vol.dims;
  const sx = 1 / vol.invSx, sy = 1 / vol.invSy, sz = 1 / vol.invSz;

  // Lattice steps in voxels, at least one so a coarse volume is not skipped.
  const stepI = Math.max(1, Math.round(latticeMm / sx));
  const stepJ = Math.max(1, Math.round(latticeMm / sy));
  const stepK = Math.max(1, Math.round(latticeMm / sz));
  // Each lattice sample stands for this much volume.
  const cellMm3 = stepI * sx * stepJ * sy * stepK * sz;

  const nI = Math.ceil(dimX / stepI), nJ = Math.ceil(dimY / stepJ), nK = Math.ceil(dimZ / stepK);
  const hit = new Uint8Array(nI * nJ * nK);
  const at = (a: number, b: number, c: number) => (c * nJ + b) * nI + a;

  let any = false;
  for (let c = 0; c < nK; c++) {
    for (let b = 0; b < nJ; b++) {
      for (let a = 0; a < nI; a++) {
        if (vol.getVoxel(a * stepI, b * stepJ, c * stepK) > threshold) { hit[at(a, b, c)] = 1; any = true; }
      }
    }
  }
  if (!any) return { volumeMm3: 0, sites: [], severity: 'none' };

  // Group neighbouring hits: one restoration is one lump, however many
  // lattice cells it covers.
  const seen = new Uint8Array(hit.length);
  const sites: MetalSite[] = [];
  let totalMm3 = 0;
  const stack: number[] = [];

  for (let c = 0; c < nK; c++) {
    for (let b = 0; b < nJ; b++) {
      for (let a = 0; a < nI; a++) {
        const start = at(a, b, c);
        if (!hit[start] || seen[start]) continue;
        seen[start] = 1;
        stack.push(a, b, c);
        let n = 0, sumX = 0, sumY = 0, sumZ = 0;
        while (stack.length) {
          const z = stack.pop()!, y = stack.pop()!, x = stack.pop()!;
          n++;
          sumX += vol.origin[0] + x * stepI * sx;
          sumY += vol.origin[1] + y * stepJ * sy;
          sumZ += vol.origin[2] + z * stepK * sz;
          for (let dz = -1; dz <= 1; dz++) {
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                const qx = x + dx, qy = y + dy, qz = z + dz;
                if (qx < 0 || qy < 0 || qz < 0 || qx >= nI || qy >= nJ || qz >= nK) continue;
                const q = at(qx, qy, qz);
                if (hit[q] && !seen[q]) { seen[q] = 1; stack.push(qx, qy, qz); }
              }
            }
          }
        }
        const volumeMm3 = n * cellMm3;
        totalMm3 += volumeMm3;
        if (volumeMm3 >= minSiteMm3) sites.push({ center: [sumX / n, sumY / n, sumZ / n], volumeMm3 });
      }
    }
  }

  sites.sort((p, q) => q.volumeMm3 - p.volumeMm3);
  return {
    volumeMm3: totalMm3,
    sites: sites.slice(0, maxSites),
    severity: totalMm3 >= SEVERE_MM3 ? 'severe' : totalMm3 >= MINOR_MM3 ? 'minor' : 'none',
  };
}
