/**
 * Remembered view preferences — how the user likes the viewer arranged, kept
 * across reloads in localStorage (per browser, NOT part of a saved plan, which
 * stays tied to a study).
 *
 * Deliberately narrow: only the layout and the 3D pane's own toggles. Anything
 * that belongs to a case (implants, arch, window level…) lives in PlanData.
 *
 * Storage is best-effort: it throws in private mode / blocked-cookie settings
 * and can come back empty, so every read is validated and every write is
 * swallowed.
 */

import { normalizeOpgOrder, normalizePanelViews, DEFAULT_PANEL, type LayoutMode, type PanelConfig } from '@/types/dicom';
import { JAW_SIDES, type JawSide } from './jawSplit';

const KEY = 'denct.viewPrefs.v1';
const LAYOUTS: LayoutMode[] = ['1x1', '2x2', '1+3', 'OPG2+1', 'IO3D'];

export interface ViewPrefs {
  layoutMode: LayoutMode;
  panel: PanelConfig;
  /** Which cutting slice planes the 3D view shows. */
  sliceAxes: { AXIAL: boolean; SAGITTAL: boolean; CORONAL: boolean };
  /** The 3D "CS" marker showing where the cross-section cuts. */
  showCrossSection: boolean;
  /** Which jaw the 3D view is cut down to. */
  jawSide: JawSide;
}

export const DEFAULT_VIEW_PREFS: ViewPrefs = {
  layoutMode: '1+3',
  panel: DEFAULT_PANEL,
  sliceAxes: { AXIAL: true, SAGITTAL: true, CORONAL: true },
  showCrossSection: true,
  jawSide: 'both',
};

const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);

/** Read the stored preferences, falling back to the defaults field by field. */
export function loadViewPrefs(): ViewPrefs {
  let raw: unknown;
  try {
    const s = localStorage.getItem(KEY);
    if (!s) return DEFAULT_VIEW_PREFS;
    raw = JSON.parse(s);
  } catch {
    return DEFAULT_VIEW_PREFS; // unparsable or storage unavailable
  }
  if (!raw || typeof raw !== 'object') return DEFAULT_VIEW_PREFS;
  const o = raw as Record<string, any>;
  const p = (o.panel ?? {}) as Partial<PanelConfig>;
  const views = normalizePanelViews(p.big ?? DEFAULT_PANEL.big, (p.small ?? DEFAULT_PANEL.small) as PanelConfig['small']);
  const a = (o.sliceAxes ?? {}) as Record<string, unknown>;
  return {
    layoutMode: LAYOUTS.includes(o.layoutMode) ? o.layoutMode : DEFAULT_VIEW_PREFS.layoutMode,
    panel: {
      big: views.big,
      small: views.small,
      arrangement: p.arrangement === 'top' ? 'top' : 'left',
      grid: p.grid === '2x2' ? '2x2' : '1+3',
      panoArrangement: p.panoArrangement === 'top' ? 'top' : 'left',
      opgOrder: normalizeOpgOrder(p.opgOrder),
    },
    sliceAxes: {
      AXIAL: bool(a.AXIAL, true), SAGITTAL: bool(a.SAGITTAL, true), CORONAL: bool(a.CORONAL, true),
    },
    showCrossSection: bool(o.showCrossSection, true),
    jawSide: JAW_SIDES.includes(o.jawSide) ? o.jawSide : 'both',
  };
}

/** Merge a partial update into the stored preferences. */
export function saveViewPrefs(patch: Partial<ViewPrefs>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...loadViewPrefs(), ...patch }));
  } catch {
    /* storage unavailable — preferences simply do not persist */
  }
}
