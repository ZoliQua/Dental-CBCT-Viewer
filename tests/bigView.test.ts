/**
 * The status bar's zoom follows the BIG view of each layout.
 */

import { describe, it, expect } from 'vitest';
import { bigView, bigViewportId } from '../src/core/bigView';
import { DEFAULT_PANEL, swapOpgBig, type PanelConfig } from '../src/types/dicom';
import { VP_AXIAL, VP_3D, VP_SAGITTAL } from '../src/core/constants';

const panel = (over: Partial<PanelConfig> = {}): PanelConfig => ({ ...DEFAULT_PANEL, ...over });

describe('bigView / bigViewportId', () => {
  it('1×1 follows the selected view', () => {
    expect(bigView('1x1', 'SAGITTAL', panel())).toBe('SAGITTAL');
    expect(bigViewportId('1x1', 'SAGITTAL', panel())).toBe(VP_SAGITTAL);
    expect(bigViewportId('1x1', '3D', panel())).toBe(VP_3D);
  });

  it('3D view follows the configured big panel', () => {
    expect(bigViewportId('1+3', 'AXIAL', panel())).toBe(VP_3D); // default big = 3D
    expect(bigViewportId('1+3', 'AXIAL', panel({ big: 'AXIAL', small: ['SAGITTAL', 'CORONAL', '3D'] }))).toBe(VP_AXIAL);
  });

  it('Panoramic: canvas big views have no camera zoom', () => {
    expect(bigView('OPG2+1', 'AXIAL', panel())).toBe('PANORAMA');
    expect(bigViewportId('OPG2+1', 'AXIAL', panel())).toBeNull();
    const cross = panel({ opgOrder: swapOpgBig(DEFAULT_PANEL.opgOrder, 2) });
    expect(bigViewportId('OPG2+1', 'AXIAL', cross)).toBeNull();
  });

  it('Panoramic: swapping 3D / axial into the big slot tracks that viewport', () => {
    const idx3d = DEFAULT_PANEL.opgOrder.indexOf('3D');
    expect(bigViewportId('OPG2+1', 'AXIAL', panel({ opgOrder: swapOpgBig(DEFAULT_PANEL.opgOrder, idx3d) }))).toBe(VP_3D);
    const idxAx = DEFAULT_PANEL.opgOrder.indexOf('AXIAL');
    expect(bigViewportId('OPG2+1', 'AXIAL', panel({ opgOrder: swapOpgBig(DEFAULT_PANEL.opgOrder, idxAx) }))).toBe(VP_AXIAL);
  });
});

describe('Panoramic default arrangement', () => {
  it('is big-left', () => {
    expect(DEFAULT_PANEL.panoArrangement).toBe('left');
  });
});
