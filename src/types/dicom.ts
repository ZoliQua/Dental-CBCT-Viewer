export interface DicomSeriesInfo {
  seriesInstanceUID: string;
  seriesDescription: string;
  seriesNumber: number;
  modality: string;
  imageCount: number;
  imageIds: string[];
}

export interface DicomStudyInfo {
  studyInstanceUID: string;
  studyDescription: string;
  studyDate: string;
  patientName: string;
  patientId: string;
  patientBirthDate: string;
  institution: string;
  series: DicomSeriesInfo[];
}

export interface WindowLevelPreset {
  /** Translation key suffix (preset.<key>) */
  key: string;
  windowCenter: number;
  windowWidth: number;
}

export const WL_PRESETS: WindowLevelPreset[] = [
  { key: 'bone', windowCenter: 300, windowWidth: 1500 },
  { key: 'soft', windowCenter: 40, windowWidth: 400 },
  { key: 'lung', windowCenter: -600, windowWidth: 1500 },
  { key: 'brain', windowCenter: 40, windowWidth: 80 },
  { key: 'dental', windowCenter: 500, windowWidth: 3000 },
  { key: 'implant', windowCenter: 1000, windowWidth: 4000 },
];

export type ViewportTool =
  | 'windowLevel'
  | 'pan'
  | 'zoom'
  | 'scroll'
  | 'length'
  | 'angle'
  | 'ellipticalRoi'
  | 'circleRoi'
  | 'rectangleRoi'
  | 'freehandRoi'
  | 'bidirectional'
  | 'arrowAnnotate'
  | 'probe'
  | 'crosshairs';

export type LayoutMode = '1x1' | '2x2' | '1+3' | 'OPG2+1';

/** A view that can occupy a panel slot in the configurable 1+3 layout. */
export type ViewKey = 'AXIAL' | 'SAGITTAL' | 'CORONAL' | '3D';

export const VIEW_KEYS: ViewKey[] = ['AXIAL', 'SAGITTAL', 'CORONAL', '3D'];

/** Panel assignment for the "3D view" layout: one big slot + three small slots. */
export interface PanelConfig {
  big: ViewKey;
  small: [ViewKey, ViewKey, ViewKey];
  /** 'left' = big on the left, 3 stacked right; 'top' = big on top, 3 in a row below */
  arrangement: 'left' | 'top';
  /** '1+3' = one big + three small; '2x2' = four equal panels */
  grid: '1+3' | '2x2';
  /** Panoramic view arrangement: 'top' = big panoramic on top, 3 below; 'left' = big left */
  panoArrangement: 'left' | 'top';
}

export const DEFAULT_PANEL: PanelConfig = {
  big: '3D',
  small: ['AXIAL', 'SAGITTAL', 'CORONAL'],
  arrangement: 'left',
  grid: '1+3',
  panoArrangement: 'top',
};

/**
 * Force the four 1+3 panels (big + 3 small) to show four DISTINCT views. Each
 * MPR/3D view maps to a single Cornerstone viewport id, so two panels showing
 * the same view would collide (one goes black). Duplicates are replaced with
 * whichever views are missing, keeping a stable bijection.
 */
export function normalizePanelViews(
  big: ViewKey,
  small: [ViewKey, ViewKey, ViewKey],
): { big: ViewKey; small: [ViewKey, ViewKey, ViewKey] } {
  const slots: (ViewKey | null)[] = [big, ...small];
  const seen = new Set<ViewKey>();
  for (let i = 0; i < 4; i++) {
    const v = slots[i];
    if (v && seen.has(v)) slots[i] = null;
    else if (v) seen.add(v);
  }
  const unused = VIEW_KEYS.filter((v) => !seen.has(v));
  let u = 0;
  for (let i = 0; i < 4; i++) {
    if (slots[i] == null) slots[i] = unused[u++] ?? VIEW_KEYS[0];
  }
  return { big: slots[0] as ViewKey, small: [slots[1], slots[2], slots[3]] as [ViewKey, ViewKey, ViewKey] };
}

export type ProjectionMode = 'AVG' | 'MIP';

export type MPROrientation = 'AXIAL' | 'SAGITTAL' | 'CORONAL';

export type ViewMode = MPROrientation | '3D';

/** Translation keys per view mode (use with t()) */
export const VIEW_LABEL_KEYS: Record<ViewMode, string> = {
  AXIAL: 'view.axial',
  SAGITTAL: 'view.sagittal',
  CORONAL: 'view.coronal',
  '3D': 'view.3d',
};

// ── Implant planning ──────────────────────────────────────────

export interface ImplantData {
  id: string;
  /** Layer name shown in the layers panel */
  name: string;
  /** Layer visibility */
  visible: boolean;
  /** Entry point (platform center) in world coordinates, mm */
  position: [number, number, number];
  /** Diameter in mm (typical: 3.0–6.0) */
  diameter: number;
  /** Length in mm (typical: 6.0–16.0) */
  length: number;
  /**
   * Buccolingual apex rotation in degrees, in the cross-section plane.
   * Full ±180° range: 0 = apex down (lower jaw), ±180 = apex up (upper jaw).
   */
  angleBLDeg: number;
  /** Mesiodistal apex tilt in degrees (lean along the arch, visible on the panoramic) */
  angleMDDeg: number;
  /** Implant system catalog id (provides sleeve diameter + available sizes) */
  systemId?: string;
  /** Guided (template) surgery plan — drill sleeve + osteotomy protocol */
  guided?: GuidedPlan;
}

// ── Guided (template-based) surgery ────────────────────────────

export const IMPLANT_DIAMETERS = [3.0, 3.3, 3.5, 3.75, 4.0, 4.2, 4.5, 5.0, 5.5, 6.0];
export const IMPLANT_LENGTHS = [6.0, 7.0, 8.0, 8.5, 9.0, 10.0, 11.0, 11.5, 12.0, 13.0, 14.0, 15.0, 16.0];

/** An implant product line: available sizes + its guided drill sleeve. */
export interface ImplantSystem {
  id: string;
  brand: string;
  line: string;
  diameters: number[];
  lengths: number[];
  /** Persely (drill sleeve) working diameter in mm */
  sleeveDiameter: number;
}

export const IMPLANT_SYSTEMS: ImplantSystem[] = [
  {
    id: 'generic',
    brand: 'Generic',
    line: 'Standard',
    diameters: IMPLANT_DIAMETERS,
    lengths: IMPLANT_LENGTHS,
    sleeveDiameter: 5.0,
  },
  {
    id: 'alphabio-multineo-cs',
    brand: 'Alpha-Bio',
    line: 'MultiNeo CS',
    diameters: [3.5, 3.75, 4.2, 5.0, 6.0],
    lengths: [8.0, 10.0, 11.5, 13.0, 16.0],
    sleeveDiameter: 5.5,
  },
  {
    id: 'straumann-blx',
    brand: 'Straumann',
    line: 'BLX',
    diameters: [3.5, 3.75, 4.0, 4.5, 5.0, 5.5, 6.5],
    lengths: [6.0, 8.0, 10.0, 12.0, 14.0, 16.0],
    sleeveDiameter: 5.0,
  },
  {
    id: 'nobel-active',
    brand: 'Nobel Biocare',
    line: 'NobelActive',
    diameters: [3.0, 3.5, 4.3, 5.0],
    lengths: [8.5, 10.0, 11.5, 13.0, 15.0, 18.0],
    sleeveDiameter: 5.0,
  },
];

export const DEFAULT_IMPLANT_SYSTEM_ID = 'generic';

/** Guided drill sleeve + osteotomy parameters for one implant. */
export interface GuidedPlan {
  /** Show the sleeve + drill axis on every view */
  enabled: boolean;
  /** Sleeve bottom → implant platform distance along the axis, mm (drill protocol offset) */
  sleeveOffset: number;
  /** Sleeve (bushing) height, mm */
  sleeveHeight: number;
  /** Planned osteotomy depth from the platform along the axis, mm (Fúró hossz) */
  drillLength: number;
}

export const SLEEVE_OFFSETS = [8, 9, 10, 11, 12];

/**
 * Drill-guide (surgical template) export parameters. Kept here (no manifold
 * import) so the context/Settings can reference the defaults without pulling in
 * the WASM Boolean kernel — that lives in `core/guideBuilder` (loaded on demand).
 */
export interface GuideParams {
  /** Sleeve housing wall thickness (radial), mm */
  wallMm: number;
  /** Base bar cross-section width, mm */
  baseWidthMm: number;
  /** Base bar cross-section height (Z), mm */
  baseHeightMm: number;
  /** Extra diameter on the drill channel over the sleeve diameter, mm */
  channelTolMm: number;
  /** Angular tessellation of cylinders */
  segments: number;
}

export const GUIDE_DEFAULTS: GuideParams = {
  wallMm: 1.5,
  baseWidthMm: 5,
  baseHeightMm: 4,
  channelTolMm: 0.1,
  segments: 48,
};

export function getImplantSystem(id: string | undefined): ImplantSystem {
  return IMPLANT_SYSTEMS.find((s) => s.id === id) ?? IMPLANT_SYSTEMS[0];
}

export function defaultGuidedPlan(implant: { length: number }): GuidedPlan {
  return { enabled: true, sleeveOffset: 9, sleeveHeight: 5, drillLength: implant.length };
}

// ── Multimodal: imported scan meshes (STL/OBJ/PLY) ─────────────

export type ScanType = 'oral' | 'bite' | 'antagonist' | 'toothSetup';

/** An imported surface mesh, aligned to the CBCT by a 4×4 transform. */
export interface ScanMesh {
  id: string;
  name: string;
  type: ScanType;
  color: string;
  opacity: number;
  visible: boolean;
  /** 4×4 column-major transform (vtk userMatrix); registration result */
  transform: number[];
  /** Source file name (the mesh geometry itself is kept in memory, not persisted) */
  fileName: string;
}

export const SCAN_DEFAULTS: Record<ScanType, { color: string; opacity: number }> = {
  oral: { color: '#e8c0a8', opacity: 1 },
  bite: { color: '#c0c0ff', opacity: 0.85 },
  antagonist: { color: '#b0e0b0', opacity: 0.85 },
  toothSetup: { color: '#ffffff', opacity: 0.9 },
};

export const SCAN_TYPES: ScanType[] = ['oral', 'bite', 'antagonist', 'toothSetup'];

// ── Safety: anatomy markers (nerve canal, sinus floor) ─────────

export type AnatomyType = 'nerve' | 'sinus';

/** A traced anatomical boundary as a world-mm polyline with a safety tube. */
export interface AnatomyMarker {
  id: string;
  name: string;
  visible: boolean;
  type: AnatomyType;
  /** Display color */
  color: string;
  /** Safety tube radius, mm */
  radius: number;
  /** World polyline, mm */
  points: [number, number, number][];
}

export const ANATOMY_DEFAULTS: Record<AnatomyType, { color: string; radius: number }> = {
  nerve: { color: '#ff5577', radius: 1.5 },
  sinus: { color: '#55aaff', radius: 1.0 },
};

/** One measurement shown as its own layer in the layers panel */
export interface MeasurementLayer {
  /** Cornerstone annotationUID or generated id for canvas measurements */
  id: string;
  /** 'annotation' = Cornerstone tool on MPR views; 'canvas' = drawn on panoramic/cross-section */
  kind: 'annotation' | 'canvas';
  /** Tool key suffix for tool.<key> translation */
  tool: string;
  name: string;
  visible: boolean;
  /** Canvas measurements: which custom viewport they belong to */
  viewport?: 'panoramic' | 'crossSection';
  /** Canvas measurements: points in normalized image coords (0-1) */
  points?: [number, number][];
  /** Formatted measured value (mm, °, HU) */
  value?: string;
}

export type Volume3DPreset = 'CT-Bone' | 'CT-Bones' | 'CT-Coronary-Arteries-3' | 'CT-MIP';

export const VOLUME_3D_PRESETS: { id: Volume3DPreset; labelKey: string }[] = [
  { id: 'CT-Bone', labelKey: 'preset3d.bone' },
  { id: 'CT-Bones', labelKey: 'preset3d.bones' },
  { id: 'CT-Coronary-Arteries-3', labelKey: 'preset3d.dental' },
  { id: 'CT-MIP', labelKey: 'preset3d.mip' },
];
