/**
 * Offline prep for the bundled "CT + IO scan" sample (public/sample-io/).
 *
 * Produces, from an already de-identified source folder (see
 * scripts/anonymize-dicom.cjs):
 *   volume.raw.bin  gzipped raw int16 HU volume, downsampled to ~0.3 mm
 *   meta.json       its geometry + neutral study metadata (same shape as
 *                   public/sample/, so the sample loader reads both the same way)
 *   upper-jaw.ply.gz / lower-jaw.ply.gz
 *                   the intraoral scans, decimated to a display budget and
 *                   written as gzipped binary PLY (indexed — far smaller than
 *                   STL, and the viewer already reads PLY)
 *   scans.json      each mesh's jaw, colour and the 4×4 transform that puts it
 *                   into the CBCT's patient frame, plus the registration
 *                   residual it was measured at
 *
 * No patient identifier is carried over: the volume is rebuilt from pixel data
 * alone and the meshes are re-encoded from geometry alone.
 *
 *   node scripts/make-io-sample.cjs <anonymized-src-dir> [reg-dir]
 *
 * where <anonymized-src-dir> contains CBCT/ (DICOM) and scan/upper-jaw.stl +
 * scan/lower-jaw.stl. Registrations are read from [reg-dir]/{upper,lower}.json
 * when present, and computed (slow) otherwise.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const dicomParser = require('dicom-parser');
const reg = require('./register-scan-to-cbct.cjs');

const OUT = path.join(__dirname, '..', 'public', 'sample-io');
const STEP = 2; //  in-plane downsample factor (0.15 → 0.30 mm)
const ZSTEP = 3; // slice downsample factor (0.15 → 0.45 mm)
const TRIANGLE_BUDGET = 60000; // per jaw — smooth at arch scale, ~0.7 MB gzipped

// ── CBCT volume ────────────────────────────────────────────────

function readSlice(file) {
  const buf = fs.readFileSync(file);
  const ds = dicomParser.parseDicom(new Uint8Array(buf));
  const rows = ds.uint16('x00280010');
  const cols = ds.uint16('x00280011');
  const pxEl = ds.elements['x7fe00010'];
  if (!rows || !cols || !pxEl) return null;
  const signed = (ds.uint16('x00280103') || 0) === 1;
  const ipp = (ds.string('x00200032') || '0\\0\\0').split('\\').map(Number);
  const ps = (ds.string('x00280030') || '0.15\\0.15').split('\\').map(Number);
  const raw = signed
    ? new Int16Array(buf.buffer, buf.byteOffset + pxEl.dataOffset, pxEl.length / 2)
    : new Uint16Array(buf.buffer, buf.byteOffset + pxEl.dataOffset, pxEl.length / 2);
  return {
    rows, cols, raw, ipp, ps, z: ipp[2],
    slope: parseFloat(ds.string('x00281053') || '1') || 1,
    intercept: parseFloat(ds.string('x00281052') || '0') || 0,
  };
}

function buildVolume(dir) {
  const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.dcm')).map((f) => path.join(dir, f));
  const slices = [];
  for (const f of files) {
    try { const s = readSlice(f); if (s) slices.push(s); } catch { /* skip unreadable */ }
  }
  slices.sort((a, b) => a.z - b.z);
  const kept = slices.filter((_, i) => i % ZSTEP === 0);
  const s0 = kept[0];
  const cols = Math.floor(s0.cols / STEP);
  const rows = Math.floor(s0.rows / STEP);
  const vol = new Int16Array(cols * rows * kept.length);
  kept.forEach((s, k) => {
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const hu = Math.round(s.raw[(j * STEP) * s.cols + (i * STEP)] * s.slope + s.intercept);
        vol[k * cols * rows + j * cols + i] = Math.max(-32768, Math.min(32767, hu));
      }
    }
  });
  return {
    vol,
    dimensions: [cols, rows, kept.length],
    spacing: [s0.ps[1] * STEP, s0.ps[0] * STEP, Math.abs(kept[1].z - kept[0].z)],
    origin: [s0.ipp[0], s0.ipp[1], s0.ipp[2]],
  };
}

// ── mesh decimation + PLY ──────────────────────────────────────

/**
 * Vertex-clustering decimation: snap vertices to a `cell`-sized grid, replace
 * each cell by its centroid and drop the triangles that collapse. Cheap, robust
 * on scanner output (which is often not watertight) and quite good enough for a
 * display mesh — the scan's own 0.05 mm detail is far beyond what the screen or
 * the CBCT it sits on can show.
 */
function clusterDecimate(soup, cell) {
  const cells = new Map(); // key → {sx,sy,sz,n,index}
  const idx = new Int32Array(soup.length / 3);
  for (let i = 0, v = 0; i < soup.length; i += 3, v++) {
    const key = `${Math.floor(soup[i] / cell)},${Math.floor(soup[i + 1] / cell)},${Math.floor(soup[i + 2] / cell)}`;
    let c = cells.get(key);
    if (!c) { c = { sx: 0, sy: 0, sz: 0, n: 0, index: cells.size }; cells.set(key, c); }
    c.sx += soup[i]; c.sy += soup[i + 1]; c.sz += soup[i + 2]; c.n++;
    idx[v] = c.index;
  }
  const positions = new Float32Array(cells.size * 3);
  for (const c of cells.values()) {
    positions[c.index * 3] = c.sx / c.n;
    positions[c.index * 3 + 1] = c.sy / c.n;
    positions[c.index * 3 + 2] = c.sz / c.n;
  }
  const tris = [];
  for (let f = 0; f < idx.length; f += 3) {
    const a = idx[f], b = idx[f + 1], c = idx[f + 2];
    if (a === b || b === c || a === c) continue; // collapsed into one cell
    tris.push(a, b, c);
  }
  return { positions, indices: new Uint32Array(tris) };
}

/** Pick the cell size that lands closest to `budget` triangles (bisection). */
function decimateToBudget(soup, budget) {
  let lo = 0.05, hi = 3.0, best = null;
  for (let it = 0; it < 14; it++) {
    const cell = Math.sqrt(lo * hi); // geometric bisection — cell scales ~1/√tris
    const m = clusterDecimate(soup, cell);
    const n = m.indices.length / 3;
    if (!best || Math.abs(n - budget) < Math.abs(best.n - budget)) best = { ...m, n, cell };
    if (n > budget) lo = cell; else hi = cell;
    if (Math.abs(n - budget) / budget < 0.05) break;
  }
  return best;
}

/** Area-weighted per-vertex normals. */
function vertexNormals(positions, indices) {
  const n = new Float32Array(positions.length);
  for (let f = 0; f < indices.length; f += 3) {
    const a = indices[f] * 3, b = indices[f + 1] * 3, c = indices[f + 2] * 3;
    const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; // ‖n‖ = 2·area
    for (const o of [a, b, c]) { n[o] += nx; n[o + 1] += ny; n[o + 2] += nz; }
  }
  for (let i = 0; i < n.length; i += 3) {
    const len = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
    n[i] /= len; n[i + 1] /= len; n[i + 2] /= len;
  }
  return n;
}

/** Binary little-endian PLY with positions + normals and triangle faces. */
function writePLY(positions, normals, indices) {
  const nv = positions.length / 3, nf = indices.length / 3;
  const header = Buffer.from(
    'ply\nformat binary_little_endian 1.0\n'
    + 'comment DenCT sample intraoral scan (de-identified, decimated)\n'
    + `element vertex ${nv}\n`
    + 'property float x\nproperty float y\nproperty float z\n'
    + 'property float nx\nproperty float ny\nproperty float nz\n'
    + `element face ${nf}\n`
    + 'property list uchar int vertex_indices\n'
    + 'end_header\n', 'latin1');
  const body = Buffer.allocUnsafe(nv * 24 + nf * 13);
  let o = 0;
  for (let i = 0; i < nv; i++) {
    body.writeFloatLE(positions[i * 3], o); body.writeFloatLE(positions[i * 3 + 1], o + 4); body.writeFloatLE(positions[i * 3 + 2], o + 8);
    body.writeFloatLE(normals[i * 3], o + 12); body.writeFloatLE(normals[i * 3 + 1], o + 16); body.writeFloatLE(normals[i * 3 + 2], o + 20);
    o += 24;
  }
  for (let f = 0; f < nf; f++) {
    body.writeUInt8(3, o);
    body.writeInt32LE(indices[f * 3], o + 1); body.writeInt32LE(indices[f * 3 + 1], o + 5); body.writeInt32LE(indices[f * 3 + 2], o + 9);
    o += 13;
  }
  return Buffer.concat([header, body]);
}

// ── driver ─────────────────────────────────────────────────────

const JAWS = [
  { jaw: 'upper', file: 'upper-jaw.stl', out: 'upper-jaw.ply.gz', type: 'upperJaw', nameKey: 'scan.upperJaw' },
  { jaw: 'lower', file: 'lower-jaw.stl', out: 'lower-jaw.ply.gz', type: 'lowerJaw', nameKey: 'scan.lowerJaw' },
];

function main() {
  const src = process.argv[2];
  const regDir = process.argv[3];
  if (!src) {
    console.error('usage: node scripts/make-io-sample.cjs <anonymized-src-dir> [reg-dir]');
    process.exit(1);
  }
  const dicomDir = path.join(src, 'CBCT');
  const scanDir = path.join(src, 'scan');
  fs.mkdirSync(OUT, { recursive: true });

  console.log('building volume…');
  const { vol, dimensions, spacing, origin } = buildVolume(dicomDir);
  const meta = {
    dimensions, spacing, origin,
    direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    modality: 'CT',
    windowCenter: 300,
    windowWidth: 2500,
    patientName: 'Sample Patient',
    studyDate: '2020-01-01',
    institution: 'Sample Clinic',
    seriesDescription: 'CBCT + IO scan sample (0.3 mm)',
  };
  const gz = zlib.gzipSync(Buffer.from(vol.buffer), { level: 9 });
  meta.fileBytes = gz.length; // download denominator for the progress bar
  fs.writeFileSync(path.join(OUT, 'volume.raw.bin'), gz);
  fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify(meta));
  console.log(`  ${dimensions.join('×')} @ ${spacing.map((v) => v.toFixed(2)).join('×')} mm → ${(gz.length / 1e6).toFixed(1)} MB gz`);

  // Registration: reuse the measured transforms when they exist, else compute.
  let cloud = null, bands = null;
  const scans = [];
  for (const j of JAWS) {
    const stl = path.join(scanDir, j.file);
    const cached = regDir && path.join(regDir, `${j.jaw}.json`);
    let result;
    if (cached && fs.existsSync(cached)) {
      result = JSON.parse(fs.readFileSync(cached, 'utf8'));
      console.log(`${j.jaw}: transform from ${path.relative(process.cwd(), cached)} (trimmed RMS ${result.trimmedRmsMm} mm)`);
    } else {
      if (!cloud) {
        console.log('registering (no cached transform) — this takes a few minutes…');
        const slices = reg.readSeries(dicomDir);
        bands = reg.findJawBands(slices);
        cloud = reg.denseSurfacePoints(slices, 1200, 2);
      }
      result = reg.registerJaw(cloud, reg.readBinarySTL(stl), j.jaw, bands[j.jaw]);
      console.log(`${j.jaw}: registered, trimmed RMS ${result.trimmedRmsMm} mm`);
    }

    const soup = reg.readBinarySTL(stl);
    const dec = decimateToBudget(soup, TRIANGLE_BUDGET);
    const normals = vertexNormals(dec.positions, dec.indices);
    const ply = writePLY(dec.positions, normals, dec.indices);
    const plyGz = zlib.gzipSync(ply, { level: 9 });
    fs.writeFileSync(path.join(OUT, j.out), plyGz);
    console.log(`  ${soup.length / 9} → ${dec.n} triangles (cell ${dec.cell.toFixed(3)} mm), ${(plyGz.length / 1e6).toFixed(2)} MB gz`);

    scans.push({
      file: j.out,
      type: j.type,
      nameKey: j.nameKey,
      transform: result.transform,
      triangles: dec.n,
      fileBytes: plyGz.length,
      registration: { trimmedRmsMm: result.trimmedRmsMm, within03mmPct: result.within03mmPct },
    });
  }

  fs.writeFileSync(path.join(OUT, 'scans.json'), JSON.stringify({ version: 1, scans }, null, 2));
  const total = fs.readdirSync(OUT).reduce((a, f) => a + fs.statSync(path.join(OUT, f)).size, 0);
  console.log(`\npublic/sample-io/ — ${(total / 1e6).toFixed(1)} MB total`);
}

if (require.main === module) main();
module.exports = { clusterDecimate, decimateToBudget, vertexNormals, writePLY };
