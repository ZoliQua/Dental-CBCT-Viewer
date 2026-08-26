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
import { OrientationLabel } from './OrientationLabel';
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
  const [presetOpen, setPresetOpen] = useState(false);
  const [cropOpen, setCropOpen] = useState(false);

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
    <div className="relative w-full h-full bg-black" data-vp="3D" data-vp-title="3D">
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
      <OrientationLabel text="3D" />

      {/* 3D implant layer toggles (top-left, translucent) */}
      {state.implants.length > 0 && (
        <div className="absolute top-2 left-2 z-10 flex flex-col gap-1 rounded-lg bg-slate-900/70 backdrop-blur-sm border border-slate-700/60 p-1.5">
          {([
            ['implant', t('view3d.implant')],
            ['sleeve', t('view3d.sleeve')],
            ['axis', t('view3d.axis')],
          ] as [keyof Implant3DLayers, string][]).map(([key, label]) => (
            <label key={key} className="flex items-center gap-1.5 text-[10px] text-slate-200 cursor-pointer select-none">
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

      {/* Unified bottom control bar: preset · slice planes · crop · slab */}
      {state.volumeId && (
        <div className={`absolute ${state.layoutMode === '1x1' ? 'bottom-14' : 'bottom-2'} left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 rounded-lg bg-slate-900/70 backdrop-blur-sm border border-slate-700/60 px-2 py-1.5 shadow-lg`}>
          {/* Preset popup */}
          <div className="relative">
            <button
              onClick={() => { setPresetOpen((o) => !o); setCropOpen(false); }}
              title={t('view3d.preset')}
              className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] text-slate-200 hover:bg-slate-700/60 transition-colors"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
                <path d="M12 2 21 7v10l-9 5-9-5V7l9-5z" /><path d="M3 7l9 5 9-5M12 12v10" />
              </svg>
              <span>{t(VOLUME_3D_PRESETS.find((p) => p.id === activePreset)?.labelKey ?? 'preset3d.bone')}</span>
            </button>
            {presetOpen && (
              <div className="absolute bottom-9 left-0 w-36 rounded-lg bg-slate-900/95 border border-slate-700 shadow-xl p-1 z-20">
                {VOLUME_3D_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => { handlePresetChange(p.id); setPresetOpen(false); }}
                    className={`w-full text-left px-2 py-1 text-[11px] rounded transition-colors ${
                      activePreset === p.id ? 'bg-dental-600 text-white' : 'text-slate-300 hover:bg-slate-700/60'
                    }`}
                  >
                    {t(p.labelKey)}
                  </button>
                ))}
              </div>
            )}
          </div>

          <span className="w-px h-4 bg-slate-700/60" />

          {/* Slice-plane toggles */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-slate-400 select-none">{t('view3d.slices')}</span>
            {SLICE_AXES.map((axis) => (
              <button
                key={axis}
                onClick={() => setSliceAxes((p) => ({ ...p, [axis]: !p[axis] }))}
                title={t(`view.${axis.toLowerCase()}`)}
                className={`px-1.5 py-1 rounded text-[10px] font-semibold transition-colors ${
                  sliceAxes[axis] ? 'bg-dental-600 text-white' : 'bg-slate-800/60 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {axis[0]}
              </button>
            ))}
          </div>

          <span className="w-px h-4 bg-slate-700/60" />

          {/* Crop popover */}
          <div className="relative">
            <button
              onClick={() => { setCropOpen((o) => !o); setPresetOpen(false); }}
              title={t('view3d.crop')}
              className={`px-2 py-1 rounded-md text-[11px] transition-colors ${
                cropEnabled ? 'bg-dental-600 text-white' : 'text-slate-200 hover:bg-slate-700/60'
              }`}
            >
              {t('view3d.crop')}
            </button>
            {cropOpen && (
              <div className="absolute bottom-9 left-0 w-44 rounded-lg bg-slate-900/95 border border-slate-700 shadow-xl p-2 space-y-1.5 z-20">
                <label className="flex items-center gap-1.5 text-[11px] text-slate-200 cursor-pointer select-none">
                  <input type="checkbox" checked={cropEnabled} onChange={(e) => setCropEnabled(e.target.checked)} className="accent-dental-400 w-3 h-3" />
                  {t('view3d.crop')}
                </label>
                {['X', 'Y', 'Z'].map((label, a) => (
                  <div key={label} className="flex items-center gap-1">
                    <span className="text-[10px] text-slate-400 w-2 select-none">{label}</span>
                    <input type="range" min={0} max={100} step={1} disabled={!cropEnabled}
                      value={Math.round(crop.min[a] * 100)}
                      onChange={(e) => setCropVal(a, 'min', Number(e.target.value) / 100)}
                      className="w-full h-1 accent-dental-400 disabled:opacity-40" />
                    <input type="range" min={0} max={100} step={1} disabled={!cropEnabled}
                      value={Math.round(crop.max[a] * 100)}
                      onChange={(e) => setCropVal(a, 'max', Number(e.target.value) / 100)}
                      className="w-full h-1 accent-dental-400 disabled:opacity-40" />
                  </div>
                ))}
              </div>
            )}
          </div>

          <span className="w-px h-4 bg-slate-700/60" />

          {/* Slab thickness */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-slate-400 select-none">{t('view3d.slab')}</span>
            <input
              type="range" min={0} max={200} step={5}
              value={slabThickness}
              onChange={(e) => handleSlabChange(Number(e.target.value))}
              className="w-16 h-1 accent-dental-400"
              title={slabThickness === 0 ? t('common.off') : `${slabThickness} mm`}
            />
          </div>
        </div>
      )}
    </div>
  );
}
