/**
 * Binary STL serialization of an indexed triangle mesh — pure, no vtk. Each
 * triangle gets a computed facet normal. Layout per the STL binary spec:
 * 80-byte header, uint32 triangle count, then 50 bytes per triangle.
 */

import type { TriMesh } from './guideGeom';

export function triMeshToBinarySTL(mesh: TriMesh): ArrayBuffer {
  const idx = mesh.indices;
  const p = mesh.positions;
  const nTri = idx.length / 3;

  const buf = new ArrayBuffer(84 + nTri * 50);
  const view = new DataView(buf);

  // 80-byte header (zeroed) + triangle count
  view.setUint32(80, nTri, true);

  let o = 84;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3;
    const b = idx[t + 1] * 3;
    const c = idx[t + 2] * 3;
    const ax = p[a], ay = p[a + 1], az = p[a + 2];
    const bx = p[b], by = p[b + 1], bz = p[b + 2];
    const cx = p[c], cy = p[c + 1], cz = p[c + 2];

    // Facet normal = normalize((b−a) × (c−a))
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl; ny /= nl; nz /= nl;

    view.setFloat32(o, nx, true); view.setFloat32(o + 4, ny, true); view.setFloat32(o + 8, nz, true);
    view.setFloat32(o + 12, ax, true); view.setFloat32(o + 16, ay, true); view.setFloat32(o + 20, az, true);
    view.setFloat32(o + 24, bx, true); view.setFloat32(o + 28, by, true); view.setFloat32(o + 32, bz, true);
    view.setFloat32(o + 36, cx, true); view.setFloat32(o + 40, cy, true); view.setFloat32(o + 44, cz, true);
    view.setUint16(o + 48, 0, true); // attribute byte count
    o += 50;
  }
  return buf;
}
