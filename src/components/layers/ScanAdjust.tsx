/**
 * Manual correction of a scan's placement, in the Layers panel.
 *
 * Automatic registration (3-point / ICP) gets a scan close; this is how the
 * operator finishes the job — nudge along the patient axes, rotate about the
 * scan's own centre, watch the cross-section contour or the 3D surface move,
 * and reset back to the placement the scan arrived with if the correction went
 * the wrong way. Every step is the same size, so a correction can be walked
 * back exactly. The maths is in core/scanAdjust.
 */

import { useState } from 'react';
import { useViewer } from '@/context/ViewerContext';
import { useI18n } from '@/i18n/I18nContext';
import { useScanRefine } from '@/hooks/useScanRefine';
import { nudgeScan, rotateScan, scanCenterWorld, NUDGE_MM, NUDGE_DEG, type NudgeAxis } from '@/core/scanAdjust';
import { getScanPolyData, getScanBaseTransform } from '@/core/scanMesh';
import type { ScanMesh } from '@/types/dicom';

const AXES: NudgeAxis[] = ['x', 'y', 'z'];
const STEPS_MM = [0.1, 0.25, 1];
const STEPS_DEG = [0.5, 1, 5];

function StepButton({ label, title, onClick }: { label: string; title: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="w-6 h-5 flex items-center justify-center rounded bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 text-[11px] leading-none transition-colors"
    >
      {label}
    </button>
  );
}

export function ScanAdjust({ scan }: { scan: ScanMesh }) {
  const { dispatch } = useViewer();
  const { t } = useI18n();
  const [mm, setMm] = useState(NUDGE_MM);
  const [deg, setDeg] = useState(NUDGE_DEG);
  const refine = useScanRefine();
  const [refining, setRefining] = useState(false);
  const [surfaceRms, setSurfaceRms] = useState<number | null>(null);

  const runRefine = async () => {
    setRefining(true);
    setSurfaceRms(null);
    try {
      const outcome = await refine(scan);
      if (outcome.ok) setSurfaceRms(outcome.result.rmsMm);
      else window.alert(t(`reg.refine.${outcome.reason}`));
    } finally {
      setRefining(false);
    }
  };

  const apply = (transform: number[]) => dispatch({ type: 'UPDATE_SCAN', payload: { ...scan, transform } });

  const move = (axis: NudgeAxis, sign: 1 | -1) => apply(nudgeScan(scan.transform, axis, sign * mm));

  const turn = (axis: NudgeAxis, sign: 1 | -1) => {
    // Rotate about the mesh's own centre, so it spins in place rather than
    // swinging around the volume origin.
    const pivot = scanCenterWorld(scan.transform, getScanPolyData(scan.id)?.getBounds?.());
    apply(rotateScan(scan.transform, axis, sign * deg, pivot));
  };

  const base = getScanBaseTransform(scan.id);

  return (
    <div className="mt-1 ml-2 mr-1 rounded-md border border-gray-200 dark:border-gray-700 p-1.5 space-y-1.5">
      {/* Let the CT do the work first — hand nudges are for what it cannot see. */}
      <button
        onClick={runRefine}
        disabled={refining}
        title={t('reg.refine.hint')}
        className="w-full py-1 text-[11px] rounded bg-dental-600 text-white hover:bg-dental-700 transition-colors disabled:opacity-50"
      >
        {refining ? t('reg.refine.busy') : t('reg.refine.button')}
      </button>
      {surfaceRms !== null && (
        <p className="text-[10px] font-mono text-gray-600 dark:text-gray-300 text-center">
          {t('reg.refine.result', { rms: surfaceRms.toFixed(2) })}
        </p>
      )}

      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wide text-gray-500 select-none">{t('scanAdjust.move')}</span>
        <select
          value={mm}
          onChange={(e) => setMm(Number(e.target.value))}
          className="bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600 text-[10px] rounded px-1 py-0.5 border"
        >
          {STEPS_MM.map((v) => <option key={v} value={v}>{v} mm</option>)}
        </select>
      </div>
      <div className="flex items-center gap-2">
        {AXES.map((axis) => (
          <div key={axis} className="flex items-center gap-0.5">
            <span className="w-3 text-[10px] font-semibold text-gray-500 uppercase select-none">{axis}</span>
            <StepButton label="−" title={`${axis.toUpperCase()} −${mm} mm`} onClick={() => move(axis, -1)} />
            <StepButton label="+" title={`${axis.toUpperCase()} +${mm} mm`} onClick={() => move(axis, 1)} />
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2 pt-0.5">
        <span className="text-[10px] uppercase tracking-wide text-gray-500 select-none">{t('scanAdjust.rotate')}</span>
        <select
          value={deg}
          onChange={(e) => setDeg(Number(e.target.value))}
          className="bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600 text-[10px] rounded px-1 py-0.5 border"
        >
          {STEPS_DEG.map((v) => <option key={v} value={v}>{v}°</option>)}
        </select>
      </div>
      <div className="flex items-center gap-2">
        {AXES.map((axis) => (
          <div key={axis} className="flex items-center gap-0.5">
            <span className="w-3 text-[10px] font-semibold text-gray-500 uppercase select-none">{axis}</span>
            <StepButton label="↺" title={`${axis.toUpperCase()} −${deg}°`} onClick={() => turn(axis, -1)} />
            <StepButton label="↻" title={`${axis.toUpperCase()} +${deg}°`} onClick={() => turn(axis, 1)} />
          </div>
        ))}
      </div>

      <button
        onClick={() => base && apply(base)}
        disabled={!base}
        title={t('scanAdjust.resetHint')}
        className="w-full py-0.5 text-[10px] rounded bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700/60 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors disabled:opacity-40"
      >
        {t('scanAdjust.reset')}
      </button>
    </div>
  );
}
