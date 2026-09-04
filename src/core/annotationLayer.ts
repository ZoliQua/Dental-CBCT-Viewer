/**
 * Cornerstone annotation helpers: per-annotation visibility and removal, plus
 * mapping Cornerstone tool names to our translation tool keys.
 */

import { annotation } from '@cornerstonejs/tools';
import { getRenderingEngine } from '@cornerstonejs/core';
import { RENDERING_ENGINE_ID } from './constants';

function rerenderAll(): void {
  getRenderingEngine(RENDERING_ENGINE_ID)?.render();
}

export function setAnnotationVisible(annotationUID: string, visible: boolean): void {
  annotation.visibility.setAnnotationVisibility(annotationUID, visible);
  rerenderAll();
}

export function removeAnnotationByUid(annotationUID: string): void {
  annotation.state.removeAnnotation(annotationUID);
  rerenderAll();
}

export interface AnnotationMeasure {
  /** Formatted value string (mm / ° / HU), if stats are available yet. */
  value?: string;
  /** World-space handle points of the annotation. */
  points?: [number, number, number][];
}

/**
 * Read the formatted measured value + handle points from a Cornerstone
 * annotation. Stats are computed asynchronously by the tools, so `value` is
 * undefined until they are ready (ANNOTATION_MODIFIED fires once they are).
 */
export function readAnnotationMeasure(ann: any): AnnotationMeasure {
  const tool = ann?.metadata?.toolName as string;
  const cached = ann?.data?.cachedStats;
  const stats = cached ? (Object.values(cached)[0] as any) : null;
  const points = (ann?.data?.handles?.points as [number, number, number][]) ?? undefined;
  const out: AnnotationMeasure = { points };
  if (!stats) return out;
  const f1 = (x: number) => (Math.round(x * 10) / 10).toFixed(1);
  const f0 = (x: number) => Math.round(x).toString();
  switch (tool) {
    case 'Length':
      if (stats.length != null) out.value = `${f1(stats.length)} mm`;
      break;
    case 'Angle':
      if (stats.angle != null) out.value = `${f1(stats.angle)}°`;
      break;
    case 'Bidirectional':
      if (stats.length != null) out.value = `${f1(stats.length)} × ${f1(stats.width)} mm`;
      break;
    case 'Probe':
      if (stats.value != null) out.value = `${f0(stats.value)} HU`;
      break;
    case 'EllipticalROI':
    case 'CircleROI':
    case 'RectangleROI':
    case 'PlanarFreehandROI':
      if (stats.mean != null) {
        out.value = `${f0(stats.mean)} ± ${f0(stats.stdDev)} HU · ${f0(stats.min)}–${f0(stats.max)}`;
      }
      break;
  }
  return out;
}

/** Cornerstone toolName → tool.<key> translation key suffix */
export const CS_TOOL_KEYS: Record<string, string> = {
  Length: 'length',
  Angle: 'angle',
  EllipticalROI: 'ellipse',
  CircleROI: 'circle',
  RectangleROI: 'rectangle',
  PlanarFreehandROI: 'freehand',
  Bidirectional: 'bidirectional',
  Probe: 'probe',
  ArrowAnnotate: 'arrow',
};
