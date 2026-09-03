/**
 * Shared viewport capture: composites a viewport's Cornerstone image canvas
 * with its SVG overlays (implants / sleeves / measurements) into one
 * undistorted canvas, optionally burning in the on-image text overlays (patient
 * name, clinic, orientation markers, …). Used by both the image and PDF export.
 */

import { getRenderingEngine } from '@cornerstonejs/core';
import { RENDERING_ENGINE_ID, VP_3D } from './constants';

/** Render an inline <svg> overlay to an Image at the given on-screen size. */
function svgToImage(svg: SVGSVGElement, w: number, h: number): Promise<HTMLImageElement | null> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(w));
  clone.setAttribute('height', String(h));
  const str = new XMLSerializer().serializeToString(clone);
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(str)}`;
  return new Promise((resolve) => {
    const img = new Image();
    // Some serialized overlays never fire load/error — cap the wait so a single
    // stuck overlay can't hang the whole export (skip it instead).
    const timer = setTimeout(() => resolve(null), 2500);
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); resolve(null); };
    img.src = url;
  });
}

/**
 * Composite a viewport's image canvas with its SVG overlays into one canvas at
 * the image's own aspect ratio, scaled by `scale` (a super-sample factor).
 */
export async function captureView(view: HTMLElement, scale = 2): Promise<HTMLCanvasElement | null> {
  const bare = view.querySelector('canvas') as HTMLCanvasElement | null;
  if (!bare || !bare.width || !bare.height) return null;

  const W = bare.width;
  const H = bare.height;
  const CW = view.clientWidth;
  const CH = view.clientHeight;
  if (!CW || !CH) return null;

  // Content rect: where the image actually sits inside the container (object-fit: contain)
  const fit = Math.min(CW / W, CH / H);
  const rw = W * fit;
  const rh = H * fit;
  const left = (CW - rw) / 2;
  const top = (CH - rh) / 2;

  const out = document.createElement('canvas');
  out.width = Math.round(W * scale);
  out.height = Math.round(H * scale);
  const ctx = out.getContext('2d');
  if (!ctx) return null;

  ctx.drawImage(bare, 0, 0, out.width, out.height);

  // Map the on-screen content rect of each SVG overlay onto the full output.
  // The 3D volume view's SVG layer is just tool chrome (the crosshair reference
  // lines + rotation handles show up as a thick dark cross) — skip it so the 3D
  // export is the model only.
  if (view.getAttribute('data-vp') !== '3D') {
    for (const svg of Array.from(view.querySelectorAll('svg')) as SVGSVGElement[]) {
      const img = await svgToImage(svg, CW, CH);
      if (img) ctx.drawImage(img, left, top, rw, rh, 0, 0, out.width, out.height);
    }
  }

  return out;
}

/**
 * Force a fresh render of the 3D volume viewport and hide its cutting (slice)
 * planes so the capture shows only the model. The render also repopulates the
 * WebGL drawing buffer (which clears between frames), so the 3D capture isn't
 * blank. Returns the hidden actors to restore afterwards.
 */
export async function hide3DSlicePlanes(): Promise<any[]> {
  const vp = getRenderingEngine(RENDERING_ENGINE_ID)?.getViewport(VP_3D) as any;
  if (!vp?.getActors) return [];
  const hidden: any[] = [];
  try {
    for (const entry of vp.getActors()) {
      if (typeof entry.uid === 'string' && entry.uid.startsWith('slice3d:') && entry.actor?.getVisibility?.()) {
        entry.actor.setVisibility(false);
        hidden.push(entry.actor);
      }
    }
    vp.render();
    // Wait two animation frames so the render paints before the capture reads
    // the canvas, with a timeout fallback so a starved rAF can never hang.
    await new Promise((resolve) => {
      let done = false;
      const fin = () => { if (!done) { done = true; resolve(null); } };
      requestAnimationFrame(() => requestAnimationFrame(fin));
      setTimeout(fin, 1500);
    });
  } catch { /* viewport gone */ }
  return hidden;
}

export function restore3DSlicePlanes(hidden: any[]): void {
  if (!hidden.length) return;
  try {
    for (const a of hidden) a.setVisibility?.(true);
    getRenderingEngine(RENDERING_ENGINE_ID)?.getViewport(VP_3D)?.render();
  } catch { /* viewport gone */ }
}

// ── On-image text overlays (burned into the exported bitmap) ─────────

export interface OverlayContent {
  name: boolean;
  birth: boolean;
  date: boolean;
  clinic: boolean;
  series: boolean;
  modality: boolean;
  viewTitle: boolean;
  orientation: boolean;
  slice: boolean;
}

export interface OverlayData {
  name: string;
  birth: string;
  date: string;
  clinic: string;
  series: string;
  modality: string;
  color: string;
}

const MPR_MARKERS: Record<string, { top: string; bottom: string; left: string; right: string }> = {
  AXIAL: { top: 'A', bottom: 'P', left: 'R', right: 'L' },
  SAGITTAL: { top: 'S', bottom: 'I', left: 'A', right: 'P' },
  CORONAL: { top: 'S', bottom: 'I', left: 'R', right: 'L' },
};

function drawLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  align: CanvasTextAlign,
  baseline: CanvasTextBaseline,
  size: number,
  color: string,
  bold = false,
) {
  if (!text) return;
  ctx.font = `${bold ? 'bold ' : ''}${size}px ui-monospace, "SF Mono", Menlo, monospace`;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2, size / 6);
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

/** Best-effort "N / total" slice text from a viewport's own DOM. */
function readSliceText(view: HTMLElement): string {
  for (const el of Array.from(view.querySelectorAll('div, span'))) {
    const txt = el.textContent?.trim() ?? '';
    if (/^\d+\s*\/\s*\d+$/.test(txt)) return txt;
  }
  return '';
}

/** Burn the selected text overlays onto an already-captured view canvas. */
export function burnOverlays(
  canvas: HTMLCanvasElement,
  view: HTMLElement,
  viewKey: string,
  content: OverlayContent,
  data: OverlayData,
  viewTitle: string,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width;
  const H = canvas.height;
  const pad = Math.round(H * 0.02);
  const size = Math.max(11, Math.round(H * 0.028));
  const gap = size * 1.25;
  const white = '#ffffff';

  // Top-left: name (bold) + birth
  let ty = pad;
  if (content.name && data.name) { drawLabel(ctx, data.name, pad, ty, 'left', 'top', size, white, true); ty += gap; }
  if (content.birth && data.birth) { drawLabel(ctx, data.birth, pad, ty, 'left', 'top', size, white); ty += gap; }

  // Top-right: date + clinic
  ty = pad;
  if (content.date && data.date) { drawLabel(ctx, data.date, W - pad, ty, 'right', 'top', size, white); ty += gap; }
  if (content.clinic && data.clinic) { drawLabel(ctx, data.clinic, W - pad, ty, 'right', 'top', size, white); ty += gap; }

  // Bottom-left: series + modality
  let by = H - pad;
  if (content.modality && data.modality) { drawLabel(ctx, data.modality, pad, by, 'left', 'bottom', size, white); by -= gap; }
  if (content.series && data.series) { drawLabel(ctx, data.series, pad, by, 'left', 'bottom', size, white); by -= gap; }

  // Bottom-right: slice number
  if (content.slice) {
    const s = readSliceText(view);
    if (s) drawLabel(ctx, s, W - pad, H - pad, 'right', 'bottom', size, white);
  }

  // Top-centre: view title
  if (content.viewTitle && viewTitle) {
    drawLabel(ctx, viewTitle, W / 2, pad, 'center', 'top', size, data.color, true);
  }

  // Orientation markers (MPR only)
  if (content.orientation) {
    const m = MPR_MARKERS[viewKey];
    if (m) {
      const ms = Math.max(10, Math.round(H * 0.026));
      drawLabel(ctx, m.top, W / 2, pad + size * 1.5, 'center', 'top', ms, data.color);
      drawLabel(ctx, m.bottom, W / 2, H - pad, 'center', 'bottom', ms, data.color);
      drawLabel(ctx, m.left, pad, H / 2, 'left', 'middle', ms, data.color);
      drawLabel(ctx, m.right, W - pad, H / 2, 'right', 'middle', ms, data.color);
    }
  }
}

// ── Grid compositing + download ─────────────────────────────────────

/** Lay several capture canvases into a single grid image (black background). */
export function composeGrid(canvases: HTMLCanvasElement[], cols: number): HTMLCanvasElement {
  const gap = 8;
  const cellW = Math.max(...canvases.map((c) => c.width));
  const cellH = Math.max(...canvases.map((c) => c.height));
  const rows = Math.ceil(canvases.length / cols);
  const out = document.createElement('canvas');
  out.width = cols * cellW + (cols - 1) * gap;
  out.height = rows * cellH + (rows - 1) * gap;
  const ctx = out.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, out.width, out.height);
  canvases.forEach((c, i) => {
    const cx = (i % cols) * (cellW + gap);
    const cy = Math.floor(i / cols) * (cellH + gap);
    // object-fit: contain inside the cell
    const fit = Math.min(cellW / c.width, cellH / c.height);
    const w = c.width * fit;
    const h = c.height * fit;
    ctx.drawImage(c, cx + (cellW - w) / 2, cy + (cellH - h) / 2, w, h);
  });
  return out;
}

/** Download a canvas as PNG or JPG. */
export function downloadCanvas(canvas: HTMLCanvasElement, filename: string, format: 'png' | 'jpg', quality: number): void {
  const mime = format === 'jpg' ? 'image/jpeg' : 'image/png';
  const url = canvas.toDataURL(mime, format === 'jpg' ? quality : undefined);
  const link = document.createElement('a');
  link.download = filename;
  link.href = url;
  link.click();
}
