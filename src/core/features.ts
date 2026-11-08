/**
 * Edition feature switches — which parts of the planner a host enables.
 *
 * The viewer ships as one component in more than one edition: a plain imaging
 * viewer (for teaching, and for stores where a planning tool would be
 * regulated as a medical device) and the full planner. The switches live here,
 * pure and React-free, so the rules are unit-testable and so there is exactly
 * one place that decides what a disabled feature means for the state.
 *
 * Hiding the buttons is not enough on its own: a plan file, the session
 * autosave or the imperative API can all carry implants in. So every action
 * passes through `gateAction` on its way to the reducer, and a disabled
 * feature's data never reaches the state at all.
 */

import { GUIDE_DEFAULTS, type ImplantData } from '@/types/dicom';
import type { ParsedPlan } from './planIO';
import type { ViewerAction } from '@/context/ViewerContext';

/** What a host passes in. Everything defaults to on. */
export interface ViewerFeatures {
  /** Placing and editing implants, with their safety clearances and bone quality. */
  implantPlanning?: boolean;
  /** Guided-surgery sleeves and the printable drill-guide STL. Needs implantPlanning. */
  drillGuide?: boolean;
}

export type ResolvedFeatures = Required<ViewerFeatures>;

export const ALL_FEATURES: ResolvedFeatures = { implantPlanning: true, drillGuide: true };

/** Fill in the defaults. A drill guide is built around implants, so it cannot outlive them. */
export function resolveFeatures(f?: ViewerFeatures): ResolvedFeatures {
  const implantPlanning = f?.implantPlanning !== false;
  return { implantPlanning, drillGuide: implantPlanning && f?.drillGuide !== false };
}

function stripGuided(imp: ImplantData): ImplantData {
  if (!imp.guided) return imp;
  const { guided: _dropped, ...rest } = imp;
  return rest;
}

/**
 * Drop what this edition cannot show from a plan about to be loaded. The guide
 * parameters go back to their defaults rather than being kept invisibly, so a
 * plan saved again from this edition does not carry settings nobody could see.
 */
export function stripPlanForFeatures<P extends ParsedPlan>(plan: P, f: ResolvedFeatures): P {
  if (!f.implantPlanning) return { ...plan, implants: [], guide: { ...GUIDE_DEFAULTS } };
  if (!f.drillGuide) return { ...plan, implants: plan.implants.map(stripGuided), guide: { ...GUIDE_DEFAULTS } };
  return plan;
}

/**
 * The action that actually reaches the reducer: unchanged, rewritten to drop
 * disabled data, or null when it has no meaning in this edition.
 */
export function gateAction(action: ViewerAction, f: ResolvedFeatures): ViewerAction | null {
  switch (action.type) {
    case 'LOAD_PLAN':
      return { ...action, payload: stripPlanForFeatures(action.payload, f) };
    case 'ADD_IMPLANT':
    case 'UPDATE_IMPLANT':
      if (!f.implantPlanning) return null;
      return f.drillGuide ? action : { ...action, payload: stripGuided(action.payload) };
    case 'SET_IMPLANT_PLACEMENT_MODE':
      // Turning placement off is always allowed — it is how a stray mode ends.
      return !f.implantPlanning && action.payload ? null : action;
    case 'SET_ACTIVE_IMPLANT':
    case 'SET_EDITING_IMPLANT':
      return !f.implantPlanning && action.payload !== null ? null : action;
    case 'SET_GUIDE':
      return f.drillGuide ? action : null;
    default:
      return action;
  }
}

/**
 * Which copy variant the UI text should use. Some help and intro text describes
 * the planner; an edition without it reads `<key>@viewer` (or `<key>@noguide`)
 * where such a variant exists. See I18nProvider.
 */
export function copyVariant(f: ResolvedFeatures): string | null {
  if (!f.implantPlanning) return 'viewer';
  if (!f.drillGuide) return 'noguide';
  return null;
}
