/**
 * Dental arch curve math — CatmullRom spline interpolation,
 * default arch generation, normals & arc-lengths.
 */

type Point2 = [number, number];

// ── Catmull-Rom spline ─────────────────────────────────────────

function catmullRom(p0: Point2, p1: Point2, p2: Point2, p3: Point2, t: number): Point2 {
  const t2 = t * t;
  const t3 = t2 * t;
  return [
    0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
    0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
  ];
}

/**
 * Interpolate control points through a Catmull-Rom spline.
 * Returns a dense polyline in the same coordinate space.
 */
export function interpolateArchCurve(controlPoints: Point2[], samplesPerSegment = 50): Point2[] {
  const n = controlPoints.length;
  if (n < 2) return [...controlPoints];

  const result: Point2[] = [];
  for (let i = 0; i < n - 1; i++) {
    const p0 = controlPoints[Math.max(0, i - 1)];
    const p1 = controlPoints[i];
    const p2 = controlPoints[i + 1];
    const p3 = controlPoints[Math.min(n - 1, i + 2)];
    for (let s = 0; s < samplesPerSegment; s++) {
      result.push(catmullRom(p0, p1, p2, p3, s / samplesPerSegment));
    }
  }
  result.push(controlPoints[n - 1]);
  return result;
}

// ── Normals ────────────────────────────────────────────────────

/**
 * Compute unit normals perpendicular to the curve at each point.
 * The normal is rotated 90 ° CW from the tangent in the XY plane.
 */
export function computeCurveNormals(curve: Point2[]): Point2[] {
  // M3: degenerate (<2-point) curve — no tangent is defined, and the branches
  // below would dereference a missing neighbor. Return a default normal per
  // point so CPR / cross-section sampling never throws.
  if (curve.length < 2) return curve.map((): Point2 => [0, 1]);
  return curve.map((_, i, arr) => {
    let tx: number, ty: number;
    if (i === 0) {
      tx = arr[1][0] - arr[0][0];
      ty = arr[1][1] - arr[0][1];
    } else if (i === arr.length - 1) {
      tx = arr[i][0] - arr[i - 1][0];
      ty = arr[i][1] - arr[i - 1][1];
    } else {
      tx = arr[i + 1][0] - arr[i - 1][0];
      ty = arr[i + 1][1] - arr[i - 1][1];
    }
    const len = Math.hypot(tx, ty);
    // Coincident neighbors (zero-length tangent) → default normal
    if (len === 0) return [0, 1];
    return [-ty / len, tx / len];
  });
}

// ── Arc length ─────────────────────────────────────────────────

export function totalArcLength(curve: Point2[]): number {
  let len = 0;
  for (let i = 1; i < curve.length; i++) {
    len += Math.hypot(curve[i][0] - curve[i - 1][0], curve[i][1] - curve[i - 1][1]);
  }
  return len;
}

// ── Arc-length reparameterization ──────────────────────────────

/**
 * Resample a polyline so that points are uniformly spaced by arc length.
 * This eliminates distortion caused by uneven control point spacing.
 */
export function resampleByArcLength(curve: Point2[], numSamples: number): Point2[] {
  if (curve.length < 2 || numSamples < 2) return [...curve];

  // Cumulative arc lengths
  const cumLen = [0];
  for (let i = 1; i < curve.length; i++) {
    cumLen.push(cumLen[i - 1] + Math.hypot(
      curve[i][0] - curve[i - 1][0],
      curve[i][1] - curve[i - 1][1],
    ));
  }
  const total = cumLen[cumLen.length - 1];
  if (total === 0) return [curve[0]];

  const result: Point2[] = [];
  let seg = 0;

  for (let s = 0; s < numSamples; s++) {
    const target = (s / (numSamples - 1)) * total;

    // Advance to the segment containing this arc length
    while (seg < curve.length - 2 && cumLen[seg + 1] < target) seg++;

    const segStart = cumLen[seg];
    const segLen = cumLen[seg + 1] - segStart;
    const t = segLen > 0 ? (target - segStart) / segLen : 0;

    result.push([
      curve[seg][0] + t * (curve[seg + 1][0] - curve[seg][0]),
      curve[seg][1] + t * (curve[seg + 1][1] - curve[seg][1]),
    ]);
  }

  return result;
}

// ── Default dental arch ────────────────────────────────────────

/**
 * Generate a default U-shaped dental arch centered on `center` with
 * approximate extent given by `size` (the usable volume size in XY).
 */
export function generateDefaultArchCurve(
  center: Point2,
  size: Point2,
): Point2[] {
  const [cx, cy] = center;
  const sx = size[0] * 0.32;
  const sy = size[1] * 0.32;

  // 9 control points — horseshoe opening posteriorly (+Y in LPS)
  return [
    [cx - sx,          cy + sy * 0.85],   // right wisdom / posterior molar
    [cx - sx * 0.97,   cy + sy * 0.35],   // right molar
    [cx - sx * 0.85,   cy - sy * 0.20],   // right premolar
    [cx - sx * 0.55,   cy - sy * 0.70],   // right canine
    [cx,               cy - sy],           // front incisors (most anterior)
    [cx + sx * 0.55,   cy - sy * 0.70],   // left canine
    [cx + sx * 0.85,   cy - sy * 0.20],   // left premolar
    [cx + sx * 0.97,   cy + sy * 0.35],   // left molar
    [cx + sx,          cy + sy * 0.85],   // left wisdom / posterior molar
  ];
}

// ── Parallel offset curves (for slab-width visualisation) ──────

export function offsetCurve(curve: Point2[], normals: Point2[], distance: number): Point2[] {
  return curve.map((p, i) => [
    p[0] + normals[i][0] * distance,
    p[1] + normals[i][1] * distance,
  ]);
}
