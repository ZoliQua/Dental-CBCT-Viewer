/**
 * gunzip byte budget: the decompressed output is streamed and aborted as soon
 * as it exceeds the caller's budget, so gzip bombs cannot exhaust memory.
 */

import { describe, it, expect } from 'vitest';
import { gzipSync } from 'node:zlib';
import { gunzip } from '@/core/import/gzip';

function gzip(data: Uint8Array): Uint8Array {
  const b = gzipSync(Buffer.from(data));
  const out = new Uint8Array(b.byteLength);
  out.set(b);
  return out;
}

describe('gunzip byte budget', () => {
  it('passes non-gzip data through unchanged within budget', async () => {
    const data = new Uint8Array([1, 2, 3, 4]);
    const out = await gunzip(data, 10);
    expect(Array.from(out)).toEqual([1, 2, 3, 4]);
  });

  it('rejects non-gzip data over budget', async () => {
    const data = new Uint8Array(100);
    await expect(gunzip(data, 10)).rejects.toThrow(/budget/);
  });

  it('decompresses a gzip payload within budget', async () => {
    const raw = new Uint8Array(1000);
    for (let i = 0; i < raw.length; i++) raw[i] = i % 251;
    const out = await gunzip(gzip(raw), 2000);
    expect(out.length).toBe(1000);
    expect(Array.from(out.slice(0, 8))).toEqual(Array.from(raw.slice(0, 8)));
  });

  it('aborts as soon as the decompressed output exceeds the budget', async () => {
    // Highly compressible: tiny gzip, huge output (the "bomb" shape).
    const raw = new Uint8Array(4 * 1024 * 1024).fill(7);
    const gz = gzip(raw);
    expect(gz.byteLength).toBeLessThan(100_000);
    await expect(gunzip(gz, 64 * 1024)).rejects.toThrow(/budget/);
  });
});
