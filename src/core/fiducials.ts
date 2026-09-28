/**
 * Radiopaque marker (fiducial) registration — pure, no Cornerstone/vtk
 * (unit-testable).
 *
 * Registering an intraoral scan to a CBCT by their surfaces does not work: the
 * objective is flat at the millimetre scale, because most of an arch scan is
 * gingiva that the CBCT never imaged, and what is left does not pin the pose
 * down (measured — see the CHANGELOG's "Not shipped" note). Markers are the way
 * around it, and the reason is simple: a bead is a *point*, not a surface. Its
 * centre is unambiguous in both the volume and the scan, so the correspondence
 * is exact instead of a best guess between two similar-looking edges.
 *
 * This module does the three things that need care:
 *
 *   detectFiducials  finds bead-shaped blobs in the volume. It proposes; it
 *                    does not decide. A metal restoration can be just as small,
 *                    bright and round as a marker, so the operator confirms
 *                    every candidate — the value here is turning "click the
 *                    exact voxel" into "click the bead you can see".
 *   fitSphere        recovers a bead's centre from the scan surface around a
 *                    click, which is better than the click: the centre of a
 *                    sphere is determined by its surface, so the fit is more
 *                    accurate than any single point on it.
 *   matchConstellations
 *                    fixes the classic fiducial blunder — pairing marker 2 with
 *                    marker 3. The beads form a rigid constellation, so the
 *                    correct assignment is the one whose inter-point distances
 *                    agree, and that can be found rather than trusted.
 */

import { trilinear, type VolumeSamplingData } from './cprMath';
import type { Vec3 } from './implantGeometry';

/** A detected marker candidate. */
export interface Fiducial {
  /** World-mm centre, intensity-weighted (sub-voxel). */
  center: Vec3;
  /** Diameter implied by the blob's volume, mm. */
  diameterMm: number;
  /** 0–1, how bead-like the blob is; 1 is a perfect sphere. */
  sphericity: number;
  /** Mean density inside the blob. */
  meanValue: number;
}

export interface DetectOptions {
  /**
   * Density a marker must exceed. The default sits above enamel, since beads
   * are gutta-percha, composite or metal; lower it for a faint marker and
   * expect more candidates to sift through.
   */
  threshold?: number;
  /** Plausible bead sizes. Anything outside is a tooth, a restoration or noise. */
  minDiameterMm?: number;
  maxDiameterMm?: number;
  /** Search lattice, mm. Beads are millimetres across, so this can be coarse. */
  latticeMm?: number;
  maxResults?: number;
  /** Restrict the search in z — e.g. to one jaw. */
  zRange?: [number, number];
}

const DEFAULTS = {
  threshold: 2200,
  minDiameterMm: 0.8,
  maxDiameterMm: 4.5,
  latticeMm: 0.3,
  maxResults: 12,
};

/**
 * For a solid sphere of radius R, the RMS distance of its material from the
 * centre is R·√(3/5). That ratio is the shape test: it does not care how big
 * the blob is or how the lattice happened to fall across it, unlike the
 * fraction of a bounding box that gets filled — which for a bead only a few
 * cells wide is dominated by quantization and throws real markers away.
 */
const SPHERE_RADIAL = Math.sqrt(3 / 5);
const RADIAL_MIN = 0.62; //  below: a shell or a ring
const RADIAL_MAX = 0.92; //  above: a streak or a plate

const sampleAt = (vol: VolumeSamplingData, p: Vec3): number => trilinear(
  vol.getVoxel, vol.dims,
  (p[0] - vol.origin[0]) * vol.invSx,
  (p[1] - vol.origin[1]) * vol.invSy,
  (p[2] - vol.origin[2]) * vol.invSz,
);

function worldBounds(vol: VolumeSamplingData): [Vec3, Vec3] {
  return [
    [vol.origin[0], vol.origin[1], vol.origin[2]],
    [
      vol.origin[0] + (vol.dims[0] - 1) / vol.invSx,
      vol.origin[1] + (vol.dims[1] - 1) / vol.invSy,
      vol.origin[2] + (vol.dims[2] - 1) / vol.invSz,
    ],
  ];
}

/** Nearest-voxel read — the coarse pass only asks "is there dense material
 *  here", and skipping interpolation is eight times fewer voxel reads. */
const nearestAt = (vol: VolumeSamplingData, p: Vec3): number => {
  const i = Math.round((p[0] - vol.origin[0]) * vol.invSx);
  const j = Math.round((p[1] - vol.origin[1]) * vol.invSy);
  const k = Math.round((p[2] - vol.origin[2]) * vol.invSz);
  if (i < 0 || j < 0 || k < 0 || i >= vol.dims[0] || j >= vol.dims[1] || k >= vol.dims[2]) return -1024;
  return vol.getVoxel(i, j, k);
};

/** Shape and size of one blob, measured on a fine local lattice. */
interface BlobShape {
  center: Vec3;
  volumeMm3: number;
  aspect: number;
  /** RMS distance of the material from its centre, over the radius its volume implies. */
  radial: number;
}

/**
 * Measure the dense blob around `near` properly: flood fill a small box at a
 * fine lattice and take its volume, extent and spread.
 *
 * The coarse pass cannot do this. At a lattice that can sweep a whole field of
 * view in reasonable time, a 1 mm bead is two cells across and every shape
 * statistic is really a statistic about where the lattice happened to fall. So
 * the coarse pass only says *where* to look, and the measuring happens here.
 */
function measureBlob(vol: VolumeSamplingData, near: Vec3, halfBoxMm: number, h: number, threshold: number): BlobShape | null {
  const n = Math.max(3, Math.ceil((2 * halfBoxMm) / h) + 1);
  const lo: Vec3 = [near[0] - halfBoxMm, near[1] - halfBoxMm, near[2] - halfBoxMm];
  const mask = new Uint8Array(n * n * n);
  const at = (i: number, j: number, k: number) => k * n * n + j * n + i;
  for (let k = 0; k < n; k++) {
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        if (sampleAt(vol, [lo[0] + i * h, lo[1] + j * h, lo[2] + k * h]) > threshold) mask[at(i, j, k)] = 1;
      }
    }
  }
  // Start from the cell nearest the middle that is dense; the coarse pass put
  // the box on the blob, so that is the blob we are being asked about.
  const mid = Math.floor(n / 2);
  let seed = -1;
  for (let r = 0; r < mid && seed < 0; r++) {
    for (let dk = -r; dk <= r && seed < 0; dk++) {
      for (let dj = -r; dj <= r && seed < 0; dj++) {
        for (let di = -r; di <= r && seed < 0; di++) {
          const i = mid + di, j = mid + dj, k = mid + dk;
          if (i < 0 || j < 0 || k < 0 || i >= n || j >= n || k >= n) continue;
          if (mask[at(i, j, k)] === 1) seed = at(i, j, k);
        }
      }
    }
  }
  if (seed < 0) return null;

  const queue = new Int32Array(n * n * n);
  let head = 0, tail = 0;
  queue[tail++] = seed;
  mask[seed] = 2;
  let bi0 = n, bi1 = -1, bj0 = n, bj1 = -1, bk0 = n, bk1 = -1;
  let touchedEdge = false;
  while (head < tail) {
    const idx = queue[head++];
    const i = idx % n;
    const j = Math.floor(idx / n) % n;
    const k = Math.floor(idx / (n * n));
    if (i === 0 || j === 0 || k === 0 || i === n - 1 || j === n - 1 || k === n - 1) touchedEdge = true;
    if (i < bi0) bi0 = i; if (i > bi1) bi1 = i;
    if (j < bj0) bj0 = j; if (j > bj1) bj1 = j;
    if (k < bk0) bk0 = k; if (k > bk1) bk1 = k;
    const push = (a: number, b: number, c: number) => {
      if (a < 0 || b < 0 || c < 0 || a >= n || b >= n || c >= n) return;
      const m = at(a, b, c);
      if (mask[m] === 1) { mask[m] = 2; queue[tail++] = m; }
    };
    push(i - 1, j, k); push(i + 1, j, k);
    push(i, j - 1, k); push(i, j + 1, k);
    push(i, j, k - 1); push(i, j, k + 1);
  }
  // Running into the wall of the box means the blob is bigger than the box, so
  // it is bigger than any marker — and its measurements would be truncated.
  if (touchedEdge) return null;

  const count = tail;
  const volumeMm3 = count * h * h * h;
  let cx = 0, cy = 0, cz = 0;
  for (let q = 0; q < count; q++) {
    const idx = queue[q];
    cx += idx % n;
    cy += Math.floor(idx / n) % n;
    cz += Math.floor(idx / (n * n));
  }
  cx /= count; cy /= count; cz /= count;
  let sr2 = 0;
  for (let q = 0; q < count; q++) {
    const idx = queue[q];
    const di = (idx % n) - cx;
    const dj = (Math.floor(idx / n) % n) - cy;
    const dk = Math.floor(idx / (n * n)) - cz;
    sr2 += (di * di + dj * dj + dk * dk) * h * h;
  }
  const dx = (bi1 - bi0 + 1) * h, dy = (bj1 - bj0 + 1) * h, dz = (bk1 - bk0 + 1) * h;
  const radiusMm = Math.cbrt((3 * volumeMm3) / (4 * Math.PI));
  return {
    center: [lo[0] + cx * h, lo[1] + cy * h, lo[2] + cz * h],
    volumeMm3,
    aspect: Math.max(dx, dy, dz) / Math.max(1e-6, Math.min(dx, dy, dz)),
    radial: Math.sqrt(sr2 / count) / Math.max(1e-9, radiusMm),
  };
}

/**
 * Bead-shaped blobs in the volume, best first.
 *
 * Coarse to fine, because a single lattice cannot be both. One fine enough to
 * judge a 1 mm bead's shape is tens of millions of samples across a whole field
 * of view; one coarse enough to sweep that quickly cannot tell a bead from a
 * chip of calculus. So a coarse sweep (nearest-voxel, no interpolation) finds
 * *where* dense material sits, and each of those places is then measured
 * properly in a small box at a fine lattice.
 */
export function detectFiducials(vol: VolumeSamplingData, opts: DetectOptions = {}): Fiducial[] {
  const o = { ...DEFAULTS, ...opts };
  // Coarse spacing has to guarantee a hit inside the smallest bead we accept:
  // a cell's body diagonal must fit within its diameter.
  const h = Math.min(o.latticeMm, o.minDiameterMm / 2);
  const [wmin, wmax] = worldBounds(vol);
  const lo: Vec3 = [wmin[0], wmin[1], Math.max(wmin[2], opts.zRange?.[0] ?? -Infinity)];
  const hi: Vec3 = [wmax[0], wmax[1], Math.min(wmax[2], opts.zRange?.[1] ?? Infinity)];
  const nx = Math.floor((hi[0] - lo[0]) / h) + 1;
  const ny = Math.floor((hi[1] - lo[1]) / h) + 1;
  const nz = Math.floor((hi[2] - lo[2]) / h) + 1;
  if (nx < 2 || ny < 2 || nz < 2) return [];

  const mask = new Uint8Array(nx * ny * nz);
  const at = (i: number, j: number, k: number) => k * nx * ny + j * nx + i;
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        if (nearestAt(vol, [lo[0] + i * h, lo[1] + j * h, lo[2] + k * h]) > o.threshold) mask[at(i, j, k)] = 1;
      }
    }
  }

  const minVol = (Math.PI / 6) * o.minDiameterMm ** 3;
  const maxVol = (Math.PI / 6) * o.maxDiameterMm ** 3;
  // Generous at this resolution: the coarse pass only shortlists, and a bead
  // near the limit can quantize well outside its true volume.
  const maxCoarseCells = Math.ceil((maxVol * 4) / (h * h * h)) + 64;
  const queue = new Int32Array(Math.min(nx * ny * nz, maxCoarseCells));
  const halfBox = o.maxDiameterMm / 2 + 1.5;
  const fine = Math.min(0.15, o.minDiameterMm / 5);
  const found: Fiducial[] = [];

  for (let k0 = 0; k0 < nz; k0++) {
    for (let j0 = 0; j0 < ny; j0++) {
      for (let i0 = 0; i0 < nx; i0++) {
        if (mask[at(i0, j0, k0)] !== 1) continue;
        let head = 0, tail = 0;
        queue[tail++] = at(i0, j0, k0);
        mask[at(i0, j0, k0)] = 2;
        let si = 0, sj = 0, sk = 0;
        let overran = false;
        while (head < tail) {
          const idx = queue[head++];
          const i = idx % nx;
          const j = Math.floor(idx / nx) % ny;
          const k = Math.floor(idx / (nx * ny));
          si += i; sj += j; sk += k;
          const push = (a: number, b: number, c: number) => {
            if (a < 0 || b < 0 || c < 0 || a >= nx || b >= ny || c >= nz) return;
            const m = at(a, b, c);
            if (mask[m] !== 1) return;
            if (tail >= queue.length) { overran = true; return; }
            mask[m] = 2; queue[tail++] = m;
          };
          push(i - 1, j, k); push(i + 1, j, k);
          push(i, j - 1, k); push(i, j + 1, k);
          push(i, j, k - 1); push(i, j, k + 1);
        }
        if (overran) continue; // far too big to be a marker

        const centre: Vec3 = [lo[0] + (si / tail) * h, lo[1] + (sj / tail) * h, lo[2] + (sk / tail) * h];
        const shape = measureBlob(vol, centre, halfBox, fine, o.threshold);
        if (!shape) continue;
        if (shape.volumeMm3 < minVol || shape.volumeMm3 > maxVol) continue;
        if (shape.aspect > 2.2) continue;
        if (shape.radial < RADIAL_MIN || shape.radial > RADIAL_MAX) continue;

        const radiusMm = Math.cbrt((3 * shape.volumeMm3) / (4 * Math.PI));
        const refined = refineCentre(vol, shape.center, radiusMm + 2 * fine, fine, o.threshold);
        found.push({
          center: refined.center,
          diameterMm: 2 * radiusMm,
          // 1 for a perfect sphere, falling off with both elongation and an
          // unsphere-like spread of material.
          sphericity: Math.max(0, 1 - Math.abs(shape.radial - SPHERE_RADIAL) / 0.3) / Math.max(1, shape.aspect / 1.2),
          meanValue: refined.meanValue,
        });
      }
    }
  }

  found.sort((a, b) => b.sphericity - a.sphericity);
  // Two coarse components can straddle one bead and both refine onto it, so the
  // same marker would be offered twice — and a duplicate in a fiducial list is
  // a mis-pairing waiting to happen. Best-scoring one wins.
  const unique: Fiducial[] = [];
  for (const f of found) {
    const tooClose = unique.some((u) => {
      const gap = Math.hypot(u.center[0] - f.center[0], u.center[1] - f.center[1], u.center[2] - f.center[2]);
      return gap < Math.max(0.8, 0.6 * Math.max(u.diameterMm, f.diameterMm));
    });
    if (!tooClose) unique.push(f);
    if (unique.length >= o.maxResults) break;
  }
  return unique;
}

/** Density-weighted centre of the dense material in a box around `near`. */
function refineCentre(
  vol: VolumeSamplingData, near: Vec3, radiusMm: number, step: number, threshold: number,
): { center: Vec3; meanValue: number } {
  let sw = 0, sx = 0, sy = 0, sz = 0, sv = 0, n = 0;
  for (let z = -radiusMm; z <= radiusMm; z += step) {
    for (let y = -radiusMm; y <= radiusMm; y += step) {
      for (let x = -radiusMm; x <= radiusMm; x += step) {
        const p: Vec3 = [near[0] + x, near[1] + y, near[2] + z];
        const v = sampleAt(vol, p);
        if (v <= threshold) continue;
        // Weight by how far above threshold the sample is: the bead's core
        // pulls harder than its blurred rim.
        const w = v - threshold;
        sw += w; sx += w * p[0]; sy += w * p[1]; sz += w * p[2];
        sv += v; n++;
      }
    }
  }
  if (sw <= 0 || n === 0) return { center: near, meanValue: 0 };
  return { center: [sx / sw, sy / sw, sz / sw], meanValue: sv / n };
}

/**
 * Least-squares sphere through a point cloud (algebraic fit — linear, so no
 * iteration and no starting guess). Returns null when the points are too few or
 * degenerate, e.g. all on one plane.
 */
export function fitSphere(points: Vec3[]): { center: Vec3; radiusMm: number; rmsMm: number } | null {
  if (points.length < 8) return null;
  // |p|² = 2c·p + (r² − |c|²) is linear in (cx, cy, cz, k) — solve the 4×4 normal
  // equations for the least-squares solution.
  const A = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
  const b = [0, 0, 0, 0];
  for (const p of points) {
    const row = [2 * p[0], 2 * p[1], 2 * p[2], 1];
    const rhs = p[0] * p[0] + p[1] * p[1] + p[2] * p[2];
    for (let i = 0; i < 4; i++) {
      b[i] += row[i] * rhs;
      for (let j = 0; j < 4; j++) A[i][j] += row[i] * row[j];
    }
  }
  const sol = solveN(A, b);
  if (!sol) return null;
  const center: Vec3 = [sol[0], sol[1], sol[2]];
  const r2 = sol[3] + center[0] ** 2 + center[1] ** 2 + center[2] ** 2;
  if (!(r2 > 0)) return null;
  const radiusMm = Math.sqrt(r2);
  let s = 0;
  for (const p of points) {
    const d = Math.hypot(p[0] - center[0], p[1] - center[1], p[2] - center[2]) - radiusMm;
    s += d * d;
  }
  return { center, radiusMm, rmsMm: Math.sqrt(s / points.length) };
}

/** Gauss–Jordan with partial pivoting for a small dense system. */
function solveN(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const m = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[piv][c])) piv = r;
    if (Math.abs(m[piv][c]) < 1e-12) return null;
    [m[c], m[piv]] = [m[piv], m[c]];
    const d = m[c][c];
    for (let k = c; k <= n; k++) m[c][k] /= d;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = m[r][c];
      if (f === 0) continue;
      for (let k = c; k <= n; k++) m[r][k] -= f * m[c][k];
    }
  }
  return m.map((row) => row[n]);
}

/**
 * Snap a click on a scan surface to the centre of the bead it landed on.
 *
 * The centre of a sphere is fixed by its surface, so fitting the vertices
 * around the click beats the click itself. The fit has to be *checked* though —
 * click flat gingiva and it will happily return a sphere of any size centred
 * anywhere — so an implausible radius or a poor fit falls back to the click.
 */
export function snapToSphere(
  surfacePoints: Vec3[],
  click: Vec3,
  opts: { gatherMm?: number; minRadiusMm?: number; maxRadiusMm?: number; maxRmsMm?: number } = {},
): { point: Vec3; snapped: boolean; radiusMm?: number } {
  const gather = opts.gatherMm ?? 2.2;
  const minR = opts.minRadiusMm ?? 0.4;
  const maxR = opts.maxRadiusMm ?? 3.0;
  const maxRms = opts.maxRmsMm ?? 0.25;

  const near: Vec3[] = [];
  for (const p of surfacePoints) {
    if (Math.abs(p[0] - click[0]) > gather || Math.abs(p[1] - click[1]) > gather || Math.abs(p[2] - click[2]) > gather) continue;
    if (Math.hypot(p[0] - click[0], p[1] - click[1], p[2] - click[2]) <= gather) near.push(p);
  }
  const fit = fitSphere(near);
  if (!fit || fit.radiusMm < minR || fit.radiusMm > maxR || fit.rmsMm > maxRms) {
    return { point: click, snapped: false };
  }
  // A fit that runs away from the click is not the bead the user meant.
  if (Math.hypot(fit.center[0] - click[0], fit.center[1] - click[1], fit.center[2] - click[2]) > maxR) {
    return { point: click, snapped: false };
  }
  return { point: fit.center, snapped: true, radiusMm: fit.radiusMm };
}

/** The candidate a camera ray passes closest to, within `maxDistMm` of the ray. */
export function nearestFiducialToRay(
  fiducials: Fiducial[], origin: Vec3, direction: Vec3, maxDistMm = 2.5,
): Fiducial | null {
  const len = Math.hypot(direction[0], direction[1], direction[2]);
  if (len < 1e-9) return null;
  const d: Vec3 = [direction[0] / len, direction[1] / len, direction[2] / len];
  let best: Fiducial | null = null;
  let bestAlong = Infinity;
  for (const f of fiducials) {
    const v: Vec3 = [f.center[0] - origin[0], f.center[1] - origin[1], f.center[2] - origin[2]];
    const along = v[0] * d[0] + v[1] * d[1] + v[2] * d[2];
    if (along <= 0) continue; // behind the camera
    const perp = Math.hypot(v[0] - d[0] * along, v[1] - d[1] * along, v[2] - d[2] * along);
    // Generous enough to click a small bead, and the nearest one along the ray
    // wins so a marker behind another cannot steal the pick.
    if (perp > Math.max(maxDistMm, f.diameterMm)) continue;
    if (along < bestAlong) { bestAlong = along; best = f; }
  }
  return best;
}

/** Pairwise distance matrix of a point set. */
function distances(points: Vec3[]): number[][] {
  return points.map((a) => points.map((b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])));
}

/**
 * Which target point each source point corresponds to, from shape alone.
 *
 * Markers form a rigid constellation, so the correct assignment is the one
 * whose inter-point distances agree — pairing marker 2 with marker 3 stretches
 * the constellation and shows up immediately. Returns a permutation `perm`
 * where source i matches target perm[i], or null if the sets differ in size or
 * are too small to be distinctive.
 *
 * Brute force over permutations: this is used with a handful of markers, and at
 * that size exhaustive is both instant and exactly right.
 */
export function matchConstellations(source: Vec3[], target: Vec3[], maxErrorMm = 1.5): number[] | null {
  const n = source.length;
  if (n < 3 || n !== target.length || n > 8) return null;
  const ds = distances(source);
  const dt = distances(target);

  let best: number[] | null = null;
  let bestErr = Infinity;
  const perm: number[] = [];
  const used = new Array<boolean>(n).fill(false);

  const recurse = (i: number) => {
    if (i === n) {
      let err = 0, count = 0;
      for (let a = 0; a < n; a++) {
        for (let b = a + 1; b < n; b++) {
          err += Math.abs(ds[a][b] - dt[perm[a]][perm[b]]);
          count++;
        }
      }
      err /= count;
      if (err < bestErr) { bestErr = err; best = [...perm]; }
      return;
    }
    for (let j = 0; j < n; j++) {
      if (used[j]) continue;
      // Prune: a partial assignment already inconsistent cannot be rescued.
      let ok = true;
      for (let a = 0; a < i && ok; a++) {
        if (Math.abs(ds[a][i] - dt[perm[a]][j]) > maxErrorMm * 3) ok = false;
      }
      if (!ok) continue;
      used[j] = true; perm[i] = j;
      recurse(i + 1);
      used[j] = false;
    }
  };
  recurse(0);

  return best && bestErr <= maxErrorMm ? best : null;
}
