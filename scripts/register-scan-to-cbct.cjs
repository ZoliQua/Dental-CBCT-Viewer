/**
 * Offline CBCT ↔ intraoral-scan registration (surface-based).
 *
 * An intraoral scanner exports each jaw in its own coordinate system, so a scan
 * has to be brought into the CBCT's patient frame before it can be planned
 * against. This finds that rigid transform automatically:
 *
 *   1. Threshold the CBCT and collect the dense-tissue (enamel / cortical)
 *      boundary voxels as a point cloud, restricted to the jaw's crown band.
 *   2. Take the scan's occlusal band — the crowns, the only surface the CBCT
 *      actually images. Gingiva has no CBCT counterpart and must not steer the
 *      fit, so the objective is *trimmed*: only the best-matching fraction of
 *      the points counts.
 *   3. Coarse pose search (yaw × pitch × roll about the crown centroid) to pick
 *      the basin, then trimmed ICP from the best few candidates.
 *
 * The result is a 4×4 column-major matrix in the app's convention (the one a
 * ScanMesh carries as `transform`, i.e. vtk `actor.setUserMatrix`).
 *
 *   node scripts/register-scan-to-cbct.cjs <dicom-dir> <mesh.stl> upper|lower [out.json]
 *
 * Accuracy is reported as the trimmed RMS over the kept correspondences; on the
 * bundled sample both jaws land at ≈0.3 mm, which is the CBCT's own voxel size.
 * Always check the result visually — this is a starting alignment, not a
 * certified registration, and the viewer's manual nudge exists for that reason.
 */
const fs = require('fs');
const path = require('path');
const dicomParser = require('dicom-parser');

// ── CBCT → dense-surface point cloud ───────────────────────────

/** Read a CT series into z-sorted slices with their geometry. */
function readSeries(dir) {
  const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.dcm'));
  const slices = [];
  for (const f of files) {
    const buf = fs.readFileSync(path.join(dir, f));
    const ds = dicomParser.parseDicom(new Uint8Array(buf));
    const el = ds.elements['x7fe00010'];
    if (!el) continue;
    const ipp = (ds.string('x00200032') || '0\\0\\0').split('\\').map(Number);
    const ps = (ds.string('x00280030') || '0.15\\0.15').split('\\').map(Number);
    slices.push({
      z: ipp[2], ox: ipp[0], oy: ipp[1],
      sx: ps[1], sy: ps[0],
      cols: ds.uint16('x00280011'), rows: ds.uint16('x00280010'),
      intercept: parseFloat(ds.string('x00281052') || '0') || 0,
      slope: parseFloat(ds.string('x00281053') || '1') || 1,
      raw: new Uint16Array(buf.buffer, buf.byteOffset + el.dataOffset, el.length / 2),
    });
  }
  slices.sort((a, b) => a.z - b.z);
  return slices;
}

/**
 * Boundary voxels of the `>huThreshold` mask, as world-mm points, sampled on a
 * `step`-times coarser grid. A boundary voxel is a dense voxel with at least one
 * non-dense 6-neighbour — i.e. the surface the scan should land on.
 */
function denseSurfacePoints(slices, huThreshold, step = 2) {
  const s0 = slices[0];
  const nx = Math.floor(s0.cols / step), ny = Math.floor(s0.rows / step), nz = Math.floor(slices.length / step);
  const sx = s0.sx * step, sy = s0.sy * step, sz = Math.abs(slices[1].z - slices[0].z) * step;
  const vol = new Int16Array(nx * ny * nz);
  for (let k = 0; k < nz; k++) {
    const s = slices[k * step];
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        vol[k * nx * ny + j * nx + i] = s.raw[(j * step) * s.cols + (i * step)] * s.slope + s.intercept;
      }
    }
  }
  const dense = (i, j, k) => vol[k * nx * ny + j * nx + i] > huThreshold;
  const pts = [];
  for (let k = 1; k < nz - 1; k++) {
    for (let j = 1; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        if (!dense(i, j, k)) continue;
        if (dense(i - 1, j, k) && dense(i + 1, j, k) && dense(i, j - 1, k)
            && dense(i, j + 1, k) && dense(i, j, k - 1) && dense(i, j, k + 1)) continue;
        pts.push(s0.ox + i * sx, s0.oy + j * sy, s0.z + k * sz);
      }
    }
  }
  return new Float32Array(pts);
}

// ── mesh input ─────────────────────────────────────────────────

/** Binary-STL triangle soup as a flat Float32Array (9 floats per triangle). */
function readBinarySTL(file) {
  const b = fs.readFileSync(file);
  const n = b.readUInt32LE(80);
  const out = new Float32Array(n * 9);
  for (let i = 0; i < n; i++) {
    const o = 84 + i * 50 + 12; // skip the per-facet normal
    for (let k = 0; k < 9; k++) out[i * 9 + k] = b.readFloatLE(o + k * 4);
  }
  return out;
}

/** Collapse a soup to one point per `cell`-sized grid cube. */
function dedupe(soup, cell) {
  const seen = new Map();
  for (let i = 0; i < soup.length; i += 3) {
    const k = `${Math.round(soup[i] / cell)},${Math.round(soup[i + 1] / cell)},${Math.round(soup[i + 2] / cell)}`;
    if (!seen.has(k)) seen.set(k, [soup[i], soup[i + 1], soup[i + 2]]);
  }
  const out = new Float32Array(seen.size * 3);
  let j = 0;
  for (const p of seen.values()) { out[j++] = p[0]; out[j++] = p[1]; out[j++] = p[2]; }
  return out;
}

function filterZ(pts, zmin, zmax) {
  const out = [];
  for (let i = 0; i < pts.length; i += 3) if (pts[i + 2] >= zmin && pts[i + 2] <= zmax) out.push(pts[i], pts[i + 1], pts[i + 2]);
  return new Float32Array(out);
}

function centroid(p) {
  let x = 0, y = 0, z = 0;
  const n = p.length / 3;
  for (let i = 0; i < p.length; i += 3) { x += p[i]; y += p[i + 1]; z += p[i + 2]; }
  return [x / n, y / n, z / n];
}

function zRange(p) {
  let a = Infinity, b = -Infinity;
  for (let i = 2; i < p.length; i += 3) { if (p[i] < a) a = p[i]; if (p[i] > b) b = p[i]; }
  return [a, b];
}

// ── nearest neighbour ──────────────────────────────────────────

/** Uniform-grid nearest neighbour over a static cloud — O(1) per query. */
class PointGrid {
  constructor(pts, cell) {
    this.pts = pts;
    this.cell = cell;
    this.map = new Map();
    for (let i = 0; i < pts.length; i += 3) {
      const k = this.key(pts[i], pts[i + 1], pts[i + 2]);
      let a = this.map.get(k);
      if (!a) { a = []; this.map.set(k, a); }
      a.push(i);
    }
  }

  key(x, y, z) {
    return `${Math.floor(x / this.cell)},${Math.floor(y / this.cell)},${Math.floor(z / this.cell)}`;
  }

  /** [index, distance] of the nearest point within `rings` cells, or [-1, ∞]. */
  nearest(x, y, z, rings) {
    const c = this.cell;
    const bx = Math.floor(x / c), by = Math.floor(y / c), bz = Math.floor(z / c);
    let best = -1, bd = Infinity;
    for (let dz = -rings; dz <= rings; dz++) {
      for (let dy = -rings; dy <= rings; dy++) {
        for (let dx = -rings; dx <= rings; dx++) {
          const a = this.map.get(`${bx + dx},${by + dy},${bz + dz}`);
          if (!a) continue;
          for (const i of a) {
            const ex = this.pts[i] - x, ey = this.pts[i + 1] - y, ez = this.pts[i + 2] - z;
            const d = ex * ex + ey * ey + ez * ez;
            if (d < bd) { bd = d; best = i; }
          }
        }
      }
    }
    return [best, Math.sqrt(bd)];
  }
}

// ── small rotation / rigid-transform algebra (row-major 3×3) ───

function rotXYZ(rxDeg, ryDeg, rzDeg) {
  const d = Math.PI / 180;
  const cx = Math.cos(rxDeg * d), sx = Math.sin(rxDeg * d);
  const cy = Math.cos(ryDeg * d), sy = Math.sin(ryDeg * d);
  const cz = Math.cos(rzDeg * d), sz = Math.sin(rzDeg * d);
  return [
    cy * cz, -cy * sz, sy,
    sx * sy * cz + cx * sz, -sx * sy * sz + cx * cz, -sx * cy,
    -cx * sy * cz + sx * sz, cx * sy * sz + sx * cz, cx * cy,
  ];
}
const applyR = (R, p) => [
  R[0] * p[0] + R[1] * p[1] + R[2] * p[2],
  R[3] * p[0] + R[4] * p[1] + R[5] * p[2],
  R[6] * p[0] + R[7] * p[1] + R[8] * p[2],
];
const mulR = (A, B) => {
  const C = new Array(9);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) C[r * 3 + c] = A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c];
  return C;
};
const det3 = (m) => m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);
function inv3(m) {
  const d = det3(m);
  if (Math.abs(d) < 1e-14) return null;
  const i = 1 / d;
  return [
    (m[4] * m[8] - m[5] * m[7]) * i, (m[2] * m[7] - m[1] * m[8]) * i, (m[1] * m[5] - m[2] * m[4]) * i,
    (m[5] * m[6] - m[3] * m[8]) * i, (m[0] * m[8] - m[2] * m[6]) * i, (m[2] * m[3] - m[0] * m[5]) * i,
    (m[3] * m[7] - m[4] * m[6]) * i, (m[1] * m[6] - m[0] * m[7]) * i, (m[0] * m[4] - m[1] * m[3]) * i,
  ];
}

/** Orthogonal (rotation) factor of Hᵀ by Newton polar iteration R ← (R + R⁻ᵀ)/2. */
function polarRotation(H) {
  let R = [H[0], H[3], H[6], H[1], H[4], H[7], H[2], H[5], H[8]];
  for (let it = 0; it < 60; it++) {
    const Ri = inv3(R);
    if (!Ri) break;
    const next = new Array(9);
    let diff = 0;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) next[i * 3 + j] = 0.5 * (R[i * 3 + j] + Ri[j * 3 + i]);
    for (let i = 0; i < 9; i++) diff += Math.abs(next[i] - R[i]);
    R = next;
    if (diff < 1e-12) break;
  }
  if (det3(R) < 0) for (let i = 0; i < 9; i++) R[i] = -R[i]; // never return a reflection
  return R;
}

/** Best rigid src→dst for the given index pairs (Kabsch). */
function kabsch(src, dst, pairs) {
  let cs = [0, 0, 0], cd = [0, 0, 0];
  for (const [a, b] of pairs) {
    cs[0] += src[a]; cs[1] += src[a + 1]; cs[2] += src[a + 2];
    cd[0] += dst[b]; cd[1] += dst[b + 1]; cd[2] += dst[b + 2];
  }
  const n = pairs.length;
  cs = cs.map((v) => v / n); cd = cd.map((v) => v / n);
  const H = new Array(9).fill(0);
  for (const [a, b] of pairs) {
    const p = [src[a] - cs[0], src[a + 1] - cs[1], src[a + 2] - cs[2]];
    const q = [dst[b] - cd[0], dst[b + 1] - cd[1], dst[b + 2] - cd[2]];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) H[r * 3 + c] += p[r] * q[c];
  }
  const R = polarRotation(H);
  const Rc = applyR(R, cs);
  return { R, t: [cd[0] - Rc[0], cd[1] - Rc[1], cd[2] - Rc[2]] };
}

const compose = (R1, t1, R2, t2) => ({ R: mulR(R2, R1), t: applyR(R2, t1).map((v, i) => v + t2[i]) });

function transformPts(pts, R, t) {
  const out = new Float32Array(pts.length);
  for (let i = 0; i < pts.length; i += 3) {
    out[i] = R[0] * pts[i] + R[1] * pts[i + 1] + R[2] * pts[i + 2] + t[0];
    out[i + 1] = R[3] * pts[i] + R[4] * pts[i + 1] + R[5] * pts[i + 2] + t[1];
    out[i + 2] = R[6] * pts[i] + R[7] * pts[i + 1] + R[8] * pts[i + 2] + t[2];
  }
  return out;
}

/** Column-major 4×4 (vtk userMatrix / ScanMesh.transform order). */
const toMat16 = (R, t) => [R[0], R[3], R[6], 0, R[1], R[4], R[7], 0, R[2], R[5], R[8], 0, t[0], t[1], t[2], 1];

// ── registration ───────────────────────────────────────────────

const DEFAULTS = {
  huThreshold: 1200, // dense tissue: enamel + cortical bone
  crownBandMm: 8, //   occlusal band of the scan that the CBCT can match
  keep: 0.35, //       trimmed fraction — the rest is gingiva with no counterpart
  icpIterations: 60,
  seeds: 6, //         coarse candidates refined by ICP
};

/**
 * Register one jaw scan to a CBCT point cloud.
 * `cbctBand` is the world-z range of that jaw's crowns in the CBCT.
 */
function registerJaw(cbctPoints, meshSoup, jaw, cbctBand, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const target = filterZ(cbctPoints, cbctBand[0], cbctBand[1]);
  if (target.length < 3000) throw new Error(`CBCT band ${cbctBand} holds too few surface points (${target.length / 3})`);

  const verts = dedupe(meshSoup, 0.35);
  const [mn, mx] = zRange(verts);
  const crown = jaw === 'upper' ? filterZ(verts, mn, mn + o.crownBandMm) : filterZ(verts, mx - o.crownBandMm, mx);

  const grid = new PointGrid(target, 2.0);
  const cc = centroid(crown), tc = centroid(target);
  const centred = new Float32Array(crown.length);
  for (let i = 0; i < crown.length; i += 3) {
    centred[i] = crown[i] - cc[0]; centred[i + 1] = crown[i + 1] - cc[1]; centred[i + 2] = crown[i + 2] - cc[2];
  }

  // Coarse search on a subsample; distances are truncated so a wildly wrong
  // pose cannot score better just by having fewer catastrophic outliers.
  const stride = Math.max(1, Math.floor(crown.length / 3 / 1200));
  const sub = [];
  for (let i = 0; i < crown.length / 3; i += stride) sub.push(centred[i * 3], centred[i * 3 + 1], centred[i * 3 + 2]);
  const subA = new Float32Array(sub);
  const trimmedMean = (pts) => {
    const ds = [];
    for (let i = 0; i < pts.length; i += 3) {
      const [j, d] = grid.nearest(pts[i], pts[i + 1], pts[i + 2], 2);
      ds.push(j >= 0 ? d : 4);
    }
    ds.sort((a, b) => a - b);
    const k = Math.max(20, Math.floor(ds.length * o.keep));
    let s = 0;
    for (let i = 0; i < k; i++) s += ds[i];
    return s / k;
  };

  const candidates = [];
  for (let yaw = 0; yaw < 360; yaw += 6) {
    for (const pitch of [-24, -12, 0, 12, 24]) {
      for (const roll of [-24, -12, 0, 12, 24]) {
        const R = rotXYZ(pitch, roll, yaw);
        candidates.push({ score: trimmedMean(transformPts(subA, R, tc)), R, t: [...tc], yaw, pitch, roll });
      }
    }
  }
  candidates.sort((a, b) => a.score - b.score);

  const icp = (R0, t0) => {
    let R = R0, t = t0, rms = Infinity, kept = 0;
    for (let it = 0; it < o.icpIterations; it++) {
      const moved = transformPts(centred, R, t);
      const corr = [];
      for (let i = 0; i < moved.length; i += 3) {
        const [j, d] = grid.nearest(moved[i], moved[i + 1], moved[i + 2], 2);
        if (j >= 0) corr.push([i, j, d]);
      }
      if (corr.length < 50) return null;
      corr.sort((a, b) => a[2] - b[2]);
      kept = Math.max(50, Math.floor(corr.length * o.keep));
      const inliers = corr.slice(0, kept);
      rms = Math.sqrt(inliers.reduce((a, c) => a + c[2] * c[2], 0) / kept);
      const { R: dR, t: dt } = kabsch(moved, target, inliers.map(([i, j]) => [i, j]));
      ({ R, t } = compose(R, t, dR, dt));
    }
    return { R, t, rms, kept };
  };

  let best = null;
  for (const c of candidates.slice(0, o.seeds)) {
    const r = icp(c.R, c.t);
    if (r && (!best || r.rms < best.rms)) best = { ...r, seed: c };
  }
  if (!best) throw new Error('ICP failed to converge from any coarse seed');

  // Residual profile over the whole crown band (gingiva included), for the report.
  const moved = transformPts(centred, best.R, best.t);
  const ds = [];
  for (let i = 0; i < moved.length; i += 3) {
    const [j, d] = grid.nearest(moved[i], moved[i + 1], moved[i + 2], 2);
    ds.push(j >= 0 ? d : 99);
  }
  ds.sort((a, b) => a - b);

  // Fold the centring back in: world = R·(p − cc) + t = R·p + (t − R·cc)
  const Rcc = applyR(best.R, cc);
  const t = [best.t[0] - Rcc[0], best.t[1] - Rcc[1], best.t[2] - Rcc[2]];
  return {
    transform: toMat16(best.R, t).map((v) => Number(v.toFixed(6))),
    trimmedRmsMm: Number(best.rms.toFixed(4)),
    keptPoints: best.kept,
    crownPoints: crown.length / 3,
    within03mmPct: Number((ds.filter((d) => d < 0.3).length / ds.length * 100).toFixed(1)),
    seed: { yaw: best.seed.yaw, pitch: best.seed.pitch, roll: best.seed.roll },
  };
}

/**
 * Split the CBCT's dense-surface cloud into the upper and lower crown bands by
 * finding the occlusal gap: the two tooth-enamel peaks along z with the sparse
 * band between them. Returns world-z ranges, so the caller needs no hand-tuning.
 */
function findJawBands(slices) {
  const enamel = denseSurfacePoints(slices, 2000, 2);
  const [zmin, zmax] = zRange(enamel);
  const bin = 1.5;
  const counts = new Map();
  for (let i = 2; i < enamel.length; i += 3) {
    const b = Math.floor((enamel[i] - zmin) / bin);
    counts.set(b, (counts.get(b) || 0) + 1);
  }
  const nb = Math.ceil((zmax - zmin) / bin);
  const hist = Array.from({ length: nb }, (_, i) => counts.get(i) || 0);
  const peak = hist.indexOf(Math.max(...hist));
  // Walk away from the global peak until the count collapses — that valley is
  // the occlusal gap; the other arch is on its far side.
  const floorCount = Math.max(...hist) * 0.12;
  let lo = peak, hi = peak;
  while (lo > 0 && hist[lo] > floorCount) lo--;
  while (hi < nb - 1 && hist[hi] > floorCount) hi++;
  const peakBand = [zmin + lo * bin, zmin + (hi + 1) * bin];
  const otherHist = hist.map((c, i) => (i >= lo && i <= hi ? 0 : c));
  const peak2 = otherHist.indexOf(Math.max(...otherHist));
  let lo2 = peak2, hi2 = peak2;
  while (lo2 > 0 && otherHist[lo2] > floorCount) lo2--;
  while (hi2 < nb - 1 && otherHist[hi2] > floorCount) hi2++;
  const otherBand = [zmin + lo2 * bin, zmin + (hi2 + 1) * bin];
  // +z is superior in DICOM patient coordinates, so the higher band is the maxilla.
  const [lower, upper] = peakBand[0] < otherBand[0] ? [peakBand, otherBand] : [otherBand, peakBand];
  return { upper, lower };
}

function main() {
  const [dicomDir, meshFile, jaw, outFile] = process.argv.slice(2);
  if (!dicomDir || !meshFile || !['upper', 'lower'].includes(jaw)) {
    console.error('usage: node scripts/register-scan-to-cbct.cjs <dicom-dir> <mesh.stl> upper|lower [out.json]');
    process.exit(1);
  }
  console.log('reading CBCT…');
  const slices = readSeries(dicomDir);
  console.log(`  ${slices.length} slices, z ${slices[0].z.toFixed(1)}..${slices[slices.length - 1].z.toFixed(1)} mm`);
  const bands = findJawBands(slices);
  console.log(`  crown bands: upper z ${bands.upper.map((v) => v.toFixed(1)).join('..')}  lower z ${bands.lower.map((v) => v.toFixed(1)).join('..')}`);
  const cloud = denseSurfacePoints(slices, DEFAULTS.huThreshold, 2);
  console.log(`  dense surface points: ${cloud.length / 3}`);

  console.log(`registering ${jaw} jaw…`);
  const result = registerJaw(cloud, readBinarySTL(meshFile), jaw, bands[jaw]);
  console.log(`  trimmed RMS ${result.trimmedRmsMm} mm over ${result.keptPoints}/${result.crownPoints} crown points`);
  console.log(`  ${result.within03mmPct}% of the crown band within 0.3 mm`);
  console.log(`  transform ${JSON.stringify(result.transform)}`);
  if (outFile) {
    fs.writeFileSync(outFile, JSON.stringify({ jaw, mesh: path.basename(meshFile), band: bands[jaw], ...result }, null, 2));
    console.log(`  written to ${outFile}`);
  }
}

if (require.main === module) main();
module.exports = { readSeries, denseSurfacePoints, readBinarySTL, registerJaw, findJawBands, PointGrid, dedupe, filterZ, zRange, toMat16 };
