/**
 * Drill-guide CSG — assembles the printable guide from primitives via
 * manifold-3d Boolean operations:
 *
 *   guide = ( base_bar ∪ sleeve_housings ) − scan_solid − drill_channels
 *
 * The pure geometry lives in guideGeom.ts; this module binds it to the WASM
 * Boolean kernel. The scan subtraction is guarded: a non-watertight scan is
 * skipped with a warning so the sleeve frame still exports.
 */

import type { ManifoldToplevel } from 'manifold-3d';
import type { Vec3 } from './implantGeometry';
import type { Point2 } from './cprMath';
import { archFrameAt, nearestArchFrame } from './implantGeometry';
import { distSegmentToPolyline3 } from './safety';
import { cylinderMesh, sweptBarMesh, type TriMesh } from './guideGeom';
import type { GuideParams } from '@/types/dicom';

export type { GuideParams };

export interface GuideImplantInput {
  /** Platform center, world mm */
  entry: Vec3;
  /** Unit axis, entry → apex */
  axis: Vec3;
  length: number;
  sleeveDiameter: number;
  sleeveOffset: number;
  sleeveHeight: number;
}

export interface BuildGuideInput {
  controlPoints: Point2[];
  implants: GuideImplantInput[];
  /** World-space triangle soups (already transformed) to subtract as tissue */
  scanSoups: Float32Array[];
  params: GuideParams;
}

export interface BuildGuideResult {
  mesh: TriMesh;
  warnings: string[];
  stats: { volumeMm3: number; triangles: number };
}

// ── arch base centerline (pure, testable) ──────────────────────

/**
 * XY centerline for the base bar: the arch sampled over the guided implants'
 * `s`-span (+padding), lifted to `baseZ`. Pure — no WASM.
 */
export function planBaseCenterline(
  controlPoints: Point2[],
  entries: Vec3[],
  baseZ: number,
  padS = 0.03,
  samples = 40,
): Vec3[] {
  if (entries.length === 0) return [];
  let sMin = 1;
  let sMax = 0;
  for (const e of entries) {
    const af = nearestArchFrame(controlPoints, [e[0], e[1]]);
    if (!af) continue;
    sMin = Math.min(sMin, af.s);
    sMax = Math.max(sMax, af.s);
  }
  sMin = Math.max(0, sMin - padS);
  sMax = Math.min(1, sMax + padS);
  if (sMax <= sMin) sMax = Math.min(1, sMin + 1e-3);

  const pts: Vec3[] = [];
  for (let i = 0; i <= samples; i++) {
    const s = sMin + (sMax - sMin) * (i / samples);
    const af = archFrameAt(controlPoints, s);
    if (af) pts.push([af.point[0], af.point[1], baseZ]);
  }
  return pts;
}

// ── housing ↔ base connectivity (pure, testable) ───────────────

/**
 * A sleeve housing counts as connected to the base bar when its axis passes
 * within (housing radius + half the base cross-section) of the base
 * centerline AND the housing's Z span overlaps the base slab. Conservative
 * geometric stand-in for the exact Boolean-overlap check (the manifold WASM
 * kernel cannot run under unit tests); it catches housings that clearly miss
 * the bar — e.g. an implant placed far buccal of the arch.
 */
export function isHousingConnectedToBase(
  axisA: Vec3,
  axisB: Vec3,
  housingRadius: number,
  baseCenterline: Vec3[],
  baseWidthMm: number,
  baseHeightMm: number,
): boolean {
  if (baseCenterline.length < 2) return false;
  const baseZ = baseCenterline[0][2];
  const zMin = Math.min(axisA[2], axisB[2]);
  const zMax = Math.max(axisA[2], axisB[2]);
  if (zMax < baseZ - baseHeightMm / 2 || zMin > baseZ + baseHeightMm / 2) return false;
  const reach = housingRadius + Math.max(baseWidthMm, baseHeightMm) / 2;
  return distSegmentToPolyline3(axisA, axisB, baseCenterline) <= reach;
}

// ── WASM lifecycle ─────────────────────────────────────────────

let wasmPromise: Promise<ManifoldToplevel> | null = null;

/** Lazily initialize the manifold WASM kernel (cached across exports). */
export async function initManifold(): Promise<ManifoldToplevel> {
  if (!wasmPromise) {
    // Dynamic import so the heavy WASM kernel is only pulled in when a guide is
    // actually built — keeps `dental-cbct-viewer/core` light for callers that
    // only use the geometry/safety helpers.
    wasmPromise = (async () => {
      const [{ default: Module }, { default: wasmUrl }] = await Promise.all([
        import('manifold-3d'),
        import('manifold-3d/manifold.wasm?url'),
      ]);
      const m = await Module({ locateFile: () => wasmUrl });
      m.setup();
      return m;
    })();
  }
  return wasmPromise;
}

// ── conversions ────────────────────────────────────────────────

/** TriMesh → Manifold. Throws if the mesh is not an oriented 2-manifold. */
function triToManifold(wasm: ManifoldToplevel, tri: TriMesh): any {
  const mesh = new wasm.Mesh({
    numProp: 3,
    vertProperties: tri.positions,
    triVerts: tri.indices,
  });
  mesh.merge();
  return new wasm.Manifold(mesh); // throws on non-manifold input
}

function manifoldToTri(m: any): TriMesh {
  const mesh = m.getMesh();
  const np: number = mesh.numProp;
  const vp: Float32Array = mesh.vertProperties;
  const nVert = vp.length / np;
  let positions: Float32Array;
  if (np === 3) {
    positions = vp;
  } else {
    positions = new Float32Array(nVert * 3);
    for (let i = 0; i < nVert; i++) {
      positions[3 * i] = vp[np * i];
      positions[3 * i + 1] = vp[np * i + 1];
      positions[3 * i + 2] = vp[np * i + 2];
    }
  }
  return { positions, indices: mesh.triVerts as Uint32Array };
}

// ── the build ──────────────────────────────────────────────────

/**
 * Build the drill guide. Async (WASM). Guided implants only should be passed in.
 */
export async function buildDrillGuide(input: BuildGuideInput): Promise<BuildGuideResult> {
  const { controlPoints, implants, scanSoups, params } = input;
  const warnings: string[] = [];
  if (implants.length === 0) throw new Error('no-guided-implants');

  const wasm = await initManifold();
  const { Manifold } = wasm;
  const trash: any[] = []; // manifolds to free after getMesh
  const track = <T>(m: T): T => { trash.push(m); return m; };

  try {
    // 1) base bar along the arch, centered on the mean entry Z
    const baseZ = implants.reduce((s, i) => s + i.entry[2], 0) / implants.length;
    const centerline = planBaseCenterline(controlPoints, implants.map((i) => i.entry), baseZ);
    const solids: any[] = [];
    if (centerline.length >= 2) {
      solids.push(track(triToManifold(wasm, sweptBarMesh(centerline, params.baseWidthMm, params.baseHeightMm))));
    }

    // 2) sleeve housings (towers) + collect drill channels
    const channels: any[] = [];
    for (const imp of implants) {
      const { entry, axis } = imp;
      const at = (t: number): Vec3 => [entry[0] + axis[0] * t, entry[1] + axis[1] * t, entry[2] + axis[2] * t];
      const sleeveTop = -(imp.sleeveOffset + imp.sleeveHeight); // occlusal side (−axis)
      // Housing: from just past the platform (toward apex) up to the sleeve top.
      const housingRadius = imp.sleeveDiameter / 2 + params.wallMm;
      const housingBase = at(params.baseHeightMm);
      const housingTop = at(sleeveTop);
      const housing = cylinderMesh(
        housingBase,
        housingTop,
        housingRadius,
        params.segments,
      );
      // Clinical safeguard: a housing floating free of the base bar would
      // break off the printed guide.
      if (
        centerline.length >= 2 &&
        !isHousingConnectedToBase(housingBase, housingTop, housingRadius, centerline, params.baseWidthMm, params.baseHeightMm)
      ) {
        warnings.push('housing-disconnected');
      }
      solids.push(track(triToManifold(wasm, housing)));
      // Channel: full through-bore for the sleeve / drill.
      const channel = cylinderMesh(
        at(imp.length + 2),
        at(sleeveTop - 2),
        (imp.sleeveDiameter + params.channelTolMm) / 2,
        params.segments,
      );
      channels.push(track(triToManifold(wasm, channel)));
    }

    // 3) union frame, subtract channels
    let solid = track(Manifold.union(solids));
    solid = track(Manifold.difference([solid, ...channels]));

    // 4) subtract tissue (each registered scan), guarded
    for (let i = 0; i < scanSoups.length; i++) {
      const soup = scanSoups[i];
      if (!soup || soup.length < 9) continue;
      const nTri = Math.floor(soup.length / 9);
      const indices = new Uint32Array(nTri * 3);
      for (let k = 0; k < indices.length; k++) indices[k] = k;
      try {
        const scanMan = track(triToManifold(wasm, { positions: soup, indices }));
        solid = track(Manifold.difference([solid, scanMan]));
      } catch {
        warnings.push('scan-not-watertight');
      }
    }

    if (solid.isEmpty()) throw new Error('empty-result');
    const mesh = manifoldToTri(solid);
    const stats = { volumeMm3: solid.volume(), triangles: mesh.indices.length / 3 };
    // Copy out before freeing WASM memory (manifoldToTri may alias WASM buffers).
    const out: TriMesh = {
      positions: new Float32Array(mesh.positions),
      indices: new Uint32Array(mesh.indices),
    };
    return { mesh: out, warnings, stats };
  } finally {
    for (const m of trash) {
      try { m.delete?.(); } catch { /* already freed */ }
    }
  }
}
