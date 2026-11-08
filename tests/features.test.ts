/**
 * Edition feature switches: defaults, the plan stripping applied on every load,
 * the action gate in front of the reducer, and the edition copy lookup.
 */

import { describe, it, expect } from 'vitest';
import {
  resolveFeatures, stripPlanForFeatures, gateAction, copyVariant, ALL_FEATURES,
} from '../src/core/features';
import { viewerReducer, initialState, type ViewerAction, type ViewerState } from '../src/context/ViewerContext';
import { planFromObject, serializePlan, type PlanData } from '../src/core/planIO';
import { translations } from '../src/i18n/translations';
import { translate } from '../src/i18n/I18nContext';
import { GUIDE_DEFAULTS, type ImplantData } from '../src/types/dicom';

const VIEWER = resolveFeatures({ implantPlanning: false });
const NO_GUIDE = resolveFeatures({ drillGuide: false });

const guidedImplant: ImplantData = {
  id: 'i1', name: 'Implant 1', visible: true, position: [1, 2, 3], diameter: 4, length: 10,
  angleBLDeg: 0, angleMDDeg: 0, systemId: 'alphabio-multineo-cs',
  guided: { enabled: true, sleeveOffset: 9, sleeveHeight: 5, drillLength: 10 },
};

const customGuide = { ...GUIDE_DEFAULTS, wallMm: 3, sleeveSeat: true };

function plan(): PlanData {
  const parsed = planFromObject({
    version: 1,
    implants: [guidedImplant],
    anatomy: [{ id: 'n1', name: 'Nerve 1', visible: true, type: 'nerve', color: '#ff5577', radius: 1.5, points: [[0, 0, 0], [1, 1, 1]] }],
    measurements: [{ id: 'm1', kind: 'canvas', tool: 'length', name: 'Length 1', visible: true, viewport: 'panoramic', points: [[0.1, 0.2], [0.3, 0.4]] }],
    archCurveControlPoints: [[1, 2], [3, 4], [5, 6]],
    guide: customGuide,
    scans: [{ id: 's1', name: 'Upper', type: 'upperJaw', transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], fileName: 'u.ply' }],
  });
  if (!parsed) throw new Error('fixture plan did not parse');
  return parsed;
}

/** What the provider does: gate, then reduce (or drop). */
function run(state: ViewerState, action: ViewerAction, f = ALL_FEATURES): ViewerState {
  const gated = gateAction(action, f);
  return gated ? viewerReducer(state, gated) : state;
}

describe('resolveFeatures', () => {
  it('turns everything on by default', () => {
    expect(resolveFeatures()).toEqual({ implantPlanning: true, drillGuide: true });
    expect(resolveFeatures({})).toEqual({ implantPlanning: true, drillGuide: true });
  });

  it('takes the drill guide away with implant planning', () => {
    expect(resolveFeatures({ implantPlanning: false })).toEqual({ implantPlanning: false, drillGuide: false });
    expect(resolveFeatures({ implantPlanning: false, drillGuide: true }).drillGuide).toBe(false);
  });

  it('can drop only the drill guide', () => {
    expect(resolveFeatures({ drillGuide: false })).toEqual({ implantPlanning: true, drillGuide: false });
  });
});

describe('stripPlanForFeatures', () => {
  it('leaves a plan untouched with every feature on', () => {
    const p = plan();
    expect(stripPlanForFeatures(p, ALL_FEATURES)).toBe(p);
  });

  it('drops implants and guide settings, and keeps everything else, without planning', () => {
    const p = plan();
    const out = stripPlanForFeatures(p, VIEWER);
    expect(out.implants).toEqual([]);
    expect(out.guide).toEqual(GUIDE_DEFAULTS);
    expect(out.anatomy).toEqual(p.anatomy);
    expect(out.measurements).toEqual(p.measurements);
    expect(out.archCurveControlPoints).toEqual(p.archCurveControlPoints);
    expect(out.scans).toEqual(p.scans);
    // The input is not mutated — the caller may still hold it.
    expect(p.implants).toHaveLength(1);
  });

  it('keeps implants but drops their sleeves without a drill guide', () => {
    const out = stripPlanForFeatures(plan(), NO_GUIDE);
    expect(out.implants).toHaveLength(1);
    expect(out.implants[0].guided).toBeUndefined();
    expect(out.implants[0].position).toEqual(guidedImplant.position);
    expect(out.guide).toEqual(GUIDE_DEFAULTS);
  });

  it('keeps the study the plan was recorded for', () => {
    const out = stripPlanForFeatures({ ...plan(), studyInstanceUID: 'S1' }, VIEWER);
    expect(out.studyInstanceUID).toBe('S1');
  });
});

describe('gateAction', () => {
  it('passes every action through with every feature on', () => {
    const a: ViewerAction = { type: 'ADD_IMPLANT', payload: guidedImplant };
    expect(gateAction(a, ALL_FEATURES)).toBe(a);
  });

  it('ignores adding, editing and placing implants without planning', () => {
    expect(gateAction({ type: 'ADD_IMPLANT', payload: guidedImplant }, VIEWER)).toBeNull();
    expect(gateAction({ type: 'UPDATE_IMPLANT', payload: guidedImplant }, VIEWER)).toBeNull();
    expect(gateAction({ type: 'SET_IMPLANT_PLACEMENT_MODE', payload: true }, VIEWER)).toBeNull();
    expect(gateAction({ type: 'SET_EDITING_IMPLANT', payload: 'i1' }, VIEWER)).toBeNull();
    expect(gateAction({ type: 'SET_ACTIVE_IMPLANT', payload: 'i1' }, VIEWER)).toBeNull();
    expect(gateAction({ type: 'SET_GUIDE', payload: { wallMm: 2 } }, VIEWER)).toBeNull();
  });

  it('still lets a stray placement mode or popup be closed', () => {
    expect(gateAction({ type: 'SET_IMPLANT_PLACEMENT_MODE', payload: false }, VIEWER)).not.toBeNull();
    expect(gateAction({ type: 'SET_EDITING_IMPLANT', payload: null }, VIEWER)).not.toBeNull();
    expect(gateAction({ type: 'REMOVE_IMPLANT', payload: 'i1' }, VIEWER)).not.toBeNull();
  });

  it('leaves the rest of the viewer alone without planning', () => {
    const a: ViewerAction = { type: 'SET_LAYOUT_MODE', payload: 'OPG2+1' };
    expect(gateAction(a, VIEWER)).toBe(a);
    const m: ViewerAction = { type: 'SET_ANATOMY_DRAW_MODE', payload: 'nerve' };
    expect(gateAction(m, VIEWER)).toBe(m);
  });

  it('strips the sleeve from implants added without a drill guide', () => {
    const g = gateAction({ type: 'ADD_IMPLANT', payload: guidedImplant }, NO_GUIDE);
    expect(g?.type).toBe('ADD_IMPLANT');
    expect(g && g.type === 'ADD_IMPLANT' && g.payload.guided).toBeUndefined();
    expect(gateAction({ type: 'SET_GUIDE', payload: { wallMm: 2 } }, NO_GUIDE)).toBeNull();
  });
});

describe('gate + reducer: no route brings implants into a viewer edition', () => {
  it('a loaded plan arrives without implants or guide settings', () => {
    const s = run(initialState, { type: 'LOAD_PLAN', payload: plan() }, VIEWER);
    expect(s.implants).toEqual([]);
    expect(s.guide).toEqual(GUIDE_DEFAULTS);
    expect(s.anatomy).toHaveLength(1);
    expect(s.measurements).toHaveLength(1);
  });

  it('the imperative addImplant is a no-op', () => {
    const s = run(initialState, { type: 'ADD_IMPLANT', payload: guidedImplant }, VIEWER);
    expect(s).toBe(initialState);
  });

  it('a plan saved again from the viewer edition carries no implants', () => {
    const s = run(initialState, { type: 'LOAD_PLAN', payload: plan() }, VIEWER);
    const file = serializePlan(s, { savedAt: 'now', studyInstanceUID: null, patientId: null });
    expect(file.implants).toEqual([]);
    expect(file.guide).toEqual(GUIDE_DEFAULTS);
  });

  it('the full edition still loads everything', () => {
    const s = run(initialState, { type: 'LOAD_PLAN', payload: plan() });
    expect(s.implants).toHaveLength(1);
    expect(s.implants[0].guided?.enabled).toBe(true);
    expect(s.guide).toEqual(customGuide);
  });
});

describe('edition copy', () => {
  it('picks the variant for the missing feature', () => {
    expect(copyVariant(ALL_FEATURES)).toBeNull();
    expect(copyVariant(VIEWER)).toBe('viewer');
    expect(copyVariant(NO_GUIDE)).toBe('noguide');
  });

  it('prefers the variant, and falls back to the plain key', () => {
    expect(translate('en', 'pdf.description', undefined, 'viewer')).toBe(translations.en['pdf.description@viewer']);
    expect(translate('hu', 'pdf.description', undefined, 'viewer')).toBe(translations.hu['pdf.description@viewer']);
    expect(translate('en', 'pdf.description')).toBe(translations.en['pdf.description']);
    expect(translate('en', 'layers.title', undefined, 'viewer')).toBe(translations.en['layers.title']);
  });

  it('has every variant in every language, and only for keys that exist', () => {
    const variants = Object.keys(translations.en).filter((k) => k.includes('@'));
    expect(variants.length).toBeGreaterThan(0);
    for (const k of variants) {
      expect(translations.en[k.split('@')[0]], `${k} has no plain key`).toBeDefined();
      for (const lang of ['de', 'es', 'hu'] as const) {
        expect(translations[lang][k], `${lang} lacks ${k}`).toBeDefined();
      }
    }
  });

  it('never mentions implants or the drill guide in the viewer copy', () => {
    for (const lang of ['en', 'de', 'es', 'hu'] as const) {
      for (const [k, v] of Object.entries(translations[lang])) {
        if (!k.endsWith('@viewer')) continue;
        expect(v, `${lang} ${k}`).not.toMatch(/implant|drill|bohr|fresado|fúró|sleeve|hülse|casquillo|persely/i);
      }
    }
  });
});
