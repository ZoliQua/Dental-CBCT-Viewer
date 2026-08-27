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

  prop.setRGBTransferFunction(0, ctf);
  prop.setScalarOpacity(0, otf);
  prop.setScalarOpacityUnitDistance(0, 1.5);
  prop.setInterpolationTypeToLinear();
  prop.setShade(false);              // no surface shading → translucent, X-ray-like
  prop.setUseGradientOpacity(0, false);
}
