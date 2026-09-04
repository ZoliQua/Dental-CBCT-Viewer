import { useEffect, useRef, useState } from 'react';
import { RenderingEngine, eventTarget, cache } from '@cornerstonejs/core';
import { Enums as csToolsEnums } from '@cornerstonejs/tools';
import { LeftPanel } from './LeftPanel';
import { ViewportGrid } from '@/components/viewport/ViewportGrid';
import { RegistrationPanel } from '@/components/registration/RegistrationPanel';
import { WindowLevelSync } from '@/components/viewport/WindowLevelSync';
import { useViewer } from '@/context/ViewerContext';
import { useI18n } from '@/i18n/I18nContext';
import { setupTools, setActiveTool } from '@/core/toolManager';
import { createVolume } from '@/core/volumeBuilder';
import { revokeAllBlobUrls } from '@/core/dicomLoader';
import { clearScanRegistry } from '@/core/scanMesh';
import { serializePlan, planFromObject } from '@/core/planIO';
import { CS_TOOL_KEYS, readAnnotationMeasure } from '@/core/annotationLayer';
import { getVolumeData } from '@/core/cprEngine';
import { lineProfileHU } from '@/core/measureStats';
import { RENDERING_ENGINE_ID } from '@/core/constants';

export function ViewerShell() {
  const { state, dispatch } = useViewer();
  const { t } = useI18n();
  const measurementsRef = useRef(state.measurements);
  measurementsRef.current = state.measurements;
  const volumeIdRef = useRef(state.volumeId);
  volumeIdRef.current = state.volumeId;
  const renderingEngineRef = useRef<RenderingEngine | null>(null);
  const buildingVolumeRef = useRef<string | null>(null); // series UID currently building
  const [engineReady, setEngineReady] = useState(false);

  // Create a shared rendering engine BEFORE children mount
  useEffect(() => {
    if (!state.isInitialized) return;

    setupTools();
    const engine = new RenderingEngine(RENDERING_ENGINE_ID);
    renderingEngineRef.current = engine;
    setEngineReady(true);

    return () => {
      engine.destroy();
      renderingEngineRef.current = null;
      setEngineReady(false);
    };
  }, [state.isInitialized]);

  // Cornerstone measurements → one layer each, with live value + HU profile.
  // Tool stats are computed asynchronously, so ANNOTATION_COMPLETED creates the
  // layer and ANNOTATION_MODIFIED (debounced) fills in / refreshes the value.
  useEffect(() => {
    const readProfile = (pts?: [number, number, number][]): number[] | undefined => {
      const vid = volumeIdRef.current;
      if (!vid || !pts || pts.length < 2) return undefined;
      const vol = getVolumeData(vid);
      return vol ? lineProfileHU(vol, pts[0], pts[pts.length - 1], 64) : undefined;
    };

    const upsert = (ann: any) => {
      const uid = ann?.annotationUID;
      const toolKey = CS_TOOL_KEYS[ann?.metadata?.toolName as string];
      if (!uid || !toolKey) return;
      const { value, points } = readAnnotationMeasure(ann);
      const profile = toolKey === 'length' ? readProfile(points) : undefined;
      const existing = measurementsRef.current.find(m => m.id === uid);
      if (existing) {
        if (existing.value === value && !profile) return; // nothing changed
        dispatch({
          type: 'UPDATE_MEASUREMENT',
          payload: { ...existing, value: value ?? existing.value, profile: profile ?? existing.profile },
        });
      } else {
        const sameTool = measurementsRef.current.filter(m => m.tool === toolKey).length;
        dispatch({
          type: 'ADD_MEASUREMENT',
          payload: { id: uid, kind: 'annotation', tool: toolKey, name: `${t(`tool.${toolKey}`)} ${sameTool + 1}`, visible: true, value, profile },
        });
      }
    };

    const onCompleted = (evt: Event) => upsert((evt as CustomEvent).detail?.annotation);

    // MODIFIED fires continuously during a drag → debounce per annotation.
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    const onModified = (evt: Event) => {
      const ann = (evt as CustomEvent).detail?.annotation;
      const uid = ann?.annotationUID;
      if (!uid) return;
      const prev = timers.get(uid);
      if (prev) clearTimeout(prev);
      timers.set(uid, setTimeout(() => { timers.delete(uid); upsert(ann); }, 200));
    };

    eventTarget.addEventListener(csToolsEnums.Events.ANNOTATION_COMPLETED, onCompleted);
    eventTarget.addEventListener(csToolsEnums.Events.ANNOTATION_MODIFIED, onModified);
    return () => {
      eventTarget.removeEventListener(csToolsEnums.Events.ANNOTATION_COMPLETED, onCompleted);
      eventTarget.removeEventListener(csToolsEnums.Events.ANNOTATION_MODIFIED, onModified);
      timers.forEach(clearTimeout);
    };
  }, [dispatch, t]);

  // Build volume for MPR/3D views (always needed since default viewMode is AXIAL)
  const needsVolume = true;
  // H2: mirror the active series in a ref so async build completions can tell
  // whether the user switched series while the build was in flight.
  const activeSeriesRef = useRef(state.activeSeriesUID);
  activeSeriesRef.current = state.activeSeriesUID;
  // Bumping this re-runs the effect, retrying a build that was skipped/aborted.
  const [buildRetry, setBuildRetry] = useState(0);
  useEffect(() => {
    const uid = state.activeSeriesUID;
    if (!needsVolume || !uid || !state.study) return;
    // A restored study may already have a live volume in the cache → nothing to
    // build. If its volumeId was evicted, fall through and rebuild it.
    if (state.volumeId && cache.getVolume(state.volumeId)) return;
    // UID-keyed guard: only skip if THIS series is already being built.
    if (buildingVolumeRef.current === uid) return;

    const series = state.study.series.find(
      (s) => s.seriesInstanceUID === uid,
    );
    if (!series || series.imageIds.length < 3) return;

    buildingVolumeRef.current = uid;

    createVolume(series.imageIds)
      .then((volumeId) => {
        if (activeSeriesRef.current !== uid) {
          // Stale: the user switched series mid-build — discard the result and
          // let the effect rebuild the volume for the now-active series.
          buildingVolumeRef.current = null;
          setBuildRetry(n => n + 1);
          return;
        }
        buildingVolumeRef.current = null;
        dispatch({ type: 'SET_VOLUME_ID', payload: volumeId });
        console.log('[DQ-DICOM] Volume created:', volumeId);
      })
      .catch((err) => {
        buildingVolumeRef.current = null;
        console.error('[DQ-DICOM] Volume creation failed:', err);
        // If the failure belonged to a series that is no longer active, retry
        // so the current series still gets its volume.
        if (activeSeriesRef.current !== uid) setBuildRetry(n => n + 1);
      });
  }, [needsVolume, state.activeSeriesUID, state.study, state.volumeId, buildRetry, dispatch]);

  // Crosshairs is the default tool once a study is loaded in a multi-view
  // layout (needs the MPR viewports to exist first, hence the small delay).
  const crosshairInitRef = useRef<string | null>(null);
  useEffect(() => {
    if (!engineReady || !state.volumeId) return;
    const multi = state.layoutMode === '1+3' || state.layoutMode === '2x2';
    if (!multi || crosshairInitRef.current === state.volumeId) return;
    crosshairInitRef.current = state.volumeId;
    const id = setTimeout(() => {
      setActiveTool('crosshairs');
      dispatch({ type: 'SET_ACTIVE_TOOL', payload: 'crosshairs' });
    }, 300);
    return () => clearTimeout(id);
  }, [engineReady, state.volumeId, state.layoutMode, dispatch]);

  // H1: release ALL per-study resources only when the viewer is cleared
  // (RESET sets study to null) or unmounts. Switching between loaded studies
  // deliberately keeps every study's volume + scans resident so switching is
  // instant and lossless (the reducer restores each study's saved plan).
  const releaseAll = () => {
    try { cache.purgeCache(); } catch { /* engine already gone */ }
    revokeAllBlobUrls();
    clearScanRegistry();
  };
  const prevStudyRef = useRef<{ uid: string | null; volumeId: string | null }>({ uid: null, volumeId: null });
  useEffect(() => {
    const uid = state.study?.studyInstanceUID ?? null;
    const prev = prevStudyRef.current;
    prevStudyRef.current = { uid, volumeId: state.volumeId };
    if (!prev.uid || prev.uid === uid) return;
    if (!uid) releaseAll(); // RESET: no studies remain, free everything
  }, [state.study?.studyInstanceUID, state.volumeId]);
  // Also release everything on a real unmount. The release is deferred by a
  // macrotask and cancelled if the component mounts again, so React StrictMode's
  // dev-only mount→unmount→remount cycle does NOT purge the volume that the
  // loader created just before this mounted (that purge caused blank viewports
  // in dev). A genuine unmount has no remount to cancel it, so it still fires.
  const releaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (releaseTimerRef.current) {
      clearTimeout(releaseTimerRef.current);
      releaseTimerRef.current = null;
    }
    return () => {
      releaseTimerRef.current = setTimeout(() => releaseAll(), 0);
    };
  }, []);

  // ── Plan autosave / restore (per study, sessionStorage) ─────
  // M3: sessionStorage (not localStorage) so patient-identifying plan data
  // does not persist on disk beyond the browser session; patient name and
  // birth date are stripped from the persisted report (re-entered on demand).
  const studyUID = state.study?.studyInstanceUID ?? null;
  const restoredRef = useRef<string | null>(null);

  // Restore the last autosaved plan once per study, only into a fresh plan
  useEffect(() => {
    if (!studyUID || restoredRef.current === studyUID) return;
    restoredRef.current = studyUID;
    if (state.implants.length || state.anatomy.length || state.measurements.length) return;
    try {
      const key = `rdcv-plan-${studyUID}`;
      // Legacy: pre-M3 autosaves lived in localStorage — drop them, don't migrate.
      localStorage.removeItem(key);
      const raw = sessionStorage.getItem(key);
      if (!raw) return;
      const data = planFromObject(JSON.parse(raw));
      if (data) dispatch({ type: 'LOAD_PLAN', payload: data });
    } catch { /* ignore corrupt autosave */ }
  }, [studyUID, state.implants.length, state.anatomy.length, state.measurements.length, dispatch]);

  // Debounced autosave of the current plan
  useEffect(() => {
    if (!studyUID) return;
    const id = setTimeout(() => {
      try {
        const plan = serializePlan(
          { ...state, report: { ...state.report, patientName: '', patientBirthDate: '' } },
          {
            savedAt: new Date().toISOString(),
            studyInstanceUID: studyUID,
            patientId: state.study?.patientId ?? null,
          },
        );
        sessionStorage.setItem(`rdcv-plan-${studyUID}`, JSON.stringify(plan));
      } catch { /* storage full / unavailable */ }
    }, 800);
    return () => clearTimeout(id);
  }, [
    studyUID, state.implants, state.anatomy, state.measurements, state.archCurveControlPoints,
    state.crossSectionPosition, state.crossSectionTiltDeg, state.panoramicSlabWidth,
    state.panoramicProjection, state.panoramicResolution, state.safety, state.windowLevel,
    state.report, state.study,
  ]);

  return (
    <div className="flex h-full w-full overflow-hidden bg-gray-100 dark:bg-gray-900">
      <LeftPanel />
      <div className="flex-1 relative overflow-hidden">
        {engineReady ? (
          <ViewportGrid />
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 border-4 border-dental-400 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        <RegistrationPanel />
        {engineReady && <WindowLevelSync />}
      </div>
    </div>
  );
}
