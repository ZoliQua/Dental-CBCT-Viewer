import { useEffect, useCallback, useRef, useImperativeHandle, forwardRef } from 'react';
import { ViewerProvider, useViewer } from '@/context/ViewerContext';
import { I18nProvider, useI18n } from '@/i18n/I18nContext';
import { ThemeProvider, useTheme } from '@/context/ThemeContext';
import { initCornerstone } from '@/core/init';
import { setActiveTool } from '@/core/toolManager';
import { LandingPage } from '@/components/dicom/LandingPage';
import { DisclaimerBanner } from '@/components/dicom/DisclaimerBanner';
import { ViewerShell } from '@/components/layout/ViewerShell';
import { TopBar } from '@/components/layout/TopBar';
import { StatusBar } from '@/components/layout/StatusBar';
import { SettingsPanel } from '@/components/panels/SettingsPanel';
import { IntroTour } from '@/components/panels/IntroTour';
import { HelpPanel } from '@/components/panels/HelpPanel';
import { useDicomLoader } from '@/hooks/useDicomLoader';
import { serializePlan } from '@/core/planIO';
import { loadSample } from '@/core/sampleLoader';
import { exportPlanPdf, exportDrillGuideStl } from '@/core/viewerExports';
import type { PlanData } from '@/core/planIO';
import type { ViewportTool, ImplantData, LayoutMode, ViewKey } from '@/types/dicom';

const SHORTCUT_MAP: Record<string, ViewportTool> = {
  w: 'windowLevel',
  p: 'pan',
  z: 'zoom',
  s: 'scroll',
  l: 'length',
  a: 'angle',
  e: 'ellipticalRoi',
  c: 'circleRoi',
  r: 'rectangleRoi',
  f: 'freehandRoi',
  b: 'bidirectional',
  h: 'probe',
  n: 'arrowAnnotate',
  x: 'crosshairs',
};

// ── Public component props / imperative handle ──────────────────

export interface DicomViewerProps {
  /** Optional patient identity shown in the report header. */
  patientId?: string;
  patientName?: string;
  /** Load a saved plan (implants, anatomy, arch, settings…) on mount. */
  initialPlan?: PlanData;
  /** Start in this layout ('1x1' | '1+3' | '2x2' | 'OPG2+1'). */
  initialLayout?: LayoutMode;
  /** UI language ('en' | 'de' | 'es' | 'hu'). */
  lang?: string;
  /** Called (debounced) whenever the plan changes — persist it host-side. */
  onPlanChange?: (plan: PlanData) => void;
  /** Called whenever the implant list changes. */
  onImplantsChange?: (implants: ImplantData[]) => void;
  /** Extra class name on the root element. */
  className?: string;
  /** Embed mode — the host owns page-level consent, so the built-in
   *  disclaimer banner is suppressed. */
  embedded?: boolean;
}

export interface DicomViewerHandle {
  getImplants(): ImplantData[];
  addImplant(implant: ImplantData): void;
  updateImplant(implant: ImplantData): void;
  removeImplant(id: string): void;
  getPlan(): PlanData;
  loadPlan(plan: PlanData): void;
  loadStudy(files: File[]): Promise<void>;
  loadSample(): Promise<void>;
  setLayout(mode: LayoutMode): void;
  setActiveView(view: ViewKey): void;
  exportPdf(): Promise<void>;
  exportGuideStl(): Promise<boolean>;
}

function ViewerApp({
  props,
  handleRef,
}: {
  props: DicomViewerProps;
  handleRef: React.Ref<DicomViewerHandle>;
}) {
  const { state, dispatch } = useViewer();
  const { t, lang, setLang } = useI18n();
  const { theme } = useTheme();
  const { loadFiles } = useDicomLoader();

  // Latest state for the imperative handle (avoids stale closures without
  // rebuilding the handle every render).
  const stateRef = useRef(state);
  stateRef.current = state;

  const planMeta = () => ({
    savedAt: new Date().toISOString(),
    studyInstanceUID: stateRef.current.study?.studyInstanceUID ?? null,
    patientId: stateRef.current.study?.patientId ?? null,
  });

  const openSample = useCallback(async () => {
    const { study, volumeId, windowLevel } = await loadSample();
    dispatch({ type: 'SET_STUDY', payload: study });
    dispatch({ type: 'SET_WINDOW_LEVEL', payload: windowLevel });
    dispatch({ type: 'SET_VOLUME_ID', payload: volumeId });
  }, [dispatch]);

  useImperativeHandle(handleRef, (): DicomViewerHandle => ({
    getImplants: () => stateRef.current.implants,
    addImplant: (implant) => dispatch({ type: 'ADD_IMPLANT', payload: implant }),
    updateImplant: (implant) => dispatch({ type: 'UPDATE_IMPLANT', payload: implant }),
    removeImplant: (id) => dispatch({ type: 'REMOVE_IMPLANT', payload: id }),
    getPlan: () => serializePlan(stateRef.current, planMeta()),
    loadPlan: (plan) => dispatch({ type: 'LOAD_PLAN', payload: plan }),
    loadStudy: (files) => loadFiles(files),
    loadSample: openSample,
    setLayout: (mode) => dispatch({ type: 'SET_LAYOUT_MODE', payload: mode }),
    setActiveView: (view) => dispatch({ type: 'SET_VIEW_MODE', payload: view }),
    exportPdf: () => exportPlanPdf(stateRef.current, t, lang),
    exportGuideStl: () => exportDrillGuideStl(stateRef.current).then((r) => r.ok),
  }), [dispatch, loadFiles, openSample, t, lang]);

  // ── Prop → state wiring ─────────────────────────────────────
  const appliedInitial = useRef(false);
  useEffect(() => {
    if (appliedInitial.current || !state.isInitialized) return;
    appliedInitial.current = true;
    if (props.initialLayout) dispatch({ type: 'SET_LAYOUT_MODE', payload: props.initialLayout });
    if (props.initialPlan) dispatch({ type: 'LOAD_PLAN', payload: props.initialPlan });
  }, [state.isInitialized, props.initialLayout, props.initialPlan, dispatch]);

  useEffect(() => {
    if (props.lang && props.lang !== lang) setLang(props.lang as Parameters<typeof setLang>[0]);
  }, [props.lang, lang, setLang]);

  // Notify the host when the implant list changes.
  const onImplants = props.onImplantsChange;
  useEffect(() => {
    onImplants?.(state.implants);
  }, [state.implants, onImplants]);

  // Notify the host (debounced) when the plan changes.
  const onPlan = props.onPlanChange;
  useEffect(() => {
    if (!onPlan) return;
    const id = setTimeout(() => onPlan(serializePlan(stateRef.current, planMeta())), 500);
    return () => clearTimeout(id);
  }, [
    onPlan, state.implants, state.anatomy, state.measurements, state.archCurveControlPoints,
    state.crossSectionPosition, state.crossSectionTiltDeg, state.safety, state.report, state.guide,
  ]);

  // Keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const tool = SHORTCUT_MAP[e.key.toLowerCase()];
      if (tool) {
        setActiveTool(tool);
        dispatch({ type: 'SET_ACTIVE_TOOL', payload: tool });
      }
    },
    [dispatch],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    initCornerstone()
      .then(() => {
        dispatch({ type: 'SET_INITIALIZED' });
      })
      .catch((err) => {
        dispatch({
          type: 'SET_ERROR',
          payload: t('app.initError', { msg: err instanceof Error ? err.message : String(err) }),
        });
      });
  }, [dispatch, t]);

  let content;
  if (!state.isInitialized) {
    content = (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-dental-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">{t('app.initializing')}</p>
        </div>
      </div>
    );
  } else if (state.error && !state.study) {
    content = (
      <div className="flex items-center justify-center h-full">
        <div className="text-center max-w-md">
          <p className="text-red-500 dark:text-red-400 mb-4">{state.error}</p>
          <button
            onClick={() => dispatch({ type: 'SET_ERROR', payload: null })}
            className="px-4 py-2 bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 rounded transition-colors"
          >
            {t('app.retry')}
          </button>
        </div>
      </div>
    );
  } else if (!state.study) {
    content = <LandingPage />;
  } else {
    content = <ViewerShell />;
  }

  // The `dark` class lives on the viewer's own root (dcv-root) — never on
  // <html> — so an embedded viewer never toggles the host page's theme.
  return (
    <div className={`dcv-root ${theme === 'dark' ? 'dark' : ''} ${props.className ?? ''} h-full w-full`}>
      <div className="flex flex-col h-full w-full overflow-hidden bg-gray-100 text-gray-900 dark:bg-gray-900 dark:text-gray-100">
        <TopBar />
        <div className="flex-1 overflow-hidden">{content}</div>
        <StatusBar />
        <SettingsPanel />
        <IntroTour />
        <HelpPanel />
        {!props.embedded && <DisclaimerBanner />}
      </div>
    </div>
  );
}

/**
 * Embeddable DenCT (Dental CBCT Viewer). Render it (optionally with a ref for the
 * imperative API) and import `dental-cbct-viewer/style.css` once.
 */
const DicomViewer = forwardRef<DicomViewerHandle, DicomViewerProps>((props, ref) => {
  return (
    <I18nProvider>
      <ThemeProvider>
        <ViewerProvider>
          <ViewerApp props={props} handleRef={ref} />
        </ViewerProvider>
      </ThemeProvider>
    </I18nProvider>
  );
});
DicomViewer.displayName = 'DicomViewer';

export default DicomViewer;
