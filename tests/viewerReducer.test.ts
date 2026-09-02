/**
 * Reducer behavior around patient/study changes (C2), series switches (M2)
 * and plan loading mismatches. Exercises viewerReducer directly.
 */

import { describe, it, expect } from 'vitest';
import { viewerReducer, initialState, type ViewerState } from '../src/context/ViewerContext';
import { planFromObject, type PlanData } from '../src/core/planIO';
import type { DicomStudyInfo, ImplantData } from '../src/types/dicom';

const study = (uid: string, seriesUIDs = ['se1']): DicomStudyInfo => ({
  studyInstanceUID: uid,
  studyDescription: '',
  studyDate: '',
  patientName: 'Real Patient',
  patientId: 'P1',
  patientBirthDate: '1970-05-06',
  institution: '',
  series: seriesUIDs.map((s, i) => ({
    seriesInstanceUID: s,
    seriesDescription: '',
    seriesNumber: i + 1,
    modality: 'CT',
    imageCount: 10,
    imageIds: [],
  })),
});

const implant: ImplantData = {
  id: 'i1', name: 'Implant 1', visible: true, position: [1, 2, 3], diameter: 4, length: 10,
  angleBLDeg: 0, angleMDDeg: 0, systemId: 'sys',
  guided: { enabled: false, sleeveOffset: 0, sleeveHeight: 0, drillLength: 10 },
};

/** State with plan data loaded, as if the user had planned on `uid`. */
const plannedState = (uid: string): ViewerState => ({
  ...initialState,
  study: study(uid, ['se1', 'se2']),
  activeSeriesUID: 'se1',
  volumeId: 'vol-1',
  implants: [implant],
  anatomy: [{ id: 'n1', name: 'N', visible: true, type: 'nerve', color: '#fff', radius: 1, points: [[0, 0, 0]] }],
  measurements: [{ id: 'm1', kind: 'canvas', tool: 'length', name: 'L', visible: true }],
  archCurveControlPoints: [[1, 2]],
  scans: [{ id: 'sc1' } as unknown as ViewerState['scans'][number]],
});

const planFor = (uid: string | null): PlanData & { studyInstanceUID: string | null } =>
  planFromObject({
    version: 1,
    studyInstanceUID: uid,
    implants: [implant],
    report: { patientName: 'Planned' },
  })!;

describe('C1: report defaults', () => {
  it('starts empty so DICOM metadata flows through', () => {
    expect(initialState.report.patientName).toBe('');
    expect(initialState.report.patientBirthDate).toBe('');
    expect(initialState.report.quoteNumber).toBe('');
    expect(initialState.report.statusDescription).toBe('');
  });
});

describe('C2: SET_STUDY', () => {
  it('clears plan state when the study UID changes', () => {
    const s = viewerReducer(plannedState('A'), { type: 'SET_STUDY', payload: study('B') });
    expect(s.study?.studyInstanceUID).toBe('B');
    expect(s.implants).toEqual([]);
    expect(s.anatomy).toEqual([]);
    expect(s.measurements).toEqual([]);
    expect(s.archCurveControlPoints).toBeNull();
    expect(s.scans).toEqual([]);
    expect(s.volumeId).toBeNull();
    expect(s.registration).toBeNull();
  });

  it('keeps plan state on a same-study re-dispatch', () => {
    const s = viewerReducer(plannedState('A'), { type: 'SET_STUDY', payload: study('A', ['se1', 'se2']) });
    expect(s.implants).toHaveLength(1);
    expect(s.anatomy).toHaveLength(1);
    expect(s.measurements).toHaveLength(1);
    expect(s.archCurveControlPoints).toEqual([[1, 2]]);
    expect(s.scans).toHaveLength(1);
  });
});

describe('C2: LOAD_PLAN study mismatch', () => {
  it('ignores a plan recorded for a different study and flags the mismatch', () => {
    const prev = plannedState('A');
    const s = viewerReducer(prev, { type: 'LOAD_PLAN', payload: planFor('B') });
    expect(s.planMismatch).toBe(true);
    expect(s.implants).toBe(prev.implants); // untouched
    expect(s.report.patientName).toBe(prev.report.patientName);
  });

  it('applies a plan whose study UID matches, clearing the flag', () => {
    const s = viewerReducer({ ...plannedState('A'), implants: [], planMismatch: true },
      { type: 'LOAD_PLAN', payload: planFor('A') });
    expect(s.planMismatch).toBe(false);
    expect(s.implants).toEqual([implant]);
    expect(s.report.patientName).toBe('Planned');
  });

  it('applies a plan without a study UID (legacy file)', () => {
    const s = viewerReducer({ ...plannedState('A'), implants: [] },
      { type: 'LOAD_PLAN', payload: planFor(null) });
    expect(s.planMismatch).toBe(false);
    expect(s.implants).toEqual([implant]);
  });
});

describe('M2: SET_ACTIVE_SERIES', () => {
  it('clears world-space plan data when switching to a different series', () => {
    const s = viewerReducer(plannedState('A'), { type: 'SET_ACTIVE_SERIES', payload: 'se2' });
    expect(s.activeSeriesUID).toBe('se2');
    expect(s.volumeId).toBeNull();
    expect(s.implants).toEqual([]);
    expect(s.anatomy).toEqual([]);
    expect(s.measurements).toEqual([]);
    expect(s.archCurveControlPoints).toBeNull();
    // Scans are registered separately and not part of the persisted plan.
    expect(s.scans).toHaveLength(1);
  });

  it('is a no-op when re-selecting the active series', () => {
    const prev = plannedState('A');
    const s = viewerReducer(prev, { type: 'SET_ACTIVE_SERIES', payload: 'se1' });
    expect(s).toBe(prev);
  });
});

describe('multi-study: ADD_STUDIES', () => {
  it('appends a new study, makes it active and clears plan data', () => {
    const prev = { ...plannedState('A'), studies: [study('A', ['se1', 'se2'])] };
    const s = viewerReducer(prev, { type: 'ADD_STUDIES', payload: [study('B', ['seB'])] });
    expect(s.studies.map((x) => x.studyInstanceUID)).toEqual(['A', 'B']);
    expect(s.study?.studyInstanceUID).toBe('B');
    expect(s.activeSeriesUID).toBe('seB');
    expect(s.volumeId).toBeNull();
    expect(s.implants).toEqual([]);
  });

  it('replaces a re-loaded study (same UID) instead of duplicating it', () => {
    const prev = { ...initialState, studies: [study('A')], study: study('A'), activeSeriesUID: 'se1' };
    const s = viewerReducer(prev, { type: 'ADD_STUDIES', payload: [study('A', ['seX'])] });
    expect(s.studies).toHaveLength(1);
    expect(s.studies[0].series[0].seriesInstanceUID).toBe('seX');
  });

  it('is a no-op for an empty payload', () => {
    const prev = { ...plannedState('A'), studies: [study('A')] };
    expect(viewerReducer(prev, { type: 'ADD_STUDIES', payload: [] })).toBe(prev);
  });
});

describe('multi-study: REMOVE_STUDY', () => {
  it('drops a non-active study without touching the active one', () => {
    const prev = { ...plannedState('A'), studies: [study('A', ['se1', 'se2']), study('B', ['seB'])], volumeId: 'vol-A' };
    const s = viewerReducer(prev, { type: 'REMOVE_STUDY', payload: 'B' });
    expect(s.studies.map((x) => x.studyInstanceUID)).toEqual(['A']);
    expect(s.study?.studyInstanceUID).toBe('A');
    expect(s.volumeId).toBe('vol-A');
    expect(s.implants).toHaveLength(1);
  });

  it('activates the next study when the active one is removed', () => {
    const prev = { ...plannedState('A'), studies: [study('A', ['se1']), study('B', ['seB'])] };
    const s = viewerReducer(prev, { type: 'REMOVE_STUDY', payload: 'A' });
    expect(s.studies.map((x) => x.studyInstanceUID)).toEqual(['B']);
    expect(s.study?.studyInstanceUID).toBe('B');
    expect(s.activeSeriesUID).toBe('seB');
    expect(s.implants).toEqual([]);
  });

  it('returns to the landing state when the last study is removed', () => {
    const prev = { ...plannedState('A'), studies: [study('A')] };
    const s = viewerReducer(prev, { type: 'REMOVE_STUDY', payload: 'A' });
    expect(s.study).toBeNull();
    expect(s.studies).toEqual([]);
    expect(s.implants).toEqual([]);
  });
});

describe('multi-study: per-study plan retention (lossless switching)', () => {
  it('restores each study’s volume + plan when switching back and forth', () => {
    const onA = { ...plannedState('A'), studies: [study('A', ['se1', 'se2']), study('B', ['seB'])], volumeId: 'vol-A' };
    // A → B: B starts fresh, A's plan is snapshotted.
    const onB = viewerReducer(onA, { type: 'SET_ACTIVE_STUDY', payload: 'B' });
    expect(onB.study?.studyInstanceUID).toBe('B');
    expect(onB.implants).toEqual([]);
    expect(onB.volumeId).toBeNull();
    // Plan a little on B.
    const onB2: ViewerState = { ...onB, volumeId: 'vol-B', implants: [{ ...implant, id: 'iB' }] };
    // B → A: A's volume + plan come back intact (no rebuild).
    const backA = viewerReducer(onB2, { type: 'SET_ACTIVE_STUDY', payload: 'A' });
    expect(backA.volumeId).toBe('vol-A');
    expect(backA.implants).toEqual(onA.implants);
    // A → B again: B's plan was retained too.
    const backB = viewerReducer(backA, { type: 'SET_ACTIVE_STUDY', payload: 'B' });
    expect(backB.volumeId).toBe('vol-B');
    expect(backB.implants.map((i) => i.id)).toEqual(['iB']);
  });
});

describe('multi-study: SET_ACTIVE_STUDY', () => {
  it('switches active study, rebuilds volume and clears plan', () => {
    const prev = { ...plannedState('A'), studies: [study('A', ['se1', 'se2']), study('B', ['seB'])] };
    const s = viewerReducer(prev, { type: 'SET_ACTIVE_STUDY', payload: 'B' });
    expect(s.study?.studyInstanceUID).toBe('B');
    expect(s.activeSeriesUID).toBe('seB');
    expect(s.volumeId).toBeNull();
    expect(s.implants).toEqual([]);
  });

  it('is a no-op for the already-active study', () => {
    const prev = { ...plannedState('A'), studies: [study('A')] };
    expect(viewerReducer(prev, { type: 'SET_ACTIVE_STUDY', payload: 'A' })).toBe(prev);
  });

  it('ignores an unknown study UID', () => {
    const prev = { ...plannedState('A'), studies: [study('A')] };
    expect(viewerReducer(prev, { type: 'SET_ACTIVE_STUDY', payload: 'ZZ' })).toBe(prev);
  });
});

describe('RESET', () => {
  it('clears the planMismatch flag', () => {
    const s = viewerReducer({ ...plannedState('A'), planMismatch: true }, { type: 'RESET' });
    expect(s.planMismatch).toBe(false);
    expect(s.study).toBeNull();
  });
});
