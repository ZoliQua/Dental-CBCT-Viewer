/**
 * Orientation label (Axial / Sagittal / Coronal / Panorama / Cross-section)
 * drawn over a viewport. Color, size and alignment come from Settings → General
 * (state.display), so all viewport labels stay consistent and configurable.
 */

import { useViewer } from '@/context/ViewerContext';

export function OrientationLabel({ text }: { text: string }) {
  const { state } = useViewer();
  const { labelColor, labelSize, labelAlign } = state.display;
  const pos =
    labelAlign === 'left' ? 'left-2' : labelAlign === 'right' ? 'right-2' : 'left-1/2 -translate-x-1/2';
  return (
    <div
      className={`absolute top-1 ${pos} font-mono font-bold pointer-events-none select-none [text-shadow:_0_1px_2px_rgb(0_0_0_/_80%)]`}
      style={{ color: labelColor, fontSize: `${labelSize}px` }}
    >
      {text}
    </div>
  );
}
