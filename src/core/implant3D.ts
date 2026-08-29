/**
 * Builds vtk.js mesh actors for an implant in the 3D volume scene: the implant
 * body (tapered tube following the threaded silhouette), the guided drill
 * sleeve, and the implant axis. Geometry is generated directly in world mm, so
 * the actors drop straight into the Cornerstone VOLUME_3D renderer with no
 * orientation matrix — they sit in the bone exactly where the 2D views show
 * them, giving true spatial perception when the volume is rotated.
 */

import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkTubeFilter from '@kitware/vtk.js/Filters/General/TubeFilter';
import { radiusProfile, type Vec3 } from './implantGeometry';

// VaryRadius.VARY_RADIUS_BY_ABSOLUTE_SCALAR (Constants.js ships no .d.ts, and
// TubeFilter does not re-export the enum at runtime → use the literal value).
// With base radius 1 the tube radius at each point equals its scalar (mm).
const VARY_RADIUS_BY_ABSOLUTE_SCALAR = 3;

type RGB = [number, number, number];

function lerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** A capped tube through `points` with per-point radius (mm), as a vtk actor.
 *  Pass `edgeColor` to draw a thin defining outline (used for the drill sleeve
 *  so it reads as a distinct object against the translucent volume). */
function tubeActor(points: Vec3[], radii: number[], color: RGB, opacity: number, sides = 24, edgeColor?: RGB, capping = true): any {
  const n = points.length;
  const pd = vtkPolyData.newInstance();

  const pts = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pts[3 * i] = points[i][0];
    pts[3 * i + 1] = points[i][1];
    pts[3 * i + 2] = points[i][2];
  }
  pd.getPoints().setData(pts, 3);

  const lines = new Uint32Array(n + 1);
  lines[0] = n;
  for (let i = 0; i < n; i++) lines[i + 1] = i;
  pd.getLines().setData(lines);

  pd.getPointData().setScalars(
    vtkDataArray.newInstance({ name: 'radius', values: Float32Array.from(radii) }),
  );

  const tube = vtkTubeFilter.newInstance({ capping, numberOfSides: sides, radius: 1 });
  tube.setVaryRadius(VARY_RADIUS_BY_ABSOLUTE_SCALAR);
  tube.setInputData(pd);

  const mapper = vtkMapper.newInstance();
  mapper.setScalarVisibility(false);
  mapper.setInputConnection(tube.getOutputPort());

  const actor = vtkActor.newInstance();
  actor.setMapper(mapper);
  const prop = actor.getProperty();
  prop.setColor(color[0], color[1], color[2]);
  prop.setOpacity(opacity);
  if (edgeColor) {
    prop.setEdgeVisibility(true);
    prop.setEdgeColor(edgeColor[0], edgeColor[1], edgeColor[2]);
    prop.setLineWidth(1);
  }
  return actor;
}

function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '');
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const r = parseInt(n.slice(0, 2), 16) / 255;
  const g = parseInt(n.slice(2, 4), 16) / 255;
  const b = parseInt(n.slice(4, 6), 16) / 255;
  return [Number.isFinite(r) ? r : 1, Number.isFinite(g) ? g : 0, Number.isFinite(b) ? b : 0];
}

/** Constant-radius tube actor for an anatomy polyline (nerve / sinus). */
export function buildAnatomyTube(points: Vec3[], radiusMm: number, colorHex: string, opacity = 0.5): any | null {
  if (points.length < 2) return null;
  return tubeActor(points, points.map(() => radiusMm), hexToRgb(colorHex), opacity, 16);
}

export interface Implant3DSleeve {
  diameter: number;
  offset: number;
  height: number;
}

export interface Implant3DInput {
  entry: Vec3;
  axis: Vec3; // unit, toward apex
  diameter: number;
  length: number;
  active: boolean;
  sleeve?: Implant3DSleeve;
}

export interface Implant3DLayers {
  implant: boolean;
  sleeve: boolean;
  axis: boolean;
}

/** Build the set of {key, actor} for one implant per the enabled 3D layers. */
export function buildImplantActors(
  imp: Implant3DInput,
  layers: Implant3DLayers,
): { key: string; actor: any }[] {
  const out: { key: string; actor: any }[] = [];
  const color: RGB = imp.active ? [1, 0.78, 0] : [0, 0.7, 1];
  const { axis: a } = imp;
  const apex: Vec3 = [
    imp.entry[0] + a[0] * imp.length,
    imp.entry[1] + a[1] * imp.length,
    imp.entry[2] + a[2] * imp.length,
  ];

  if (layers.implant) {
    const N = 18;
    const pts: Vec3[] = [];
    const radii: number[] = [];
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      pts.push(lerp(imp.entry, apex, t));
      radii.push(Math.max(0.08, (imp.diameter / 2) * radiusProfile(t)));
    }
    out.push({ key: 'body', actor: tubeActor(pts, radii, color, 0.6) });
  }

  if (layers.axis) {
    const back: Vec3 = [imp.entry[0] - a[0] * 3, imp.entry[1] - a[1] * 3, imp.entry[2] - a[2] * 3];
    const tip: Vec3 = [apex[0] + a[0] * 2, apex[1] + a[1] * 2, apex[2] + a[2] * 2];
    out.push({
      key: 'axis',
      actor: tubeActor([back, tip], [0.15, 0.15], imp.active ? [1, 0.9, 0.4] : [0.6, 0.85, 1], 0.9, 8),
    });
  }

  if (layers.sleeve && imp.sleeve) {
    const back = imp.sleeve.offset + imp.sleeve.height;
    const top: Vec3 = [imp.entry[0] - a[0] * back, imp.entry[1] - a[1] * back, imp.entry[2] - a[2] * back];
    const bot: Vec3 = [
      imp.entry[0] - a[0] * imp.sleeve.offset,
      imp.entry[1] - a[1] * imp.sleeve.offset,
      imp.entry[2] - a[2] * imp.sleeve.offset,
    ];
    const r = imp.sleeve.diameter / 2;
    // Open-ended (uncapped), smooth translucent tube → a clean hollow drill
    // sleeve you can see through (no facet edges, which read as ribbing).
    out.push({ key: 'sleeve', actor: tubeActor([top, bot], [r, r], [0.5, 0.92, 0.6], 0.45, 40, undefined, false) });
  }

  return out;
}
