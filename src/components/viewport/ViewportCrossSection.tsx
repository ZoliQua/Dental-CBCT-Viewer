import { useEffect, useRef, useCallback, useState } from 'react';
import { getRenderingEngine, Enums } from '@cornerstonejs/core';
import { useViewer } from '@/context/ViewerContext';
import { CanvasMeasurementOverlay } from '@/components/measurements/CanvasMeasurementOverlay';
import { useI18n } from '@/i18n/I18nContext';
import { OrientationLabel } from './OrientationLabel';
import { generateCrossSection, type CrossSectionResult } from '@/core/cprEngine';
import { RENDERING_ENGINE_ID, VP_AXIAL } from '@/core/constants';
import { ImplantOverlay } from '@/components/implant/ImplantOverlay';
import { ComputingOverlay } from './ComputingOverlay';

interface ViewportCrossSectionProps {
  volumeId: string;
}

const CROSS_SECTION_WIDTH_MM = 50;

// ── Canvas W/L rendering (same algo as ViewportPanoramic) ─────

function renderToCanvas(
  canvas: HTMLCanvasElement,
  pixelData: Float32Array,
  srcW: number,
  srcH: number,
  hSpacing: number,
  vSpacing: number,
  wc: number,
  ww: number,
) {
  const physW = srcW * hSpacing;
  const physH = srcH * vSpacing;
  const maxPx = 1024;
  const pxPerMm = maxPx / Math.max(physW, physH);
  const dstW = Math.round(physW * pxPerMm);
  const dstH = Math.round(physH * pxPerMm);

  canvas.width = dstW;
  canvas.height = dstH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const imgData = ctx.createImageData(dstW, dstH);
  const rgba = imgData.data;
  const lower = wc - ww / 2;
  const scale = 255 / ww;
  const xRatio = (srcW - 1) / Math.max(1, dstW - 1);
  const yRatio = (srcH - 1) / Math.max(1, dstH - 1);

  for (let dy = 0; dy < dstH; dy++) {
    const sy = dy * yRatio;
    const sy0 = Math.floor(sy);
    const sy1 = Math.min(sy0 + 1, srcH - 1);
    const fy = sy - sy0;
    for (let dx = 0; dx < dstW; dx++) {
      const sx = dx * xRatio;
      const sx0 = Math.floor(sx);
      const sx1 = Math.min(sx0 + 1, srcW - 1);
      const fx = sx - sx0;
      const v00 = pixelData[sy0 * srcW + sx0];
      const v10 = pixelData[sy0 * srcW + sx1];
      const v01 = pixelData[sy1 * srcW + sx0];
      const v11 = pixelData[sy1 * srcW + sx1];
      const hu = v00 * (1 - fx) * (1 - fy) + v10 * fx * (1 - fy)
               + v01 * (1 - fx) * fy + v11 * fx * fy;
      const gray = Math.max(0, Math.min(255, (hu - lower) * scale));
      const j = (dy * dstW + dx) << 2;
      rgba[j] = gray;
      rgba[j + 1] = gray;
      rgba[j + 2] = gray;
      rgba[j + 3] = 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);
}

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

// ── Component ──────────────────────────────────────────────────

export function ViewportCrossSection({ volumeId }: ViewportCrossSectionProps) {
  const { state, dispatch } = useViewer();
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const resultRef = useRef<CrossSectionResult | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [computing, setComputing] = useState(false);
  // Shared window/level (preset buttons + W/L drag all flow through context)
  const wc = state.windowLevel.wc;
  const ww = state.windowLevel.ww;
  const wcRef = useRef(wc);
  const wwRef = useRef(ww);
  const [csResult, setCsResult] = useState<CrossSectionResult | null>(null);

  // Keep refs in sync for use in debounced callbacks
  wcRef.current = wc;
  wwRef.current = ww;

  // Axial Z indicator line
  const [lineTop, setLineTop] = useState<number | null>(null);
  const [lineDragging, setLineDragging] = useState(false);

  // W/L drag
  const wlDragRef = useRef<{ startX: number; startY: number; startWc: number; startWw: number } | null>(null);

  const renderCurrent = useCallback(() => {
    const r = resultRef.current;
    const canvas = canvasRef.current;
    if (!r || !canvas) return;
    renderToCanvas(canvas, r.pixelData, r.width, r.height, r.horizontalSpacing, r.verticalSpacing, wc, ww);
  }, [wc, ww]);

  useEffect(() => { renderCurrent(); }, [renderCurrent]);

  // Generate cross-section (debounced, fast)
  useEffect(() => {
    if (!volumeId || !state.archCurveControlPoints) return;

    setComputing(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      const result = generateCrossSection({
        volumeId,
        controlPoints: state.archCurveControlPoints!,
        position: state.crossSectionPosition,
        tiltDeg: state.crossSectionTiltDeg,
        widthMm: CROSS_SECTION_WIDTH_MM,
        resolution: state.panoramicResolution,
      });

      if (result) {
        resultRef.current = result;
        setCsResult(result);
        const canvas = canvasRef.current;
        if (canvas) {
          renderToCanvas(canvas, result.pixelData, result.width, result.height, result.horizontalSpacing, result.verticalSpacing, wcRef.current, wwRef.current);
        }
      }
      setComputing(false);
    }, 100); // shorter debounce — cross-section is fast

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [volumeId, state.archCurveControlPoints, state.crossSectionPosition, state.crossSectionTiltDeg, state.panoramicResolution]);

  // ── Z line sync ─────────────────────────────────────────────

  // When tilted, image rows run along the leaned slice axis: row v maps to
  // world z = zMid + v·cos(tilt), so the z ↔ row conversion needs the cos factor
  const zToContainerY = useCallback((z: number): number | null => {
    const r = resultRef.current;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!r || !canvas || !container) return null;
    const zMid = (r.zMin + r.zMax) / 2;
    const cosT = Math.cos((state.crossSectionTiltDeg * Math.PI) / 180);
    const v = (z - zMid) / cosT;
    const normY = (r.zMax - zMid - v) / (r.zMax - r.zMin);
    if (normY < 0 || normY > 1) return null;
    const cr = getContentRect(container, canvas);
    return cr.top + normY * cr.height;
  }, [state.crossSectionTiltDeg]);

  const containerYToZ = useCallback((clientY: number): number | null => {
    const r = resultRef.current;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!r || !canvas || !container) return null;
    const rect = container.getBoundingClientRect();
    const localY = clientY - rect.top;
    const cr = getContentRect(container, canvas);
    const normY = Math.max(0, Math.min(1, (localY - cr.top) / cr.height));
    const zMid = (r.zMin + r.zMax) / 2;
    const cosT = Math.cos((state.crossSectionTiltDeg * Math.PI) / 180);
    const v = (r.zMax - zMid) - normY * (r.zMax - r.zMin);
    return zMid + v * cosT;
  }, [state.crossSectionTiltDeg]);

  const setAxialSliceZ = useCallback((z: number) => {
    const engine = getRenderingEngine(RENDERING_ENGINE_ID);
    const vp = engine?.getViewport(VP_AXIAL);
    if (!vp) return;
    const cam = vp.getCamera();
    const fp = cam.focalPoint!;
    const pos = cam.position!;
    const dz = z - fp[2];
    vp.setCamera({
      focalPoint: [fp[0], fp[1], z] as any,
      position: [pos[0], pos[1], pos[2] + dz] as any,
    });
    vp.render();
  }, []);

  // Track axial Z. The axial viewport may not exist yet when this mounts (or
  // may be recreated on a layout change), so poll until it is ready and
  // re-attach — same pattern as ViewportPanoramic; a one-shot listener dies
  // silently with the old viewport element.
  useEffect(() => {
    let cancelled = false;
    let el: HTMLElement | null = null;
    let handler: (() => void) | null = null;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const attach = () => {
      if (cancelled) return;
      const engine = getRenderingEngine(RENDERING_ENGINE_ID);
      const vp = engine?.getViewport(VP_AXIAL);
      if (!vp) {
        if (tries++ < 40) timer = setTimeout(attach, 150);
        return;
      }
      handler = () => {
        const z = vp.getCamera().focalPoint?.[2] ?? 0;
        setLineTop(zToContainerY(z));
      };
      handler();
      el = vp.element;
      el.addEventListener(Enums.Events.CAMERA_MODIFIED, handler);
    };
    attach();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (el && handler) el.removeEventListener(Enums.Events.CAMERA_MODIFIED, handler);
    };
  }, [zToContainerY, volumeId, state.layoutMode]);

  // Update line after recompute
  useEffect(() => {
    const engine = getRenderingEngine(RENDERING_ENGINE_ID);
    const vp = engine?.getViewport(VP_AXIAL);
    if (!vp) return;
    const z = vp.getCamera().focalPoint?.[2] ?? 0;
    setLineTop(zToContainerY(z));
  }, [computing, zToContainerY]);

  // Z line drag
  const handleLinePointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setLineDragging(true);
  }, []);

  useEffect(() => {
    if (!lineDragging) return;
    const handleMove = (e: PointerEvent) => {
      const z = containerYToZ(e.clientY);
      if (z !== null) {
        setAxialSliceZ(z);
        setLineTop(zToContainerY(z));
      }
    };
    const handleUp = () => setLineDragging(false);
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [lineDragging, containerYToZ, setAxialSliceZ, zToContainerY]);

  // ── W/L pointer drag ────────────────────────────────────────

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    // Don't start W/L drag while implant placement mode is active
    if (state.implantPlacementMode) return;
    wlDragRef.current = { startX: e.clientX, startY: e.clientY, startWc: wc, startWw: ww };
  }, [wc, ww, state.implantPlacementMode]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const d = wlDragRef.current;
    if (!d) return;
    dispatch({
      type: 'SET_WINDOW_LEVEL',
      payload: {
        ww: Math.max(1, d.startWw + (e.clientX - d.startX) * 5),
        wc: d.startWc + (e.clientY - d.startY) * 5,
      },
    });
  }, [dispatch]);

  const handlePointerUp = useCallback(() => { wlDragRef.current = null; }, []);

  return (
    <div
      ref={containerRef}
      data-crosssection-view
      data-vp="CROSS"
      data-vp-title={t('viewport.crossSection')}
      className="relative w-full h-full bg-black overflow-hidden select-none"
      style={state.implantPlacementMode ? { cursor: 'crosshair' } : undefined}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      <canvas
        ref={canvasRef}
        data-crosssection-canvas
        className="w-full h-full"
        style={{ objectFit: 'contain', imageRendering: 'auto' }}
      />

      {/* Measurement drawing & display */}
      <CanvasMeasurementOverlay
        containerRef={containerRef}
        canvasRef={canvasRef}
        viewport="crossSection"
        getExtentMm={() => {
          const r = resultRef.current;
          return r ? [r.width * r.horizontalSpacing, r.height * r.verticalSpacing] : null;
        }}
        sampleHU={(u, v) => {
          const r = resultRef.current;
          if (!r) return null;
          const ix = Math.round(u * (r.width - 1));
          const iy = Math.round(v * (r.height - 1));
          // L5: outside the sampled CPR image → show no value
          if (ix < 0 || ix >= r.width || iy < 0 || iy >= r.height) return null;
          return r.pixelData[iy * r.width + ix];
        }}
      />


      {/* Axial Z indicator line */}
      {lineTop !== null && (
        <div
          className="absolute left-0 right-0"
          style={{ top: `${lineTop}px`, height: '11px', marginTop: '-5.5px', cursor: 'ns-resize', pointerEvents: 'auto', zIndex: 20 }}
          onPointerDown={handleLinePointerDown}
        >
          <div className="w-full" style={{ height: '1px', marginTop: '5px', background: 'rgba(255, 255, 50, 0.6)', boxShadow: '0 0 4px rgba(255, 255, 50, 0.4)' }} />
        </div>
      )}

      {/* Label */}
      <OrientationLabel text={t('viewport.crossSection')} viewKey="CROSS" />

      {/* Tilt info */}
      {state.crossSectionTiltDeg !== 0 && (
        <div className="absolute top-5 left-1/2 -translate-x-1/2 text-gray-400 text-[10px] font-mono pointer-events-none select-none [text-shadow:_0_1px_2px_rgb(0_0_0_/_80%)]">
          {t('viewport.tilt', { deg: state.crossSectionTiltDeg.toFixed(0) })}
        </div>
      )}

      {/* W/L info */}
      <div className="absolute bottom-1 left-2 text-gray-400 text-[10px] font-mono pointer-events-none select-none [text-shadow:_0_1px_2px_rgb(0_0_0_/_80%)]">
        WC: {Math.round(wc)} / WW: {Math.round(ww)}
      </div>

      <ComputingOverlay show={computing} />

      {/* Implant placement mode indicator */}
      {state.implantPlacementMode && (
        <div className="absolute top-1 right-2 text-yellow-400 text-xs font-mono font-bold pointer-events-none select-none animate-pulse [text-shadow:_0_1px_2px_rgb(0_0_0_/_80%)]">
          {t('viewport.placeImplantHint')}
        </div>
      )}

      {/* Placement mode border glow */}
      {state.implantPlacementMode && (
        <div className="absolute inset-0 pointer-events-none border-2 border-yellow-400/50 rounded" style={{ zIndex: 30 }} />
      )}

      {/* Implant overlay */}
      {csResult && (
        <ImplantOverlay
          containerRef={containerRef}
          canvasRef={canvasRef}
          widthMm={CROSS_SECTION_WIDTH_MM}
          zMin={csResult.zMin}
          zMax={csResult.zMax}
        />
      )}
    </div>
  );
}
