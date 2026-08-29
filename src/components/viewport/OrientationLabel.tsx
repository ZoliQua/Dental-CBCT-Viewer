/**
 * Orientation label (Axial / Sagittal / Coronal / Panorama / Cross-section)
 * drawn over a viewport. Color and alignment come from Settings → General
 * (state.display); the font size is larger on the main view than on the side
 * views (labelSizeMain / labelSizeSide), determined from the current layout.
 */

import { useViewer } from '@/context/ViewerContext';

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
