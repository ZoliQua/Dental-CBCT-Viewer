import { describe, it, expect } from 'vitest';
import { detectFormat } from '@/core/import';
import { matchGalileos } from '@/core/import/galileos';
import { matchOneVolume } from '@/core/import/onevolume';

// The matchers only read file names / webkitRelativePath, so plain stubs work.
const f = (name: string, rel?: string) => ({ name, webkitRelativePath: rel ?? '' }) as unknown as File;

describe('native CT import — format detection', () => {
  it('detects a GALILEOS folder (*_vol_0 + *_vol_0_###)', () => {
    const files = [f('scan.gwg'), f('scan_vol_0'), f('scan_vol_0_000'), f('scan_vol_0_001')];
    expect(matchGalileos(files)).toBe(true);
    expect(detectFormat(files)).toBe('galileos');
  });

  it('needs both the header and slice files for GALILEOS', () => {
    expect(matchGalileos([f('scan_vol_0')])).toBe(false);           // header only
    expect(matchGalileos([f('scan_vol_0_000')])).toBe(false);       // slices only
  });

  it('detects a OneVolume folder (CT_0.vol)', () => {
    expect(matchOneVolume([f('CT_0.vol')])).toBe(true);
    expect(matchOneVolume([f('CT_0.vol', 'export/CT_1/CT_0.vol')])).toBe(true);
    expect(detectFormat([f('CT_0.vol')])).toBe('onevolume');
  });

  it('leaves DICOM / unknown sets to the DICOM path (null)', () => {
    expect(detectFormat([f('IM000001.dcm'), f('IM000002.dcm')])).toBeNull();
    expect(detectFormat([f('image.dcm')])).toBeNull();
    expect(detectFormat([f('notes.txt')])).toBeNull();
  });

  it('prefers OneVolume when both markers somehow appear', () => {
    expect(detectFormat([f('CT_0.vol'), f('x_vol_0'), f('x_vol_0_000')])).toBe('onevolume');
  });
});
