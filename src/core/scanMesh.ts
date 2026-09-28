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
import { buildTriangleBVH, slicePlaneBVH, type TriangleBVH } from './meshSlice';
import type { Vec3 } from './implantGeometry';

// id → vtkPolyData (kept here, not in state/JSON — meshes are large)
const registry = new Map<string, any>();

// id → cached world soup + BVH for slicing, keyed by the transform that built
// it. The plane is scrubbed far more often than the scan is re-registered, so
// this rebuilds the O(n) world soup + tree only when the transform changes.
const sliceCache = new Map<string, { key: string; soup: Float32Array; bvh: TriangleBVH }>();

// id → the transform the scan arrived with (import placement or the sample's
// baked registration), so a manual correction can always be undone.
const baseTransforms = new Map<string, number[]>();

export const getScanPolyData = (id: string): any | null => registry.get(id) ?? null;
export const setScanPolyData = (id: string, pd: any): void => { registry.set(id, pd); };
export const removeScanPolyData = (id: string): void => { registry.delete(id); sliceCache.delete(id); baseTransforms.delete(id); meshInfo.delete(id); };
export const setScanBaseTransform = (id: string, m: number[]): void => { baseTransforms.set(id, m.slice()); };
export const getScanBaseTransform = (id: string): number[] | null => baseTransforms.get(id) ?? null;
export const hasScanPolyData = (id: string): boolean => registry.has(id);

/** Empty the whole scan-mesh registry (e.g. when the session is purged). */
export function clearScanRegistry(): void {
  registry.clear();
  sliceCache.clear();
  baseTransforms.clear();
  meshInfo.clear();
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

/**
 * Parse mesh bytes into vtkPolyData, choosing the reader by file extension.
 * Returns null when the format is unreadable or the mesh comes back empty.
 */
export function parseScanMesh(fileName: string, buffer: ArrayBuffer): any | null {
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  try {
    let pd: any = null;
    if (ext === 'obj') {
      const reader = vtkOBJReader.newInstance();
      reader.parseAsText(new TextDecoder().decode(buffer));
      pd = reader.getOutputData(0);
    } else if (ext === 'ply') {
      const reader = vtkPLYReader.newInstance();
      reader.parseAsArrayBuffer(buffer);
      pd = reader.getOutputData(0);
    } else {
      // Default: STL (binary via ArrayBuffer, fall back to ASCII text)
      const reader = vtkSTLReader.newInstance();
      reader.parseAsArrayBuffer(buffer);
      pd = reader.getOutputData(0);
      if (!pd || pd.getNumberOfPoints() === 0) {
        const alt = vtkSTLReader.newInstance();
        alt.parseAsText(new TextDecoder().decode(buffer));
        pd = alt.getOutputData(0);
      }
    }
    if (!pd || pd.getNumberOfPoints() === 0) return null;
    const warning = meshScaleWarning(pd);
    if (warning) console.warn(`[DQ-DICOM] Scan mesh "${fileName}": ${warning}`);
    return pd;
  } catch {
    return null;
  }
}

/** Read a mesh file into vtkPolyData by extension. Returns null on failure. */
export async function loadScanPolyData(file: File): Promise<any | null> {
  try {
    return parseScanMesh(file.name, await file.arrayBuffer());
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

/**
 * World-space contour of a scan cut by a plane, using a cached BVH. Rebuilds the
 * world soup + tree only when `transform` changes; otherwise a plane scrub only
 * traverses the tree (≈O(crossings)) — replacing the old rebuild-and-brute-force
 * per move. Returns [] if the mesh is not registered.
 */
export function sliceScanWorld(
  id: string,
  transform: number[],
  planePoint: Vec3,
  planeNormal: Vec3,
): [Vec3, Vec3][] {
  const key = transform.join(',');
  let entry = sliceCache.get(id);
  if (!entry || entry.key !== key) {
    const soup = scanTriangleSoupWorld(id, transform);
    if (!soup) { sliceCache.delete(id); return []; }
    entry = { key, soup, bvh: buildTriangleBVH(soup) };
    sliceCache.set(id, entry);
  }
  return slicePlaneBVH(entry.soup, entry.bvh, planePoint, planeNormal);
}

export interface ScanMeshInfo { points: number; triangles: number; extentMm: [number, number, number] }

// Counting triangles means walking the whole poly array — hundreds of thousands
// of entries for an arch scan. The geometry never changes once registered, so
// the answer is computed once instead of on every render of the series tree.
const meshInfo = new Map<string, ScanMeshInfo>();

/** Point/triangle counts and mm extent of a loaded mesh, for the series tree. */
export function scanMeshInfo(id: string): ScanMeshInfo | null {
  const cached = meshInfo.get(id);
  if (cached) return cached;
  const pd = registry.get(id);
  if (!pd) return null;
  const points = pd.getPoints?.()?.getNumberOfPoints?.() ?? 0;
  // vtk stores polys as [n, i0, i1, …] runs; each run of n is a fan of n − 2.
  const polys = pd.getPolys?.()?.getData?.();
  let triangles = 0;
  if (polys) {
    for (let i = 0; i < polys.length;) {
      const n = polys[i];
      // A malformed run has no trustworthy length to skip by; stop rather than
      // walk off into the indices and report a nonsense count.
      if (!Number.isFinite(n) || n < 3) break;
      triangles += n - 2;
      i += n + 1;
    }
  }
  const b = pd.getBounds?.();
  const info: ScanMeshInfo = {
    points,
    triangles,
    extentMm: b && b.length >= 6 ? [b[1] - b[0], b[3] - b[2], b[5] - b[4]] : [0, 0, 0],
  };
  meshInfo.set(id, info);
  return info;
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
