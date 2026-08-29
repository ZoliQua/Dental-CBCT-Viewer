import { useEffect, useRef, useCallback, useState } from 'react';
import { getRenderingEngine, Enums } from '@cornerstonejs/core';
import { useViewer } from '@/context/ViewerContext';
import { CanvasMeasurementOverlay } from '@/components/measurements/CanvasMeasurementOverlay';
import { useI18n } from '@/i18n/I18nContext';
import { OrientationLabel } from './OrientationLabel';
import { generatePanoramic, type CPRResult } from '@/core/cprEngine';
import { RENDERING_ENGINE_ID, VP_AXIAL } from '@/core/constants';
import { ImplantShape } from '@/components/implant/ImplantShape';
import { getImplantSystem, ANATOMY_DEFAULTS, type AnatomyMarker } from '@/types/dicom';
import { nearestArchFrame, archFrameAt, implantAxis, implantWorldAxis } from '@/core/implantGeometry';
import { evaluateImplant, type ImplantSeg } from '@/core/safety';
import { isMeasureTool } from '@/components/measurements/CanvasMeasurementOverlay';
import { ComputingOverlay } from './ComputingOverlay';

interface ViewportPanoramicProps {
  volumeId: string;
  showCrossSectionLine?: boolean;
}

// ── Canvas W/L rendering ───────────────────────────────────────

function renderToCanvas(
  canvas: HTMLCanvasElement,
  pixelData: Int16Array | Float32Array,
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

// ── Compute rendered content rect inside object-fit:contain ───

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

export function ViewportPanoramic({ volumeId, showCrossSectionLine = false }: ViewportPanoramicProps) {
  const { state, dispatch } = useViewer();
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const resultRef = useRef<CPRResult | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [computing, setComputing] = useState(false);
  // Shared window/level (preset buttons + W/L drag all flow through context)
  const wc = state.windowLevel.wc;
  const ww = state.windowLevel.ww;
  const wcRef = useRef(wc);
  const wwRef = useRef(ww);

  // Keep refs in sync for use in debounced callbacks
  wcRef.current = wc;
  wwRef.current = ww;

  // Horizontal Z indicator line state
  const [axialZ, setAxialZ] = useState<number | null>(null);
  const [hLineTop, setHLineTop] = useState<number | null>(null);
  const [hLineDragging, setHLineDragging] = useState(false);

  // Vertical cross-section line state
  const [vLineLeft, setVLineLeft] = useState<number | null>(null);
  const [vLineDragging, setVLineDragging] = useState(false);
  const [tiltDragging, setTiltDragging] = useState(false);

  // W/L mouse drag state
  const wlDragRef = useRef<{ startX: number; startY: number; startWc: number; startWw: number } | null>(null);

  // Implant drag state (position editing on the panoramic)
  const implantsRef = useRef(state.implants);
  implantsRef.current = state.implants;
  const [implantDrag, setImplantDrag] = useState<{ id: string; offsetPx: [number, number] } | null>(null);

  // Anatomy (nerve / sinus) tracing state
  const anatomyRef = useRef(state.anatomy);
  anatomyRef.current = state.anatomy;
  const [anatomyDrag, setAnatomyDrag] = useState<{ id: string; index: number } | null>(null);

  // Render current result with current W/L
  const renderCurrent = useCallback(() => {
    const r = resultRef.current;
    const canvas = canvasRef.current;
    if (!r || !canvas) return;
    renderToCanvas(canvas, r.pixelData, r.width, r.height, r.horizontalSpacing, r.verticalSpacing, wc, ww);
  }, [wc, ww]);

  useEffect(() => { renderCurrent(); }, [renderCurrent]);

  // Generate panoramic (debounced)
  useEffect(() => {
    if (!volumeId || !state.archCurveControlPoints) return;

    setComputing(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const debounceMs = state.panoramicResolution <= 0.3 ? 400 : 250;
    debounceRef.current = setTimeout(() => {
      const result = generatePanoramic({
        volumeId,
        controlPoints: state.archCurveControlPoints!,
        slabWidth: state.panoramicSlabWidth,
        projection: state.panoramicProjection,
        resolution: state.panoramicResolution,
      });

      if (result) {
        resultRef.current = result;
        const canvas = canvasRef.current;
        if (canvas) {
          renderToCanvas(canvas, result.pixelData, result.width, result.height, result.horizontalSpacing, result.verticalSpacing, wcRef.current, wwRef.current);
        }
        console.log(`[DQ-OPG] Rendered ${result.width}x${result.height}`);
      }
      setComputing(false);
    }, debounceMs);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [volumeId, state.archCurveControlPoints, state.panoramicSlabWidth, state.panoramicProjection, state.panoramicResolution]);

  // ── Z ↔ container Y mapping ─────────────────────────────────

  const zToContainerY = useCallback((z: number): number | null => {
    const r = resultRef.current;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!r || !canvas || !container) return null;
    const normY = (r.zMax - z) / (r.zMax - r.zMin);
    if (normY < 0 || normY > 1) return null;
    const cr = getContentRect(container, canvas);
    return cr.top + normY * cr.height;
  }, []);

  const containerYToZ = useCallback((clientY: number): number | null => {
    const r = resultRef.current;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!r || !canvas || !container) return null;
    const rect = container.getBoundingClientRect();
    const localY = clientY - rect.top;
    const cr = getContentRect(container, canvas);
    const normY = Math.max(0, Math.min(1, (localY - cr.top) / cr.height));
    return r.zMax - normY * (r.zMax - r.zMin);
  }, []);

  // ── Position ↔ container X mapping (for cross-section line) ─

  const positionToContainerX = useCallback((pos: number): number | null => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return null;
    const cr = getContentRect(container, canvas);
    return cr.left + pos * cr.width;
  }, []);

  const containerXToPosition = useCallback((clientX: number): number => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return 0.5;
    const rect = container.getBoundingClientRect();
    const localX = clientX - rect.left;
    const cr = getContentRect(container, canvas);
    return Math.max(0, Math.min(1, (localX - cr.left) / cr.width));
  }, []);

  // ── Track axial viewport Z ──────────────────────────────────

  const updateHLineFromZ = useCallback((z: number) => {
    setAxialZ(z);
    setHLineTop(zToContainerY(z));
  }, [zToContainerY]);

  // Attach to the axial viewport's camera. The axial viewport may not exist
  // yet when the panoramic mounts (or may be recreated on a layout change), so
  // poll until it is ready — otherwise the horizontal line would only appear
  // "sometimes", depending on mount order.
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
        updateHLineFromZ(z);
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
  }, [updateHLineFromZ, volumeId, state.layoutMode, state.panel.panoArrangement]);

  // Update line positions after CPR recompute
  useEffect(() => {
    if (axialZ !== null) setHLineTop(zToContainerY(axialZ));
    setVLineLeft(positionToContainerX(state.crossSectionPosition));
  }, [computing, axialZ, zToContainerY, positionToContainerX, state.crossSectionPosition]);

  // ── Set axial viewport Z ────────────────────────────────────

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
    updateHLineFromZ(z);
  }, [updateHLineFromZ]);

  // ── Horizontal line drag ────────────────────────────────────

  const handleHLinePointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setHLineDragging(true);
  }, []);

  useEffect(() => {
    if (!hLineDragging) return;
    const handleMove = (e: PointerEvent) => {
      const z = containerYToZ(e.clientY);
      if (z !== null) setAxialSliceZ(z);
    };
    const handleUp = () => setHLineDragging(false);
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [hLineDragging, containerYToZ, setAxialSliceZ]);

  // ── Vertical cross-section line drag ────────────────────────

  // Offset between the cursor and the line's CENTER X at grab time. The line
  // is tilted, so grabbing it away from its vertical middle (or anywhere in
  // the 14px-wide hit stroke) must not snap the center under the cursor.
  const vLineGrabOffsetRef = useRef(0);

  const handleVLinePointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const container = containerRef.current;
    if (container && vLineLeft !== null) {
      const rect = container.getBoundingClientRect();
      vLineGrabOffsetRef.current = e.clientX - (rect.left + vLineLeft);
    } else {
      vLineGrabOffsetRef.current = 0;
    }
    setVLineDragging(true);
  }, [vLineLeft]);

  useEffect(() => {
    if (!vLineDragging) return;
    const handleMove = (e: PointerEvent) => {
      const pos = containerXToPosition(e.clientX - vLineGrabOffsetRef.current);
      dispatch({ type: 'SET_CROSS_SECTION_POSITION', payload: pos });
      setVLineLeft(positionToContainerX(pos));
    };
    const handleUp = () => setVLineDragging(false);
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [vLineDragging, containerXToPosition, positionToContainerX, dispatch]);

  // ── Tilt drag (handle dots at line ends) ─────────────────────

  const handleTiltPointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setTiltDragging(true);
  }, []);

  useEffect(() => {
    if (!tiltDragging) return;
    const handleMove = (e: PointerEvent) => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container || vLineLeft === null) return;

      const rect = container.getBoundingClientRect();
      const cr = getContentRect(container, canvas);
      const centerX = vLineLeft;
      const centerY = cr.top + cr.height / 2;
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const dx = mx - centerX;
      const dy = -(my - centerY); // flip Y for math coords
      const angleDeg = Math.atan2(dx, dy) * (180 / Math.PI);
      const clamped = Math.max(-30, Math.min(30, angleDeg));
      dispatch({ type: 'SET_CROSS_SECTION_TILT', payload: Math.round(clamped) });
    };
    const handleUp = () => setTiltDragging(false);
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [tiltDragging, vLineLeft, dispatch]);

  // Update vLine position when crossSectionPosition changes from external source
  useEffect(() => {
    setVLineLeft(positionToContainerX(state.crossSectionPosition));
  }, [state.crossSectionPosition, positionToContainerX]);

  // ── Implant drag on the panoramic ───────────────────────────
  // Moves the implant along the arch (X) and vertically (Z), preserving its
  // buccolingual offset from the arch curve.

  useEffect(() => {
    if (!implantDrag) return;
    const controlPoints = state.archCurveControlPoints;
    if (!controlPoints) return;

    const handleMove = (e: PointerEvent) => {
      const imp = implantsRef.current.find(i => i.id === implantDrag.id);
      if (!imp) return;
      const s = containerXToPosition(e.clientX - implantDrag.offsetPx[0]);
      const z = containerYToZ(e.clientY - implantDrag.offsetPx[1]);
      if (z === null) return;
      const af = archFrameAt(controlPoints, s);
      if (!af) return;
      // Preserve the current buccolingual offset from the curve
      const afCur = nearestArchFrame(controlPoints, [imp.position[0], imp.position[1]]);
      const w0 = afCur
        ? (imp.position[0] - afCur.point[0]) * afCur.normal[0]
          + (imp.position[1] - afCur.point[1]) * afCur.normal[1]
        : 0;
      const pos: [number, number, number] = [
        af.point[0] + af.normal[0] * w0,
        af.point[1] + af.normal[1] * w0,
        z,
      ];
      dispatch({ type: 'UPDATE_IMPLANT', payload: { ...imp, position: pos } });
    };
    const handleUp = () => setImplantDrag(null);

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [implantDrag, state.archCurveControlPoints, containerXToPosition, containerYToZ, dispatch]);

  // ── Anatomy tracing (nerve / sinus) on the panoramic ────────
  // A click in draw mode appends a world point (arch XY at the click's s,
  // z from the click's y). Esc / double-click finishes; points are draggable.

  const panoramicWorldFromClient = useCallback((clientX: number, clientY: number): [number, number, number] | null => {
    const cps = state.archCurveControlPoints;
    if (!cps) return null;
    const s = containerXToPosition(clientX);
    const z = containerYToZ(clientY);
    if (z === null) return null;
    const af = archFrameAt(cps, s);
    if (!af) return null;
    return [af.point[0], af.point[1], z];
  }, [state.archCurveControlPoints, containerXToPosition, containerYToZ]);

  const handleAnatomyDraw = useCallback((e: React.PointerEvent) => {
    if (!state.anatomyDrawMode) return;
    if (e.target !== e.currentTarget) return; // a point handle was clicked — not a new point
    e.stopPropagation();
    const world = panoramicWorldFromClient(e.clientX, e.clientY);
    if (!world) return;
    const active = anatomyRef.current.find(a => a.id === state.activeAnatomyId);
    if (active && active.type === state.anatomyDrawMode) {
      dispatch({ type: 'UPDATE_ANATOMY', payload: { ...active, points: [...active.points, world] } });
    } else {
      const type = state.anatomyDrawMode;
      const def = ANATOMY_DEFAULTS[type];
      const n = anatomyRef.current.filter(a => a.type === type).length + 1;
      const marker: AnatomyMarker = {
        id: `anat_${Date.now()}`,
        name: `${t(`anatomy.${type}`)} ${n}`,
        visible: true,
        type,
        color: def.color,
        radius: def.radius,
        points: [world],
      };
      dispatch({ type: 'ADD_ANATOMY', payload: marker });
    }
  }, [state.anatomyDrawMode, state.activeAnatomyId, panoramicWorldFromClient, dispatch, t]);

  useEffect(() => {
    if (!anatomyDrag) return;
    const move = (e: PointerEvent) => {
      const world = panoramicWorldFromClient(e.clientX, e.clientY);
      if (!world) return;
      const m = anatomyRef.current.find(a => a.id === anatomyDrag.id);
      if (!m) return;
      const pts = m.points.slice();
      pts[anatomyDrag.index] = world;
      dispatch({ type: 'UPDATE_ANATOMY', payload: { ...m, points: pts } });
    };
    const up = () => setAnatomyDrag(null);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, [anatomyDrag, panoramicWorldFromClient, dispatch]);

  useEffect(() => {
    if (!state.anatomyDrawMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dispatch({ type: 'SET_ANATOMY_DRAW_MODE', payload: null });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.anatomyDrawMode, dispatch]);

  // ── W/L pointer interaction ─────────────────────────────────

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    wlDragRef.current = { startX: e.clientX, startY: e.clientY, startWc: wc, startWw: ww };
  }, [wc, ww]);

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

  // ── Tilted line geometry for SVG ────────────────────────────

  const getVLineSVGPoints = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || vLineLeft === null) return null;
    const cr = getContentRect(container, canvas);
    const cx = vLineLeft;
    const cy = cr.top + cr.height / 2;
    const halfH = cr.height / 2;
    const tiltRad = (state.crossSectionTiltDeg * Math.PI) / 180;
    return {
      x1: cx + Math.sin(tiltRad) * halfH,
      y1: cy - Math.cos(tiltRad) * halfH,
      x2: cx - Math.sin(tiltRad) * halfH,
      y2: cy + Math.cos(tiltRad) * halfH,
    };
  }, [vLineLeft, state.crossSectionTiltDeg]);

  const vLinePts = showCrossSectionLine ? getVLineSVGPoints() : null;

  // Labels: arch-length position (mm) for the vertical line, depth-from-top
  // (mm) for the horizontal line. Read live from the last CPR result.
  const csResult = resultRef.current;
  const arcLenMm = csResult ? csResult.horizontalSpacing * Math.max(1, csResult.width - 1) : 0;
  const vLabelMm = arcLenMm * state.crossSectionPosition;
  const hLabelMm = csResult && axialZ !== null ? csResult.zMax - axialZ : null;

  // Implant sections on the panoramic: X from the implant's nearest arch
  // position, Y from its world z, mesiodistal lean shown in-plane, and a
  // depth fade by how far the implant sits from the arch surface relative to
  // the panoramic slab. Draggable: moves the implant along the arch and in Z.
  const renderImplants = () => {
    if (state.implants.length === 0 || !state.archCurveControlPoints) return null;
    const r = resultRef.current;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!r || !canvas || !container) return null;
    const cr = getContentRect(container, canvas);
    const pxPerMm = cr.height / (r.zMax - r.zMin);
    const halfSlab = Math.max(1, state.panoramicSlabWidth / 2);

    const cps = state.archCurveControlPoints;
    const visAnatomy = state.anatomy.filter(a => a.visible);
    const thresholds = { nerve: state.safety.nerveMm, sinus: state.safety.sinusMm, neighbor: state.safety.neighborMm };
    const segs: ImplantSeg[] = state.implants.filter(i => i.visible).flatMap(i => {
      const wa = implantWorldAxis(cps, i);
      return wa ? [{ id: i.id, entry: wa.entry, apex: wa.apex, radius: i.diameter / 2 }] : [];
    });

    return (
      <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: 'none', zIndex: 22 }}>
        {state.implants.filter(i => i.visible).map(imp => {
          const af = nearestArchFrame(state.archCurveControlPoints!, [imp.position[0], imp.position[1]]);
          if (!af) return null;
          const x = positionToContainerX(af.s);
          const y = zToContainerY(imp.position[2]);
          if (x === null || y === null) return null;

          const axis = implantAxis(af, imp.angleBLDeg, imp.angleMDDeg);
          // Panoramic in-plane axes: arch tangent (horizontal, +s → right) and
          // Z (vertical, +z → up). ImplantShape's local body points down, so the
          // apex screen direction must equal (aT, −axis[2]) → angle = atan2(−aT, −z).
          const aT = axis[0] * af.tangent[0] + axis[1] * af.tangent[1];
          const angle = Math.atan2(-aT, -axis[2]) * (180 / Math.PI);
          const inPlaneLen = imp.length * Math.hypot(aT, axis[2]);

          // Safety: violation if any anatomy marker or neighbour implant is too close
          let warn = false;
          const self = segs.find(s => s.id === imp.id);
          if (self && (visAnatomy.length || segs.length > 1)) {
            warn = !evaluateImplant(self, segs, visAnatomy, thresholds).worstOk;
          }

          // Depth fade: buccolingual distance from the arch surface vs slab
          const w0 = (imp.position[0] - af.point[0]) * af.normal[0]
                   + (imp.position[1] - af.point[1]) * af.normal[1];
          const over = Math.max(0, Math.abs(w0) - halfSlab);
          const opacity = Math.max(0.15, Math.min(1, 1 - over / halfSlab));

          // Guided: drill sleeve (persely) + osteotomy axis, along the in-plane
          // implant direction. Apex direction in screen = rotate (0,1) by angle.
          let guidedEls: React.ReactNode = null;
          if (imp.guided?.enabled) {
            const ar = (angle * Math.PI) / 180;
            const apexDir: [number, number] = [-Math.sin(ar), Math.cos(ar)];
            const coronal: [number, number] = [Math.sin(ar), -Math.cos(ar)];
            const { sleeveOffset: off, sleeveHeight: sh, drillLength: dl } = imp.guided;
            const sleeveDia = getImplantSystem(imp.systemId).sleeveDiameter;
            const sCx = x + coronal[0] * (off + sh / 2) * pxPerMm;
            const sCy = y + coronal[1] * (off + sh / 2) * pxPerMm;
            const topX = x + coronal[0] * (off + sh) * pxPerMm;
            const topY = y + coronal[1] * (off + sh) * pxPerMm;
            const tipX = x + apexDir[0] * dl * pxPerMm;
            const tipY = y + apexDir[1] * dl * pxPerMm;
            guidedEls = (
              <g style={{ pointerEvents: 'none' }} opacity={opacity}>
                <line
                  x1={topX} y1={topY} x2={tipX} y2={tipY}
                  stroke="rgba(120, 230, 140, 0.85)" strokeWidth={1} strokeDasharray="4 3"
                />
                <rect
                  x={sCx - (sleeveDia * pxPerMm) / 2}
                  y={sCy - (sh * pxPerMm) / 2}
                  width={sleeveDia * pxPerMm}
                  height={sh * pxPerMm}
                  transform={`rotate(${angle} ${sCx} ${sCy})`}
                  fill="rgba(120, 230, 140, 0.18)"
                  stroke="rgb(120, 230, 140)" strokeWidth={1.5}
                  rx={1.5}
                />
              </g>
            );
          }

          return (
            <g key={imp.id}>
              {guidedEls}
              <ImplantShape
                x={x}
                y={y}
                widthPx={imp.diameter * pxPerMm}
                heightPx={inPlaneLen * pxPerMm}
                angleDeg={angle}
                active={state.activeImplantId === imp.id}
                opacity={opacity}
                interactive={!isMeasureTool(state.activeTool)}
                safetyXPx={pxPerMm * state.safety.marginMm}
                safetyYPx={pxPerMm * state.safety.marginMm}
                safetyColor={state.safety.color}
                warn={warn}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  dispatch({ type: 'SET_ACTIVE_IMPLANT', payload: imp.id });
                  const rect = container.getBoundingClientRect();
                  setImplantDrag({
                    id: imp.id,
                    offsetPx: [e.clientX - (rect.left + x), e.clientY - (rect.top + y)],
                  });
                }}
                onDoubleClick={() => {
                  dispatch({ type: 'SET_ACTIVE_IMPLANT', payload: imp.id });
                  dispatch({ type: 'SET_EDITING_IMPLANT', payload: imp.id });
                }}
              />
            </g>
          );
        })}
      </svg>
    );
  };

  // Anatomy (nerve / sinus) polylines + safety tube + draggable points
  const renderAnatomy = () => {
    if (!state.archCurveControlPoints) return null;
    const r = resultRef.current;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!r || !canvas || !container) return null;
    const cr = getContentRect(container, canvas);
    const pxPerMm = cr.height / (r.zMax - r.zMin);
    const drawing = state.anatomyDrawMode !== null;
    return (
      <svg
        className="absolute inset-0 w-full h-full"
        style={{ pointerEvents: drawing ? 'auto' : 'none', zIndex: 24, cursor: drawing ? 'crosshair' : 'default' }}
        onPointerDown={handleAnatomyDraw}
      >
        {state.anatomy.filter(a => a.visible).map(m => {
          const pts = m.points
            .map(p => {
              const af = nearestArchFrame(state.archCurveControlPoints!, [p[0], p[1]]);
              if (!af) return null;
              const px = positionToContainerX(af.s);
              const py = zToContainerY(p[2]);
              return px === null || py === null ? null : [px, py] as [number, number];
            })
            .filter((p): p is [number, number] => p !== null);
          if (pts.length === 0) return null;
          const poly = pts.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
          const isActive = state.activeAnatomyId === m.id;
          return (
            <g key={m.id}>
              {pts.length >= 2 && (
                <polyline points={poly} fill="none" stroke={m.color} strokeOpacity={0.25}
                  strokeWidth={Math.max(2, m.radius * 2 * pxPerMm)} strokeLinecap="round" strokeLinejoin="round" />
              )}
              {pts.length >= 2 && (
                <polyline points={poly} fill="none" stroke={m.color} strokeWidth={1.5}
                  strokeLinecap="round" strokeLinejoin="round" />
              )}
              {pts.map((p, i) => (
                <circle
                  key={i}
                  cx={p[0]} cy={p[1]} r={isActive ? 4 : 3}
                  fill={m.color} stroke="white" strokeWidth={1}
                  style={{ pointerEvents: drawing ? 'none' : 'auto', cursor: 'grab' }}
                  onPointerDown={(e) => {
                    if (drawing) return;
                    e.stopPropagation();
                    dispatch({ type: 'SET_ACTIVE_ANATOMY', payload: m.id });
                    setAnatomyDrag({ id: m.id, index: i });
                  }}
                />
              ))}
            </g>
          );
        })}
      </svg>
    );
  };

  return (
    <div
      ref={containerRef}
      data-panoramic-view
      data-vp="PANORAMA"
      data-vp-title={t('viewport.panorama')}
      className="relative w-full h-full bg-black overflow-hidden select-none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      <canvas
        ref={canvasRef}
        data-panoramic-canvas
        className="w-full h-full"
        style={{ objectFit: 'contain', imageRendering: 'auto' }}
      />

      {/* Measurement drawing & display */}
      <CanvasMeasurementOverlay
        containerRef={containerRef}
        canvasRef={canvasRef}
        viewport="panoramic"
        getExtentMm={() => {
          const r = resultRef.current;
          return r ? [r.width * r.horizontalSpacing, r.height * r.verticalSpacing] : null;
        }}
        sampleHU={(u, v) => {
          const r = resultRef.current;
          if (!r) return null;
          const ix = Math.round(u * (r.width - 1));
          const iy = Math.round(v * (r.height - 1));
          return r.pixelData[iy * r.width + ix];
        }}
      />


      {/* Horizontal indicator line — the axial plane (current axial slice Z) */}
      {hLineTop !== null && (
        <div
          className="absolute left-0 right-0"
          style={{ top: `${hLineTop}px`, height: '13px', marginTop: '-6.5px', cursor: 'ns-resize', pointerEvents: 'auto', zIndex: 20 }}
          onPointerDown={handleHLinePointerDown}
        >
          <div className="w-full" style={{ height: '2px', marginTop: '5.5px', background: 'rgba(255, 235, 60, 0.9)', boxShadow: '0 0 5px rgba(255, 235, 60, 0.6)' }} />
          <span
            className="absolute right-1 -top-4 px-1 rounded text-[10px] font-medium select-none"
            style={{ color: 'rgb(255,235,60)', background: 'rgba(0,0,0,0.45)' }}
          >
            {t('view.axial')}{hLabelMm !== null ? ` · ${hLabelMm.toFixed(0)} mm` : ''}
          </span>
        </div>
      )}

      {/* Vertical cross-section line (tilted SVG) */}
      {vLinePts && (
        <svg
          className="absolute inset-0 w-full h-full"
          style={{ pointerEvents: 'none', zIndex: 21 }}
        >
          {/* Wide invisible hit area for position drag */}
          <line
            x1={vLinePts.x1} y1={vLinePts.y1}
            x2={vLinePts.x2} y2={vLinePts.y2}
            stroke="transparent" strokeWidth={14}
            style={{ pointerEvents: 'auto', cursor: 'ew-resize' }}
            onPointerDown={handleVLinePointerDown}
          />
          {/* Visible line — the cut that produces the cross-section */}
          <line
            x1={vLinePts.x1} y1={vLinePts.y1}
            x2={vLinePts.x2} y2={vLinePts.y2}
            stroke="rgba(100, 200, 255, 0.95)" strokeWidth={2}
            style={{ pointerEvents: 'none', filter: 'drop-shadow(0 0 3px rgba(100,200,255,0.6))' }}
          />
          {/* Position label (arch-length mm) just below the top handle */}
          <text
            x={vLinePts.x1 + 8} y={vLinePts.y1 + 30}
            fontSize={10} fontWeight={500}
            fill="rgb(150,215,255)" stroke="black" strokeWidth={0.5} paintOrder="stroke"
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            {vLabelMm.toFixed(0)} mm
          </text>
          {/* Tilt handle — top */}
          <circle
            cx={vLinePts.x1} cy={vLinePts.y1} r={6}
            fill={tiltDragging ? 'rgb(80,200,255)' : 'rgb(100,200,255)'}
            stroke="white" strokeWidth={1.5}
            style={{ pointerEvents: 'auto', cursor: 'grab' }}
            onPointerDown={handleTiltPointerDown}
          />
          {/* Tilt handle — bottom */}
          <circle
            cx={vLinePts.x2} cy={vLinePts.y2} r={6}
            fill={tiltDragging ? 'rgb(80,200,255)' : 'rgb(100,200,255)'}
            stroke="white" strokeWidth={1.5}
            style={{ pointerEvents: 'auto', cursor: 'grab' }}
            onPointerDown={handleTiltPointerDown}
          />
        </svg>
      )}

      {/* Anatomy markers (nerve / sinus) */}
      {renderAnatomy()}

      {/* Implant projections */}
      {renderImplants()}

      {/* Label */}
      <OrientationLabel text={t('viewport.panorama')} viewKey="PANORAMA" />

      {/* W/L info */}
      <div className="absolute bottom-1 left-2 text-gray-400 text-[10px] font-mono pointer-events-none select-none [text-shadow:_0_1px_2px_rgb(0_0_0_/_80%)]">
        WC: {Math.round(wc)} / WW: {Math.round(ww)}
      </div>

      <ComputingOverlay show={computing} />
    </div>
  );
}
