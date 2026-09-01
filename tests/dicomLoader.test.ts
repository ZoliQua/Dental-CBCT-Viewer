/**
 * dicomLoader: blob-URL tracking/revocation, multi-patient warning,
 * series geometry validation warnings, and the zero-readable-files path.
 * Fixtures are hand-built minimal explicit-VR-little-endian datasets.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseDicomFiles, revokeAllBlobUrls } from '@/core/dicomLoader';

// ── Minimal DICOM fixture builder (explicit VR little endian) ───

interface TagSpec { g: number; e: number; vr: string; value: string }

function buildDicom(tags: TagSpec[]): ArrayBuffer {
  const parts: Uint8Array[] = [];
  const head = new Uint8Array(132);
  head.set([0x44, 0x49, 0x43, 0x4d], 128); // 'DICM'
  parts.push(head);

  const push = (g: number, e: number, vr: string, value: string) => {
    const bytes = new TextEncoder().encode(value);
    const len = bytes.length + (bytes.length % 2); // even-length padding
    const el = new Uint8Array(8 + len);
    const dv = new DataView(el.buffer);
    dv.setUint16(0, g, true);
    dv.setUint16(2, e, true);
    el[4] = vr.charCodeAt(0);
    el[5] = vr.charCodeAt(1);
    dv.setUint16(6, len, true);
    el.set(bytes, 8);
    parts.push(el);
  };

  // Meta group: explicit VR LE transfer syntax
  push(0x0002, 0x0010, 'UI', '1.2.840.10008.1.2.1');
  for (const t of tags) push(t.g, t.e, t.vr, t.value);

  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out.buffer;
}

function dicomFile(name: string, opts: { patientId?: string; seriesUid?: string; z?: number; iop?: string }): File {
  const buf = buildDicom([
    { g: 0x0008, e: 0x0060, vr: 'CS', value: 'CT' },
    { g: 0x0008, e: 0x1030, vr: 'LO', value: 'Test study' },
    { g: 0x0008, e: 0x103e, vr: 'LO', value: 'Axial' },
    { g: 0x0020, e: 0x000d, vr: 'UI', value: '1.2.3' },
    { g: 0x0020, e: 0x000e, vr: 'UI', value: opts.seriesUid ?? '1.2.3.4' },
    { g: 0x0020, e: 0x0013, vr: 'IS', value: '1' },
    { g: 0x0020, e: 0x0032, vr: 'DS', value: `0\\0\\${opts.z ?? 0}` },
    { g: 0x0020, e: 0x0037, vr: 'DS', value: opts.iop ?? '1\\0\\0\\0\\1\\0' },
    { g: 0x0010, e: 0x0010, vr: 'PN', value: 'TEST^PATIENT' },
    { g: 0x0010, e: 0x0020, vr: 'LO', value: opts.patientId ?? 'P1' },
  ]);
  return { name, arrayBuffer: async () => buf } as unknown as File;
}

// ── Browser stubs ───────────────────────────────────────────────

const createdUrls: string[] = [];
const revokedUrls: string[] = [];

beforeEach(() => {
  (URL as any).createObjectURL = () => {
    const url = `blob:mock-${createdUrls.length}`;
    createdUrls.push(url);
    return url;
  };
  (URL as any).revokeObjectURL = (url: string) => { revokedUrls.push(url); };
  revokeAllBlobUrls(); // drop anything a previous test left tracked
  createdUrls.length = 0;
  revokedUrls.length = 0;
});

describe('parseDicomFiles', () => {
  it('parses slices of one series, sorted by ImagePositionPatient Z', async () => {
    const files = [dicomFile('b.dcm', { z: 2 }), dicomFile('a.dcm', { z: 1 })];
    const study = await parseDicomFiles(files);
    expect(study).not.toBeNull();
    expect(study!.patientId).toBe('P1');
    expect(study!.patientName).toBe('TEST PATIENT');
    expect(study!.series).toHaveLength(1);
    expect(study!.series[0].imageCount).toBe(2);
    // ascending Z → file 'a' (z=1) first
    expect(study!.series[0].imageIds[0]).toBe(`wadouri:${createdUrls[1]}`);
  });

  it('returns null and reports the skip count when nothing parses', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const bad = { name: 'notes.txt', arrayBuffer: async () => new ArrayBuffer(16) } as unknown as File;
    const study = await parseDicomFiles([bad, bad]);
    expect(study).toBeNull();
    expect(warn.mock.calls.flat().join(' ')).toMatch(/all 2 file\(s\) were skipped/);
    warn.mockRestore();
  });

  it('warns when the drop mixes multiple PatientIDs but keeps loading', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const files = [dicomFile('a.dcm', { patientId: 'P1' }), dicomFile('b.dcm', { patientId: 'P2' })];
    const study = await parseDicomFiles(files);
    expect(study).not.toBeNull();
    expect(study!.patientId).toBe('P1'); // metadata stays from the first file
    expect(study!.studyDescription).toMatch(/2 PatientIDs/);
    expect(warn.mock.calls.flat().join(' ')).toMatch(/different PatientIDs/);
    warn.mockRestore();
  });

  it('warns on inconsistent ImageOrientationPatient within a series', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const files = [
      dicomFile('a.dcm', { z: 1 }),
      dicomFile('b.dcm', { z: 2, iop: '1\\0\\0\\0\\-1\\0' }),
    ];
    await parseDicomFiles(files);
    expect(warn.mock.calls.flat().join(' ')).toMatch(/inconsistent ImageOrientationPatient/);
    warn.mockRestore();
  });

  it('warns on irregular slice spacing within a series', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const files = [dicomFile('a.dcm', { z: 0 }), dicomFile('b.dcm', { z: 1 }), dicomFile('c.dcm', { z: 3 })];
    await parseDicomFiles(files);
    expect(warn.mock.calls.flat().join(' ')).toMatch(/irregular slice spacing/);
    warn.mockRestore();
  });
});

describe('revokeAllBlobUrls', () => {
  it('revokes every URL created during parsing and clears the list', async () => {
    await parseDicomFiles([dicomFile('a.dcm', {}), dicomFile('b.dcm', {})]);
    expect(createdUrls).toHaveLength(2);

    revokeAllBlobUrls();
    expect(revokedUrls.sort()).toEqual([...createdUrls].sort());

    // second call is a no-op (list was cleared)
    revokeAllBlobUrls();
    expect(revokedUrls).toHaveLength(2);
  });
});
