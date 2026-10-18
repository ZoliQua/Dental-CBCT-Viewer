/**
 * Saving a scan's registration with the plan.
 *
 * The transform is the expensive thing in a plan — minutes of landmark picking
 * — and until now it lived only in memory, so a reload threw it away. These
 * cover the two ways persisting it could go wrong: losing a mesh that is
 * already loaded, and trusting a transform out of a file.
 */

import { describe, it, expect } from 'vitest';
import { extractPlan, planFromObject, serializePlan, type PlanData } from '../src/core/planIO';
import { mergePlanScans, viewerReducer, initialState } from '../src/context/ViewerContext';
import type { ScanMesh } from '../src/types/dicom';

const T = (tx: number): number[] => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, tx, 0, 0, 1];

const scan = (over: Partial<ScanMesh> = {}): ScanMesh => ({
  id: 'scan_1', name: 'Upper jaw', type: 'upperJaw', color: '#e8c0a8',
  opacity: 1, visible: true, transform: T(5), fileName: 'upper.stl', ...over,
});

describe('mergePlanScans', () => {
  it('puts a saved registration back on the mesh already loaded for that file', () => {
    const loaded = [scan({ id: 'session_id', transform: T(0) })];
    const saved = [scan({ id: 'old_id', transform: T(5) })];
    const out = mergePlanScans(loaded, saved);
    expect(out).toHaveLength(1);
    // The registration comes from the plan, the id from this session — the
    // geometry registry is keyed by it.
    expect(out[0].transform).toEqual(T(5));
    expect(out[0].id).toBe('session_id');
  });

  it('never drops a mesh this session has loaded', () => {
    const loaded = [scan({ id: 'a', fileName: 'upper.stl' }), scan({ id: 'b', fileName: 'lower.stl' })];
    const out = mergePlanScans(loaded, [scan({ id: 'old', fileName: 'upper.stl' })]);
    expect(out.map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('keeps a saved scan whose file is missing, so the UI can ask for it', () => {
    const out = mergePlanScans([], [scan({ id: 'old', fileName: 'upper.stl' })]);
    expect(out).toHaveLength(1);
    expect(out[0].fileName).toBe('upper.stl');
  });

  it('does not hand one saved entry to two loaded meshes of the same name', () => {
    const loaded = [scan({ id: 'a' }), scan({ id: 'b' })];
    const out = mergePlanScans(loaded, [scan({ id: 'old', transform: T(9) })]);
    expect(out.filter((s) => s.transform[12] === 9)).toHaveLength(1);
  });

  it('leaves a loaded mesh alone when the plan has never heard of it', () => {
    const loaded = [scan({ id: 'a', fileName: 'other.stl', transform: T(3) })];
    const out = mergePlanScans(loaded, [scan({ id: 'old', fileName: 'upper.stl' })]);
    expect(out.find((s) => s.id === 'a')!.transform).toEqual(T(3));
  });

  it('matches nothing when a loaded scan has no file name to match on', () => {
    const out = mergePlanScans([scan({ id: 'a', fileName: '' })], [scan({ id: 'old' })]);
    expect(out).toHaveLength(2);
  });
});

describe('scans in a plan file', () => {
  const base = (): PlanData => ({ ...(planFromObject({ version: 1 }) as PlanData), scans: [scan()] });

  it('survives a save and load round trip', () => {
    const file = serializePlan(base(), { savedAt: 'now', studyInstanceUID: null, patientId: null });
    const back = planFromObject(JSON.parse(JSON.stringify(file)))!;
    expect(back.scans).toHaveLength(1);
    expect(back.scans[0].transform).toEqual(T(5));
    expect(back.scans[0].fileName).toBe('upper.stl');
  });

  it('carries scans through extractPlan', () => {
    expect(extractPlan(base()).scans).toHaveLength(1);
  });

  it('is empty, not broken, for a plan saved before scans were stored', () => {
    expect(planFromObject({ version: 1 })!.scans).toEqual([]);
  });

  it('drops an entry whose transform is not a complete 4x4', () => {
    for (const bad of [undefined, [1, 2, 3], new Array(16).fill('x'), [...new Array(15).fill(0), NaN]]) {
      const back = planFromObject({ version: 1, scans: [{ ...scan(), transform: bad }] })!;
      expect(back.scans).toEqual([]);
    }
  });

  it('refuses a colour that is not a plain hex literal', () => {
    const back = planFromObject({ version: 1, scans: [{ ...scan(), color: 'red; background:url(x)' }] })!;
    expect(back.scans[0].color).toBe('#e8c0a8');
  });

  it('clamps opacity and falls back on an unknown scan type', () => {
    const back = planFromObject({ version: 1, scans: [{ ...scan(), opacity: 40, type: 'nonsense' }] })!;
    expect(back.scans[0].opacity).toBe(1);
    expect(back.scans[0].type).toBe('oral');
  });

  it('caps how many scans a file can declare', () => {
    const many = Array.from({ length: 50 }, (_, i) => scan({ id: `s${i}` }));
    expect(planFromObject({ version: 1, scans: many })!.scans.length).toBeLessThanOrEqual(20);
  });
});

describe('a scan arriving while a restored plan waits for it', () => {
  // The autosave is applied as soon as the study is known; the sample's own
  // scans are dispatched after that. Both describe the same file.
  const waiting = scan({ id: 'from_plan', transform: T(5) });
  const arriving = scan({ id: 'session_id', transform: T(0) });

  it('ends up as one entry, with the geometry and the saved pose', () => {
    const withPlan = { ...initialState, scans: [waiting] };
    const after = viewerReducer(withPlan, { type: 'ADD_SCAN', payload: arriving });
    expect(after.scans).toHaveLength(1);
    expect(after.scans[0].id).toBe('session_id');   // the id the mesh is registered under
    expect(after.scans[0].transform).toEqual(T(5)); // the registration from the plan
  });

  it('still adds a scan nothing was waiting for', () => {
    const after = viewerReducer(initialState, { type: 'ADD_SCAN', payload: arriving });
    expect(after.scans).toHaveLength(1);
    expect(after.scans[0].transform).toEqual(T(0));
  });

  it('does not collapse two different files', () => {
    const withPlan = { ...initialState, scans: [waiting] };
    const other = scan({ id: 'x', fileName: 'lower.stl' });
    expect(viewerReducer(withPlan, { type: 'ADD_SCAN', payload: other }).scans).toHaveLength(2);
  });
});
