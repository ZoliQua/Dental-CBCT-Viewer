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

import { GUIDE_DEFAULTS, type GuideParams, type GuidedPlan, type ImplantData } from '@/types/dicom';
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

/** The parts of a plan this edition works on: its implants and the guide settings. */
interface FeaturePlan { implants: ImplantData[]; guide: GuideParams }

/**
 * What a disabled feature took out of a study's plan, kept aside rather than
 * thrown away: a host that switches a feature off and on again (or runs the
 * viewer edition over a planner autosave) must not lose the implants for good.
 */
export interface HeldPlan {
  /** Whole implants, held while implant planning is off. */
  implants: ImplantData[];
  /** Guided-surgery data by implant id, held while only the drill guide is off. */
  guided: Record<string, GuidedPlan>;
  /** The guide settings in force before they were reset; null when none were held. */
  guide: GuideParams | null;
}

export const EMPTY_HELD: HeldPlan = { implants: [], guided: {}, guide: null };

export function isHeldEmpty(h: HeldPlan | undefined): boolean {
  return !h || (h.implants.length === 0 && Object.keys(h.guided).length === 0 && h.guide === null);
}

const sameGuide = (a: GuideParams, b: GuideParams): boolean =>
  (Object.keys(GUIDE_DEFAULTS) as (keyof GuideParams)[]).every((k) => a[k] === b[k]);

/**
 * Split a plan into what this edition shows and what it has to hold back. The
 * guide parameters go back to their defaults in the shown part, so a plan
 * saved as a file from this edition does not carry settings nobody could see.
 */
export function holdBack<P extends FeaturePlan>(plan: P, f: ResolvedFeatures): { plan: P; held: HeldPlan } {
  if (f.drillGuide) return { plan, held: EMPTY_HELD };
  const guide = sameGuide(plan.guide, GUIDE_DEFAULTS) ? null : plan.guide;
  if (!f.implantPlanning) {
    return { plan: { ...plan, implants: [], guide: { ...GUIDE_DEFAULTS } }, held: { implants: plan.implants, guided: {}, guide } };
  }
  const guided: Record<string, GuidedPlan> = {};
  for (const imp of plan.implants) if (imp.guided) guided[imp.id] = imp.guided;
  return {
    plan: { ...plan, implants: plan.implants.map(stripGuided), guide: { ...GUIDE_DEFAULTS } },
    held: { implants: [], guided, guide },
  };
}

/** Add newly held data to what a study already holds (the newer guide wins). */
export function mergeHeld(a: HeldPlan | undefined, b: HeldPlan): HeldPlan {
  if (!a) return b;
  const ids = new Set(b.implants.map((i) => i.id));
  return {
    implants: [...a.implants.filter((i) => !ids.has(i.id)), ...b.implants],
    guided: { ...a.guided, ...b.guided },
    guide: b.guide ?? a.guide,
  };
}

/**
 * The plan with the held data put back in — what the session autosave and the
 * host's plan callbacks persist, so a feature switched off loses nothing.
 */
export function withHeld<P extends FeaturePlan>(plan: P, held: HeldPlan | undefined): P {
  if (isHeldEmpty(held)) return plan;
  const h = held as HeldPlan;
  const shown = plan.implants.map((imp) => (h.guided[imp.id] && !imp.guided ? { ...imp, guided: h.guided[imp.id] } : imp));
  const ids = new Set(shown.map((i) => i.id));
  return {
    ...plan,
    implants: [...shown, ...h.implants.filter((i) => !ids.has(i.id))],
    guide: h.guide ?? plan.guide,
  };
}

/**
 * Which held data the edition can show again now. `restore` goes back into
 * the state; `keep` stays held (e.g. guided data while only planning is back).
 */
export function releaseHeld(held: HeldPlan, f: ResolvedFeatures): { restore: HeldPlan; keep: HeldPlan } {
  if (!f.implantPlanning) return { restore: EMPTY_HELD, keep: held };
  if (!f.drillGuide) {
    // Planning is back but the guide is not: the implants return without their sleeves.
    const guided: Record<string, GuidedPlan> = { ...held.guided };
    for (const imp of held.implants) if (imp.guided) guided[imp.id] = imp.guided;
    return {
      restore: { implants: held.implants.map(stripGuided), guided: {}, guide: null },
      keep: { implants: [], guided, guide: held.guide },
    };
  }
  return { restore: held, keep: EMPTY_HELD };
}

/** Drop what this edition cannot show from a plan about to be loaded. */
export function stripPlanForFeatures<P extends ParsedPlan>(plan: P, f: ResolvedFeatures): P {
  return holdBack(plan, f).plan;
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

/**
 * A study's plan after the edition's switches are applied: whatever the
 * features no longer allow is held back, whatever they allow again comes out
 * of the held data. Run whenever the features or the active study change.
 */
export function applyFeatures<P extends FeaturePlan>(
  plan: P,
  held: HeldPlan | undefined,
  f: ResolvedFeatures,
): { plan: P; held: HeldPlan } {
  const { plan: shown, held: taken } = holdBack(plan, f);
  const all = isHeldEmpty(taken) ? (held ?? EMPTY_HELD) : mergeHeld(held, taken);
  const { restore, keep } = releaseHeld(all, f);
  return { plan: withHeld(shown, restore), held: keep };
}
