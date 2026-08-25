import { useEffect, useRef, useCallback, useState } from 'react';
import { getRenderingEngine, Enums, setVolumesForViewports, type Types } from '@cornerstonejs/core';
import { setupTools, addViewportTo3DToolGroup } from '@/core/toolManager';
import { RENDERING_ENGINE_ID, VP_3D } from '@/core/constants';
import { useViewer } from '@/context/ViewerContext';
import { useI18n } from '@/i18n/I18nContext';
import { ViewportOverlay } from './ViewportOverlay';
import { Implant3DActors } from './Implant3DActors';
import { ScanActors } from './ScanActors';
import { Slice3DActors } from './Slice3DActors';
import { CropController } from './CropController';
import { SLICE_AXES, type SliceAxis } from '@/core/slice3D';
import { NO_CROP, type CropBox } from '@/core/cropBox';
import type { Implant3DLayers } from '@/core/implant3D';
import { VOLUME_3D_PRESETS, type Volume3DPreset } from '@/types/dicom';

interface Viewport3DProps {
  volumeId: string;
}

export function Viewport3D({ volumeId }: Viewport3DProps) {
  const { t } = useI18n();
  const { state } = useViewer();
  const elementRef = useRef<HTMLDivElement>(null);
  const enabledRef = useRef(false);
  const destroyedRef = useRef(false);
  const [activePreset, setActivePreset] = useState<Volume3DPreset>('CT-Bone');
  const [slabThickness, setSlabThickness] = useState<number>(0); // 0 = no clipping
  const [ready, setReady] = useState(false); // volume loaded → safe to add actors
  const [layers3D, setLayers3D] = useState<Implant3DLayers>({ implant: true, sleeve: true, axis: true });
  const [sliceAxes, setSliceAxes] = useState<Record<SliceAxis, boolean>>({ AXIAL: false, SAGITTAL: false, CORONAL: false });
  const [cropEnabled, setCropEnabled] = useState(false);
  const [crop, setCrop] = useState<CropBox>(NO_CROP);

  const setCropVal = (axis: number, which: 'min' | 'max', v: number) => {
    setCrop((c) => {
      const next: CropBox = { min: [...c.min] as CropBox['min'], max: [...c.max] as CropBox['max'] };
      if (which === 'min') next.min[axis] = Math.min(v, c.max[axis] - 0.02);
      else next.max[axis] = Math.max(v, c.min[axis] + 0.02);
      return next;
    });
  };

  const handleResize = useCallback(() => {
    const engine = getRenderingEngine(RENDERING_ENGINE_ID);
    engine?.resize(true, false);
  }, []);

  // Enable the 3D viewport
  useEffect(() => {
    const element = elementRef.current;
    const engine = getRenderingEngine(RENDERING_ENGINE_ID);
    if (!element || !engine) return;

    destroyedRef.current = false;
    setupTools();

    engine.enableElement({
      viewportId: VP_3D,
      type: Enums.ViewportType.VOLUME_3D,
      element,
      defaultOptions: {
        orientation: Enums.OrientationAxis.CORONAL,
      },
    });
    addViewportTo3DToolGroup(VP_3D, RENDERING_ENGINE_ID);
    enabledRef.current = true;

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(element);

    return () => {
      destroyedRef.current = true;
      resizeObserver.disconnect();
      if (enabledRef.current) {
        try {
          engine.disableElement(VP_3D);
        } catch {
          // engine may already be destroyed
        }
        enabledRef.current = false;
      }
    };
  }, [handleResize]);

  // Load volume and apply preset
  useEffect(() => {
    if (!volumeId || !enabledRef.current) return;

    const engine = getRenderingEngine(RENDERING_ENGINE_ID);
    if (!engine) return;

    let cancelled = false;
    setReady(false);

    async function loadVolume() {
      try {
        await setVolumesForViewports(
          engine!,
          [{ volumeId, blendMode: Enums.BlendModes.COMPOSITE }],
          [VP_3D],
        );
        if (cancelled || destroyedRef.current) return;

        const viewport = engine!.getViewport(VP_3D) as Types.IVolumeViewport;
        if (!viewport) return;

        (viewport as any).setProperties({ preset: activePreset });
        viewport.resetCamera({ resetPan: true, resetZoom: true, resetToCenter: true });
        viewport.render();
        // Volume is in the scene — implant actors can be safely added now
        setReady(true);
      } catch (err) {
        if (!cancelled && !destroyedRef.current) {
          console.error('[DQ-DICOM] Failed to set volume on 3D viewport:', err);
        }
      }
    }

    loadVolume();

    return () => {
      cancelled = true;
      setReady(false);
    };
  }, [volumeId, activePreset]);

  // Apply preset change
  const handlePresetChange = useCallback(
    (preset: Volume3DPreset) => {
      setActivePreset(preset);
      const engine = getRenderingEngine(RENDERING_ENGINE_ID);
      if (!engine) return;
      const viewport = engine.getViewport(VP_3D);
      if (!viewport) return;
      (viewport as any).setProperties({ preset });
      viewport.render();
    },
    [],
  );

  // Apply slab thickness change
  const handleSlabChange = useCallback(
    (value: number) => {
      setSlabThickness(value);
      const engine = getRenderingEngine(RENDERING_ENGINE_ID);
      if (!engine) return;
      const viewport = engine.getViewport(VP_3D);
      if (!viewport || !('setSlabThickness' in viewport)) return;
      if (value === 0) {
        (viewport as any).resetSlabThickness();
      } else {
        (viewport as any).setSlabThickness(value);
      }
      viewport.render();
    },
    [],
  );

  return (
    <div className="relative w-full h-full bg-black">
      <div
        ref={elementRef}
        className="w-full h-full"
        onContextMenu={(e) => e.preventDefault()}
      />

      <ViewportOverlay sliceIndex={0} totalSlices={0} />

      {/* Implant / sleeve / axis 3D meshes (added once the volume is loaded) */}
      {ready && <Implant3DActors layers={layers3D} />}
      {ready && <ScanActors />}
      {ready && <Slice3DActors axes={sliceAxes} />}
      {ready && <CropController crop={crop} enabled={cropEnabled} />}

      {/* 3D label */}
      <div className="absolute top-1 left-1/2 -translate-x-1/2 text-yellow-400 text-xs font-mono font-bold pointer-events-none select-none [text-shadow:_0_1px_2px_rgb(0_0_0_/_80%)]">
        3D
      </div>

      {/* 3D implant layer toggles */}
      {state.implants.length > 0 && (
        <div className="absolute top-2 left-2 z-10 flex flex-col gap-1 bg-gray-900/70 rounded p-1.5">
          {([
            ['implant', t('view3d.implant')],
            ['sleeve', t('view3d.sleeve')],
            ['axis', t('view3d.axis')],
          ] as [keyof Implant3DLayers, string][]).map(([key, label]) => (
            <label key={key} className="flex items-center gap-1.5 text-[10px] text-gray-200 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={layers3D[key]}
                onChange={(e) => setLayers3D((p) => ({ ...p, [key]: e.target.checked }))}
                className="accent-dental-400 w-3 h-3"
              />
              {label}
            </label>
          ))}
        </div>
      )}

      {/* 3D slice-plane toggles + crop box (top-right column) */}
      {state.volumeId && (
        <div className="absolute top-2 right-2 z-10 flex flex-col gap-2 items-end">
          <div className="flex flex-col gap-1 bg-gray-900/70 rounded p-1.5">
            <span className="text-[10px] font-semibold text-gray-300 select-none">{t('view3d.slices')}</span>
            {SLICE_AXES.map((axis) => (
              <label key={axis} className="flex items-center gap-1.5 text-[10px] text-gray-200 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={sliceAxes[axis]}
                  onChange={(e) => setSliceAxes((p) => ({ ...p, [axis]: e.target.checked }))}
                  className="accent-dental-400 w-3 h-3"
                />
                {t(`view.${axis.toLowerCase()}`)}
              </label>
            ))}
          </div>

          <div className="flex flex-col gap-1 bg-gray-900/70 rounded p-1.5 w-32">
            <label className="flex items-center gap-1.5 text-[10px] font-semibold text-gray-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={cropEnabled}
                onChange={(e) => setCropEnabled(e.target.checked)}
                className="accent-dental-400 w-3 h-3"
              />
              {t('view3d.crop')}
            </label>
            {cropEnabled && ['X', 'Y', 'Z'].map((label, a) => (
              <div key={label} className="flex items-center gap-1">
                <span className="text-[10px] text-gray-400 w-2 select-none">{label}</span>
                <input
                  type="range" min={0} max={100} step={1}
                  value={Math.round(crop.min[a] * 100)}
                  onChange={(e) => setCropVal(a, 'min', Number(e.target.value) / 100)}
                  className="w-full h-1 accent-dental-400"
                />
                <input
                  type="range" min={0} max={100} step={1}
                  value={Math.round(crop.max[a] * 100)}
                  onChange={(e) => setCropVal(a, 'max', Number(e.target.value) / 100)}
                  className="w-full h-1 accent-dental-400"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Preset selector */}
      <div className="absolute bottom-2 right-2 flex flex-col gap-1 z-10">
        {VOLUME_3D_PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => handlePresetChange(p.id)}
            className={`
              px-2 py-1 text-[10px] rounded transition-colors text-left
              ${
                activePreset === p.id
                  ? 'bg-dental-600 text-white'
                  : 'bg-gray-800/80 text-gray-300 hover:bg-gray-700/80'
              }
            `}
          >
            {t(p.labelKey)}
          </button>
        ))}
      </div>

      {/* Slab thickness slider */}
      {state.volumeId && (
        <div className="absolute left-2 bottom-2 z-10 flex items-center gap-2">
          <label className="text-[10px] text-gray-400 font-mono select-none">Vágósík</label>
          <input
            type="range"
            min={0}
            max={200}
            step={5}
            value={slabThickness}
            onChange={(e) => handleSlabChange(Number(e.target.value))}
            className="w-20 h-1 accent-dental-400"
            title={slabThickness === 0 ? 'Ki' : `${slabThickness} mm`}
          />
          <span className="text-[10px] text-gray-400 font-mono w-8">
            {slabThickness === 0 ? 'Ki' : `${slabThickness}`}
          </span>
        </div>
      )}
    </div>
  );
}
