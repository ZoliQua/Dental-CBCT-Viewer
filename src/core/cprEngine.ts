/**
 * CPR (Curved Planar Reformation) engine.
 * Generates a panoramic (OPG-like) 2D image from a CT volume
 * by sampling voxels along an arch curve.
 *
 * The pure sampling math lives in cprMath.ts (no Cornerstone dependency);
 * this module binds it to volumes in the Cornerstone cache.
 */

import { cache, type Types } from '@cornerstonejs/core';
import { interpolateArchCurve, totalArcLength } from './archCurve';
import {
  trilinear,
  buildUniformCurve,
  computeCrossSection,
  type Point2,
  type CPRResult,
  type VolumeSamplingData,
} from './cprMath';
import type { ProjectionMode } from '@/types/dicom';

export type { CPRResult };

export interface CPRParams {
  volumeId: string;
  controlPoints: Point2[];
  slabWidth: number;
  projection: ProjectionMode;
  resolution: number; // mm per pixel along the curve
}

// ── Helpers ────────────────────────────────────────────────────

export function getVolumeData(volumeId: string): VolumeSamplingData | null {
  const volume = cache.getVolume(volumeId) as Types.IImageVolume | undefined;
  if (!volume?.voxelManager) return null;

  const dims = volume.dimensions as [number, number, number];
  const spacing = volume.spacing as [number, number, number];
  const origin = volume.origin as [number, number, number];

  // LIMITATION (M6): CPR sampling (panoramic + cross-section) assumes an
  // IDENTITY direction matrix, i.e. an axis-aligned, axially acquired volume.
  // All current loaders in this app hard-code identity direction, so results
  // are correct today — but a non-axial / oblique volume would be sampled in
  // the wrong orientation. Warn in dev builds if that assumption ever breaks.
  if (import.meta.env.DEV && volume.direction) {
    const d = Array.from(volume.direction as ArrayLike<number>);
    const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    if (d.length === 9 && d.some((v, i) => Math.abs(v - IDENTITY[i]) > 1e-3)) {
      console.warn(
        '[DQ-CPR] Volume has a non-identity direction matrix; CPR sampling assumes axial orientation and will be wrong for this volume.',
        d,
      );
    }
  }

  const vm = volume.voxelManager;
  const getVoxel = (i: number, j: number, k: number) => vm.getAtIJK(i, j, k) as number;

  const z0 = origin[2];
  const z1 = origin[2] + (dims[2] - 1) * spacing[2];

  return {
    dims, origin, getVoxel,
    invSx: 1 / spacing[0],
    invSy: 1 / spacing[1],
    invSz: 1 / spacing[2],
    zMin: Math.min(z0, z1),
    zMax: Math.max(z0, z1),
    vSpacing: Math.abs(spacing[2]),
  };
}

// ── Main CPR function ──────────────────────────────────────────

export function generatePanoramic(params: CPRParams): CPRResult | null {
  const vol = getVolumeData(params.volumeId);
  if (!vol) {
    console.warn('[DQ-CPR] Volume not found:', params.volumeId);
    return null;
  }

  // Estimate arc length to determine sample count
  const roughCurve = interpolateArchCurve(params.controlPoints, 10);
  const arcEstimate = totalArcLength(roughCurve);
  const targetWidth = Math.max(50, Math.round(arcEstimate / params.resolution));

  const { curve, normals, arcLen } = buildUniformCurve(params.controlPoints, targetWidth);
  if (curve.length < 2) return null;

  const width = curve.length;
  const height = Math.max(1, Math.round((vol.zMax - vol.zMin) / vol.vSpacing));
  const hSpacing = arcLen / Math.max(1, width - 1);

  // Slab sampling
  const halfSlab = params.slabWidth / 2;
  const SLAB_STEP_MM = 1.0;
  const numSlab = Math.max(1, Math.round(params.slabWidth / SLAB_STEP_MM));
  const isMIP = params.projection === 'MIP';

  console.time('[DQ-CPR] Panoramic generation');

  const pixelData = new Float32Array(width * height);

  for (let x = 0; x < width; x++) {
    const [cx, cy] = curve[x];
    const [nx, ny] = normals[x];

    for (let y = 0; y < height; y++) {
      const wz = vol.zMax - y * vol.vSpacing;

      if (numSlab <= 1) {
        const ci = (cx - vol.origin[0]) * vol.invSx;
        const cj = (cy - vol.origin[1]) * vol.invSy;
        const ck = (wz - vol.origin[2]) * vol.invSz;
        pixelData[y * width + x] = trilinear(vol.getVoxel, vol.dims, ci, cj, ck);
      } else {
        let acc = isMIP ? -Infinity : 0;
        for (let s = 0; s < numSlab; s++) {
          const offset = -halfSlab + (s / (numSlab - 1)) * params.slabWidth;
          const wx = cx + nx * offset;
          const wy = cy + ny * offset;
          const ci = (wx - vol.origin[0]) * vol.invSx;
          const cj = (wy - vol.origin[1]) * vol.invSy;
          const ck = (wz - vol.origin[2]) * vol.invSz;
          const val = trilinear(vol.getVoxel, vol.dims, ci, cj, ck);
          if (isMIP) { if (val > acc) acc = val; }
          else { acc += val; }
        }
        if (!isMIP) acc /= numSlab;
        pixelData[y * width + x] = acc;
      }
    }
  }

  console.timeEnd('[DQ-CPR] Panoramic generation');
  console.log(`[DQ-CPR] Output: ${width}x${height}, slab=${numSlab} samples, arc=${arcLen.toFixed(1)}mm`);

  return { pixelData, width, height, horizontalSpacing: hSpacing, verticalSpacing: vol.vSpacing, zMin: vol.zMin, zMax: vol.zMax };
}

// ── Cross-section (perpendicular slice at a point on the arch) ─

export interface CrossSectionParams {
  volumeId: string;
  controlPoints: Point2[];
  position: number;   // 0-1 normalized along the arch curve
  tiltDeg: number;    // degrees, lean of the slice vertical axis along the curve
  widthMm: number;    // total width of cross-section in mm
  resolution: number; // mm per pixel
}

export type CrossSectionResult = CPRResult;

export function generateCrossSection(params: CrossSectionParams): CrossSectionResult | null {
  const vol = getVolumeData(params.volumeId);
  if (!vol) return null;
  return computeCrossSection(vol, params);
}
