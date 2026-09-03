/**
 * Package entry — the embeddable DenCT React component.
 *
 * Consumers import the component here and the stylesheet from
 * `dental-cbct-viewer/style.css`. Pure, React-free helpers, the implant data
 * model and the `IMPLANT_SYSTEMS` catalog are published under the `/core`
 * subpath (`dental-cbct-viewer/core`).
 */

import './index.css';

export { default, default as DicomViewer } from './App';
export type { DicomViewerProps, DicomViewerHandle } from './App';

// Re-export the public data model + catalog so the common types are reachable
// straight from the main entry as well (they are also under `/core`).
export type {
  ImplantData,
  ImplantSystem,
  GuidedPlan,
  GuideParams,
  AnatomyMarker,
  ViewKey,
  LayoutMode,
} from './types/dicom';
export { IMPLANT_SYSTEMS, getImplantSystem } from './types/dicom';
export type { PlanData } from './core/planIO';
