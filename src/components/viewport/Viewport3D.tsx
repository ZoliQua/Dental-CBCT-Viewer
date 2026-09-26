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
import { CrossSection3DActor } from './CrossSection3DActor';
import { CropController } from './CropController';
import { OrientationLabel } from './OrientationLabel';
import { SLICE_AXES, type SliceAxis } from '@/core/slice3D';
import { NO_CROP, type CropBox } from '@/core/cropBox';
import { jawSplitFor, jawClipPlane, canSplitJaws, JAW_SIDES, NO_JAW_SPLIT, type JawSide } from '@/core/jawSplit';
import { nextWheelZoom } from '@/core/wheelZoom';
import { loadViewPrefs, saveViewPrefs } from '@/core/viewPrefs';
import type { Implant3DLayers } from '@/core/implant3D';
import { VOLUME_3D_PRESETS, isIoScan } from '@/types/dicom';
import {
  applyXrayPreset,
  applyColormap3D,
  applyQuality3D,
  applyVolumeStyle,
  XRAY_PRESET_ID,
  VOLUME_3D_COLORMAPS,
  type Volume3DQuality,
  type Volume3DColormap,
} from '@/core/volume3DPreset';

const QUALITIES: Volume3DQuality[] = ['low', 'medium', 'high'];

interface Viewport3DProps {
  volumeId: string;
}

export function Viewport3D({ volumeId }: Viewport3DProps) {
  const { t } = useI18n();
  const { state, dispatch } = useViewer();
  const elementRef = useRef<HTMLDivElement>(null);
  const enabledRef = useRef(false);
  const destroyedRef = useRef(false);
  const [activePreset, setActivePreset] = useState<string>(state.display.preset3d);
  const [activeQuality, setActiveQuality] = useState<Volume3DQuality>(state.display.quality3d);
  const [activeColormap, setActiveColormap] = useState<Volume3DColormap>(state.display.colormap3d);
  const [colorOpen, setColorOpen] = useState(false);
  const [slabThickness, setSlabThickness] = useState<number>(0); // 0 = no clipping
  const [ready, setReady] = useState(false); // volume loaded → safe to add actors
  const [layers3D, setLayers3D] = useState<Implant3DLayers>({ implant: true, sleeve: true, axis: true });
  // Slice planes + the CS marker are remembered across reloads (core/viewPrefs).
  const [sliceAxes, setSliceAxes] = useState<Record<SliceAxis, boolean>>(() => loadViewPrefs().sliceAxes);
  const [showCrossSection, setShowCrossSection] = useState(() => loadViewPrefs().showCrossSection);
  useEffect(() => { saveViewPrefs({ sliceAxes, showCrossSection }); }, [sliceAxes, showCrossSection]);
  // 3D IO view: a single sagittal cut through the CT, scrubbed by hand. It is
  // the check that matters when positioning a scan — the scan's surface has to
  // land on the enamel where the slice cuts it — and there is no sagittal MPR
  // pane in this layout for the plane to follow, so it gets its own slider.
  const [ioSagittal, setIoSagittal] = useState(false);
  const [ioSagittalIndex, setIoSagittalIndex] = useState<number | null>(null);
  const [sagittalCount, setSagittalCount] = useState(0);

  // The same viewport serves three layouts, with progressively fewer controls:
  //  'full'    — the 3D view: everything.
  //  'compact' — the Panoramic layout's small companion pane: only what relates
  //              to that cut (the axial + cross-section planes).
  //  'io'      — the 3D IO view: the volume with the intraoral scans on it.
  //              The arch toggles replace the slice buttons, and the only cut
  //              on offer is a sagittal one, for checking a scan against the
  //              enamel it should be sitting on.
  const mode: 'full' | 'compact' | 'io' =
    state.layoutMode === 'OPG2+1' ? 'compact' : state.layoutMode === 'IO3D' ? 'io' : 'full';
  const compact = mode !== 'full';
  // Hidden planes are also not drawn, without clobbering the user's choices for
  // the full 3D view.
  const effectiveAxes: Record<SliceAxis, boolean> = mode === 'io'
    ? { AXIAL: false, SAGITTAL: ioSagittal, CORONAL: false }
    : mode === 'compact'
      ? { ...sliceAxes, SAGITTAL: false, CORONAL: false }
      : sliceAxes;
  const sliceIndexOverride = mode === 'io' && ioSagittalIndex != null
    ? { SAGITTAL: ioSagittalIndex }
    : undefined;

  // The arch toggles drive the scans' own visibility, so the IO view and the
  // Layers panel never disagree about what is on screen.
  const ioScans = state.scans.filter((sc) => isIoScan(sc.type));
  const jawScans = (jaw: 'upperJaw' | 'lowerJaw') => ioScans.filter((sc) => sc.type === jaw);
  const toggleJaw = (jaw: 'upperJaw' | 'lowerJaw') => {
    const group = jawScans(jaw);
    const next = !group.every((sc) => sc.visible);
    for (const sc of group) dispatch({ type: 'UPDATE_SCAN', payload: { ...sc, visible: next } });
  };

  /** Switch the whole scene to one jaw: clip the CT and match the arch scans. */
  const selectJaw = (side: JawSide) => {
    dispatch({ type: 'SET_JAW_SIDE', payload: side });
    for (const sc of ioScans) {
      const wanted = side === 'both' || sc.type === (side === 'upper' ? 'upperJaw' : 'lowerJaw');
      if (sc.visible !== wanted) dispatch({ type: 'UPDATE_SCAN', payload: { ...sc, visible: wanted } });
    }
  };

  // Jaw filter: cut the volume at the occlusal plane so one arch can be turned
  // around on its own. Detection runs once per volume (it sweeps the whole
  // scan) and also reports whether there are two arches to choose between —
  // a mandible-only field of view gets no button, since hiding "the other
  // half" of it would just blank the view.
  const [jawSplit, setJawSplit] = useState(NO_JAW_SPLIT);
  useEffect(() => {
    if (!ready || !volumeId) { setJawSplit(NO_JAW_SPLIT); return; }
    let cancelled = false;
    // Off the render path: the sweep is cheap but not free.
    const id = window.setTimeout(async () => {
      const { getVolumeData } = await import('@/core/cprEngine');
      if (cancelled) return;
      const vd = getVolumeData(volumeId);
      setJawSplit(jawSplitFor(volumeId, vd));
      // Sagittal runs along x; start the scrubber in the middle of the arch.
      const n = vd?.dims[0] ?? 0;
      setSagittalCount(n);
      setIoSagittalIndex((prev) => (prev != null && prev < n ? prev : Math.floor(n / 2)));
    }, 0);
    return () => { cancelled = true; window.clearTimeout(id); };
  }, [ready, volumeId]);
  const jawSide = state.jawSide;
  const jawPlane = jawClipPlane(jawSplit, jawSide);
  const canSplit = canSplitJaws(jawSplit);
  // A scan whose arches cannot be told apart must not stay clipped.
  useEffect(() => {
    if (!canSplit && jawSide !== 'both') dispatch({ type: 'SET_JAW_SIDE', payload: 'both' });
  }, [canSplit, jawSide, dispatch]);

  const [cropEnabled, setCropEnabled] = useState(false);
  const [crop, setCrop] = useState<CropBox>(NO_CROP);
  const [presetOpen, setPresetOpen] = useState(false);
  const [cropOpen, setCropOpen] = useState(false);
  const [sliceRebuild, setSliceRebuild] = useState(0);

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

        applyVolumeStyle(viewport, { preset: activePreset, colormap: activeColormap, quality: activeQuality, wl: state.windowLevel });
        viewport.resetCamera({ resetPan: true, resetZoom: true, resetToCenter: true });
        // Start slightly rotated (not dead-on frontal) so enabling two slice
        // planes doesn't hide everything behind an edge-on plane.
        try {
          const cam = (viewport as any).getRenderer?.()?.getActiveCamera?.();
          if (cam) {
            cam.azimuth(30);
            cam.elevation(20);
            cam.orthogonalizeViewUp?.();
            (viewport as any).getRenderer?.()?.resetCameraClippingRange?.();
          }
        } catch { /* camera not ready */ }
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

  // Re-apply the window/level-dependent style (X-Ray transfer function + the
  // colormap, both built from the shared W/L window) and the mapper quality,
  // without reloading the volume. The load effect above intentionally does NOT
  // depend on these, so W/L drags and colormap/quality changes stay cheap.
  useEffect(() => {
    if (!ready) return;
    const engine = getRenderingEngine(RENDERING_ENGINE_ID);
    const viewport = engine?.getViewport(VP_3D) as Types.IVolumeViewport | undefined;
    if (!viewport) return;
    const actor = (viewport as any).getDefaultActor?.()?.actor;
    if (activePreset === XRAY_PRESET_ID) applyXrayPreset(actor, state.windowLevel);
    applyColormap3D(actor, activeColormap, state.windowLevel);
    applyQuality3D(actor, activeQuality);
    viewport.render();
  }, [state.windowLevel, activePreset, activeColormap, activeQuality, ready]);

  // Apply preset change
  const handlePresetChange = useCallback(
    (preset: string) => {
      setActivePreset(preset);
      const engine = getRenderingEngine(RENDERING_ENGINE_ID);
      if (!engine) return;
      const viewport = engine.getViewport(VP_3D);
      if (!viewport) return;
      applyVolumeStyle(viewport, { preset, colormap: activeColormap, quality: activeQuality, wl: state.windowLevel });
      // Re-add the slice planes on the next frame — some presets (e.g. MIP) drop
      // the added actors when their blend mode changes.
      requestAnimationFrame(() => setSliceRebuild((k) => k + 1));
    },
    [state.windowLevel, activeColormap, activeQuality],
  );

  const handleQualityChange = useCallback((q: Volume3DQuality) => {
    setActiveQuality(q);
    dispatch({ type: 'SET_DISPLAY', payload: { quality3d: q } });
  }, [dispatch]);

  const handleColormapChange = useCallback((c: Volume3DColormap) => {
    setActiveColormap(c);
    dispatch({ type: 'SET_DISPLAY', payload: { colormap3d: c } });
  }, [dispatch]);

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

  // Mouse-wheel zoom. Cornerstone's ZoomTool only zooms on drag (it has no
  // wheel handler), so the 3D view listens for the wheel itself. setZoom fires
  // CAMERA_MODIFIED, so the status bar's zoom readout follows along.
  useEffect(() => {
    if (!ready) return;
    const vp = getRenderingEngine(RENDERING_ENGINE_ID)?.getViewport(VP_3D) as Types.IVolumeViewport | undefined;
    const el = vp?.element;
    if (!vp || !el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0) return;
      e.preventDefault(); // keep the page from scrolling under the viewer
      try {
        vp.setZoom(nextWheelZoom(vp.getZoom(), e.deltaY, e.deltaMode));
        vp.render();
      } catch { /* viewport torn down mid-event */ }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [ready]);

  return (
    <div className="relative w-full h-full bg-black" data-vp="3D" data-vp-title="3D">
      <div
        ref={elementRef}
        className="w-full h-full"
        onContextMenu={(e) => e.preventDefault()}
      />

      <ViewportOverlay sliceIndex={0} totalSlices={0} viewKey="3D" />

      {/* Implant / sleeve / axis 3D meshes (added once the volume is loaded) */}
      {ready && <Implant3DActors layers={layers3D} />}
      {ready && <ScanActors />}
      {ready && <Slice3DActors axes={effectiveAxes} preset={activePreset} rebuildKey={sliceRebuild} indexOverride={sliceIndexOverride} />}
      {ready && <CrossSection3DActor enabled={mode === 'compact' && showCrossSection} />}
      {ready && <CropController crop={crop} enabled={cropEnabled} jawPlane={jawPlane} />}

      {/* 3D label */}
      <OrientationLabel text={mode === 'io' ? t('layout.viewIo3d') : '3D'} viewKey="3D" />

      {/* IO view: one toggle per arch, in place of the slice-plane buttons.
          Only the arches that were actually loaded get a button. */}
      {mode === 'io' && ioScans.length > 0 && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 z-10 flex flex-col gap-1.5">
          {(['upperJaw', 'lowerJaw'] as const).map((jaw) => {
            const group = jawScans(jaw);
            if (group.length === 0) return null;
            const on = group.every((sc) => sc.visible);
            return (
              <button
                key={jaw}
                onClick={() => toggleJaw(jaw)}
                title={t(`scan.${jaw}`)}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium border backdrop-blur-sm transition-colors whitespace-nowrap ${
                  on
                    ? 'bg-dental-600 text-white border-dental-500'
                    : 'bg-slate-900/70 text-slate-300 border-slate-700/60 hover:bg-slate-800/80'
                }`}
              >
                {t(`scan.${jaw}`)}
              </button>
            );
          })}
        </div>
      )}

      {/* 3D implant layer toggles (bottom-right, translucent — clear of overlays) */}
      {state.implants.length > 0 && (
        <div className="absolute bottom-2 right-2 z-10 flex flex-col gap-1 rounded-lg bg-slate-900/70 backdrop-blur-sm border border-slate-700/60 p-1.5">
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
              className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] text-slate-200 hover:bg-slate-700/60 transition-colors whitespace-nowrap"
            >
              <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
                <path d="M12 2 21 7v10l-9 5-9-5V7l9-5z" /><path d="M3 7l9 5 9-5M12 12v10" />
              </svg>
              <span className="whitespace-nowrap">{activePreset === XRAY_PRESET_ID ? t('preset3d.xray') : t(VOLUME_3D_PRESETS.find((p) => p.id === activePreset)?.labelKey ?? 'preset3d.bone')}</span>
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
                <button
                  onClick={() => { handlePresetChange(XRAY_PRESET_ID); setPresetOpen(false); }}
                  className={`w-full text-left px-2 py-1 text-[11px] rounded transition-colors ${
                    activePreset === XRAY_PRESET_ID ? 'bg-dental-600 text-white' : 'text-slate-300 hover:bg-slate-700/60'
                  }`}
                >
                  {t('preset3d.xray')}
                </button>
              </div>
            )}
          </div>

          <span className="w-px h-4 bg-slate-700/60" />

          {/* Quality: one button — click cycles low → medium → high */}
          <button
            onClick={() => handleQualityChange(QUALITIES[(QUALITIES.indexOf(activeQuality) + 1) % QUALITIES.length])}
            title={`${t('view3d.quality')}: ${t(`quality.${activeQuality}`)}`}
            className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] text-slate-200 hover:bg-slate-700/60 transition-colors whitespace-nowrap"
          >
            <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              {/* signal bars: filled up to the active level */}
              {[0, 1, 2].map((i) => (
                <line key={i} x1={6 + i * 6} y1={20} x2={6 + i * 6} y2={14 - i * 5}
                  opacity={i <= QUALITIES.indexOf(activeQuality) ? 1 : 0.3} />
              ))}
            </svg>
            <span>{t(`quality.${activeQuality}`)}</span>
          </button>

          {mode === 'io' && sagittalCount > 0 && (<>
          <span className="w-px h-4 bg-slate-700/60" />

          {/* Sagittal cut + its own scrubber: no MPR pane here to follow. */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setIoSagittal((v) => !v)}
              title={t('view3d.ioSagittal')}
              className={`px-1.5 py-1 rounded text-[10px] font-semibold transition-colors ${
                ioSagittal ? 'bg-dental-600 text-white' : 'bg-slate-800/60 text-slate-300 hover:bg-slate-700'
              }`}
            >
              S
            </button>
            <input
              type="range"
              min={0}
              max={Math.max(0, sagittalCount - 1)}
              step={1}
              value={ioSagittalIndex ?? 0}
              disabled={!ioSagittal}
              onChange={(e) => setIoSagittalIndex(Number(e.target.value))}
              className="w-24 h-1 accent-dental-400 disabled:opacity-40"
              title={`${(ioSagittalIndex ?? 0) + 1} / ${sagittalCount}`}
            />
          </div>
          </>)}

          {canSplit && (<>
          <span className="w-px h-4 bg-slate-700/60" />

          {/* Jaw filter: both → upper → lower. It sets the scene to that jaw —
              the CT is cut at the occlusal plane and the arch scans follow, so
              "lower jaw" means the lower jaw and nothing else. The per-arch
              toggles stay free afterwards for anyone who wants one back. */}
          <button
            onClick={() => selectJaw(JAW_SIDES[(JAW_SIDES.indexOf(jawSide) + 1) % JAW_SIDES.length])}
            title={t('jaw.hint')}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] transition-colors whitespace-nowrap ${
              jawSide === 'both' ? 'text-slate-200 hover:bg-slate-700/60' : 'bg-dental-600 text-white'
            }`}
          >
            <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              {/* two arches with the occlusal cut between them */}
              <path d="M5 7c2-2.5 12-2.5 14 0" opacity={jawSide === 'lower' ? 0.3 : 1} />
              <path d="M5 17c2 2.5 12 2.5 14 0" opacity={jawSide === 'upper' ? 0.3 : 1} />
              <line x1="3" y1="12" x2="21" y2="12" strokeDasharray="2 2" />
            </svg>
            <span>{t(`jaw.${jawSide}`)}</span>
          </button>
          </>)}

          {!compact && (<>
          <span className="w-px h-4 bg-slate-700/60" />

          {/* Colormap popup */}
          <div className="relative">
            <button
              onClick={() => { setColorOpen((o) => !o); setPresetOpen(false); setCropOpen(false); }}
              title={t('view3d.color')}
              className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] text-slate-200 hover:bg-slate-700/60 transition-colors"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="12" cy="12" r="9" /><circle cx="8.5" cy="10" r="1.2" fill="currentColor" stroke="none" /><circle cx="15.5" cy="10" r="1.2" fill="currentColor" stroke="none" /><circle cx="12" cy="15" r="1.2" fill="currentColor" stroke="none" />
              </svg>
              <span>{t(`colormap.${activeColormap}`)}</span>
            </button>
            {colorOpen && (
              <div className="absolute bottom-9 left-0 w-36 rounded-lg bg-slate-900/95 border border-slate-700 shadow-xl p-1 z-20">
                {VOLUME_3D_COLORMAPS.map((c) => (
                  <button
                    key={c}
                    onClick={() => { handleColormapChange(c); setColorOpen(false); }}
                    className={`w-full text-left px-2 py-1 text-[11px] rounded transition-colors ${
                      activeColormap === c ? 'bg-dental-600 text-white' : 'text-slate-300 hover:bg-slate-700/60'
                    }`}
                  >
                    {t(`colormap.${c}`)}
                  </button>
                ))}
              </div>
            )}
          </div>

          </>)}
          {mode !== 'io' && (<>
          <span className="w-px h-4 bg-slate-700/60" />

          {/* Slice-plane toggles */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-slate-400 select-none">{t('view3d.slices')}</span>
            {(compact ? (['AXIAL'] as SliceAxis[]) : SLICE_AXES).map((axis) => (
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
            {/* CS = the cross-section cut; only meaningful beside the panoramic */}
            {compact && <button
              onClick={() => setShowCrossSection((v) => !v)}
              title={t('viewport.crossSection')}
              className={`px-1.5 py-1 rounded text-[10px] font-semibold transition-colors ${
                showCrossSection ? 'bg-dental-600 text-white' : 'bg-slate-800/60 text-slate-300 hover:bg-slate-700'
              }`}
            >
              CS
            </button>}
          </div>
          </>)}

          {!compact && (<>
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
              <div className="absolute bottom-9 left-0 w-52 rounded-lg bg-slate-900/95 border border-slate-700 shadow-xl p-2.5 space-y-2 z-20">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1.5 text-[11px] text-slate-200 cursor-pointer select-none">
                    <input type="checkbox" checked={cropEnabled} onChange={(e) => setCropEnabled(e.target.checked)} className="accent-dental-400 w-3 h-3" />
                    {t('view3d.crop')}
                  </label>
                  <button
                    onClick={() => setCrop(NO_CROP)}
                    disabled={!cropEnabled}
                    className="text-[10px] text-slate-400 hover:text-slate-200 disabled:opacity-40"
                  >
                    {t('common.reset')}
                  </button>
                </div>
                <p className="text-[9px] text-slate-500 leading-tight">{t('view3d.cropHint')}</p>
                {['X', 'Y', 'Z'].map((label, a) => (
                  <div key={label} className="space-y-0.5">
                    <div className="flex justify-between text-[9px] text-slate-400 select-none">
                      <span className="font-semibold text-slate-300">{label}</span>
                      <span>{Math.round(crop.min[a] * 100)}–{Math.round(crop.max[a] * 100)}%</span>
                    </div>
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
          </>)}
        </div>
      )}
    </div>
  );
}
