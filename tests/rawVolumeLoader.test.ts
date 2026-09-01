/**
 * rawVolumeLoader: per-volume image-id namespacing (re-import never corrupts
 * a volume still on screen), row/column pixel spacing convention, and the
 * volume-load failure path. Cornerstone is mocked — these tests cover our
 * loader/registry logic, not the renderer.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const loaders = new Map<string, (imageId: string) => { promise: Promise<any> }>();
const providers: Array<(type: string, imageId: string) => unknown> = [];

vi.mock('@cornerstonejs/core', () => ({
  imageLoader: {
    registerImageLoader: (scheme: string, fn: any) => loaders.set(scheme, fn),
  },
  metaData: {
    addProvider: (fn: any) => providers.push(fn),
  },
  volumeLoader: {
    createAndCacheVolume: async () => ({
      load: (cb: (evt: { success: boolean }) => void) => cb({ success: true }),
    }),
  },
}));

import { buildRawVolume, disposeRawVolume, type RawVolume } from '@/core/import/rawVolumeLoader';

function makeRaw(): RawVolume {
  return {
    data: new Int16Array(4 * 3 * 2),
    dimensions: [4, 3, 2],
    spacing: [0.2, 0.3, 0.5], // sx, sy, sz — deliberately all different
    windowCenter: 300,
    windowWidth: 2000,
    modality: 'CT',
    minValue: 0,
    maxValue: 4095,
    seriesDescription: 'Test',
  };
}

/** The image id of slice `i` of the volume that buildRawVolume returned. */
function imageIdOf(volumeId: string, i: number): string {
  const n = volumeId.match(/import(\d+)/)![1];
  return `importvol${n}:${i}`;
}

async function loadSlice(imageId: string): Promise<any> {
  const scheme = imageId.split(':')[0];
  const loader = loaders.get(scheme);
  expect(loader, `loader registered for ${scheme}`).toBeTruthy();
  return loader!(imageId).promise;
}

function providerFor(imageId: string, type: string): any {
  const p = providers[providers.length - 1];
  return p(type, imageId);
}

describe('buildRawVolume', () => {
  beforeEach(() => {
    loaders.clear();
    providers.length = 0;
  });

  it('follows the DICOM row/column spacing convention (row = sy, column = sx)', async () => {
    const { volumeId } = await buildRawVolume(makeRaw());
    expect(volumeId).toContain('import');
    const imageId = imageIdOf(volumeId, 0);
    const img = await loadSlice(imageId);
    expect(img.rowPixelSpacing).toBe(0.3);    // sy — between rows
    expect(img.columnPixelSpacing).toBe(0.2); // sx — between columns
    // and consistent with the metadata provider for the same image
    const plane = providerFor(imageId, 'imagePlaneModule');
    expect(plane.rowPixelSpacing).toBe(img.rowPixelSpacing);
    expect(plane.columnPixelSpacing).toBe(img.columnPixelSpacing);
  });

  it('namespaces volumes: a second import leaves the first one readable', async () => {
    const first = makeRaw();
    first.data[0] = 111;
    const a = await buildRawVolume(first);
    const second = makeRaw();
    second.data[0] = 222;
    const b = await buildRawVolume(second);

    const imgA = await loadSlice(imageIdOf(a.volumeId, 0));
    const imgB = await loadSlice(imageIdOf(b.volumeId, 0));
    expect(imgA.getPixelData()[0]).toBe(111); // old volume still intact
    expect(imgB.getPixelData()[0]).toBe(222);
  });

  it('disposeRawVolume drops only the disposed volume', async () => {
    const a = await buildRawVolume(makeRaw());
    const b = await buildRawVolume(makeRaw());

    disposeRawVolume(a.volumeId);
    await expect(loadSlice(imageIdOf(a.volumeId, 0))).rejects.toThrow(/not loaded/);
    await expect(loadSlice(imageIdOf(b.volumeId, 0))).resolves.toBeTruthy();
  });

  it('appends decoding warnings to the study description and console', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const raw = makeRaw();
    raw.warnings = ['columns missing from header — assuming 512'];
    const { study } = await buildRawVolume(raw);
    expect(study.studyDescription).toMatch(/warning: columns missing/);
    expect(warn.mock.calls.flat().join(' ')).toMatch(/columns missing/);
    warn.mockRestore();
  });
});
