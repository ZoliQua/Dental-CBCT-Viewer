/**
 * SVG overlay on the axial viewport for drawing / editing the dental arch curve.
 * Shows: control points (draggable), interpolated curve, slab-width parallel lines.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { getRenderingEngine, Enums, cache } from '@cornerstonejs/core';
import { useViewer } from '@/context/ViewerContext';
import { RENDERING_ENGINE_ID, VP_AXIAL } from '@/core/constants';
import {
  interpolateArchCurve,
  computeCurveNormals,
  offsetCurve,
  generateDefaultArchCurve,
} from '@/core/archCurve';
import { crossSectionFrame, buildUniformCurve } from '@/core/cprMath';

type Point2 = [number, number];

/** Half-width (mm) of the cross-section indicator drawn on the axial. */
const CROSS_SECTION_HALF_MM = 25;

/** Nearest arch position (0-1, arc-length uniform) to a world XY point. */
function nearestArchPosition(controlPoints: Point2[], wx: number, wy: number): number {
  const { curve } = buildUniformCurve(controlPoints, 500);
  if (curve.length < 2) return 0.5;
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < curve.length; i++) {
    const dx = curve[i][0] - wx;
    const dy = curve[i][1] - wy;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best / (curve.length - 1);
}

function pointsToPath(pts: Point2[]): string {
  if (pts.length === 0) return '';
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
}

export function ArchCurveEditor() {
  const { state, dispatch } = useViewer();
  const containerRef = useRef<HTMLDivElement>(null);
  const dragIdxRef = useRef<number | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const csDraggingRef = useRef(false);
  const [csDragging, setCsDragging] = useState(false);
  const [screenData, setScreenData] = useState<{
    controlPts: Point2[];
    curvePath: string;
    innerPath: string;
    outerPath: string;
    csA: Point2 | null;
    csB: Point2 | null;
    csMid: Point2 | null;
  } | null>(null);

  // Auto-generate default arch curve if none exists
  useEffect(() => {
    if (state.archCurveControlPoints || !state.volumeId) return;
    const volume = cache.getVolume(state.volumeId);
    if (!volume) {
      console.warn('[DQ-OPG] Volume not in cache yet, retrying in 500ms...');
      const t = setTimeout(() => {
        const v = cache.getVolume(state.volumeId!);
        if (!v) return;
        initCurve(v);
      }, 500);
      return () => clearTimeout(t);
    }
    initCurve(volume);

    function initCurve(v: any) {
      const o = v.origin as [number, number, number];
      const d = v.dimensions as [number, number, number];
      const s = v.spacing as [number, number, number];
      const center: Point2 = [o[0] + (d[0] * s[0]) / 2, o[1] + (d[1] * s[1]) / 2];
      const size: Point2 = [d[0] * s[0], d[1] * s[1]];
      const curve = generateDefaultArchCurve(center, size);
      console.log('[DQ-OPG] Default arch curve generated, center:', center, 'size:', size);
      dispatch({ type: 'SET_ARCH_CURVE', payload: curve });
    }
  }, [state.archCurveControlPoints, state.volumeId, dispatch]);

  // Get viewport and focal Z
  const getViewport = useCallback(() => {
    const engine = getRenderingEngine(RENDERING_ENGINE_ID);
    return engine?.getViewport(VP_AXIAL) ?? null;
  }, []);

  const getFocalZ = useCallback(() => {
    const vp = getViewport();
    if (!vp) return 0;
    const cam = vp.getCamera();
    return cam.focalPoint?.[2] ?? 0;
  }, [getViewport]);

  // Reproject world control points → screen coordinates
  const updateScreen = useCallback(() => {
    const vp = getViewport();
    if (!vp || !state.archCurveControlPoints) return;

    const wz = getFocalZ();

    const screenCPs = state.archCurveControlPoints.map(([wx, wy]) => {
      const c = vp.worldToCanvas([wx, wy, wz] as any);
      return [c[0], c[1]] as Point2;
    });

    const curveWorld = interpolateArchCurve(state.archCurveControlPoints, 20);
    const curveScreen = curveWorld.map(([wx, wy]) => {
      const c = vp.worldToCanvas([wx, wy, wz] as any);
      return [c[0], c[1]] as Point2;
    });

    const normals = computeCurveNormals(curveWorld);
    const halfSlab = state.panoramicSlabWidth / 2;
    const inner = offsetCurve(curveWorld, normals, -halfSlab);
    const outer = offsetCurve(curveWorld, normals, halfSlab);
    const innerScreen = inner.map(([wx, wy]) => {
      const c = vp.worldToCanvas([wx, wy, wz] as any);
      return [c[0], c[1]] as Point2;
    });
    const outerScreen = outer.map(([wx, wy]) => {
      const c = vp.worldToCanvas([wx, wy, wz] as any);
      return [c[0], c[1]] as Point2;
    });

    // Cross-section indicator: line through the arch point at the current
    // cross-section position, running along the buccolingual normal (i.e.
    // perpendicular to the arch). Tilt is a Z-lean, so it does not change the
    // in-plane (axial) projection.
    let csA: Point2 | null = null;
    let csB: Point2 | null = null;
    let csMid: Point2 | null = null;
    const frame = crossSectionFrame(state.archCurveControlPoints, state.crossSectionPosition, 0, 0, 1);
    if (frame) {
      const [px, py] = frame.point;
      const [nx, ny] = frame.normal;
      const ca = vp.worldToCanvas([px - nx * CROSS_SECTION_HALF_MM, py - ny * CROSS_SECTION_HALF_MM, wz] as any);
      const cb = vp.worldToCanvas([px + nx * CROSS_SECTION_HALF_MM, py + ny * CROSS_SECTION_HALF_MM, wz] as any);
      const cm = vp.worldToCanvas([px, py, wz] as any);
      csA = [ca[0], ca[1]];
      csB = [cb[0], cb[1]];
      csMid = [cm[0], cm[1]];
    }

    setScreenData({
      controlPts: screenCPs,
      curvePath: pointsToPath(curveScreen),
      innerPath: pointsToPath(innerScreen),
      outerPath: pointsToPath(outerScreen),
      csA, csB, csMid,
    });
  }, [state.archCurveControlPoints, state.panoramicSlabWidth, state.crossSectionPosition, getViewport, getFocalZ]);

  // Re-render on camera changes (pan/zoom/scroll)
  useEffect(() => {
    const vp = getViewport();
    if (!vp) return;

    const el = vp.element;
    const handler = () => updateScreen();
    el.addEventListener(Enums.Events.CAMERA_MODIFIED, handler);
    updateScreen();

    return () => el.removeEventListener(Enums.Events.CAMERA_MODIFIED, handler);
  }, [updateScreen, getViewport]);

  // ── Drag interaction via window events ────────────────────────

  const handlePointerDown = useCallback((idx: number) => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setDragIdx(idx);
    dragIdxRef.current = idx;
  }, []);

  // Window-level move & up handlers (attached when dragging)
  useEffect(() => {
    if (dragIdx === null) return;

    const handleMove = (e: PointerEvent) => {
      const idx = dragIdxRef.current;
      if (idx === null || !containerRef.current || !state.archCurveControlPoints) return;

      const vp = getViewport();
      if (!vp) return;

      const rect = containerRef.current.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const worldPos = vp.canvasToWorld([cx, cy]) as [number, number, number];

      const newPts = state.archCurveControlPoints.map((p) => [...p] as [number, number]);
      newPts[idx] = [worldPos[0], worldPos[1]];
      dispatch({ type: 'SET_ARCH_CURVE', payload: newPts });
    };

    const handleUp = () => {
      setDragIdx(null);
      dragIdxRef.current = null;
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);

    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [dragIdx, state.archCurveControlPoints, dispatch, getViewport]);

  // ── Cross-section indicator drag (moves position along the arch) ──

  const handleCsPointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setCsDragging(true);
    csDraggingRef.current = true;
  }, []);

  useEffect(() => {
    if (!csDragging) return;

    const handleMove = (e: PointerEvent) => {
      if (!csDraggingRef.current || !containerRef.current || !state.archCurveControlPoints) return;
      const vp = getViewport();
      if (!vp) return;
      const rect = containerRef.current.getBoundingClientRect();
      const world = vp.canvasToWorld([e.clientX - rect.left, e.clientY - rect.top]) as [number, number, number];
      const pos = nearestArchPosition(state.archCurveControlPoints, world[0], world[1]);
      dispatch({ type: 'SET_CROSS_SECTION_POSITION', payload: pos });
    };
    const handleUp = () => {
      setCsDragging(false);
      csDraggingRef.current = false;
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [csDragging, state.archCurveControlPoints, dispatch, getViewport]);

  if (!screenData || !state.archCurveControlPoints) return null;

  return (
    <div ref={containerRef} className="absolute inset-0" style={{ zIndex: 10, pointerEvents: 'none' }}>
      <svg className="w-full h-full">
        {/* Slab width lines */}
        <path d={screenData.innerPath} fill="none" stroke="rgba(255,80,80,0.4)" strokeWidth={1} />
        <path d={screenData.outerPath} fill="none" stroke="rgba(255,80,80,0.4)" strokeWidth={1} />

        {/* Main curve */}
        <path d={screenData.curvePath} fill="none" stroke="rgba(255,80,80,0.85)" strokeWidth={2} />

        {/* Cross-section position indicator — perpendicular to the arch,
            matching the vertical line on the panoramic. Draggable to slide the
            cross-section along the arch. */}
        {screenData.csA && screenData.csB && screenData.csMid && (
          <g>
            {/* Wide invisible hit area */}
            <line
              x1={screenData.csA[0]} y1={screenData.csA[1]}
              x2={screenData.csB[0]} y2={screenData.csB[1]}
              stroke="transparent" strokeWidth={16}
              style={{ pointerEvents: 'auto', cursor: 'move' }}
              onPointerDown={handleCsPointerDown}
            />
            {/* Visible line */}
            <line
              x1={screenData.csA[0]} y1={screenData.csA[1]}
              x2={screenData.csB[0]} y2={screenData.csB[1]}
              stroke="rgb(100,200,255)" strokeWidth={2}
              style={{ pointerEvents: 'none', filter: 'drop-shadow(0 0 3px rgba(100,200,255,0.7))' }}
            />
            {/* Centre handle */}
            <circle
              cx={screenData.csMid[0]} cy={screenData.csMid[1]} r={6}
              fill={csDragging ? 'rgb(80,200,255)' : 'rgb(100,200,255)'}
              stroke="white" strokeWidth={1.5}
              style={{ pointerEvents: 'auto', cursor: 'move' }}
              onPointerDown={handleCsPointerDown}
            />
          </g>
        )}

        {/* Control points */}
        {screenData.controlPts.map((p, i) => (
          <circle
            key={i}
            cx={p[0]}
            cy={p[1]}
            r={7}
            fill={dragIdx === i ? 'rgb(80,200,255)' : 'rgb(50,140,255)'}
            stroke="white"
            strokeWidth={2}
            style={{ pointerEvents: 'auto', cursor: dragIdx === i ? 'grabbing' : 'grab' }}
            onPointerDown={handlePointerDown(i)}
          />
        ))}
      </svg>
    </div>
  );
}
