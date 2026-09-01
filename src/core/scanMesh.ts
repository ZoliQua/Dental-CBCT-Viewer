/**
 * Imported scan meshes (STL / OBJ / PLY): reading files into vtkPolyData,
 * a session registry that holds the (large) geometry out of the React state,
 * and vtk actor construction for the 3D scene.
 *
 * All vtk readers ship with @kitware/vtk.js — no extra dependency.
 */

import vtkSTLReader from '@kitware/vtk.js/IO/Geometry/STLReader';
import vtkPLYReader from '@kitware/vtk.js/IO/Geometry/PLYReader';
import vtkOBJReader from '@kitware/vtk.js/IO/Misc/OBJReader';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import { applyMat4 } from './registration';

// id → vtkPolyData (kept here, not in state/JSON — meshes are large)
const registry = new Map<string, any>();

export const getScanPolyData = (id: string): any | null => registry.get(id) ?? null;
export const setScanPolyData = (id: string, pd: any): void => { registry.set(id, pd); };
export const removeScanPolyData = (id: string): void => { registry.delete(id); };
export const hasScanPolyData = (id: string): boolean => registry.has(id);

/** Empty the whole scan-mesh registry (e.g. when the session is purged). */
export function clearScanRegistry(): void {
  registry.clear();
}

/** 4×4 column-major identity. */
export const IDENTITY16 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** 4×4 column-major translation matrix. */
export function translation16(tx: number, ty: number, tz: number): number[] {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, tx, ty, tz, 1];
}

/**
 * Sanity-check a mesh's extent against mm-scale jaw anatomy (STL/OBJ/PLY carry
 * no unit metadata). Returns a human-readable warning when the bounding box is
 * implausible (< 5 mm or > 2000 mm), else null. Never auto-scales — wrong-unit
 * geometry must be flagged, not silently "fixed".
 */
export function meshScaleWarning(pd: any): string | null {
  const b = pd?.getBounds?.();
  if (!b || b.length < 6) return null;
  const maxDim = Math.max(b[1] - b[0], b[3] - b[2], b[5] - b[4]);
  if (!Number.isFinite(maxDim) || maxDim <= 0) return null;
  if (maxDim < 5) {
    return `mesh extent is only ${maxDim.toFixed(2)} units — far below mm-scale anatomy; the file may be in meters or wrongly scaled`;
  }
  if (maxDim > 2000) {
    return `mesh extent is ${Math.round(maxDim)} units — far above mm-scale anatomy; the file may be in micrometers or wrongly scaled`;
  }
  return null;
}

/** Read a mesh file into vtkPolyData by extension. Returns null on failure. */
export async function loadScanPolyData(file: File): Promise<any | null> {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  try {
    let pd: any = null;
    if (ext === 'obj') {
      const reader = vtkOBJReader.newInstance();
      reader.parseAsText(await file.text());
      pd = reader.getOutputData(0);
    } else {
      const buf = await file.arrayBuffer();
      if (ext === 'ply') {
        const reader = vtkPLYReader.newInstance();
        reader.parseAsArrayBuffer(buf);
        pd = reader.getOutputData(0);
      } else {
        // Default: STL (binary via ArrayBuffer, fall back to ASCII text)
        const reader = vtkSTLReader.newInstance();
        reader.parseAsArrayBuffer(buf);
        pd = reader.getOutputData(0);
        if (!pd || pd.getNumberOfPoints() === 0) {
          const alt = vtkSTLReader.newInstance();
          alt.parseAsText(new TextDecoder().decode(buf));
          pd = alt.getOutputData(0);
        }
      }
    }
    if (!pd || pd.getNumberOfPoints() === 0) return null;
    const warning = meshScaleWarning(pd);
    if (warning) console.warn(`[DQ-DICOM] Scan mesh "${file.name}": ${warning}`);
    return pd;
  } catch {
    return null;
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const r = parseInt(n.slice(0, 2), 16) / 255;
  const g = parseInt(n.slice(2, 4), 16) / 255;
  const b = parseInt(n.slice(4, 6), 16) / 255;
  return [Number.isFinite(r) ? r : 1, Number.isFinite(g) ? g : 1, Number.isFinite(b) ? b : 1];
}

/** Center of a polydata's bounding box, in its own coordinates. */
export function polyDataCenter(pd: any): [number, number, number] {
  const b = pd.getBounds(); // [xmin,xmax,ymin,ymax,zmin,zmax]
  return [(b[0] + b[1]) / 2, (b[2] + b[3]) / 2, (b[4] + b[5]) / 2];
}

/**
 * World-space triangle soup [ax,ay,az, bx,by,bz, cx,cy,cz, …] for a scan,
 * with `transform` (its userMatrix) applied. Polygons are fan-triangulated.
 * Used for ray-cast landmark picking on the 3D surface.
 */
export function scanTriangleSoupWorld(id: string, transform: number[]): Float32Array | null {
  const pd = registry.get(id);
  if (!pd) return null;
  const pts = pd.getPoints()?.getData();
  const polys = pd.getPolys()?.getData();
  if (!pts || !polys) return null;

  const nPts = pts.length / 3;
  const wpts = new Float32Array(pts.length);
  for (let i = 0; i < nPts; i++) {
    const p = applyMat4(transform, [pts[3 * i], pts[3 * i + 1], pts[3 * i + 2]]);
    wpts[3 * i] = p[0]; wpts[3 * i + 1] = p[1]; wpts[3 * i + 2] = p[2];
  }

  const tris: number[] = [];
  let i = 0;
  while (i < polys.length) {
    const n = polys[i++];
    if (n < 3) { i += n; continue; }
    const i0 = polys[i];
    for (let k = 1; k < n - 1; k++) {
      const b = polys[i + k], c = polys[i + k + 1];
      tris.push(
        wpts[3 * i0], wpts[3 * i0 + 1], wpts[3 * i0 + 2],
        wpts[3 * b], wpts[3 * b + 1], wpts[3 * b + 2],
        wpts[3 * c], wpts[3 * c + 1], wpts[3 * c + 2],
      );
    }
    i += n;
  }
  return new Float32Array(tris);
}

/** Build a vtk actor for a scan mesh with color / opacity / transform. */
export function buildScanActor(pd: any, colorHex: string, opacity: number, transform: number[]): any {
  const mapper = vtkMapper.newInstance();
  mapper.setScalarVisibility(false);
  mapper.setInputData(pd);

  const actor = vtkActor.newInstance();
  actor.setMapper(mapper);
  const prop = actor.getProperty();
  const [r, g, b] = hexToRgb(colorHex);
  prop.setColor(r, g, b);
  prop.setOpacity(opacity);
  if (transform && transform.length === 16) actor.setUserMatrix(transform);
  return actor;
}
