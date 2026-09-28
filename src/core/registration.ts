/**
 * Rigid landmark registration — pure math, no Cornerstone/vtk (unit-testable).
 *
 * kabschTransform() aligns N corresponding point pairs (source → target) with a
 * rigid transform (rotation + translation) via Horn's unit-quaternion method
 * (a symmetric-4×4 eigenproblem solved by cyclic Jacobi — no reflection edge
 * cases). Matrices are 4×4 column-major, ready for vtk actor.setUserMatrix().
 *
 * rayTriangleHit()/pickMesh() ray-cast a click against a triangle soup so scan
 * landmarks can be picked on the 3D surface.
 */

import type { Vec3 } from './implantGeometry';

// ── 4×4 column-major matrix helpers ────────────────────────────

export const IDENTITY4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** Multiply two column-major 4×4 matrices: returns a·b. */
export function mul4(a: number[], b: number[]): number[] {
  const out = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      out[c * 4 + r] = s;
    }
  }
  return out;
}

/** Apply a column-major 4×4 (affine) to a world point. */
export function applyMat4(m: number[], p: Vec3): Vec3 {
  return [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
  ];
}

/** Column-major rigid matrix from a row-major 3×3 rotation R and translation t. */
function rigidMatrix(R: number[][], t: Vec3): number[] {
  return [
    R[0][0], R[1][0], R[2][0], 0,
    R[0][1], R[1][1], R[2][1], 0,
    R[0][2], R[1][2], R[2][2], 0,
    t[0], t[1], t[2], 1,
  ];
}

// ── Symmetric-matrix eigensolver (cyclic Jacobi) ───────────────

/** Eigen-decomposition of a symmetric n×n matrix. vectors[r][c] = component r
 * of eigenvector c. */
export function jacobiEigenSymmetric(input: number[][], n: number): { values: number[]; vectors: number[][] } {
  const a = input.map((row) => row.slice());
  const v: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  );

  for (let iter = 0; iter < 100; iter++) {
    // largest off-diagonal magnitude
    let p = 0, q = 1, off = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (Math.abs(a[i][j]) > off) { off = Math.abs(a[i][j]); p = i; q = j; }
      }
    }
    if (off < 1e-12) break;

    const app = a[p][p], aqq = a[q][q], apq = a[p][q];
    const phi = 0.5 * Math.atan2(2 * apq, aqq - app);
    const c = Math.cos(phi), s = Math.sin(phi);

    for (let i = 0; i < n; i++) {
      const aip = a[i][p], aiq = a[i][q];
      a[i][p] = c * aip - s * aiq;
      a[i][q] = s * aip + c * aiq;
    }
    for (let i = 0; i < n; i++) {
      const api = a[p][i], aqi = a[q][i];
      a[p][i] = c * api - s * aqi;
      a[q][i] = s * api + c * aqi;
    }
    for (let i = 0; i < n; i++) {
      const vip = v[i][p], viq = v[i][q];
      v[i][p] = c * vip - s * viq;
      v[i][q] = s * vip + c * viq;
    }
  }

  const values = a.map((row, i) => row[i]);
  return { values, vectors: v };
}

// ── Kabsch / Horn absolute orientation ─────────────────────────

function centroid(pts: Vec3[]): Vec3 {
  const c: Vec3 = [0, 0, 0];
  for (const p of pts) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; }
  return [c[0] / pts.length, c[1] / pts.length, c[2] / pts.length];
}

/**
 * Best-fit rigid transform mapping src → tgt (corresponding, same length ≥ 3).
 * Returns a 4×4 column-major matrix, or null if degenerate.
 */
export function kabschTransform(src: Vec3[], tgt: Vec3[]): number[] | null {
  if (src.length < 3 || src.length !== tgt.length) return null;
  const cs = centroid(src);
  const ct = centroid(tgt);

  // S[a][b] = Σ (src-cs)[a] · (tgt-ct)[b]
  const S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < src.length; i++) {
    const p: Vec3 = [src[i][0] - cs[0], src[i][1] - cs[1], src[i][2] - cs[2]];
    const q: Vec3 = [tgt[i][0] - ct[0], tgt[i][1] - ct[1], tgt[i][2] - ct[2]];
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) S[a][b] += p[a] * q[b];
  }

  const [Sxx, Sxy, Sxz] = S[0];
  const [Syx, Syy, Syz] = S[1];
  const [Szx, Szy, Szz] = S[2];

  const N = [
    [Sxx + Syy + Szz, Syz - Szy, Szx - Sxz, Sxy - Syx],
    [Syz - Szy, Sxx - Syy - Szz, Sxy + Syx, Szx + Sxz],
    [Szx - Sxz, Sxy + Syx, -Sxx + Syy - Szz, Syz + Szy],
    [Sxy - Syx, Szx + Sxz, Syz + Szy, -Sxx - Syy + Szz],
  ];

  const { values, vectors } = jacobiEigenSymmetric(N, 4);
  let best = 0;
  for (let i = 1; i < 4; i++) if (values[i] > values[best]) best = i;
  const q0 = vectors[0][best], q1 = vectors[1][best], q2 = vectors[2][best], q3 = vectors[3][best];
  const nrm = Math.hypot(q0, q1, q2, q3) || 1;
  const w = q0 / nrm, x = q1 / nrm, y = q2 / nrm, z = q3 / nrm;

  const R = [
    [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
    [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
    [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)],
  ];

  const Rcs: Vec3 = [
    R[0][0] * cs[0] + R[0][1] * cs[1] + R[0][2] * cs[2],
    R[1][0] * cs[0] + R[1][1] * cs[1] + R[1][2] * cs[2],
    R[2][0] * cs[0] + R[2][1] * cs[1] + R[2][2] * cs[2],
  ];
  const t: Vec3 = [ct[0] - Rcs[0], ct[1] - Rcs[1], ct[2] - Rcs[2]];
  return rigidMatrix(R, t);
}

/**
 * kabschTransform() plus the RMS point-pair residual in mm — the fit quality
 * of the registration. Large RMS (> ~1 mm) means the landmark pairs do not
 * agree with a single rigid transform (mis-picked points).
 */
export function kabschTransformWithRms(src: Vec3[], tgt: Vec3[]): { matrix: number[]; rmsMm: number } | null {
  const matrix = kabschTransform(src, tgt);
  if (!matrix) return null;
  let sum = 0;
  for (let i = 0; i < src.length; i++) {
    const p = applyMat4(matrix, src[i]);
    sum += (p[0] - tgt[i][0]) ** 2 + (p[1] - tgt[i][1]) ** 2 + (p[2] - tgt[i][2]) ** 2;
  }
  return { matrix, rmsMm: Math.sqrt(sum / src.length) };
}

// ── Iterative Closest Point (surface refinement) ───────────────

export interface IcpOptions {
  /** Max iterations (default 40). */
  maxIterations?: number;
  /** Stop when the RMS improvement between iterations drops below this (mm, default 1e-4). */
  tolerance?: number;
  /** Initial source→target transform (default identity — pass the 3-point Kabsch result). */
  initial?: number[];
  /**
   * Fraction of correspondences to keep, closest first (default 1 = all).
   *
   * Registering an intraoral scan to a CBCT is the case that needs this: most
   * of an arch scan is gingiva, which the CBCT does not image at all. Those
   * points have no true counterpart, and letting them vote drags the fit off
   * the teeth — a full-set objective plateaus around 1–2 mm where a trimmed one
   * reaches the voxel size. 0.3–0.5 is the useful range.
   */
  keep?: number;
}

export interface IcpResult {
  /** Refined source → target rigid transform (4×4 column-major). */
  transform: number[];
  /** Final RMS of each source point to its nearest target point, mm. */
  rmsMm: number;
  iterations: number;
}

/**
 * Uniform-grid nearest-neighbour index over a static point cloud.
 *
 * Brute force is O(n·m) per ICP iteration, which is fine for a handful of
 * landmarks and hopeless for the thousands of surface points a scan-to-CBCT
 * refinement needs. The grid answers in roughly constant time and stays
 * *exact*: rings of cells are scanned outwards and the search only stops once
 * the best distance found is closer than anything the next ring could hold.
 */
class PointGrid {
  private readonly cell: number;
  /** Rings beyond this cannot contain anything — the cloud has ended. */
  private readonly maxRing: number;
  private readonly buckets = new Map<string, number[]>();

  constructor(private readonly points: Vec3[]) {
    // Aim for a handful of points per cell, from the cloud's own density.
    let lo = [Infinity, Infinity, Infinity];
    let hi = [-Infinity, -Infinity, -Infinity];
    for (const p of points) {
      for (let a = 0; a < 3; a++) {
        if (p[a] < lo[a]) lo[a] = p[a];
        if (p[a] > hi[a]) hi[a] = p[a];
      }
    }
    const span = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2], 1e-6);
    this.cell = Math.max(span / Math.max(1, Math.cbrt(points.length)), 1e-6);
    // A query far outside the cloud would otherwise expand ring after ring over
    // empty space; one extent's worth of cells is all it can ever need.
    this.maxRing = Math.ceil(span / this.cell) + 2;
    for (let i = 0; i < points.length; i++) {
      const k = this.key(points[i]);
      const b = this.buckets.get(k);
      if (b) b.push(i); else this.buckets.set(k, [i]);
    }
  }

  private key(p: Vec3): string {
    const c = this.cell;
    return `${Math.floor(p[0] / c)},${Math.floor(p[1] / c)},${Math.floor(p[2] / c)}`;
  }

  /** [point, distance] of the nearest target to `q`. */
  nearest(q: Vec3): [Vec3, number] {
    const c = this.cell;
    const bx = Math.floor(q[0] / c), by = Math.floor(q[1] / c), bz = Math.floor(q[2] / c);
    let best = -1;
    let bestSq = Infinity;
    const scan = (dx: number, dy: number, dz: number) => {
      const b = this.buckets.get(`${bx + dx},${by + dy},${bz + dz}`);
      if (!b) return;
      for (const i of b) {
        const t = this.points[i];
        const d = (q[0] - t[0]) ** 2 + (q[1] - t[1]) ** 2 + (q[2] - t[2]) ** 2;
        if (d < bestSq) { bestSq = d; best = i; }
      }
    };
    for (let r = 0; r <= this.maxRing; r++) {
      // Walk only the SHELL of ring r (the interior was covered by r−1).
      // Scanning the whole cube and skipping the inside makes each ring O(r³)
      // and the search O(r⁴), which a point far outside the cloud feels badly.
      if (r === 0) {
        scan(0, 0, 0);
      } else {
        for (let dz = -r; dz <= r; dz++) {
          const faceZ = Math.abs(dz) === r;
          for (let dy = -r; dy <= r; dy++) {
            const faceY = Math.abs(dy) === r;
            if (faceZ || faceY) {
              for (let dx = -r; dx <= r; dx++) scan(dx, dy, dz);
            } else {
              scan(-r, dy, dz);
              scan(r, dy, dz);
            }
          }
        }
      }
      // A cell in ring r+1 can hold points as close as r·cell to q, so the
      // answer is only certain once the best beats that bound.
      if (best >= 0 && Math.sqrt(bestSq) <= r * c) break;
    }
    if (best < 0) return [this.points[0], Math.hypot(q[0] - this.points[0][0], q[1] - this.points[0][1], q[2] - this.points[0][2])];
    return [this.points[best], Math.sqrt(bestSq)];
  }
}

/** Source points under `m`, each with its nearest target and distance. */
function correspond(source: Vec3[], grid: PointGrid, m: number[]): { moved: Vec3; target: Vec3; dist: number }[] {
  return source.map((p) => {
    const moved = applyMat4(m, p);
    const [target, dist] = grid.nearest(moved);
    return { moved, target, dist };
  });
}

/** RMS over the closest `keep` fraction of the correspondences, mm. */
function trimmedRms(pairs: { dist: number }[], keep: number): number {
  const d = pairs.map((p) => p.dist).sort((a, b) => a - b);
  const n = Math.max(1, Math.min(d.length, Math.round(d.length * keep)));
  let sum = 0;
  for (let i = 0; i < n; i++) sum += d[i] * d[i];
  return Math.sqrt(sum / n);
}

/**
 * Point-to-point ICP: refine a source point cloud onto a target cloud by
 * repeatedly matching each source point to its nearest target and solving the
 * best rigid transform (Kabsch) for those correspondences. Seed `initial` with
 * the coarse 3-point Kabsch result so ICP only has to polish it.
 *
 * Pure (no Cornerstone/vtk) → unit-testable. Nearest-neighbour is brute force,
 * so callers should subsample large surfaces before passing them in.
 */
export function icpAlign(source: Vec3[], target: Vec3[], opts: IcpOptions = {}): IcpResult | null {
  const maxIter = opts.maxIterations ?? 40;
  const tol = opts.tolerance ?? 1e-4;
  const keep = Math.max(0.05, Math.min(1, opts.keep ?? 1));
  if (source.length < 3 || target.length < 1) return null;

  const grid = new PointGrid(target);
  let current = opts.initial ? [...opts.initial] : [...IDENTITY4];
  // Track the best iterate: point-to-point ICP is not monotonic, so the LAST
  // transform can be worse than one we already had — or worse than the seed.
  // Returning the best seen means a seeded refinement can never make things worse.
  let pairs = correspond(source, grid, current);
  let rms = trimmedRms(pairs, keep);
  let best = [...current];
  let bestRms = rms;
  let iter = 0;
  for (; iter < maxIter; iter++) {
    // With trimming, only the closest `keep` share of the correspondences get
    // to define the step — the rest are points the target does not contain.
    const used = keep < 1
      ? [...pairs].sort((a, b) => a.dist - b.dist).slice(0, Math.max(3, Math.round(pairs.length * keep)))
      : pairs;
    const delta = kabschTransform(used.map((p) => p.moved), used.map((p) => p.target));
    if (!delta) break;
    const next = mul4(delta, current);
    // One correspondence pass per iteration: it both scores `next` and feeds
    // the following step.
    const nextPairs = correspond(source, grid, next);
    const nextRms = trimmedRms(nextPairs, keep);
    if (nextRms < bestRms) { bestRms = nextRms; best = [...next]; }
    const improved = rms - nextRms;
    current = next; pairs = nextPairs; rms = nextRms;
    if (improved >= 0 && improved < tol) { iter++; break; }
  }
  return { transform: best, rmsMm: bestRms, iterations: iter };
}

// ── Ray-cast picking against a triangle soup ───────────────────

/** Möller–Trumbore ray/triangle: returns t (ray param) of the hit, or null. */
export function rayTriangleHit(orig: Vec3, dir: Vec3, a: Vec3, b: Vec3, c: Vec3): number | null {
  const e1: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const e2: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const px = dir[1] * e2[2] - dir[2] * e2[1];
  const py = dir[2] * e2[0] - dir[0] * e2[2];
  const pz = dir[0] * e2[1] - dir[1] * e2[0];
  const det = e1[0] * px + e1[1] * py + e1[2] * pz;
  if (Math.abs(det) < 1e-9) return null;
  const inv = 1 / det;
  const tv: Vec3 = [orig[0] - a[0], orig[1] - a[1], orig[2] - a[2]];
  const u = (tv[0] * px + tv[1] * py + tv[2] * pz) * inv;
  if (u < 0 || u > 1) return null;
  const qx = tv[1] * e1[2] - tv[2] * e1[1];
  const qy = tv[2] * e1[0] - tv[0] * e1[2];
  const qz = tv[0] * e1[1] - tv[1] * e1[0];
  const v = (dir[0] * qx + dir[1] * qy + dir[2] * qz) * inv;
  if (v < 0 || u + v > 1) return null;
  const t = (e2[0] * qx + e2[1] * qy + e2[2] * qz) * inv;
  return t > 1e-6 ? t : null;
}

/**
 * Nearest ray hit against a triangle soup (flat world-space vertex triplets).
 * `tris` is [ax,ay,az, bx,by,bz, cx,cy,cz, …]. Returns the hit world point.
 */
export function pickTriangleSoup(orig: Vec3, dir: Vec3, tris: Float32Array | number[]): Vec3 | null {
  let bestT = Infinity;
  for (let i = 0; i + 8 < tris.length; i += 9) {
    const a: Vec3 = [tris[i], tris[i + 1], tris[i + 2]];
    const b: Vec3 = [tris[i + 3], tris[i + 4], tris[i + 5]];
    const c: Vec3 = [tris[i + 6], tris[i + 7], tris[i + 8]];
    const t = rayTriangleHit(orig, dir, a, b, c);
    if (t !== null && t < bestT) bestT = t;
  }
  if (!Number.isFinite(bestT)) return null;
  return [orig[0] + dir[0] * bestT, orig[1] + dir[1] * bestT, orig[2] + dir[2] * bestT];
}
