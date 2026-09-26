/**
 * Remembered view preferences: stored values are untrusted (hand-edited or
 * from an older version), so every read must come back usable.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { loadViewPrefs, saveViewPrefs, DEFAULT_VIEW_PREFS } from '../src/core/viewPrefs';
import { OPG_VIEWS } from '../src/types/dicom';

const KEY = 'denct.viewPrefs.v1';

// The suite runs DOM-free (no jsdom), so provide a minimal in-memory Storage.
function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() { return map.size; },
  } as Storage;
}
beforeEach(() => { (globalThis as any).localStorage = memoryStorage(); });

describe('loadViewPrefs', () => {
  it('returns the defaults when nothing is stored', () => {
    expect(loadViewPrefs()).toEqual(DEFAULT_VIEW_PREFS);
  });

  it('round-trips what was saved', () => {
    saveViewPrefs({ layoutMode: 'OPG2+1', showCrossSection: false });
    const p = loadViewPrefs();
    expect(p.layoutMode).toBe('OPG2+1');
    expect(p.showCrossSection).toBe(false);
    expect(p.panel.opgOrder).toEqual(DEFAULT_VIEW_PREFS.panel.opgOrder);
  });

  it('survives corrupt JSON', () => {
    localStorage.setItem(KEY, '{not json');
    expect(loadViewPrefs()).toEqual(DEFAULT_VIEW_PREFS);
  });

  it('rejects an unknown layout and repairs a broken pane order', () => {
    localStorage.setItem(KEY, JSON.stringify({ layoutMode: 'hacked', panel: { opgOrder: ['AXIAL', 'AXIAL'] } }));
    const p = loadViewPrefs();
    expect(p.layoutMode).toBe(DEFAULT_VIEW_PREFS.layoutMode);
    expect([...p.panel.opgOrder].sort()).toEqual([...OPG_VIEWS].sort());
  });

  it('coerces non-boolean slice toggles', () => {
    localStorage.setItem(KEY, JSON.stringify({ sliceAxes: { AXIAL: 'yes', SAGITTAL: null }, showCrossSection: 1 }));
    const p = loadViewPrefs();
    expect(p.sliceAxes).toEqual({ AXIAL: true, SAGITTAL: true, CORONAL: true });
    expect(p.showCrossSection).toBe(true);
  });

  it('never throws when storage is unavailable (private mode)', () => {
    (globalThis as any).localStorage = {
      getItem() { throw new Error('denied'); },
      setItem() { throw new Error('denied'); },
    } as unknown as Storage;
    expect(loadViewPrefs()).toEqual(DEFAULT_VIEW_PREFS);
    expect(() => saveViewPrefs({ layoutMode: '1x1' })).not.toThrow();
  });
});
