import { createContext, useContext, useReducer, type ReactNode, type Dispatch } from 'react';
import type { DicomStudyInfo, ViewportTool, LayoutMode, ViewMode, ProjectionMode, ImplantData, MeasurementLayer, AnatomyMarker, AnatomyType, ScanMesh, GuideParams, PanelConfig } from '@/types/dicom';
import { GUIDE_DEFAULTS, DEFAULT_PANEL, DEFAULT_IMPLANT_SYSTEM_ID, normalizePanelViews } from '@/types/dicom';
import type { ParsedPlan } from '@/core/planIO';

export interface ViewerState {
  isInitialized: boolean;
  isLoading: boolean;
  loadProgress: { loaded: number; total: number } | null;
  study: DicomStudyInfo | null;
  activeSeriesUID: string | null;
  activeTool: ViewportTool;
  layoutMode: LayoutMode;
  /** Panel assignment for the configurable 1+3 layout */
  panel: PanelConfig;
  volumeId: string | null;
  viewMode: ViewMode;
  currentSliceIndex: number;
  totalSlices: number;
  error: string | null;
  // Panoramic OPG state
  archCurveControlPoints: [number, number][] | null;
  panoramicSlabWidth: number;
  panoramicProjection: ProjectionMode;
  panoramicResolution: number; // mm per pixel along the curve
  // Cross-section state
  crossSectionPosition: number; // 0-1 normalized position along arch curve
  crossSectionTiltDeg: number;  // degrees, tilt of cross-section plane
  // Implant planning
  implants: ImplantData[];
  activeImplantId: string | null;
  implantPlacementMode: boolean;
  /** Implant whose edit popup is open (null = closed) */
  editingImplantId: string | null;
  // Right-side slide-in panels (one open at a time)
  activePanel: 'layers' | 'settings' | 'help' | 'patients' | 'intro' | null;
  // Left layers rail expanded?
  layersOpen: boolean;
  // Shared window/level (applies to panoramic, cross-section and MPR)
  windowLevel: { wc: number; ww: number };
  // Implant safety-margin halo (mm + color) and clearance thresholds (mm)
  safety: { marginMm: number; color: string; nerveMm: number; sinusMm: number; neighborMm: number };
  // Anatomy markers (nerve canal, sinus floor) + tracing mode
  anatomy: AnatomyMarker[];
  anatomyDrawMode: AnatomyType | null;
  activeAnatomyId: string | null;
  // Drill-guide (surgical template) export parameters
  guide: GuideParams;
  // Default implant system for newly placed implants
  defaultSystemId: string;
  // Imported scan meshes (geometry lives in scanMesh registry, not in state)
  scans: ScanMesh[];
  // Active landmark registration session (null = not registering)
  registration: RegistrationSession | null;
  // Editable report header fields (shown in the PDF report)
  report: ReportFields;
  // On-image display + overlay styling preferences
  display: DisplayConfig;
  // Individual measurement layers (Cornerstone annotations + canvas drawings)
  measurements: MeasurementLayer[];
  /** Set when a plan file recorded for a different study was ignored (UI may warn) */
  planMismatch: boolean;
}

export interface ReportFields {
  patientName: string;
  patientAge: string;
  patientBirthDate: string;
  quoteNumber: string;
  statusDescription: string;
  /** On-image text overrides (empty = use the DICOM value) */
  clinic: string;
  studyDate: string;
  seriesName: string;
}

/** On-image display + overlay styling preferences (Settings → General). */
export interface DisplayConfig {
  showName: boolean;
  showBirth: boolean;
  showDate: boolean;
  showClinic: boolean;
  /** Orientation label color (Axial/Sagittal/Coronal) */
  labelColor: string;
  /** Orientation label font size, px — separate for the main and the side views */
  labelSizeMain: number;
  labelSizeSide: number;
  labelAlign: 'left' | 'center' | 'right';
  /** On-image series/modality/slice-number toggles */
  showSeries: boolean;
  showModality: boolean;
  showSlice: boolean;
  /** Whether on-image data shows on the main (big) view only, or every view */
  scope: 'main' | 'all';
  /** 3D slice-plane opacity (0.05–1) */
  sliceOpacity: number;
  /** Default 3D volume preset (CT-Bone, …, or the custom "X-Ray") */
  preset3d: string;
}

export const DISPLAY_DEFAULTS: DisplayConfig = {
  showName: true,
  showBirth: true,
  showDate: true,
  showClinic: true,
  labelColor: '#fbbf24',
  labelSizeMain: 18,
  labelSizeSide: 14,
  labelAlign: 'center',
  showSeries: false,
  showModality: false,
  showSlice: true,
  scope: 'main',
  sliceOpacity: 0.2,
  preset3d: 'X-Ray',
};

/** One landmark pair (scan point + corresponding CBCT point), world mm. */
export interface RegPair {
  scan: [number, number, number] | null;
  cbct: [number, number, number] | null;
}

/** Active 3-point landmark registration session for one scan. */
export interface RegistrationSession {
  scanId: string;
  pairs: RegPair[];
  /** Which slot/side is currently awaiting a click, if any */
  picking: { slot: number; kind: 'scan' | 'cbct' } | null;
}

export type ViewerAction =
  | { type: 'SET_INITIALIZED' }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_LOAD_PROGRESS'; payload: { loaded: number; total: number } }
  | { type: 'SET_STUDY'; payload: DicomStudyInfo }
  | { type: 'SET_ACTIVE_SERIES'; payload: string }
  | { type: 'SET_ACTIVE_TOOL'; payload: ViewportTool }
  | { type: 'SET_LAYOUT_MODE'; payload: LayoutMode }
  | { type: 'SET_PANEL'; payload: Partial<PanelConfig> }
  | { type: 'SET_VOLUME_ID'; payload: string }
  | { type: 'SET_VIEW_MODE'; payload: ViewMode }
  | { type: 'SET_SLICE_INFO'; payload: { index: number; total: number } }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_ARCH_CURVE'; payload: [number, number][] }
  | { type: 'SET_PANORAMIC_SLAB'; payload: number }
  | { type: 'SET_PANORAMIC_PROJECTION'; payload: ProjectionMode }
  | { type: 'SET_PANORAMIC_RESOLUTION'; payload: number }
  | { type: 'SET_CROSS_SECTION_POSITION'; payload: number }
  | { type: 'SET_CROSS_SECTION_TILT'; payload: number }
  | { type: 'ADD_IMPLANT'; payload: ImplantData }
  | { type: 'UPDATE_IMPLANT'; payload: ImplantData }
  | { type: 'REMOVE_IMPLANT'; payload: string }
  | { type: 'SET_ACTIVE_IMPLANT'; payload: string | null }
  | { type: 'SET_IMPLANT_PLACEMENT_MODE'; payload: boolean }
  | { type: 'SET_EDITING_IMPLANT'; payload: string | null }
  | { type: 'SET_ACTIVE_PANEL'; payload: 'layers' | 'settings' | 'help' | 'patients' | 'intro' | null }
  | { type: 'TOGGLE_PANEL'; payload: 'layers' | 'settings' | 'help' | 'patients' | 'intro' }
  | { type: 'TOGGLE_LAYERS' }
  | { type: 'SET_WINDOW_LEVEL'; payload: { wc: number; ww: number } }
  | { type: 'SET_SAFETY'; payload: Partial<{ marginMm: number; color: string; nerveMm: number; sinusMm: number; neighborMm: number }> }
  | { type: 'SET_GUIDE'; payload: Partial<GuideParams> }
  | { type: 'SET_DEFAULT_SYSTEM'; payload: string }
  | { type: 'SET_REPORT'; payload: Partial<ReportFields> }
  | { type: 'SET_DISPLAY'; payload: Partial<DisplayConfig> }
  | { type: 'ADD_ANATOMY'; payload: AnatomyMarker }
  | { type: 'UPDATE_ANATOMY'; payload: AnatomyMarker }
  | { type: 'REMOVE_ANATOMY'; payload: string }
  | { type: 'SET_ANATOMY_DRAW_MODE'; payload: AnatomyType | null }
  | { type: 'SET_ACTIVE_ANATOMY'; payload: string | null }
  | { type: 'ADD_SCAN'; payload: ScanMesh }
  | { type: 'UPDATE_SCAN'; payload: ScanMesh }
  | { type: 'REMOVE_SCAN'; payload: string }
  | { type: 'START_REGISTRATION'; payload: string }
  | { type: 'SET_REG_PICKING'; payload: { slot: number; kind: 'scan' | 'cbct' } | null }
  | { type: 'SET_REG_POINT'; payload: { slot: number; kind: 'scan' | 'cbct'; point: [number, number, number] } }
  | { type: 'END_REGISTRATION' }
  | { type: 'LOAD_PLAN'; payload: ParsedPlan }
  | { type: 'ADD_MEASUREMENT'; payload: MeasurementLayer }
  | { type: 'UPDATE_MEASUREMENT'; payload: MeasurementLayer }
  | { type: 'REMOVE_MEASUREMENT'; payload: string }
  | { type: 'RESET' };

/** Exported for unit tests. */
export const initialState: ViewerState = {
  isInitialized: false,
  isLoading: false,
  loadProgress: null,
  study: null,
  activeSeriesUID: null,
  activeTool: 'windowLevel',
  layoutMode: '1+3',
  panel: DEFAULT_PANEL,
  volumeId: null,
  viewMode: 'AXIAL' as ViewMode,
  currentSliceIndex: 0,
  totalSlices: 0,
  error: null,
  archCurveControlPoints: null,
  panoramicSlabWidth: 20,
  panoramicProjection: 'AVG' as ProjectionMode,
  panoramicResolution: 0.3,
  crossSectionPosition: 0.5,
  crossSectionTiltDeg: 0,
  implants: [],
  activeImplantId: null,
  implantPlacementMode: false,
  editingImplantId: null,
  activePanel: null,
  layersOpen: false,
  windowLevel: { wc: 300, ww: 2500 },
  safety: { marginMm: 1, color: '#ff3c3c', nerveMm: 2, sinusMm: 1, neighborMm: 3 },
  guide: { ...GUIDE_DEFAULTS },
  defaultSystemId: DEFAULT_IMPLANT_SYSTEM_ID,
  anatomy: [],
  anatomyDrawMode: null,
  activeAnatomyId: null,
  scans: [],
  registration: null,
  // Empty defaults: real DICOM metadata must flow through (consumers fall back
  // to study values via `report?.field?.trim() || study?.field`); placeholders
  // here would override genuine patient data in exports.
  report: { patientName: '', patientAge: '', patientBirthDate: '', quoteNumber: '', statusDescription: '', clinic: '', studyDate: '', seriesName: '' },
  display: DISPLAY_DEFAULTS,
  measurements: [],
  planMismatch: false,
};

// Exported for unit tests (reducer behavior is exercised directly).
export function viewerReducer(state: ViewerState, action: ViewerAction): ViewerState {
  switch (action.type) {
    case 'SET_INITIALIZED':
      return { ...state, isInitialized: true };
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload, error: null, loadProgress: null };
    case 'SET_LOAD_PROGRESS':
      return { ...state, loadProgress: action.payload };
    case 'SET_STUDY': {
      const isNewStudy = state.study?.studyInstanceUID !== action.payload.studyInstanceUID;
      return {
        ...state,
        study: action.payload,
        activeSeriesUID: action.payload.series[0]?.seriesInstanceUID ?? null,
        isLoading: false,
        loadProgress: null,
        planMismatch: false,
        // C2: plan data is world-space and bound to a specific study — never
        // carry it across a patient/study change (same-study re-dispatch keeps it).
        ...(isNewStudy ? {
          volumeId: null,
          implants: [] as ImplantData[],
          anatomy: [] as AnatomyMarker[],
          measurements: [] as MeasurementLayer[],
          archCurveControlPoints: null,
          scans: [] as ScanMesh[],
          registration: null,
          activeImplantId: null,
          editingImplantId: null,
          activeAnatomyId: null,
          anatomyDrawMode: null,
        } : {}),
      };
    }
    case 'SET_ACTIVE_SERIES': {
      if (action.payload === state.activeSeriesUID) return state;
      // M2: plan geometry lives in world coordinates. DicomSeriesInfo does not
      // carry FrameOfReferenceUID, so we cannot prove two series of one study
      // share a frame of reference — conservatively clear world-space plan data
      // on any series switch (scans stay: they are registered separately and
      // are not part of the persisted plan).
      return {
        ...state,
        activeSeriesUID: action.payload,
        volumeId: null,
        implants: [],
        anatomy: [],
        measurements: [],
        archCurveControlPoints: null,
        activeImplantId: null,
        editingImplantId: null,
        activeAnatomyId: null,
        anatomyDrawMode: null,
      };
    }
    case 'SET_ACTIVE_TOOL':
      return { ...state, activeTool: action.payload };
    case 'SET_LAYOUT_MODE':
      return { ...state, layoutMode: action.payload, viewMode: 'AXIAL' };
    case 'SET_PANEL': {
      const merged = { ...state.panel, ...action.payload };
      const norm = normalizePanelViews(merged.big, merged.small);
      return { ...state, panel: { ...merged, big: norm.big, small: norm.small } };
    }
    case 'SET_VOLUME_ID':
      return { ...state, volumeId: action.payload };
    case 'SET_VIEW_MODE':
      return { ...state, viewMode: action.payload };
    case 'SET_SLICE_INFO':
      return { ...state, currentSliceIndex: action.payload.index, totalSlices: action.payload.total };
    case 'SET_ERROR':
      return { ...state, error: action.payload, isLoading: false, loadProgress: null };
    case 'SET_ARCH_CURVE':
      return { ...state, archCurveControlPoints: action.payload };
    case 'SET_PANORAMIC_SLAB':
      return { ...state, panoramicSlabWidth: action.payload };
    case 'SET_PANORAMIC_PROJECTION':
      return { ...state, panoramicProjection: action.payload };
    case 'SET_PANORAMIC_RESOLUTION':
      return { ...state, panoramicResolution: action.payload };
    case 'SET_CROSS_SECTION_POSITION':
      return { ...state, crossSectionPosition: action.payload };
    case 'SET_CROSS_SECTION_TILT':
      return { ...state, crossSectionTiltDeg: action.payload };
    case 'ADD_IMPLANT':
      // Keep placement mode on so several implants can be dropped in a row;
      // the user exits with Esc or by toggling the "+ Implant" button.
      return { ...state, implants: [...state.implants, action.payload], activeImplantId: action.payload.id };
    case 'UPDATE_IMPLANT':
      return { ...state, implants: state.implants.map(imp => imp.id === action.payload.id ? action.payload : imp) };
    case 'REMOVE_IMPLANT':
      return {
        ...state,
        implants: state.implants.filter(imp => imp.id !== action.payload),
        activeImplantId: state.activeImplantId === action.payload ? null : state.activeImplantId,
        editingImplantId: state.editingImplantId === action.payload ? null : state.editingImplantId,
      };
    case 'SET_ACTIVE_IMPLANT':
      return { ...state, activeImplantId: action.payload };
    case 'SET_IMPLANT_PLACEMENT_MODE':
      return { ...state, implantPlacementMode: action.payload };
    case 'SET_EDITING_IMPLANT':
      return { ...state, editingImplantId: action.payload };
    case 'SET_ACTIVE_PANEL':
      return { ...state, activePanel: action.payload };
    case 'TOGGLE_PANEL':
      return { ...state, activePanel: state.activePanel === action.payload ? null : action.payload };
    case 'TOGGLE_LAYERS':
      return { ...state, layersOpen: !state.layersOpen };
    case 'SET_WINDOW_LEVEL':
      return { ...state, windowLevel: action.payload };
    case 'SET_SAFETY':
      return { ...state, safety: { ...state.safety, ...action.payload } };
    case 'SET_GUIDE':
      return { ...state, guide: { ...state.guide, ...action.payload } };
    case 'SET_DEFAULT_SYSTEM':
      return { ...state, defaultSystemId: action.payload };
    case 'ADD_ANATOMY':
      return { ...state, anatomy: [...state.anatomy, action.payload], activeAnatomyId: action.payload.id };
    case 'UPDATE_ANATOMY':
      return { ...state, anatomy: state.anatomy.map(a => a.id === action.payload.id ? action.payload : a) };
    case 'REMOVE_ANATOMY':
      return {
        ...state,
        anatomy: state.anatomy.filter(a => a.id !== action.payload),
        activeAnatomyId: state.activeAnatomyId === action.payload ? null : state.activeAnatomyId,
      };
    case 'SET_ANATOMY_DRAW_MODE':
      return { ...state, anatomyDrawMode: action.payload };
    case 'SET_ACTIVE_ANATOMY':
      return { ...state, activeAnatomyId: action.payload };
    case 'ADD_SCAN':
      return { ...state, scans: [...state.scans, action.payload] };
    case 'UPDATE_SCAN':
      return { ...state, scans: state.scans.map(s => s.id === action.payload.id ? action.payload : s) };
    case 'REMOVE_SCAN':
      return {
        ...state,
        scans: state.scans.filter(s => s.id !== action.payload),
        registration: state.registration?.scanId === action.payload ? null : state.registration,
      };
    case 'START_REGISTRATION':
      return {
        ...state,
        registration: {
          scanId: action.payload,
          pairs: [{ scan: null, cbct: null }, { scan: null, cbct: null }, { scan: null, cbct: null }],
          picking: null,
        },
      };
    case 'SET_REG_PICKING':
      return state.registration ? { ...state, registration: { ...state.registration, picking: action.payload } } : state;
    case 'SET_REG_POINT': {
      if (!state.registration) return state;
      const pairs = state.registration.pairs.map((p, i) =>
        i === action.payload.slot ? { ...p, [action.payload.kind]: action.payload.point } : p);
      return { ...state, registration: { ...state.registration, pairs, picking: null } };
    }
    case 'END_REGISTRATION':
      return { ...state, registration: null };
    case 'LOAD_PLAN': {
      // C2: never silently apply a plan recorded for a different study — the
      // world-space coordinates would land on the wrong patient. Surface the
      // mismatch (planMismatch flag) so the UI can ask for confirmation later.
      const planUID = action.payload.studyInstanceUID;
      if (planUID && state.study && planUID !== state.study.studyInstanceUID) {
        console.warn('[DQ-DICOM] Plan ignored: recorded for a different study', planUID);
        return { ...state, planMismatch: true };
      }
      // Replace the persistable slices in one shot; clear transient selection
      const { studyInstanceUID: _ignored, ...plan } = action.payload;
      return {
        ...state,
        ...plan,
        planMismatch: false,
        activeImplantId: null,
        editingImplantId: null,
        activeAnatomyId: null,
        anatomyDrawMode: null,
        implantPlacementMode: false,
      };
    }
    case 'SET_REPORT':
      return { ...state, report: { ...state.report, ...action.payload } };
    case 'SET_DISPLAY':
      return { ...state, display: { ...state.display, ...action.payload } };
    case 'ADD_MEASUREMENT':
      return { ...state, measurements: [...state.measurements, action.payload] };
    case 'UPDATE_MEASUREMENT':
      return { ...state, measurements: state.measurements.map(m => m.id === action.payload.id ? action.payload : m) };
    case 'REMOVE_MEASUREMENT':
      return { ...state, measurements: state.measurements.filter(m => m.id !== action.payload) };
    case 'RESET':
      return { ...initialState, isInitialized: state.isInitialized };
    default:
      return state;
  }
}

const ViewerContext = createContext<{
  state: ViewerState;
  dispatch: Dispatch<ViewerAction>;
} | null>(null);

export function ViewerProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(viewerReducer, initialState);
  return (
    <ViewerContext.Provider value={{ state, dispatch }}>
      {children}
    </ViewerContext.Provider>
  );
}

export function useViewer() {
  const context = useContext(ViewerContext);
  if (!context) throw new Error('useViewer must be used within ViewerProvider');
  return context;
}
