import { describe, it, expect } from 'vitest';
import { gzipSync } from 'node:zlib';
import { detectFormat } from '@/core/import';
import { matchGalileos, parseGalileos } from '@/core/import/galileos';
import { matchOneVolume, parseOneVolume } from '@/core/import/onevolume';

// The matchers only read file names / webkitRelativePath, so plain stubs work.
const f = (name: string, rel?: string) => ({ name, webkitRelativePath: rel ?? '' }) as unknown as File;

/** File stub carrying real bytes (arrayBuffer is all the parsers call). */
function fileWithBytes(name: string, bytes: Uint8Array): File {
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return { name, webkitRelativePath: '', arrayBuffer: async () => buf } as unknown as File;
}

function gzip(data: Uint8Array): Uint8Array {
  const b = gzipSync(Buffer.from(data));
  const out = new Uint8Array(b.byteLength);
  out.set(b);
  return out;
}

// ── OneVolume (CT_0.vol) fixture ────────────────────────────────

const OV_VERSION = 'JmVolumeVersion=1';

function makeOneVolume(xml: string, payloadBytes: Uint8Array): File {
  const enc = new TextEncoder();
  const xmlBytes = enc.encode(xml);
  const total = 4 + OV_VERSION.length + 1 + 4 + xmlBytes.length + 36 + payloadBytes.byteLength;
  const buf = new ArrayBuffer(total);
  const u8 = new Uint8Array(buf);
  const dv = new DataView(buf);
  let off = 4; // container prefix
  u8.set(enc.encode(OV_VERSION), off); off += OV_VERSION.length;
  u8[off++] = 0; // null terminator
  dv.setUint32(off, xmlBytes.byteLength, true); off += 4;
  u8.set(xmlBytes, off); off += xmlBytes.byteLength;
  off += 36; // CArray3D bounds block
  u8.set(payloadBytes, off);
  return fileWithBytes('CT_0.vol', u8);
}

const int16Bytes = (n: number) => new Uint8Array(new Int16Array(n).buffer);

// ── GALILEOS fixture ────────────────────────────────────────────

function galileosFiles(xml: string, sliceBytes: Uint8Array[]): File[] {
  return [
    fileWithBytes('scan_vol_0', gzip(new TextEncoder().encode(xml))),
    ...sliceBytes.map((s, i) => fileWithBytes(`scan_vol_0_${String(i).padStart(3, '0')}`, gzip(s))),
  ];
}

describe('native CT import — format detection', () => {
  it('detects a GALILEOS folder (*_vol_0 + *_vol_0_###)', () => {
    const files = [f('scan.gwg'), f('scan_vol_0'), f('scan_vol_0_000'), f('scan_vol_0_001')];
    expect(matchGalileos(files)).toBe(true);
    expect(detectFormat(files)).toBe('galileos');
  });

  it('needs both the header and slice files for GALILEOS', () => {
    expect(matchGalileos([f('scan_vol_0')])).toBe(false);           // header only
    expect(matchGalileos([f('scan_vol_0_000')])).toBe(false);       // slices only
  });

  it('detects a OneVolume folder (CT_0.vol)', () => {
    expect(matchOneVolume([f('CT_0.vol')])).toBe(true);
    expect(matchOneVolume([f('CT_0.vol', 'export/CT_1/CT_0.vol')])).toBe(true);
    expect(detectFormat([f('CT_0.vol')])).toBe('onevolume');
  });

  it('leaves DICOM / unknown sets to the DICOM path (null)', () => {
    expect(detectFormat([f('IM000001.dcm'), f('IM000002.dcm')])).toBeNull();
    expect(detectFormat([f('image.dcm')])).toBeNull();
    expect(detectFormat([f('notes.txt')])).toBeNull();
  });

  it('prefers OneVolume when both markers somehow appear', () => {
    expect(detectFormat([f('CT_0.vol'), f('x_vol_0'), f('x_vol_0_000')])).toBe('onevolume');
  });
});

describe('OneVolume parsing — geometry validation', () => {
  it('parses a valid volume', async () => {
    const xml = '<volume><sizex>16</sizex><sizey>12</sizey><sizez>4</sizez><voxelsize>0.30</voxelsize></volume>';
    const vol = await parseOneVolume([makeOneVolume(xml, int16Bytes(16 * 12 * 4))]);
    expect(vol.dimensions).toEqual([16, 12, 4]);
    expect(vol.spacing).toEqual([0.3, 0.3, 0.3]);
    expect(vol.data.length).toBe(16 * 12 * 4);
  });

  it('throws on implausible per-axis dimensions before allocating', async () => {
    const xml = '<volume><sizex>4096</sizex><sizey>4096</sizey><sizez>0100</sizez></volume>';
    await expect(parseOneVolume([makeOneVolume(xml, int16Bytes(8))])).rejects.toThrow(/implausible dimensions/);
  });

  it('throws when the payload is shorter than the declared geometry', async () => {
    const xml = '<volume><sizex>16</sizex><sizey>12</sizey><sizez>04</sizez></volume>';
    await expect(parseOneVolume([makeOneVolume(xml, int16Bytes(100))])).rejects.toThrow(/payload too short/);
  });
});

describe('GALILEOS parsing — geometry validation & header fallbacks', () => {
  it('parses a valid export without warnings', async () => {
    const xml = '<vol><sizex>16</sizex><sizey>12</sizey><voxelsize>0.25</voxelsize><maxvalue>4095</maxvalue></vol>';
    const files = galileosFiles(xml, [int16Bytes(16 * 12), int16Bytes(16 * 12)]);
    const vol = await parseGalileos(files);
    expect(vol.dimensions).toEqual([16, 12, 2]);
    expect(vol.spacing).toEqual([0.25, 0.25, 0.25]);
    expect(vol.warnings).toBeUndefined();
  });

  it('collects a warning for every header field that falls back to defaults', async () => {
    const files = galileosFiles('<vol></vol>', [int16Bytes(512 * 512)]);
    const vol = await parseGalileos(files);
    expect(vol.dimensions).toEqual([512, 512, 1]); // GALILEOS defaults
    expect(vol.warnings?.join(' ')).toMatch(/columns.*assuming 512/);
    expect(vol.warnings?.join(' ')).toMatch(/rows.*assuming 512/);
    expect(vol.warnings?.join(' ')).toMatch(/voxel size.*assuming 0.16/);
    expect(vol.warnings?.join(' ')).toMatch(/max value.*assuming 4095/);
  });

  it('reads patient name/id from the XML when present', async () => {
    const xml = '<vol><sizex>16</sizex><sizey>12</sizey><voxelsize>0.25</voxelsize><maxvalue>4095</maxvalue>' +
      '<patientName>DOE^JANE</patientName><patientId>P-42</patientId></vol>';
    const vol = await parseGalileos(galileosFiles(xml, [int16Bytes(16 * 12)]));
    expect(vol.patientName).toBe('DOE^JANE');
    expect(vol.patientId).toBe('P-42');
  });

  it('throws on implausible dimensions before allocating', async () => {
    const xml = '<vol><sizex>4096</sizex><sizey>0512</sizey></vol>';
    const files = galileosFiles(xml, [int16Bytes(8)]);
    await expect(parseGalileos(files)).rejects.toThrow(/implausible dimensions/);
  });

  it('throws when a decompressed slice is shorter than cols×rows×2', async () => {
    const xml = '<vol><sizex>16</sizex><sizey>12</sizey><voxelsize>0.25</voxelsize><maxvalue>4095</maxvalue></vol>';
    const files = galileosFiles(xml, [new Uint8Array(64)]); // 64 bytes << 16*12*2
    await expect(parseGalileos(files)).rejects.toThrow(/too short/);
  });
});
