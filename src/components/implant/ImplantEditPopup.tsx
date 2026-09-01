/**
 * Pop-up editor for one implant's properties. Opened from the layers panel
 * "módosítás" icon (replaces the old toolbar inline editor).
 */

import { useViewer } from '@/context/ViewerContext';
import { useI18n } from '@/i18n/I18nContext';
import type { ImplantData } from '@/types/dicom';
import {
  IMPLANT_SYSTEMS,
  SLEEVE_OFFSETS,
  getImplantSystem,
  defaultGuidedPlan,
} from '@/types/dicom';
import { implantWorldAxis } from '@/core/implantGeometry';
import { evaluateImplant, type ImplantSeg } from '@/core/safety';
import { getVolumeData } from '@/core/cprEngine';
import { sampleImplantBoneHU, type BoneClass } from '@/core/boneQuality';

const BONE_COLOR: Record<BoneClass, string> = {
  D1: 'text-green-600 dark:text-green-400',
  D2: 'text-green-600 dark:text-green-400',
  D3: 'text-amber-600 dark:text-amber-400',
  D4: 'text-red-600 dark:text-red-400',
  D5: 'text-red-600 dark:text-red-400 font-bold',
};

/** Closest value in `options` to `value` (keeps sizes valid across systems). */
function nearest(value: number, options: number[]): number {
  return options.reduce((a, b) => (Math.abs(b - value) < Math.abs(a - value) ? b : a), options[0]);
}

interface ImplantEditPopupProps {
  implantId: string;
  onClose: () => void;
}

export function ImplantEditPopup({ implantId, onClose }: ImplantEditPopupProps) {
  const { state, dispatch } = useViewer();
  const { t } = useI18n();
  const implant = state.implants.find(i => i.id === implantId);

  if (!implant) return null;

  const update = (partial: Partial<ImplantData>) => {
    dispatch({ type: 'UPDATE_IMPLANT', payload: { ...implant, ...partial } });
  };

  const system = getImplantSystem(implant.systemId);
  const guided = implant.guided;

  // Safety clearances to anatomy markers and neighbouring implants
  const visAnatomy = state.anatomy.filter(a => a.visible);
  const cps = state.archCurveControlPoints;
  const segs: ImplantSeg[] = cps
    ? state.implants.filter(i => i.visible).flatMap(i => {
        const w = implantWorldAxis(cps, i);
        return w ? [{ id: i.id, entry: w.entry, apex: w.apex, radius: i.diameter / 2 }] : [];
      })
    : [];
  const selfSeg = segs.find(s => s.id === implant.id);
  const safetyEval = selfSeg && (visAnatomy.length || segs.length > 1)
    ? evaluateImplant(selfSeg, segs, visAnatomy,
        { nerve: state.safety.nerveMm, sinus: state.safety.sinusMm, neighbor: state.safety.neighborMm })
    : null;

  // Bone quality (Misch D1–D5, indicative) from the mean CBCT gray value along the implant body
  const vol = state.volumeId ? getVolumeData(state.volumeId) : null;
  const bone = vol && selfSeg ? sampleImplantBoneHU(vol, selfSeg.entry, selfSeg.apex, selfSeg.radius) : null;

  const changeSystem = (id: string) => {
    const sys = getImplantSystem(id);
    update({
      systemId: id,
      diameter: nearest(implant.diameter, sys.diameters),
      length: nearest(implant.length, sys.lengths),
    });
  };

  const updateGuided = (partial: Partial<NonNullable<ImplantData['guided']>>) => {
    const base = implant.guided ?? defaultGuidedPlan(implant);
    update({ guided: { ...base, ...partial } });
  };

  return (
    <>
      {/* Click-away backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      <div className="fixed left-[20rem] top-24 z-50 w-64 bg-white border border-gray-300 dark:bg-gray-800 dark:border-gray-600 rounded-lg shadow-xl p-3 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-dental-600 dark:text-dental-400 select-none">{implant.name}</span>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-gray-900 hover:bg-gray-200 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-700 rounded"
            title={t('implant.close')}
          >
            ✕
          </button>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-600 dark:text-gray-400 w-16 select-none">{t('implant.system')}</label>
          <select
            value={implant.systemId ?? 'generic'}
            onChange={(e) => changeSystem(e.target.value)}
            className="flex-1 bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600 text-xs rounded px-1 py-1 border"
          >
            {IMPLANT_SYSTEMS.map(s => (
              <option key={s.id} value={s.id}>{s.brand} {s.line}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-600 dark:text-gray-400 w-16 select-none">{t('implant.diameter')}</label>
          <select
            value={implant.diameter}
            onChange={(e) => update({ diameter: Number(e.target.value) })}
            className="flex-1 bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600 text-xs rounded px-1 py-1 border"
          >
            {system.diameters.map(d => (
              <option key={d} value={d}>⌀ {d} mm</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-600 dark:text-gray-400 w-16 select-none">{t('implant.length')}</label>
          <select
            value={implant.length}
            onChange={(e) => update({ length: Number(e.target.value) })}
            className="flex-1 bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600 text-xs rounded px-1 py-1 border"
          >
            {system.lengths.map(l => (
              <option key={l} value={l}>{l} mm</option>
            ))}
          </select>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label className="text-xs text-gray-600 dark:text-gray-400 select-none" title={t('implant.blHint')}>
              {t('implant.blRotation')}
            </label>
            <span className="text-xs text-gray-700 dark:text-gray-300 font-mono">{implant.angleBLDeg}°</span>
          </div>
          <input
            type="range"
            min={-180}
            max={180}
            step={1}
            value={implant.angleBLDeg}
            onChange={(e) => update({ angleBLDeg: Number(e.target.value) })}
            className="w-full h-1 accent-dental-400"
          />
          <div className="flex gap-1 mt-1">
            <button
              onClick={() => update({ angleBLDeg: 0 })}
              className="flex-1 px-1 py-0.5 text-[10px] bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 rounded"
              title={t('implant.lowerJaw')}
            >
              {t('implant.lowerJaw')}
            </button>
            <button
              onClick={() => update({ angleBLDeg: 180 })}
              className="flex-1 px-1 py-0.5 text-[10px] bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 rounded"
              title={t('implant.upperJaw')}
            >
              {t('implant.upperJaw')}
            </button>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label className="text-xs text-gray-600 dark:text-gray-400 select-none" title={t('implant.mdHint')}>
              {t('implant.mdTilt')}
            </label>
            <span className="text-xs text-gray-700 dark:text-gray-300 font-mono">{implant.angleMDDeg}°</span>
          </div>
          <input
            type="range"
            min={-60}
            max={60}
            step={1}
            value={implant.angleMDDeg}
            onChange={(e) => update({ angleMDDeg: Number(e.target.value) })}
            className="w-full h-1 accent-dental-400"
          />
        </div>

        {/* ── Guided surgery (drill sleeve + osteotomy) ── */}
        <div className="border-t border-gray-200 dark:border-gray-700 pt-2 space-y-2">
          <label className="flex items-center justify-between cursor-pointer select-none">
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{t('guided.title')}</span>
            <input
              type="checkbox"
              checked={!!guided?.enabled}
              onChange={(e) =>
                e.target.checked
                  ? update({ guided: defaultGuidedPlan(implant) })
                  : updateGuided({ enabled: false })
              }
              className="accent-dental-500"
            />
          </label>

          {guided?.enabled && (
            <>
              <div className="flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400">
                <span>{t('guided.sleeveDiameter')}</span>
                <span className="font-mono text-gray-700 dark:text-gray-300">⌀ {system.sleeveDiameter} mm</span>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-600 dark:text-gray-400 w-20 select-none" title={t('guided.offsetHint')}>{t('guided.offset')}</label>
                <select
                  value={guided.sleeveOffset}
                  onChange={(e) => updateGuided({ sleeveOffset: Number(e.target.value) })}
                  className="flex-1 bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600 text-xs rounded px-1 py-1 border"
                >
                  {SLEEVE_OFFSETS.map(o => (
                    <option key={o} value={o}>{o} mm</option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs text-gray-600 dark:text-gray-400 select-none">{t('guided.drillLength')}</label>
                  <span className="text-xs text-gray-700 dark:text-gray-300 font-mono">{guided.drillLength} mm</span>
                </div>
                <input
                  type="range"
                  min={implant.length}
                  max={implant.length + 6}
                  step={0.5}
                  value={guided.drillLength}
                  onChange={(e) => updateGuided({ drillLength: Number(e.target.value) })}
                  className="w-full h-1 accent-dental-400"
                />
              </div>
            </>
          )}
        </div>

        {/* Safety clearances */}
        {safetyEval && (
          <div className="border-t border-gray-200 dark:border-gray-700 pt-2 space-y-1">
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{t('safety.title')}</span>
            {safetyEval.anatomy.map(r => {
              const name = visAnatomy.find(a => a.id === r.id)?.name ?? '';
              return (
                <div key={r.id} className="flex items-center justify-between text-xs">
                  <span className="text-gray-600 dark:text-gray-400 truncate mr-2">{name}</span>
                  <span className={`font-mono ${r.ok ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400 font-bold'}`}>
                    {r.mm.toFixed(1)} mm {r.ok ? '✓' : '⚠'}
                  </span>
                </div>
              );
            })}
            {/* The nerve is traced on the panoramic only — its buccolingual
                position is unknown, so the 3D clearance is against a centerline
                pinned to the arch curve. Disclose that next to the value. */}
            {safetyEval.anatomy.some(r => r.type === 'nerve') && (
              <p className="text-[10px] leading-snug text-amber-600 dark:text-amber-400">{t('safety.nerveCaveat')}</p>
            )}
            {safetyEval.neighborMm !== null && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-600 dark:text-gray-400 truncate mr-2">{t('safety.neighbor')}</span>
                <span className={`font-mono ${safetyEval.neighborOk ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400 font-bold'}`}>
                  {safetyEval.neighborMm.toFixed(1)} mm {safetyEval.neighborOk ? '✓' : '⚠'}
                </span>
              </div>
            )}
            <p className="text-[10px] leading-snug text-gray-500 dark:text-gray-400">{t('safety.notChecked')}</p>
          </div>
        )}

        {/* Bone quality (CBCT gray values are uncalibrated — not HU) */}
        {bone && (
          <div className="border-t border-gray-200 dark:border-gray-700 pt-2 space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-700 dark:text-gray-300 font-semibold">{t('bone.title')}</span>
              <span className={`font-mono ${BONE_COLOR[bone.bone]}`}>
                {bone.bone} · {Math.round(bone.meanHU)} GV
              </span>
            </div>
            <p className="text-[10px] leading-snug text-gray-500 dark:text-gray-400">{t('bone.uncalibrated')}</p>
          </div>
        )}
      </div>
    </>
  );
}
