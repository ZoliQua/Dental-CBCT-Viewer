/**
 * SVG overlay on the axial viewport: draws the circular section where each
 * implant body crosses the current axial slice. Scrolling through slices the
 * disc appears at the entry, shrinks toward the apex, and follows the tilted
 * axis sideways — the implant behaves as a real 3D object.
 */

import { useEffect, useState, useCallback } from 'react';
import { getRenderingEngine, Enums } from '@cornerstonejs/core';
import { useViewer } from '@/context/ViewerContext';
import { getImplantSystem } from '@/types/dicom';
import { RENDERING_ENGINE_ID, VP_AXIAL } from '@/core/constants';
import { nearestArchFrame, implantAxis, radiusProfile } from '@/core/implantGeometry';
import { slicePlaneSegments } from '@/core/meshSlice';
import { scanTriangleSoupWorld } from '@/core/scanMesh';

export function ImplantAxialOverlay() {
  const { state } = useViewer();
  // Bump to re-project on camera changes (scroll/pan/zoom)
  const [, setCamTick] = useState(0);

  const getViewport = useCallback(() => {
    const engine = getRenderingEngine(RENDERING_ENGINE_ID);
    return engine?.getViewport(VP_AXIAL) ?? null;
  }, []);

  useEffect(() => {
    const vp = getViewport();
    if (!vp) return;
    const handler = () => setCamTick(t => t + 1);
    const el = vp.element;
    el.addEventListener(Enums.Events.CAMERA_MODIFIED, handler);
    return () => el.removeEventListener(Enums.Events.CAMERA_MODIFIED, handler);
  }, [getViewport]);

  if ((state.implants.length === 0 && state.anatomy.length === 0 && state.scans.length === 0) || !state.archCurveControlPoints) return null;
  const vp = getViewport();
  if (!vp) return null;
  const zFocal = vp.getCamera().focalPoint?.[2];
  if (zFocal === undefined) return null;

  return (
    <div className="absolute inset-0" style={{ zIndex: 11, pointerEvents: 'none' }}>
      <svg className="w-full h-full">
        {/* Registered scan contours where they cross this axial slice */}
        {state.scans.filter(s => s.visible).map(s => {
          const soup = scanTriangleSoupWorld(s.id, s.transform);
          if (!soup) return null;
          const segs = slicePlaneSegments(soup, [0, 0, zFocal], [0, 0, 1]);
          return (
            <g key={`scan-${s.id}`}>
              {segs.map((seg, i) => {
                const a = vp.worldToCanvas([seg[0][0], seg[0][1], zFocal] as any);
                const b = vp.worldToCanvas([seg[1][0], seg[1][1], zFocal] as any);
                return <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={s.color} strokeWidth={1.25} strokeOpacity={0.9} />;
              })}
            </g>
          );
        })}
        {/* Anatomy markers where the polyline crosses this axial slice */}
        {state.anatomy.filter(a => a.visible && a.points.length >= 2).map(m => {
          const nodes: React.ReactNode[] = [];
          for (let i = 0; i < m.points.length - 1; i++) {
            const p = m.points[i];
            const q = m.points[i + 1];
            const dz = q[2] - p[2];
            if (Math.abs(dz) < 1e-6) continue;
            const t = (zFocal - p[2]) / dz;
            if (t < 0 || t > 1) continue;
            const cx = p[0] + (q[0] - p[0]) * t;
            const cy = p[1] + (q[1] - p[1]) * t;
            const c = vp.worldToCanvas([cx, cy, zFocal] as any);
            const e = vp.worldToCanvas([cx + m.radius, cy, zFocal] as any);
            const rPx = Math.hypot(e[0] - c[0], e[1] - c[1]);
            nodes.push(
              <circle key={i} cx={c[0]} cy={c[1]} r={Math.max(1.5, rPx)}
                fill={m.color} fillOpacity={0.35} stroke={m.color} strokeWidth={1.5} />,
            );
          }
          return <g key={m.id}>{nodes}</g>;
        })}
        {state.implants.filter(i => i.visible).map(imp => {
          const af = nearestArchFrame(state.archCurveControlPoints!, [imp.position[0], imp.position[1]]);
          if (!af) return null;
          const axis = implantAxis(af, imp.angleBLDeg, imp.angleMDDeg);
          if (Math.abs(axis[2]) < 0.1) return null;

          // Where does the implant axis cross the current axial plane?
          const t = (zFocal - imp.position[2]) / axis[2];
          if (t < 0 || t > imp.length) return null;

          const cx = imp.position[0] + axis[0] * t;
          const cy = imp.position[1] + axis[1] * t;
          const r = (imp.diameter / 2) * radiusProfile(t / imp.length);
          if (r <= 0.01) return null;

          const c = vp.worldToCanvas([cx, cy, zFocal] as any);
          const e = vp.worldToCanvas([cx + r, cy, zFocal] as any);
          const rPx = Math.hypot(e[0] - c[0], e[1] - c[1]);

          const isActive = state.activeImplantId === imp.id;
          const color = isActive ? 'rgb(255, 200, 0)' : 'rgb(0, 180, 255)';

          // Guided: drill sleeve disc where the slice crosses the bushing
          // (sleeve spans axis param −(offset+height) … −offset of the platform)
          let sleeveDisc: { cx: number; cy: number; r: number } | null = null;
          if (imp.guided?.enabled) {
            const ts = (zFocal - imp.position[2]) / axis[2];
            if (ts <= -imp.guided.sleeveOffset && ts >= -(imp.guided.sleeveOffset + imp.guided.sleeveHeight)) {
              const sx = imp.position[0] + axis[0] * ts;
              const sy = imp.position[1] + axis[1] * ts;
              const sr = getImplantSystem(imp.systemId).sleeveDiameter / 2;
              const sc = vp.worldToCanvas([sx, sy, zFocal] as any);
              const se = vp.worldToCanvas([sx + sr, sy, zFocal] as any);
              sleeveDisc = { cx: sc[0], cy: sc[1], r: Math.hypot(se[0] - sc[0], se[1] - sc[1]) };
            }
          }

          return (
            <g key={imp.id}>
              {sleeveDisc && (
                <circle
                  cx={sleeveDisc.cx} cy={sleeveDisc.cy} r={sleeveDisc.r}
                  fill="rgba(120, 230, 140, 0.15)"
                  stroke="rgb(120, 230, 140)" strokeWidth={1.5}
                />
              )}
              <circle
                cx={c[0]} cy={c[1]} r={rPx}
                fill={isActive ? 'rgba(255, 200, 0, 0.25)' : 'rgba(0, 180, 255, 0.2)'}
                stroke={color} strokeWidth={1.5}
              />
              <circle cx={c[0]} cy={c[1]} r={1.5} fill={color} />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
