/**
 * Measurement overlay for the custom canvas viewports (panoramic and
 * cross-section). The cross-section canvas is mm-square, so distances/areas
 * are mm-true; on the panoramic the horizontal axis is arc length along the
 * arch curve, so off-curve structures may be distorted (a caveat hint is
 * shown under the readout). Each completed measurement becomes its own layer
 * (named, hideable) in the layers panel. Supported tools: length, angle,
 * ellipse, circle, rectangle, freehand, bidirectional, density probe
 * (uncalibrated CBCT gray values, shown as GV), arrow.
 *
 * Points are stored in normalized image coordinates (0-1 of the rendered
 * content rect), so they stay attached to the image across resizes.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useViewer } from '@/context/ViewerContext';
import { useI18n } from '@/i18n/I18nContext';
import type { ViewportTool, MeasurementLayer } from '@/types/dicom';

type Pt = [number, number];

const VIEW_TOOL_TO_KEY: Partial<Record<ViewportTool, string>> = {
  length: 'length',
  angle: 'angle',
  ellipticalRoi: 'ellipse',
  circleRoi: 'circle',
  rectangleRoi: 'rectangle',
  freehandRoi: 'freehand',
  bidirectional: 'bidirectional',
  probe: 'probe',
  arrowAnnotate: 'arrow',
};

export function isMeasureTool(tool: ViewportTool): boolean {
  return tool in VIEW_TOOL_TO_KEY;
}

const REQUIRED_POINTS: Record<string, number> = {
  length: 2, angle: 3, ellipse: 2, circle: 2, rectangle: 2,
  bidirectional: 4, probe: 1, arrow: 2,
};

const COLOR = 'rgb(130, 220, 130)';

function getContentRect(container: HTMLElement, canvas: HTMLCanvasElement) {
  const cw = container.clientWidth;
  const ch = container.clientHeight;
  const iw = canvas.width || 1;
  const ih = canvas.height || 1;
  const s = Math.min(cw / iw, ch / ih);
  const rw = iw * s;
  const rh = ih * s;
  return { left: (cw - rw) / 2, top: (ch - rh) / 2, width: rw, height: rh };
}

interface CanvasMeasurementOverlayProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  viewport: 'panoramic' | 'crossSection';
  /** Physical extent of the full image in mm [width, height] (null while no image) */
  getExtentMm: () => [number, number] | null;
  /** Sample the underlying HU value at normalized image coords */
  sampleHU?: (u: number, v: number) => number | null;
}

export function CanvasMeasurementOverlay({
  containerRef, canvasRef, viewport, getExtentMm, sampleHU,
}: CanvasMeasurementOverlayProps) {
  const { state, dispatch } = useViewer();
  const { t } = useI18n();

  const toolKey = VIEW_TOOL_TO_KEY[state.activeTool] ?? null;
  const [draft, setDraft] = useState<Pt[]>([]);
  const [hover, setHover] = useState<Pt | null>(null);
  const drawingFreehand = useRef(false);
  const measurementsRef = useRef(state.measurements);
  measurementsRef.current = state.measurements;

  // Reset draft when the tool changes
  useEffect(() => { setDraft([]); drawingFreehand.current = false; }, [state.activeTool]);

  // ESC cancels the in-progress measurement
  useEffect(() => {
    if (draft.length === 0) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDraft([]); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [draft.length]);

  const clientToNorm = useCallback((clientX: number, clientY: number): Pt | null => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return null;
    const rect = container.getBoundingClientRect();
    const cr = getContentRect(container, canvas);
    const u = (clientX - rect.left - cr.left) / cr.width;
    const v = (clientY - rect.top - cr.top) / cr.height;
    return [Math.max(0, Math.min(1, u)), Math.max(0, Math.min(1, v))];
  }, [containerRef, canvasRef]);

  // ── Value formatting (mm-true thanks to square-mm canvas pixels) ──

  const mmDist = useCallback((a: Pt, b: Pt, extent: [number, number]) => {
    return Math.hypot((b[0] - a[0]) * extent[0], (b[1] - a[1]) * extent[1]);
  }, []);

  const computeValue = useCallback((key: string, pts: Pt[]): string => {
    const extent = getExtentMm();
    if (!extent) return '';
    switch (key) {
      case 'length':
      case 'arrow':
        return `${mmDist(pts[0], pts[1], extent).toFixed(1)} mm`;
      case 'angle': {
        const [a, b, c] = pts;
        const v1 = [(a[0] - b[0]) * extent[0], (a[1] - b[1]) * extent[1]];
        const v2 = [(c[0] - b[0]) * extent[0], (c[1] - b[1]) * extent[1]];
        const dot = v1[0] * v2[0] + v1[1] * v2[1];
        const det = v1[0] * v2[1] - v1[1] * v2[0];
        const deg = Math.abs(Math.atan2(det, dot) * (180 / Math.PI));
        return `${deg.toFixed(1)}°`;
      }
      case 'ellipse':
      case 'rectangle': {
        const w = Math.abs((pts[1][0] - pts[0][0]) * extent[0]);
        const h = Math.abs((pts[1][1] - pts[0][1]) * extent[1]);
        return `${w.toFixed(1)} × ${h.toFixed(1)} mm`;
      }
      case 'circle':
        return `r = ${mmDist(pts[0], pts[1], extent).toFixed(1)} mm`;
      case 'bidirectional':
        return `${mmDist(pts[0], pts[1], extent).toFixed(1)} × ${mmDist(pts[2], pts[3], extent).toFixed(1)} mm`;
      case 'probe': {
        // CBCT gray values are not calibrated HU — display them as GV.
        const hu = sampleHU?.(pts[0][0], pts[0][1]);
        return hu === null || hu === undefined ? '' : `${Math.round(hu)} GV`;
      }
      case 'freehand': {
        let len = 0;
        for (let i = 1; i < pts.length; i++) len += mmDist(pts[i - 1], pts[i], extent);
        return `${len.toFixed(1)} mm`;
      }
      default:
        return '';
    }
  }, [getExtentMm, mmDist, sampleHU]);

  const complete = useCallback((key: string, pts: Pt[]) => {
    const sameTool = measurementsRef.current.filter(m => m.tool === key).length;
    const layer: MeasurementLayer = {
      id: `meas_${Date.now()}_${Math.round(Math.random() * 1e6)}`,
      kind: 'canvas',
      tool: key,
      name: `${t(`tool.${key}`)} ${sameTool + 1}`,
      visible: true,
      viewport,
      points: pts,
      value: computeValue(key, pts),
    };
    dispatch({ type: 'ADD_MEASUREMENT', payload: layer });
    setDraft([]);
  }, [computeValue, dispatch, t, viewport]);

  // ── Pointer interaction ─────────────────────────────────────

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!toolKey || e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const p = clientToNorm(e.clientX, e.clientY);
    if (!p) return;

    if (toolKey === 'freehand') {
      drawingFreehand.current = true;
      setDraft([p]);
      return;
    }

    const pts = [...draft, p];
    if (pts.length >= REQUIRED_POINTS[toolKey]) {
      complete(toolKey, pts);
    } else {
      setDraft(pts);
    }
  }, [toolKey, clientToNorm, draft, complete]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!toolKey) return;
    const p = clientToNorm(e.clientX, e.clientY);
    if (!p) return;
    if (toolKey === 'freehand' && drawingFreehand.current) {
      setDraft(prev => {
        const last = prev[prev.length - 1];
        if (last && Math.hypot(p[0] - last[0], p[1] - last[1]) < 0.004) return prev;
        return [...prev, p];
      });
      return;
    }
    if (draft.length > 0) setHover(p);
  }, [toolKey, clientToNorm, draft.length]);

  const handlePointerUp = useCallback(() => {
    if (toolKey === 'freehand' && drawingFreehand.current) {
      drawingFreehand.current = false;
      setDraft(prev => {
        if (prev.length >= 2) complete('freehand', prev);
        return [];
      });
    }
  }, [toolKey, complete]);

  // ── Rendering ───────────────────────────────────────────────

  const container = containerRef.current;
  const canvas = canvasRef.current;
  const cr = container && canvas ? getContentRect(container, canvas) : null;
  const toPx = (p: Pt): Pt => cr ? [cr.left + p[0] * cr.width, cr.top + p[1] * cr.height] : [0, 0];

  const renderShape = (key: string, ptsN: Pt[], value: string | undefined, id: string, preview = false) => {
    const pts = ptsN.map(toPx);
    const stroke = preview ? 'rgba(130, 220, 130, 0.7)' : COLOR;
    const common = { stroke, strokeWidth: 1.5, fill: 'none' as const };
    const label = value && pts[0] ? (
      <text x={pts[0][0] + 8} y={pts[0][1] - 8} fill={COLOR} fontSize={11} fontFamily="monospace"
        style={{ paintOrder: 'stroke', stroke: 'rgba(0,0,0,0.7)', strokeWidth: 3 }}>
        {value}
      </text>
    ) : null;

    const dots = pts.map((p, i) => <circle key={`d${i}`} cx={p[0]} cy={p[1]} r={2.5} fill={stroke} />);

    let shape: React.ReactNode = null;
    switch (key) {
      case 'length':
        if (pts.length >= 2) shape = <line x1={pts[0][0]} y1={pts[0][1]} x2={pts[1][0]} y2={pts[1][1]} {...common} />;
        break;
      case 'arrow':
        if (pts.length >= 2) {
          const [a, b] = pts;
          const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
          const ah = 9;
          shape = (
            <g>
              <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} {...common} />
              <polygon
                points={`${b[0]},${b[1]} ${b[0] - ah * Math.cos(ang - 0.4)},${b[1] - ah * Math.sin(ang - 0.4)} ${b[0] - ah * Math.cos(ang + 0.4)},${b[1] - ah * Math.sin(ang + 0.4)}`}
                fill={stroke}
              />
            </g>
          );
        }
        break;
      case 'angle':
        shape = (
          <g>
            {pts.length >= 2 && <line x1={pts[0][0]} y1={pts[0][1]} x2={pts[1][0]} y2={pts[1][1]} {...common} />}
            {pts.length >= 3 && <line x1={pts[1][0]} y1={pts[1][1]} x2={pts[2][0]} y2={pts[2][1]} {...common} />}
          </g>
        );
        break;
      case 'ellipse':
        if (pts.length >= 2) {
          shape = <ellipse cx={(pts[0][0] + pts[1][0]) / 2} cy={(pts[0][1] + pts[1][1]) / 2}
            rx={Math.abs(pts[1][0] - pts[0][0]) / 2} ry={Math.abs(pts[1][1] - pts[0][1]) / 2} {...common} />;
        }
        break;
      case 'circle':
        if (pts.length >= 2) {
          shape = <circle cx={pts[0][0]} cy={pts[0][1]} r={Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1])} {...common} />;
        }
        break;
      case 'rectangle':
        if (pts.length >= 2) {
          shape = <rect x={Math.min(pts[0][0], pts[1][0])} y={Math.min(pts[0][1], pts[1][1])}
            width={Math.abs(pts[1][0] - pts[0][0])} height={Math.abs(pts[1][1] - pts[0][1])} {...common} />;
        }
        break;
      case 'bidirectional':
        shape = (
          <g>
            {pts.length >= 2 && <line x1={pts[0][0]} y1={pts[0][1]} x2={pts[1][0]} y2={pts[1][1]} {...common} />}
            {pts.length >= 4 && <line x1={pts[2][0]} y1={pts[2][1]} x2={pts[3][0]} y2={pts[3][1]} {...common} />}
          </g>
        );
        break;
      case 'freehand':
        if (pts.length >= 2) {
          shape = <polyline points={pts.map(p => `${p[0]},${p[1]}`).join(' ')} {...common} />;
        }
        break;
      case 'probe':
        shape = pts[0] ? (
          <g {...common}>
            <line x1={pts[0][0] - 6} y1={pts[0][1]} x2={pts[0][0] + 6} y2={pts[0][1]} />
            <line x1={pts[0][0]} y1={pts[0][1] - 6} x2={pts[0][0]} y2={pts[0][1] + 6} />
          </g>
        ) : null;
        break;
    }

    return <g key={id}>{shape}{dots}{label}</g>;
  };

  const visible = state.measurements.filter(m => m.kind === 'canvas' && m.viewport === viewport && m.visible && m.points);
  const previewPts = hover && draft.length > 0 && toolKey !== 'freehand' ? [...draft, hover] : draft;

  return (
    <div
      className="absolute inset-0"
      style={{
        zIndex: 23,
        pointerEvents: toolKey ? 'auto' : 'none',
        cursor: toolKey ? 'crosshair' : 'default',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <svg className="w-full h-full">
        {visible.map(m => renderShape(m.tool, m.points!, m.value, m.id))}
        {toolKey && previewPts.length > 0 && renderShape(toolKey, previewPts, undefined, 'draft', true)}
      </svg>
      {/* Panoramic caveat: the OPG horizontal axis is arc length along the
          curve, so off-curve structures are distorted — disclose while measuring. */}
      {viewport === 'panoramic' && (toolKey !== null || visible.length > 0) && (
        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 pointer-events-none select-none text-[9px] font-mono text-amber-300/90 [text-shadow:_0_1px_2px_rgb(0_0_0_/_80%)]">
          {t('measure.panoCaveat')}
        </div>
      )}
    </div>
  );
}
