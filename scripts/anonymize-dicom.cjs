/**
 * Offline DICOM de-identification for local test corpora.
 *
 * Rewrites the identifying element VALUES in place inside a copy of each file,
 * always with a replacement of exactly the same byte length, so no offset,
 * group length or transfer syntax has to be recomputed — the pixel data and the
 * geometry come through untouched. UIDs are replaced with deterministic
 * pseudonyms (same value in → same value out), which keeps a series coherent
 * across its files while breaking the link to the original study.
 *
 * This covers the identifiers a dental CBCT export actually carries. It is a
 * practical de-identification for sample data, not a certified implementation
 * of the DICOM Basic Application Level Confidentiality Profile (PS3.15 E.1) —
 * it does not remove burned-in annotations or unknown private tags wholesale.
 *
 *   node scripts/anonymize-dicom.cjs <src-dir> <out-dir>
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const dicomParser = require('dicom-parser');

/** tag → replacement value ('' = blank out). Dates/times get a fixed epoch. */
const REPLACE = {
  x00080020: '20200101', // StudyDate
  x00080021: '20200101', // SeriesDate
  x00080022: '20200101', // AcquisitionDate
  x00080023: '20200101', // ContentDate
  x00080030: '000000', //   StudyTime
  x00080031: '000000', //   SeriesTime
  x00080032: '000000', //   AcquisitionTime
  x00080033: '000000', //   ContentTime
  x00080050: '', //         AccessionNumber
  x00080080: 'Anonymized', // InstitutionName
  x00080081: '', //         InstitutionAddress
  x00080090: '', //         ReferringPhysicianName
  x00081010: '', //         StationName
  x00081030: 'CBCT', //     StudyDescription
  x0008103e: 'CBCT', //     SeriesDescription (often holds the patient's name)
  x00081040: '', //         InstitutionalDepartmentName
  x00081048: '', //         PhysiciansOfRecord
  x00081050: '', //         PerformingPhysicianName
  x00081060: '', //         NameOfPhysiciansReadingStudy
  x00081070: '', //         OperatorsName
  x00100010: 'Anonymous', // PatientName
  x00100020: 'ANON', //     PatientID
  x00100030: '19000101', // PatientBirthDate
  x00100032: '000000', //   PatientBirthTime
  x00100040: 'O', //        PatientSex
  x00101000: '', //         OtherPatientIDs
  x00101001: '', //         OtherPatientNames
  x00101010: '', //         PatientAge
  x00101020: '', //         PatientSize
  x00101030: '', //         PatientWeight
  x00102160: '', //         EthnicGroup
  x00104000: '', //         PatientComments
  x00181000: '', //         DeviceSerialNumber
  x00200010: '', //         StudyID
  x00204000: '', //         ImageComments
  x00324000: '', //         StudyComments
  x40080114: '', //         PhysicianApprovingInterpretation
};

/**
 * Only text VRs may be blanked. A sequence (SQ) or a binary VR must never be
 * overwritten with spaces — that shreds the item structure and the file stops
 * parsing. Nested PHI is reached by recursing into the sequence items instead.
 */
const TEXT_VRS = new Set(['AE', 'AS', 'CS', 'DA', 'DS', 'DT', 'IS', 'LO', 'LT', 'PN', 'SH', 'ST', 'TM', 'UI', 'UT']);

/** Tags whose value is a UID and must stay a *consistent* pseudonym. */
const UID_TAGS = [
  'x00020003', // MediaStorageSOPInstanceUID (must match SOPInstanceUID)
  'x00080018', // SOPInstanceUID
  'x0020000d', // StudyInstanceUID
  'x0020000e', // SeriesInstanceUID
  'x00200052', // FrameOfReferenceUID
  'x00081155', // ReferencedSOPInstanceUID
];

const uidMap = new Map();

/**
 * Deterministic pseudonymous UID of exactly `len` bytes: the ISO "2.25." root
 * followed by digits derived from a hash of the original. Same length in/out,
 * so the element can be overwritten without touching any offset.
 */
function pseudoUid(original, len) {
  const cached = uidMap.get(original);
  if (cached && cached.length === len) return cached;
  const root = '2.25.';
  if (len <= root.length) return original; // nothing sensible fits; leave as-is
  let digits = '';
  let round = 0;
  while (digits.length < len - root.length) {
    digits += BigInt('0x' + crypto.createHash('sha256').update(`${original}#${round++}`).digest('hex')).toString();
  }
  digits = digits.slice(0, len - root.length);
  if (digits[0] === '0') digits = '1' + digits.slice(1); // no leading zero component
  const uid = root + digits;
  uidMap.set(original, uid);
  return uid;
}

/**
 * Overwrite one element's value bytes with `text`, padded to the element's
 * exact length (NUL for UIDs, space for the other string VRs — the DICOM rule).
 */
function overwrite(buf, element, text) {
  const pad = element.vr === 'UI' ? 0x00 : 0x20;
  const out = Buffer.alloc(element.length, pad);
  out.write(text.slice(0, element.length), 'latin1');
  out.copy(buf, element.dataOffset);
}

/** Blank/pseudonymize every identifying element in one data set, then recurse
 *  into its sequences so nested copies of the same tags are cleaned too. */
function scrub(buf, ds) {
  for (const [tag, el] of Object.entries(ds.elements)) {
    if (el.items) {
      for (const item of el.items) if (item.dataSet) scrub(buf, item.dataSet);
      continue; // never blank the sequence bytes themselves
    }
    if (!el.length || !TEXT_VRS.has(el.vr)) continue;
    if (UID_TAGS.includes(tag)) {
      const original = (ds.string(tag) || '').trim();
      if (original) overwrite(buf, el, pseudoUid(original, el.length));
    } else if (tag in REPLACE) {
      overwrite(buf, el, REPLACE[tag]);
    }
  }
}

function anonymizeFile(srcFile, outFile) {
  const buf = fs.readFileSync(srcFile);
  scrub(buf, dicomParser.parseDicom(new Uint8Array(buf)));
  fs.writeFileSync(outFile, buf);
}

/** Identifiers a caller may want to see before and after — for verification. */
const AUDIT = [
  ['PatientName', 'x00100010'], ['PatientID', 'x00100020'], ['PatientBirthDate', 'x00100030'],
  ['InstitutionName', 'x00080080'], ['InstitutionAddress', 'x00080081'], ['StationName', 'x00081010'],
  ['ReferringPhysician', 'x00080090'], ['SeriesDescription', 'x0008103e'], ['StudyDescription', 'x00081030'],
  ['StudyDate', 'x00080020'], ['StudyInstanceUID', 'x0020000d'], ['SeriesInstanceUID', 'x0020000e'],
];

function audit(file) {
  const ds = dicomParser.parseDicom(new Uint8Array(fs.readFileSync(file)));
  return AUDIT.map(([name, tag]) => `${name.padEnd(20)} = ${JSON.stringify(ds.string(tag) ?? null)}`);
}

function main() {
  const [src, out] = process.argv.slice(2);
  if (!src || !out) {
    console.error('usage: node scripts/anonymize-dicom.cjs <src-dir> <out-dir>');
    process.exit(1);
  }
  const files = fs.readdirSync(src).filter((f) => f.toLowerCase().endsWith('.dcm'));
  if (!files.length) {
    console.error(`no .dcm files in ${src}`);
    process.exit(1);
  }
  fs.mkdirSync(out, { recursive: true });

  console.log('--- before ---');
  console.log(audit(path.join(src, files[0])).join('\n'));

  let done = 0;
  for (const f of files) {
    anonymizeFile(path.join(src, f), path.join(out, f));
    if (++done % 100 === 0) process.stdout.write(`\r${done}/${files.length}`);
  }
  process.stdout.write(`\r${done}/${files.length}\n`);

  console.log('--- after ---');
  console.log(audit(path.join(out, files[0])).join('\n'));
  console.log(`\n${done} files written to ${out}`);
}

if (require.main === module) main();
module.exports = { anonymizeFile, pseudoUid, audit };
