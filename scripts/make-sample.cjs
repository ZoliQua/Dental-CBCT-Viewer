/**
 * Offline sample-data prep: read one CBCT series, downsample to ~0.3 mm
 * (factor 2 in-plane + Z), convert to HU int16, and write an anonymized,
 * self-contained volume asset (gzipped raw + JSON header) into public/sample/.
 * No patient identifiers are carried over — only pixel data + geometry.
 *
 * Run: node scripts/make-sample.cjs
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const dicomParser = require('dicom-parser');

const SRC = path.join(__dirname, '..', 'dicom_test', 'ct_test_macko');
const OUT = path.join(__dirname, '..', 'public', 'sample');
const STEP = 2; // in-plane downsample factor
const ZSTEP = 3; // slice downsample factor

function readSlice(file) {
  const buf = fs.readFileSync(file);
  const ds = dicomParser.parseDicom(new Uint8Array(buf));
  const rows = ds.uint16('x00280010');
  const cols = ds.uint16('x00280011');
  if (!rows || !cols) return null;
  const pxEl = ds.elements['x7fe00010'];
  if (!pxEl) return null;
  const signed = (ds.uint16('x00280103') || 0) === 1;
  const slope = parseFloat(ds.string('x00281053') || '1') || 1;
  const intercept = parseFloat(ds.string('x00281052') || '0') || 0;
  const ipp = (ds.string('x00200032') || '0\\0\\0').split('\\').map(Number);
  const ps = (ds.string('x00280030') || '0.15\\0.15').split('\\').map(Number);
  const raw = signed
    ? new Int16Array(buf.buffer, buf.byteOffset + pxEl.dataOffset, pxEl.length / 2)
    : new Uint16Array(buf.buffer, buf.byteOffset + pxEl.dataOffset, pxEl.length / 2);
  return { rows, cols, raw, slope, intercept, z: ipp[2], ipp, ps };
}

function main() {
  const files = fs.readdirSync(SRC)
    .filter((f) => f.toLowerCase().endsWith('.dcm'))
    .map((f) => path.join(SRC, f));
  console.log(`Found ${files.length} DICOM files`);

  let slices = [];
  for (const f of files) {
    try { const s = readSlice(f); if (s) slices.push({ f, ...s }); } catch { /* skip */ }
  }
  slices.sort((a, b) => a.z - b.z);
  console.log(`Parsed ${slices.length} slices`);
  const kept = slices.filter((_, i) => i % ZSTEP === 0);

  const s0 = kept[0];
  const outCols = Math.floor(s0.cols / STEP);
  const outRows = Math.floor(s0.rows / STEP);
  const outSlices = kept.length;
  const vol = new Int16Array(outCols * outRows * outSlices);

  let k = 0;
  for (const s of kept) {
    for (let j = 0; j < outRows; j++) {
      for (let i = 0; i < outCols; i++) {
        const src = (j * STEP) * s.cols + (i * STEP);
        const hu = Math.round(s.raw[src] * s.slope + s.intercept);
        vol[k * outCols * outRows + j * outCols + i] = Math.max(-32768, Math.min(32767, hu));
      }
    }
    k++;
  }

  const spacing = [s0.ps[1] * STEP, s0.ps[0] * STEP, Math.abs(kept[1].z - kept[0].z)];
  const origin = [s0.ipp[0], s0.ipp[1], s0.ipp[2]];
  const meta = {
    dimensions: [outCols, outRows, outSlices],
    spacing,
    origin,
    direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    modality: 'CT',
    windowCenter: 300,
    windowWidth: 2500,
    patientName: 'Sample Patient',
    studyDate: '2020-01-01',
    institution: 'Sample Clinic',
    seriesDescription: 'CBCT sample (0.3 mm)',
  };

  fs.mkdirSync(OUT, { recursive: true });
  const gz = zlib.gzipSync(Buffer.from(vol.buffer), { level: 9 });
  meta.fileBytes = gz.length; // download denominator for the loading progress bar
  fs.writeFileSync(path.join(OUT, 'volume.raw.bin'), gz);
  fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify(meta));

  console.log(`dims ${meta.dimensions.join('x')} spacing ${spacing.map((x) => x.toFixed(3)).join('x')} mm`);
  console.log(`raw ${(vol.byteLength / 1e6).toFixed(1)} MB → gz ${(gz.length / 1e6).toFixed(1)} MB`);
}

main();
