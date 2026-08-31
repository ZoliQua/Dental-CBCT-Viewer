/** Gunzip an ArrayBuffer if it is gzip (1f 8b), else return it unchanged. */
export async function gunzip(buf: ArrayBuffer): Promise<ArrayBuffer> {
  const head = new Uint8Array(buf.slice(0, 2));
  if (head[0] !== 0x1f || head[1] !== 0x8b) return buf;
  if (typeof DecompressionStream === 'undefined') throw new Error('gzip payload but no DecompressionStream');
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

/** File name without any directory prefix (webkitRelativePath or plain name). */
export function baseName(f: File): string {
  const p = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
  return p.split('/').pop() || f.name;
}
