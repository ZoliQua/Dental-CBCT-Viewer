/**
 * Held implants are world coordinates too: a series switch clears the shown
 * ones (M2), so it must clear the held ones, or they would come back on the
 * wrong series. Drives the real provider's dispatch; a server render is enough,
 * since the held data lives in a ref.
 */

import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { ViewerProvider, useViewer } from '../src/context/ViewerContext';
import { FeaturesProvider } from '../src/context/FeaturesContext';
import { planFromObject, PLAN_VERSION } from '../src/core/planIO';
import { GUIDE_DEFAULTS, type ImplantData } from '../src/types/dicom';

const implant = { id: 'i1', name: 'I1', position: [1, 2, 3], diameter: 4, length: 10, angleBLDeg: 0, angleMDDeg: 0, visible: true } as ImplantData;
const guide = { ...GUIDE_DEFAULTS, wallMm: 4 };

function viewerEditionWithHeldPlan() {
  let api!: ReturnType<typeof useViewer>;
  const Probe = () => { api = useViewer(); return null; };
  const tree = createElement(FeaturesProvider, {
    features: { implantPlanning: false },
    children: createElement(ViewerProvider, { children: createElement(Probe) }),
  });
  renderToString(tree);
  api.dispatch({ type: 'LOAD_PLAN', payload: planFromObject({ version: PLAN_VERSION, implants: [implant], guide })! });
  return { api, persisted: () => api.withHeldPlan({ implants: [] as ImplantData[], guide: { ...GUIDE_DEFAULTS } }) };
}

describe('held plan across a series switch', () => {
  it('holds the implants until the series changes', () => {
    expect(viewerEditionWithHeldPlan().persisted().implants).toHaveLength(1);
  });

  it('drops held implants on a series switch, but keeps the guide settings', () => {
    const { api, persisted } = viewerEditionWithHeldPlan();
    api.dispatch({ type: 'SET_ACTIVE_SERIES', payload: 'se2' });
    expect(persisted().implants).toEqual([]);
    expect(persisted().guide).toEqual(guide);
  });
});
