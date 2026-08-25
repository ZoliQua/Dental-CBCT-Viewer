/**
 * 3D slice-plane actors — the orthogonal CT slices rendered as textured plane
 * meshes inside the Cornerstone VOLUME_3D scene (voxel-viewer style
 * "intersecting plains").
 *
 * IMPORTANT: these are ordinary textured vtkActor meshes (same pipeline as the
 * implant meshes), NOT vtkImageSlice. An ImageSlice added to the VOLUME_3D
 * volume-rendering viewport stalls the ray-caster and freezes the UI; a plane
 * mesh with a canvas texture renders safely alongside the volume.
 */

import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkPlaneSource from '@kitware/vtk.js/Filters/Sources/PlaneSource';
import vtkTexture from '@kitware/vtk.js/Rendering/Core/Texture';

export type SliceAxis = 'AXIAL' | 'SAGITTAL' | 'CORONAL';

export const SLICE_AXES: SliceAxis[] = ['AXIAL', 'SAGITTAL', 'CORONAL'];

/** Slice-plane opacity in the 3D scene (semi-transparent so the volume shows through). */
export const SLICE_OPACITY = 0.7;

export interface VOI { wc: number; ww: number }

export interface VolumeInfo {
  /** Voxel accessor (i, j, k) — from Cornerstone's voxelManager (v2). */
  getVoxel: (i: number, j: number, k: number) => number;
  dims: [number, number, number];
  spacing: [number, number, number];
  origin: [number, number, number];
}

/** Middle slice index of the volume along an axis. */
export function centerSliceIndex(vi: VolumeInfo, axis: SliceAxis): number {
  const n = axis === 'AXIAL' ? vi.dims[2] : axis === 'SAGITTAL' ? vi.dims[0] : vi.dims[1];
  return Math.floor(n / 2);
}

/** Slice index nearest a world point along an axis (clamped to the volume). */
export function sliceIndexAtWorld(vi: VolumeInfo, axis: SliceAxis, p: [number, number, number]): number {
  const a = axis === 'AXIAL' ? 2 : axis === 'SAGITTAL' ? 0 : 1;
  const n = vi.dims[a];
  const idx = Math.round((p[a] - vi.origin[a]) / (vi.spacing[a] || 1));
  return idx < 0 ? 0 : idx > n - 1 ? n - 1 : idx;
}

/** RGBA canvas of one orthogonal slice, window/leveled to 8-bit grayscale. */
function sliceCanvas(vi: VolumeInfo, axis: SliceAxis, index: number, voi: VOI): HTMLCanvasElement {
  const [nx, ny, nz] = vi.dims;
  const g = vi.getVoxel;
  const lo = voi.wc - voi.ww / 2;
  const scale = 255 / (voi.ww || 1);

  let w: number, h: number, at: (u: number, v: number) => number;
  if (axis === 'AXIAL') {
    w = nx; h = ny; at = (u, v) => g(u, v, index);
  } else if (axis === 'SAGITTAL') {
    w = ny; h = nz; at = (u, v) => g(index, u, v);
  } else {
    w = nx; h = nz; at = (u, v) => g(u, index, v);
  }

  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let v = 0; v < h; v++) {
    for (let u = 0; u < w; u++) {
      let g = (at(u, v) - lo) * scale;
      g = g < 0 ? 0 : g > 255 ? 255 : g;
      const p = (v * w + u) * 4;
      d[p] = d[p + 1] = d[p + 2] = g;
      d[p + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** World corners of the slice plane (origin, point1 = u-axis, point2 = v-axis). */
function planeCorners(vi: VolumeInfo, axis: SliceAxis, index: number) {
  const [ox, oy, oz] = vi.origin;
  const [sx, sy, sz] = vi.spacing;
  const [nx, ny, nz] = vi.dims;
  const xMax = ox + (nx - 1) * sx;
  const yMax = oy + (ny - 1) * sy;
  const zMax = oz + (nz - 1) * sz;
  if (axis === 'AXIAL') {
    const z = oz + index * sz;
    return { origin: [ox, oy, z], point1: [xMax, oy, z], point2: [ox, yMax, z] };
  }
  if (axis === 'SAGITTAL') {
    const x = ox + index * sx;
    return { origin: [x, oy, oz], point1: [x, yMax, oz], point2: [x, oy, zMax] };
  }
  const y = oy + index * sy;
  return { origin: [ox, y, oz], point1: [xMax, y, oz], point2: [ox, y, zMax] };
}

/** Build a textured plane-mesh actor for one orthogonal slice at `index`. */
export function buildSliceActor(vi: VolumeInfo, axis: SliceAxis, index: number, voi: VOI): any {
  const c = planeCorners(vi, axis, index);
  const plane = vtkPlaneSource.newInstance({ xResolution: 1, yResolution: 1 });
  plane.setOrigin(c.origin as any);
  plane.setPoint1(c.point1 as any);
  plane.setPoint2(c.point2 as any);

  const mapper = vtkMapper.newInstance();
  mapper.setInputConnection(plane.getOutputPort());
  mapper.setScalarVisibility(false);

  const texture = vtkTexture.newInstance();
  texture.setInterpolate(true);
  texture.setImage(sliceCanvas(vi, axis, index, voi));

  const actor = vtkActor.newInstance();
  actor.setMapper(mapper);
  actor.addTexture(texture);
  const prop = actor.getProperty();
  prop.setAmbient(1);   // show raw texture colors, unaffected by scene lighting
  prop.setDiffuse(0);
  prop.setOpacity(SLICE_OPACITY); // semi-transparent so the volume shows through
  return actor;
}
