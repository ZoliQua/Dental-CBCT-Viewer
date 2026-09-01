/**
 * Orientation label (Axial / Sagittal / Coronal / Panorama / Cross-section)
 * drawn over a viewport. Color and alignment come from Settings → General
 * (state.display); the font size is larger on the main view than on the side
 * views (labelSizeMain / labelSizeSide), determined from the current layout.
 */

import { useViewer } from '@/context/ViewerContext';
import type { MPROrientation } from '@/types/dicom';

/** Is this viewport the main (big/centre) one in the current layout? */
function isMainView(layoutMode: string, panelBig: string, viewKey?: string): boolean {
  if (!viewKey) return true;
  if (layoutMode === '1x1') return true;              // single view → main
  if (layoutMode === 'OPG2+1') return viewKey === 'PANORAMA';
  return viewKey === panelBig;                        // 1+3 / 2×2 → the big panel
}

export function OrientationLabel({ text, viewKey }: { text: string; viewKey?: string }) {
  const { state } = useViewer();
  const { labelColor, labelSizeMain, labelSizeSide, labelAlign } = state.display;
  const main = isMainView(state.layoutMode, state.panel.big, viewKey);
  const size = main ? labelSizeMain : labelSizeSide;
  const pos =
    labelAlign === 'left' ? 'left-2' : labelAlign === 'right' ? 'right-2' : 'left-1/2 -translate-x-1/2';
  return (
    <div
      className={`absolute top-1 ${pos} font-mono font-bold pointer-events-none select-none [text-shadow:_0_1px_2px_rgb(0_0_0_/_80%)]`}
      style={{ color: labelColor, fontSize: `${size}px` }}
    >
      {text}
    </div>
  );
}

/**
 * Anatomical edge markers for the MPR viewports (A/P/R/L/S/I).
 *
 * Placement follows Cornerstone's default MPR cameras for an LPS volume
 * (identity ImageOrientationPatient — this app applies no extra display
 * flips). From MPR_CAMERA_VALUES in @cornerstonejs/core:
 *   axial:    viewUp −Y (anterior up),    viewRight +X (patient left right)
 *   sagittal: viewUp +Z (superior up),    viewRight +Y (posterior right)
 *   coronal:  viewUp +Z (superior up),    viewRight +X (patient left right)
 * i.e. the standard radiological convention.
 */
const MPR_MARKERS: Record<MPROrientation, { top: string; bottom: string; left: string; right: string }> = {
  AXIAL: { top: 'A', bottom: 'P', left: 'R', right: 'L' },
  SAGITTAL: { top: 'S', bottom: 'I', left: 'A', right: 'P' },
  CORONAL: { top: 'S', bottom: 'I', left: 'R', right: 'L' },
};

export function MprOrientationMarkers({ orientation }: { orientation: MPROrientation }) {
  const { state } = useViewer();
  const m = MPR_MARKERS[orientation];
  const style: React.CSSProperties = { color: state.display.labelColor, fontSize: '10px' };
  const cls = 'absolute font-mono pointer-events-none select-none opacity-80 [text-shadow:_0_1px_2px_rgb(0_0_0_/_80%)]';
  return (
    <>
      {/* top is offset below the view-name label (which sits at top-1) */}
      <span className={`${cls} top-5 left-1/2 -translate-x-1/2`} style={style}>{m.top}</span>
      <span className={`${cls} bottom-1 left-1/2 -translate-x-1/2`} style={style}>{m.bottom}</span>
      <span className={`${cls} left-1 top-1/2 -translate-y-1/2`} style={style}>{m.left}</span>
      <span className={`${cls} right-1 top-1/2 -translate-y-1/2`} style={style}>{m.right}</span>
    </>
  );
}
