/**
 * Gunzip a buffer if it is gzip (1f 8b), else return it unchanged.
 * `maxBytes` is a mandatory budget for the decompressed size: the output is
 * streamed and aborted as soon as it exceeds the budget, so a hostile or
 * corrupt "gzip bomb" payload cannot exhaust memory.
 */
export async function gunzip(data: Uint8Array, maxBytes: number): Promise<Uint8Array> {
  if (data[0] !== 0x1f || data[1] !== 0x8b) {
    if (data.byteLength > maxBytes) {
      throw new Error(`payload (${data.byteLength} bytes) exceeds the ${maxBytes} byte budget`);
    }
    return data;
  }
  if (typeof DecompressionStream === 'undefined') throw new Error('gzip payload but no DecompressionStream');
  const reader = new Blob([data.slice()]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new Error(`gzip payload exceeds the ${maxBytes} byte decompression budget`);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

/** File name without any directory prefix (webkitRelativePath or plain name). */
export function baseName(f: File): string {
  const p = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
  return p.split('/').pop() || f.name;
}
