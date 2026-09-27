/**
 * The bundled sample's manifest is fetched from the host's public directory,
 * which need not be the one this build shipped — an embedder copies
 * public/sample-io/ into their app and may copy an older or edited one. A bad
 * transform would drop a scan at an arbitrary place in the patient's anatomy,
 * so entries are validated rather than trusted.
 */

import { describe, it, expect } from 'vitest';
import { validEntry } from '../src/core/sampleScans';

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const good = { file: 'upper-jaw.ply.gz', type: 'upperJaw', nameKey: 'scan.upperJaw', transform: IDENTITY, triangles: 100 };

describe('validEntry', () => {
  it('accepts a well-formed entry unchanged', () => {
    expect(validEntry(good)).toEqual(good);
  });

  it('rejects an entry with no file', () => {
    expect(validEntry({ ...good, file: undefined })).toBeNull();
    expect(validEntry({ ...good, file: '' })).toBeNull();
  });

  it('rejects a transform that is not 16 finite numbers', () => {
    expect(validEntry({ ...good, transform: undefined })).toBeNull();
    expect(validEntry({ ...good, transform: [1, 2, 3] })).toBeNull();
    expect(validEntry({ ...good, transform: IDENTITY.map((v, i) => (i === 5 ? NaN : v)) })).toBeNull();
    expect(validEntry({ ...good, transform: IDENTITY.map((v, i) => (i === 12 ? '3' : v)) })).toBeNull();
  });

  it('falls back to a generic oral scan for an unknown type', () => {
    expect(validEntry({ ...good, type: 'sideways' })?.type).toBe('oral');
    expect(validEntry({ ...good, type: undefined })?.type).toBe('oral');
  });

  it('derives a name key when the manifest has none', () => {
    expect(validEntry({ ...good, nameKey: undefined })?.nameKey).toBe('scan.upperJaw');
  });

  it('ignores a nonsense triangle count rather than sizing a budget from it', () => {
    expect(validEntry({ ...good, triangles: -5 })?.triangles).toBeUndefined();
    expect(validEntry({ ...good, triangles: 'lots' })?.triangles).toBeUndefined();
  });
});
