/**
 * Pure triangle-mesh generators for the drill-guide body — no manifold/vtk
 * import, so the geometry is unit-testable. Every generator returns a closed,
 * consistently-oriented (outward CCW) indexed mesh, suitable to feed straight
 * into manifold-3d for the Boolean CSG.
 */

import type { Vec3 } from './implantGeometry';

export interface TriMesh {
  /** xyz per vertex, length 3·V */
  positions: Float32Array;
  /** 3 vertex indices per triangle, length 3·T */
  indices: Uint32Array;
}

// ── small vec helpers ──────────────────────────────────────────
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const len = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
const norm = (a: Vec3): Vec3 => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Any unit vector perpendicular to `w` (assumed unit). */
function anyPerp(w: Vec3): Vec3 {
  // Pick the axis least aligned with w to avoid a near-zero cross product.
  const ax: Vec3 = Math.abs(w[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  return norm(cross(w, ax));
}

/**
 * Mutable accumulator that emits an indexed mesh. Rings push their vertices,
 * then callers wire up triangles by absolute vertex index.
 */
class MeshBuilder {
  private pos: number[] = [];
  private idx: number[] = [];

  addVertex(p: Vec3): number {
    this.pos.push(p[0], p[1], p[2]);
    return this.pos.length / 3 - 1;
  }
  addTri(a: number, b: number, c: number): void {
    this.idx.push(a, b, c);
  }
  /** Quad a→b→c→d (CCW) as two triangles. */
  addQuad(a: number, b: number, c: number, d: number): void {
    this.idx.push(a, b, c, a, c, d);
  }
  build(): TriMesh {
    return { positions: new Float32Array(this.pos), indices: new Uint32Array(this.idx) };
  }
}

/**
 * Closed capped cylinder between world points `p0` and `p1` with `radius`.
 * `segments` (≥3) sets the angular tessellation. Outward-oriented.
 */
export function cylinderMesh(p0: Vec3, p1: Vec3, radius: number, segments = 48): TriMesh {
  const seg = Math.max(3, Math.floor(segments));
  const w = norm(sub(p1, p0)); // axis
  const u = anyPerp(w);
  const v = norm(cross(w, u)); // (u, v, w) right-handed
  const b = new MeshBuilder();

  const ring0: number[] = [];
  const ring1: number[] = [];
  for (let k = 0; k < seg; k++) {
    const t = (k / seg) * Math.PI * 2;
    const dx = Math.cos(t) * radius;
    const dy = Math.sin(t) * radius;
    const off: Vec3 = [u[0] * dx + v[0] * dy, u[1] * dx + v[1] * dy, u[2] * dx + v[2] * dy];
    ring0.push(b.addVertex([p0[0] + off[0], p0[1] + off[1], p0[2] + off[2]]));
    ring1.push(b.addVertex([p1[0] + off[0], p1[1] + off[1], p1[2] + off[2]]));
  }
  const c0 = b.addVertex(p0);
  const c1 = b.addVertex(p1);

  for (let k = 0; k < seg; k++) {
    const k1 = (k + 1) % seg;
    // Side: outward normal ≈ radial (proven for CCW ring around +w)
    b.addQuad(ring0[k], ring0[k1], ring1[k1], ring1[k]);
    // Top cap (normal +w): fan center1 → ring1
    b.addTri(c1, ring1[k], ring1[k1]);
    // Bottom cap (normal −w): fan center0 → ring0 reversed
    b.addTri(c0, ring0[k1], ring0[k]);
  }
  return b.build();
}

/**
 * Rectangular-section prism swept along `centerline` (≥2 world points). The
 * section is `width` wide (horizontal, perpendicular to the XY tangent) and
 * `height` tall (along world Z). End-capped, outward-oriented.
 */
export function sweptBarMesh(centerline: Vec3[], width: number, height: number): TriMesh {
  if (centerline.length < 2) return { positions: new Float32Array(), indices: new Uint32Array() };
  const halfW = width / 2;
  const halfH = height / 2;
  const Z: Vec3 = [0, 0, 1];
  const b = new MeshBuilder();

  // Per-ring corners in CCW order around the forward tangent: with
  // r = normalize(Z × tangent), (r, Z, tangent) is right-handed, so the order
  // A(−r,−Z) B(+r,−Z) C(+r,+Z) D(−r,+Z) is CCW as seen from +tangent.
  const rings: number[][] = [];
  const n = centerline.length;
  for (let i = 0; i < n; i++) {
    const prev = centerline[Math.max(0, i - 1)];
    const next = centerline[Math.min(n - 1, i + 1)];
    let f = norm(sub(next, prev));
    if (len(f) < 1e-9) f = [1, 0, 0];
    let r = cross(Z, f);
    if (len(r) < 1e-9) r = [1, 0, 0]; // tangent parallel to Z (degenerate)
    r = norm(r);
    const c = centerline[i];
    const corner = (sr: number, sz: number): Vec3 => [
      c[0] + r[0] * sr * halfW,
      c[1] + r[1] * sr * halfW,
      c[2] + sz * halfH,
    ];
    const A = b.addVertex(corner(-1, -1));
    const B = b.addVertex(corner(1, -1));
    const C = b.addVertex(corner(1, 1));
    const D = b.addVertex(corner(-1, 1));
    rings.push([A, B, C, D]);
  }

  // Sides: 4 quads between consecutive rings (same winding as the cylinder).
  for (let i = 0; i < n - 1; i++) {
    const a = rings[i];
    const d = rings[i + 1];
    for (let k = 0; k < 4; k++) {
      const k1 = (k + 1) % 4;
      b.addQuad(a[k], a[k1], d[k1], d[k]);
    }
  }
  // Start cap (normal −tangent): reversed order.
  const s = rings[0];
  b.addQuad(s[0], s[3], s[2], s[1]);
  // End cap (normal +tangent): forward order.
  const e = rings[n - 1];
  b.addQuad(e[0], e[1], e[2], e[3]);

  return b.build();
}

/**
 * Signed volume of an indexed mesh via the divergence theorem (Σ of signed
 * tetrahedra from the origin). Positive for a closed, outward-oriented mesh.
 * Used by tests; also a cheap sanity gauge.
 */
export function meshVolume(m: TriMesh): number {
  const p = m.positions;
  const idx = m.indices;
  let vol = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3;
    const b = idx[t + 1] * 3;
    const c = idx[t + 2] * 3;
    const ax = p[a], ay = p[a + 1], az = p[a + 2];
    const bx = p[b], by = p[b + 1], bz = p[b + 2];
    const cx = p[c], cy = p[c + 1], cz = p[c + 2];
    vol += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  return vol;
}

/**
 * True iff every directed edge appears exactly once — i.e. the mesh is a
 * closed, consistently-oriented 2-manifold (the precondition manifold-3d needs).
 */
export function isClosedOriented(m: TriMesh): boolean {
  const seen = new Map<string, number>();
  const idx = m.indices;
  for (let t = 0; t < idx.length; t += 3) {
    const tri = [idx[t], idx[t + 1], idx[t + 2]];
    for (let k = 0; k < 3; k++) {
      const a = tri[k];
      const bb = tri[(k + 1) % 3];
      seen.set(`${a}_${bb}`, (seen.get(`${a}_${bb}`) ?? 0) + 1);
    }
  }
  for (const [key, count] of seen) {
    if (count !== 1) return false; // directed edge repeated → non-manifold/flipped
    const [a, bb] = key.split('_');
    if ((seen.get(`${bb}_${a}`) ?? 0) !== 1) return false; // opposite half-edge missing → open
  }
  return true;
}

// ── sleeve seat (stepped bore for a metal drill sleeve) ────────

/** Cylinder segment: axis endpoints + radius. */
export interface BoreCylinder { a: Vec3; b: Vec3; radius: number; }

export interface SleeveSeatPlan {
  /** Wide pocket the metal sleeve drops into (from the occlusal opening down). */
  seat: BoreCylinder;
  /** Narrow drill channel below the seat, continuing toward the apex. */
  channel: BoreCylinder;
  /** Housing outer radius (wall around the seat). */
  housingRadius: number;
  /** Axis parameter (mm from entry, +apical) of the seat floor the sleeve rests on. */
  shoulderT: number;
}

export interface SleeveSeatParams {
  wallMm: number;
  seatClearanceMm: number;
  sleeveWallMm: number;
  channelTolMm: number;
}

/**
 * Plan a stepped sleeve seat along an implant axis so the printed guide accepts
 * a real metal drill sleeve of outer diameter `sleeveOuterDiameter`:
 *
 *   ── occlusal opening ──┐  seat  Ø = outer + 2·clearance   (depth = sleeveHeight)
 *          shoulder  ─────┤  ← the sleeve rests here (repeatable drill stop)
 *                         │  channel  Ø = (outer − 2·sleeveWall) + 2·channelTol
 *                        apex
 *
 * `at(t) = entry + axis·t`; the sleeve occupies the occlusal region (negative t,
 * above the platform). Pure — no WASM.
 */
export function planSleeveSeat(
  entry: Vec3,
  axis: Vec3,
  implantLength: number,
  sleeveOuterDiameter: number,
  sleeveOffset: number,
  sleeveHeight: number,
  p: SleeveSeatParams,
): SleeveSeatPlan {
  const at = (t: number): Vec3 => [entry[0] + axis[0] * t, entry[1] + axis[1] * t, entry[2] + axis[2] * t];
  const OVERSHOOT = 2; // break the occlusal surface so the pocket opens cleanly

  const sleeveTop = -(sleeveOffset + sleeveHeight); // most occlusal
  const sleeveBottom = -sleeveOffset;               // seat floor / shoulder
  const seatRadius = sleeveOuterDiameter / 2 + p.seatClearanceMm;
  const innerDiameter = Math.max(0.5, sleeveOuterDiameter - 2 * p.sleeveWallMm);
  const channelRadius = innerDiameter / 2 + p.channelTolMm;

  return {
    seat: { a: at(sleeveTop - OVERSHOOT), b: at(sleeveBottom), radius: seatRadius },
    channel: { a: at(implantLength + 2), b: at(sleeveTop - OVERSHOOT), radius: channelRadius },
    housingRadius: seatRadius + p.wallMm,
    shoulderT: sleeveBottom,
  };
}
