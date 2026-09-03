/**
 * Custom "X-ray" translucent transfer function for the 3D volume — an
 * alternative to Cornerstone's opaque shaded presets (CT-Bone, …).
 *
 * The voxel-viewer look comes from a MIP / attenuation render: no surface
 * shading and no opacity occlusion, so bone stays see-through. We approximate it
 * in Cornerstone by disabling shading and using a low, linear opacity ramp
 * driven by the window/level, instead of a dense surface transfer function.
 */

import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import vtkPiecewiseFunction from '@kitware/vtk.js/Common/DataModel/PiecewiseFunction';

export const XRAY_PRESET_ID = 'X-Ray';

// ── 3D render quality (volume-mapper sample distance) ──────────────
export type Volume3DQuality = 'low' | 'medium' | 'high';

// World-mm sample distance: smaller = finer sampling = higher quality (slower).
const SAMPLE_DISTANCE: Record<Volume3DQuality, number> = { low: 1.6, medium: 0.7, high: 0.3 };
const MAX_SAMPLES: Record<Volume3DQuality, number> = { low: 2000, medium: 4000, high: 8000 };

/** Set the volume mapper's sampling density → a real low/medium/high quality difference. */
export function applyQuality3D(actor: any, quality: Volume3DQuality): void {
  const mapper = actor?.getMapper?.();
  if (!mapper) return;
  // Auto-adjust would override our fixed distance while interacting → turn it off.
  mapper.setAutoAdjustSampleDistances?.(false);
  mapper.setSampleDistance?.(SAMPLE_DISTANCE[quality]);
  mapper.setMaximumSamplesPerRay?.(MAX_SAMPLES[quality]);
}

// ── 3D colormaps (RGB transfer function overriding a preset's hue) ──
export type Volume3DColormap = 'grayscale' | 'cool' | 'warm' | 'spectral' | 'inverted';

export const VOLUME_3D_COLORMAPS: Volume3DColormap[] = ['grayscale', 'cool', 'warm', 'spectral', 'inverted'];

// Colour stops as [t, r, g, b] with t in 0..1 across the window (lo → hi).
const COLORMAPS: Record<Volume3DColormap, [number, number, number, number][]> = {
  grayscale: [[0, 0, 0, 0], [1, 1, 1, 1]],
  inverted: [[0, 1, 1, 1], [1, 0, 0, 0]],
  cool: [[0, 0.03, 0.08, 0.35], [0.5, 0.2, 0.6, 0.9], [1, 0.85, 1, 1]],
  warm: [[0, 0.1, 0.02, 0], [0.4, 0.7, 0.2, 0.05], [0.72, 1, 0.6, 0.12], [1, 1, 1, 0.85]],
  spectral: [[0, 0.15, 0.1, 0.5], [0.25, 0.1, 0.55, 0.9], [0.5, 0.1, 0.8, 0.35], [0.75, 0.95, 0.85, 0.12], [1, 0.9, 0.15, 0.1]],
};

/** Override the volume's RGB transfer function with a colormap across the W/L window. */
export function applyColormap3D(actor: any, colormap: Volume3DColormap, wl: { wc: number; ww: number }): void {
  if (!actor) return;
  const prop = actor.getProperty();
  const lo = wl.wc - wl.ww / 2;
  const hi = wl.wc + wl.ww / 2;
  const ctf = vtkColorTransferFunction.newInstance();
  for (const [tt, r, g, b] of COLORMAPS[colormap]) ctf.addRGBPoint(lo + (hi - lo) * tt, r, g, b);
  prop.setRGBTransferFunction(0, ctf);
}

/** Apply preset (opacity/shape) + colormap (hue) + quality (sampling) to a VOLUME_3D viewport. */
export function applyVolumeStyle(
  viewport: any,
  opts: { preset: string; colormap: Volume3DColormap; quality: Volume3DQuality; wl: { wc: number; ww: number } },
): void {
  const { preset, colormap, quality, wl } = opts;
  if (preset === XRAY_PRESET_ID) {
    applyXrayPreset(viewport.getDefaultActor?.()?.actor, wl);
  } else {
    viewport.setProperties({ preset });
  }
  const actor = viewport.getDefaultActor?.()?.actor;
  applyColormap3D(actor, colormap, wl);
  applyQuality3D(actor, quality);
  viewport.render();
}

/**
 * Apply the translucent X-ray transfer function to a vtk volume actor, mapping
 * the window/level (HU) range to a soft grayscale, low-opacity ramp.
 * `maxOpacity` (0.05–0.5) controls how solid the densest tissue looks.
 */
export function applyXrayPreset(actor: any, wl: { wc: number; ww: number }, maxOpacity = 0.2): void {
  if (!actor) return;
  const prop = actor.getProperty();
  const lo = wl.wc - wl.ww / 2;
  const hi = wl.wc + wl.ww / 2;

  const ctf = vtkColorTransferFunction.newInstance();
  ctf.addRGBPoint(lo, 0, 0, 0);
  ctf.addRGBPoint(hi, 1, 1, 1);

  const otf = vtkPiecewiseFunction.newInstance();
  otf.addPoint(lo, 0);
  otf.addPoint(lo + (hi - lo) * 0.5, maxOpacity * 0.3);
  otf.addPoint(hi, maxOpacity);
  // Emphasize the densest structures (metal fillings, root-canal fillings,
  // implants) beyond the bone window so they stand out instead of clamping to
  // the same opacity as dense bone.
  otf.addPoint(hi + (hi - lo) * 0.8, Math.min(0.9, maxOpacity * 2.4));

  prop.setRGBTransferFunction(0, ctf);
  prop.setScalarOpacity(0, otf);
  prop.setScalarOpacityUnitDistance(0, 1.5);
  prop.setInterpolationTypeToLinear();
  prop.setShade(false);              // no surface shading → translucent, X-ray-like
  prop.setUseGradientOpacity(0, false);
}
