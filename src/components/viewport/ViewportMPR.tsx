import { useEffect, useRef, useCallback, useState } from 'react';
import { getRenderingEngine, Enums, setVolumesForViewports, utilities } from '@cornerstonejs/core';
import { setupTools, addViewportToToolGroup } from '@/core/toolManager';
import { RENDERING_ENGINE_ID, VP_AXIAL, VP_SAGITTAL, VP_CORONAL } from '@/core/constants';
import { VIEW_LABEL_KEYS, type MPROrientation } from '@/types/dicom';
import { useI18n } from '@/i18n/I18nContext';
import { ViewportOverlay } from './ViewportOverlay';
import { SliceIndicator } from './SliceIndicator';
import { OrientationLabel } from './OrientationLabel';

interface ViewportMPRProps {
  orientation: MPROrientation;
  volumeId: string;
}

const VP_ID_MAP: Record<MPROrientation, string> = {
  AXIAL: VP_AXIAL,
  SAGITTAL: VP_SAGITTAL,
  CORONAL: VP_CORONAL,
};

const ORIENTATION_ENUM: Record<MPROrientation, Enums.OrientationAxis> = {
  AXIAL: Enums.OrientationAxis.AXIAL,
  SAGITTAL: Enums.OrientationAxis.SAGITTAL,
  CORONAL: Enums.OrientationAxis.CORONAL,
};

export function ViewportMPR({ orientation, volumeId }: ViewportMPRProps) {
  const { t } = useI18n();
  const elementRef = useRef<HTMLDivElement>(null);
  const enabledRef = useRef(false);
  const destroyedRef = useRef(false);
  const [sliceIndex, setSliceIndex] = useState(0);
  const [totalSlices, setTotalSlices] = useState(0);

  const viewportId = VP_ID_MAP[orientation];

  const handleResize = useCallback(() => {
    const engine = getRenderingEngine(RENDERING_ENGINE_ID);
    engine?.resize(true, false);
  }, []);

  // Enable the viewport element on mount
  useEffect(() => {
    const element = elementRef.current;
    const engine = getRenderingEngine(RENDERING_ENGINE_ID);
    if (!element || !engine) return;

    destroyedRef.current = false;
    setupTools();

    engine.enableElement({
      viewportId,
      type: Enums.ViewportType.ORTHOGRAPHIC,
      element,
      defaultOptions: {
        orientation: ORIENTATION_ENUM[orientation],
      },
    });
    addViewportToToolGroup(viewportId, RENDERING_ENGINE_ID);
    enabledRef.current = true;

    // Track slice changes via VOLUME_NEW_IMAGE
    const onVolumeNewImage = () => {
      const vp = engine.getViewport(viewportId);
      if (vp && 'getSliceIndex' in vp) {
        const idx = (vp as { getSliceIndex: () => number }).getSliceIndex();
        const total = (vp as { getNumberOfSlices: () => number }).getNumberOfSlices();
        setSliceIndex(idx);
        setTotalSlices(total);
      }
    };
    element.addEventListener(Enums.Events.VOLUME_NEW_IMAGE, onVolumeNewImage);

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(element);

    return () => {
      destroyedRef.current = true;
      element.removeEventListener(Enums.Events.VOLUME_NEW_IMAGE, onVolumeNewImage);
      resizeObserver.disconnect();
      if (enabledRef.current) {
        try {
          engine.disableElement(viewportId);
        } catch {
          // engine may already be destroyed
        }
        enabledRef.current = false;
      }
    };
  }, [viewportId, orientation, handleResize]);

  // Set the volume on this viewport
  useEffect(() => {
    if (!volumeId || !enabledRef.current) return;

    const engine = getRenderingEngine(RENDERING_ENGINE_ID);
    if (!engine) return;

    let cancelled = false;

    async function loadVolume() {
      try {
        await setVolumesForViewports(engine!, [{ volumeId }], [viewportId]);
        if (cancelled || destroyedRef.current) return;

        const viewport = engine!.getViewport(viewportId);
        if (viewport) {
          viewport.render();
          // Set initial slice info
          if ('getSliceIndex' in viewport) {
            const idx = (viewport as { getSliceIndex: () => number }).getSliceIndex();
            const total = (viewport as { getNumberOfSlices: () => number }).getNumberOfSlices();
            setSliceIndex(idx);
            setTotalSlices(total);
          }
        }
      } catch (err) {
        if (!cancelled && !destroyedRef.current) {
          console.error(`[DQ-DICOM] Failed to set volume on ${orientation}:`, err);
        }
      }
    }

    loadVolume();

    return () => {
      cancelled = true;
    };
  }, [volumeId, viewportId, orientation]);

  const handleJumpToSlice = useCallback(
    (targetIndex: number) => {
      const engine = getRenderingEngine(RENDERING_ENGINE_ID);
      if (!engine) return;
      const viewport = engine.getViewport(viewportId);
      if (!viewport || !('setSliceIndex' in viewport)) return;
      // Calculate delta from current
      const current = (viewport as { getSliceIndex: () => number }).getSliceIndex();
      const delta = targetIndex - current;
      if (delta === 0) return;
      utilities.scroll(viewport, { delta });
    },
    [viewportId],
  );

  return (
    <div className="relative w-full h-full bg-black" data-vp={orientation} data-vp-title={t(VIEW_LABEL_KEYS[orientation])}>
      <div
        ref={elementRef}
        className="w-full h-full"
        onContextMenu={(e) => e.preventDefault()}
      />
      <ViewportOverlay sliceIndex={sliceIndex} totalSlices={totalSlices} viewKey={orientation} />
      {/* Orientation label */}
      <OrientationLabel text={t(VIEW_LABEL_KEYS[orientation])} />
      {totalSlices > 1 && (
        <SliceIndicator
          onJumpToSlice={handleJumpToSlice}
          sliceIndex={sliceIndex}
          totalSlices={totalSlices}
        />
      )}
    </div>
  );
}
