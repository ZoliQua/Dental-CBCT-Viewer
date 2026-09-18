/**
 * Which view occupies the main ("big") slot in each layout, and which
 * Cornerstone viewport — if any — backs it. The status bar reads the zoom of
 * this viewport, so it always reflects the centre view rather than whichever
 * pane happened to move last. Pure (no Cornerstone import) → unit-testable.
 */

import { VP_AXIAL, VP_SAGITTAL, VP_CORONAL, VP_3D } from './constants';
import {
  normalizePanelViews, normalizeOpgOrder,
  type LayoutMode, type ViewMode, type PanelConfig, type ViewKey, type OpgView,
} from '@/types/dicom';

const VP_BY_VIEW: Record<ViewKey, string> = {
  AXIAL: VP_AXIAL,
  SAGITTAL: VP_SAGITTAL,
  CORONAL: VP_CORONAL,
  '3D': VP_3D,
};

/** The view shown in the big slot of the current layout. */
export function bigView(layout: LayoutMode, viewMode: ViewMode, panel: PanelConfig): ViewKey | OpgView {
  switch (layout) {
    case '1x1':
      return viewMode;
    case '1+3':
      return normalizePanelViews(panel.big, panel.small).big;
    case 'OPG2+1':
      return normalizeOpgOrder(panel.opgOrder)[0];
    case '2x2':
    default:
      return 'AXIAL';
  }
}

/**
 * Cornerstone viewport id backing the big view, or null when the big view is
 * one of our own canvases (panoramic / cross-section), which are drawn
 * fit-to-pane and have no camera zoom.
 */
export function bigViewportId(layout: LayoutMode, viewMode: ViewMode, panel: PanelConfig): string | null {
  const v = bigView(layout, viewMode, panel);
  if (v === 'PANORAMA' || v === 'CROSS') return null;
  return VP_BY_VIEW[v];
}
