/**
 * SVG overlay on the cross-section viewport for placing and editing implants.
 *
 * Implants are true 3D objects (world position + 3D apex axis). The overlay
 * always shows a "ghost" silhouette of each visible implant (fading with its
 * distance from the plane, so it stays grabbable while browsing sections) and
 * highlights the actual plane∩body intersection strip on top of it: centered
 * on the plane the highlight covers the full body, a few mm away only the
 * edge of the cylinder lights up.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useViewer } from '@/context/ViewerContext';
import { useI18n } from '@/i18n/I18nContext';
import type { ImplantData } from '@/types/dicom';
import { getImplantSystem } from '@/types/dicom';
import { ImplantShape } from './ImplantShape';
import { isMeasureTool } from '@/components/measurements/CanvasMeasurementOverlay';
import { crossSectionFrame } from '@/core/cprMath';
import {
  nearestArchFrame,
  implantAxis,
  implantWorldAxis,
  implantPlaneStrip,
  cylinderPlaneStrip,
  sleeveBody,
  drillSegment,
  projectToPlane,
  cross3,
  dot3,
  type Vec3,
} from '@/core/implantGeometry';
import { evaluateImplant, type ImplantSeg } from '@/core/safety';
import { slicePlaneSegments } from '@/core/meshSlice';
import { scanTriangleSoupWorld } from '@/core/scanMesh';

interface ImplantOverlayProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  /** Physical width of the cross-section in mm */
  widthMm: number;
  /** zMin / zMax from CPR result */
  zMin: number;
  zMax: number;
}


// ── Coordinate conversion helpers ─────────────────────────────

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

export function ImplantOverlay({ containerRef, canvasRef, widthMm, zMin, zMax }: ImplantOverlayProps) {
  const { state, dispatch } = useViewer();
  const { t } = useI18n();
  const implantsRef = useRef(state.implants);
  implantsRef.current = state.implants;

  const halfW = widthMm / 2;
  const zRange = zMax - zMin;
  const zMid = (zMin + zMax) / 2;

  // World-space frame of the current cross-section plane
  const frame = useMemo(
    () => state.archCurveControlPoints
      ? crossSectionFrame(
          state.archCurveControlPoints,
          state.crossSectionPosition,
          state.crossSectionTiltDeg,
          zMin, zMax,
        )
      : null,
    [state.archCurveControlPoints, state.crossSectionPosition, state.crossSectionTiltDeg, zMin, zMax],
  );

  // Registered scan contours where they cross this cross-section plane
  const scanContours = useMemo(() => {
    if (!frame) return [];
    const n = cross3(frame.eU, frame.eV);
    return state.scans.filter(s => s.visible).map(s => {
      const soup = scanTriangleSoupWorld(s.id, s.transform);
      return { id: s.id, color: s.color, segs: soup ? slicePlaneSegments(soup, frame.origin, n) : [] };
    });
  }, [state.scans, frame]);

  // ── Image (h, zImg) ↔ pixel mapping ─────────────────────────
  // h: mm from plane center horizontally; zImg: vertical image coordinate in
  // [zMin..zMax] (equals world z only at 0° tilt — it is zMid + v)

  const mmToPixel = useCallback((hMm: number, zImg: number): [number, number] | null => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return null;
    const cr = getContentRect(container, canvas);
    const normX = (hMm + halfW) / widthMm;
    const normY = (zMax - zImg) / zRange;
    return [cr.left + normX * cr.width, cr.top + normY * cr.height];
  }, [containerRef, canvasRef, halfW, widthMm, zMax, zRange]);

  const pixelToMm = useCallback((px: number, py: number): [number, number] | null => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return null;
    const cr = getContentRect(container, canvas);
    const rect = container.getBoundingClientRect();
    const lx = px - rect.left;
    const ly = py - rect.top;
    const normX = (lx - cr.left) / cr.width;
    const normY = (ly - cr.top) / cr.height;
    const hMm = normX * widthMm - halfW;
    const zImg = zMax - normY * zRange;
    return [hMm, zImg];
  }, [containerRef, canvasRef, halfW, widthMm, zMax, zRange]);

  const mmToPixelScale = useCallback((): number => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return 1;
    const cr = getContentRect(container, canvas);
    return cr.width / widthMm;
  }, [containerRef, canvasRef, widthMm]);

  const mmToPixelScaleV = useCallback((): number => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return 1;
    const cr = getContentRect(container, canvas);
    return cr.height / zRange;
  }, [containerRef, canvasRef, zRange]);

  // World point from image coords, offset by w along the plane normal
  const worldFromImage = useCallback((hMm: number, zImg: number, w = 0): Vec3 | null => {
    if (!frame) return null;
    const n = cross3(frame.eU, frame.eV);
    const v = zImg - zMid;
    return [
      frame.origin[0] + frame.eU[0] * hMm + frame.eV[0] * v + n[0] * w,
      frame.origin[1] + frame.eU[1] * hMm + frame.eV[1] * v + n[1] * w,
      frame.origin[2] + frame.eU[2] * hMm + frame.eV[2] * v + n[2] * w,
    ];
  }, [frame, zMid]);

  // ── Placement click ─────────────────────────────────────────

  // Esc leaves placement mode (it now stays on for placing several in a row)
  useEffect(() => {
    if (!state.implantPlacementMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dispatch({ type: 'SET_IMPLANT_PLACEMENT_MODE', payload: false });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.implantPlacementMode, dispatch]);

  const handlePlacePointerDown = useCallback((e: React.PointerEvent) => {
    if (!state.implantPlacementMode) return;
    // Only place on empty background. Clicks on an existing implant (body or
    // apex handle) call stopPropagation in their own handlers, so they never
    // reach here — that prevents the "drag duplicates the implant" bug where a
    // grab-click in persistent placement mode also dropped a new implant.
    if (e.target !== e.currentTarget) return;
    e.stopPropagation(); // also blocks the W/L drag underneath

    const mm = pixelToMm(e.clientX, e.clientY);
    if (!mm) return;
    const world = worldFromImage(mm[0], mm[1], 0); // place in-plane
    if (!world) return;

    const implant: ImplantData = {
      id: `imp_${Date.now()}`,
      name: t('implant.defaultName', { n: state.implants.length + 1 }),
      visible: true,
      position: world,
      diameter: 4.0,
      length: 10.0,
      angleBLDeg: 0,
      angleMDDeg: 0,
    };
    dispatch({ type: 'ADD_IMPLANT', payload: implant });
  }, [state.implantPlacementMode, state.implants.length, pixelToMm, worldFromImage, dispatch, t]);

  // ── Drag to move (preserves out-of-plane offset) ────────────

  const [dragState, setDragState] = useState<{
    id: string;
    grabOffsetMm: [number, number]; // cursor − entry, in image coords
    w0: number;                     // out-of-plane offset at grab time
  } | null>(null);

  const handleImplantPointerDown = useCallback((e: React.PointerEvent, imp: ImplantData) => {
    e.stopPropagation();
    e.preventDefault();
    dispatch({ type: 'SET_ACTIVE_IMPLANT', payload: imp.id });
    if (!frame) return;
    const [u0, v0, w0] = projectToPlane(imp.position, frame);
    const mm = pixelToMm(e.clientX, e.clientY);
    setDragState({
      id: imp.id,
      grabOffsetMm: mm ? [mm[0] - u0, mm[1] - (zMid + v0)] : [0, 0],
      w0,
    });
  }, [dispatch, frame, pixelToMm, zMid]);

  useEffect(() => {
    if (!dragState) return;

    const handleMove = (e: PointerEvent) => {
      const mm = pixelToMm(e.clientX, e.clientY);
      if (!mm) return;
      const imp = implantsRef.current.find(i => i.id === dragState.id);
      if (!imp) return;
      const world = worldFromImage(
        mm[0] - dragState.grabOffsetMm[0],
        mm[1] - dragState.grabOffsetMm[1],
        dragState.w0,
      );
      if (!world) return;
      dispatch({ type: 'UPDATE_IMPLANT', payload: { ...imp, position: world } });
    };

    const handleUp = () => setDragState(null);

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [dragState, pixelToMm, worldFromImage, dispatch]);

  // ── Apex rotation drag (sets the buccolingual angle) ────────

  const [rotState, setRotState] = useState<string | null>(null);

  const handleApexPointerDown = useCallback((e: React.PointerEvent, imp: ImplantData) => {
    e.stopPropagation();
    e.preventDefault();
    dispatch({ type: 'SET_ACTIVE_IMPLANT', payload: imp.id });
    setRotState(imp.id);
  }, [dispatch]);

  useEffect(() => {
    if (!rotState || !frame) return;

    const handleMove = (e: PointerEvent) => {
      const imp = implantsRef.current.find(i => i.id === rotState);
      if (!imp) return;
      const mm = pixelToMm(e.clientX, e.clientY);
      if (!mm) return;
      const [u0, v0] = projectToPlane(imp.position, frame);
      const dh = mm[0] - u0;
      const dDown = (zMid + v0) - mm[1]; // image-down is positive
      if (Math.abs(dh) < 0.01 && Math.abs(dDown) < 0.01) return;
      // Full ±180° — apex can point up (upper jaw) as well as down (lower jaw)
      const bl = Math.atan2(dh, dDown) * (180 / Math.PI);
      dispatch({ type: 'UPDATE_IMPLANT', payload: { ...imp, angleBLDeg: Math.round(bl) } });
    };

    const handleUp = () => setRotState(null);

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [rotState, frame, pixelToMm, zMid, dispatch]);

  // ── Render plane intersections ──────────────────────────────

  const controlPoints = state.archCurveControlPoints;
  const visAnatomy = state.anatomy.filter(a => a.visible);
  const safetyThresholds = { nerve: state.safety.nerveMm, sinus: state.safety.sinusMm, neighbor: state.safety.neighborMm };
  const implantSegs: ImplantSeg[] = controlPoints
    ? state.implants.filter(i => i.visible).flatMap(i => {
        const wa = implantWorldAxis(controlPoints, i);
        return wa ? [{ id: i.id, entry: wa.entry, apex: wa.apex, radius: i.diameter / 2 }] : [];
      })
    : [];
  // While a measurement tool is active, let clicks reach the measurement overlay
  const measuring = isMeasureTool(state.activeTool);
  const svgInteractive = !measuring && (state.implantPlacementMode || state.implants.length > 0);

  return (
    <svg
      className="absolute inset-0 w-full h-full"
      style={{
        pointerEvents: svgInteractive ? 'auto' : 'none',
        zIndex: 25,
        cursor: state.implantPlacementMode ? 'crosshair' : 'default',
      }}
      onPointerDown={handlePlacePointerDown}
    >
      {/* Registered scan contours where they cross this plane */}
      {frame && scanContours.map(sc => (
        <g key={`scan-${sc.id}`} style={{ pointerEvents: 'none' }}>
          {sc.segs.map((seg, i) => {
            const pa = projectToPlane(seg[0], frame);
            const pb = projectToPlane(seg[1], frame);
            const a = mmToPixel(pa[0], zMid + pa[1]);
            const b = mmToPixel(pb[0], zMid + pb[1]);
            if (!a || !b) return null;
            return <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={sc.color} strokeWidth={1.5} strokeOpacity={0.9} />;
          })}
        </g>
      ))}

      {/* Anatomy markers where the tube crosses this plane (chord disc) */}
      {frame && state.anatomy.filter(a => a.visible).map(m => {
        const discs = m.points.map((p, i) => {
          const [u, v, w] = projectToPlane(p, frame);
          if (Math.abs(w) >= m.radius) return null;
          const chord = Math.sqrt(m.radius * m.radius - w * w);
          const px = mmToPixel(u, zMid + v);
          if (!px) return null;
          const rPx = chord * mmToPixelScale();
          return <circle key={i} cx={px[0]} cy={px[1]} r={Math.max(1, rPx)} fill={m.color} fillOpacity={0.4} stroke={m.color} strokeWidth={1} />;
        }).filter(Boolean);
        return <g key={m.id} style={{ pointerEvents: 'none' }}>{discs}</g>;
      })}
      {frame && controlPoints && state.implants.filter(i => i.visible).map(imp => {
        const af = nearestArchFrame(controlPoints, [imp.position[0], imp.position[1]]);
        if (!af) return null;
        const axis = implantAxis(af, imp.angleBLDeg, imp.angleMDDeg);

        // Safety: red alert ring if any anatomy marker or neighbour is too close
        let warn = false;
        const selfSeg = implantSegs.find(s => s.id === imp.id);
        if (selfSeg && (visAnatomy.length || implantSegs.length > 1)) {
          warn = !evaluateImplant(selfSeg, implantSegs, visAnatomy, safetyThresholds).worstOk;
        }

        const [u0, v0, w0] = projectToPlane(imp.position, frame);
        const entryPx = mmToPixel(u0, zMid + v0);
        if (!entryPx) return null;

        const scaleH = mmToPixelScale();
        const scaleV = mmToPixelScaleV();

        // In-plane projection of the axis → silhouette lean + foreshortening.
        // Screen mapping: +u → right, +v → up; ImplantShape's local body points
        // down (0,1), so the apex screen direction must equal (au, −av). That
        // requires angle = atan2(−au, −av) — using +au mirrors the silhouette
        // against the true intersection strip (the "doubling" on rotation).
        const au = dot3(axis, frame.eU);
        const av = dot3(axis, frame.eV);
        const imgAngle = Math.atan2(-au, -av) * (180 / Math.PI);
        const inPlaneLen = imp.length * Math.hypot(au, av);

        // The implant is a true 3D body, so it belongs on THIS cross-section
        // only where the plane actually passes through (or grazes) it. Find how
        // close the body comes to the plane along its axis — w(t) = w0 + dw·t,
        // t∈[0,length] — and fade the silhouette out past the surface. Once the
        // plane no longer reaches the implant we draw nothing, so moving it
        // elsewhere on the panoramic correctly removes it from this section.
        const planeN = cross3(frame.eU, frame.eV);
        const dw = dot3(axis, planeN); // out-of-plane shift per mm along the axis
        let minAbsW: number;
        if (Math.abs(dw) < 1e-6) {
          minAbsW = Math.abs(w0);
        } else {
          const tZero = -w0 / dw;
          minAbsW = tZero >= 0 && tZero <= imp.length
            ? 0
            : Math.min(Math.abs(w0), Math.abs(w0 + dw * imp.length));
        }
        const GRAB_MARGIN = 4; // mm of fade past the body surface (stays grabbable)
        const ghostOpacity = Math.max(0, Math.min(1, 1 - Math.max(0, minAbsW - imp.diameter / 2) / GRAB_MARGIN));
        if (ghostOpacity <= 0.02) return null; // plane doesn't reach this implant

        // Actual plane∩body intersection highlight
        const strip = implantPlaneStrip(
          { entry: imp.position, axis, diameter: imp.diameter, length: imp.length },
          frame,
        );
        const stripPoints = strip
          ?.map(([u, v]) => mmToPixel(u, zMid + v))
          .filter((p): p is [number, number] => p !== null)
          .map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`)
          .join(' ');

        const isActive = state.activeImplantId === imp.id;
        const color = isActive ? 'rgb(255, 200, 0)' : 'rgb(0, 180, 255)';

        const apexPx = mmToPixel(u0 + au * imp.length, zMid + v0 + av * imp.length);

        // ── Guided surgery: drill sleeve strip + osteotomy axis ──
        let sleeveStripPts: string | undefined;
        let drillLine: { x1: number; y1: number; x2: number; y2: number } | undefined;
        if (imp.guided?.enabled) {
          const body = { entry: imp.position, axis, diameter: imp.diameter, length: imp.length };
          const sleeve = {
            diameter: getImplantSystem(imp.systemId).sleeveDiameter,
            offset: imp.guided.sleeveOffset,
            height: imp.guided.sleeveHeight,
          };
          const sStrip = cylinderPlaneStrip(sleeveBody(body, sleeve), frame, () => 1);
          sleeveStripPts = sStrip
            ?.map(([u, v]) => mmToPixel(u, zMid + v))
            .filter((p): p is [number, number] => p !== null)
            .map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`)
            .join(' ');

          const [ds, de] = drillSegment(body, sleeve, imp.guided.drillLength);
          const dsP = projectToPlane(ds, frame);
          const deP = projectToPlane(de, frame);
          const a = mmToPixel(dsP[0], zMid + dsP[1]);
          const b = mmToPixel(deP[0], zMid + deP[1]);
          if (a && b) drillLine = { x1: a[0], y1: a[1], x2: b[0], y2: b[1] };
        }

        return (
          <g key={imp.id}>
            {/* Ghost: full silhouette, grabbable anywhere */}
            <ImplantShape
              x={entryPx[0]}
              y={entryPx[1]}
              widthPx={imp.diameter * scaleH}
              heightPx={inPlaneLen * scaleV}
              angleDeg={imgAngle}
              active={isActive}
              opacity={ghostOpacity}
              interactive={!measuring}
              safetyXPx={scaleH * state.safety.marginMm}
              safetyYPx={scaleV * state.safety.marginMm}
              safetyColor={state.safety.color}
              warn={warn}
              onPointerDown={(e) => handleImplantPointerDown(e, imp)}
              onDoubleClick={() => {
                dispatch({ type: 'SET_ACTIVE_IMPLANT', payload: imp.id });
                dispatch({ type: 'SET_EDITING_IMPLANT', payload: imp.id });
              }}
            />
            {/* What the current plane actually cuts */}
            {stripPoints && (
              <polygon
                points={stripPoints}
                fill={isActive ? 'rgba(255, 200, 0, 0.30)' : 'rgba(0, 180, 255, 0.28)'}
                stroke={color}
                strokeWidth={1.5}
                style={{ pointerEvents: 'none' }}
              />
            )}
            {/* Guided: osteotomy axis from sleeve to drill depth */}
            {drillLine && (
              <line
                x1={drillLine.x1} y1={drillLine.y1}
                x2={drillLine.x2} y2={drillLine.y2}
                stroke="rgba(120, 230, 140, 0.85)"
                strokeWidth={1}
                strokeDasharray="4 3"
                style={{ pointerEvents: 'none' }}
              />
            )}
            {/* Guided: drill sleeve (persely) */}
            {sleeveStripPts && (
              <polygon
                points={sleeveStripPts}
                fill="rgba(120, 230, 140, 0.18)"
                stroke="rgb(120, 230, 140)"
                strokeWidth={1.5}
                style={{ pointerEvents: 'none' }}
              />
            )}
            {/* Name + size label for the active implant */}
            {isActive && (
              <text
                x={entryPx[0] + (imp.diameter * scaleH) / 2 + 6}
                y={entryPx[1]}
                fill="rgb(255, 200, 0)"
                fontSize={10}
                fontFamily="monospace"
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                {imp.name} · ⌀{imp.diameter} × {imp.length}mm
              </text>
            )}
            {/* Apex rotation handle — full 360° */}
            {isActive && !measuring && apexPx && (
              <circle
                cx={apexPx[0]}
                cy={apexPx[1]}
                r={6}
                fill={rotState === imp.id ? 'rgb(255, 220, 80)' : 'rgba(255, 200, 0, 0.85)'}
                stroke="white"
                strokeWidth={1.5}
                style={{ pointerEvents: 'auto', cursor: 'grab' }}
                onPointerDown={(e) => handleApexPointerDown(e, imp)}
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}

