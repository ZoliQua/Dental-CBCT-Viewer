/**
 * Settings panel (slides in from the right): editable report header fields,
 * Window/Level presets, and the panoramic / cross-section image controls
 * (slab width, AVG/MIP, resolution) that used to live in the toolbar.
 */

import { useViewer, type ReportFields } from '@/context/ViewerContext';
import { useI18n } from '@/i18n/I18nContext';
import { SidePanel } from './SidePanel';
import { WindowLevelPresets } from '@/components/tools/WindowLevel';
import type { ProjectionMode } from '@/types/dicom';

const FIELD =
  'w-full bg-gray-100 text-gray-800 border-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600 text-xs rounded px-2 py-1 border outline-none focus:border-dental-500';

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-wide text-gray-500 select-none">{children}</div>
  );
}

export function SettingsPanel() {
  const { state, dispatch } = useViewer();
  const { t } = useI18n();
  const isOPG = state.layoutMode === 'OPG' || state.layoutMode === 'OPG2+1';

  const setReport = (partial: Partial<ReportFields>) =>
    dispatch({ type: 'SET_REPORT', payload: partial });

  return (
    <SidePanel
      open={state.activePanel === 'settings'}
      title={t('settings.title')}
      onClose={() => dispatch({ type: 'SET_ACTIVE_PANEL', payload: null })}
      closeTitle={t('layers.close')}
    >
      <div className="space-y-5">
        {/* Report header fields */}
        <div className="space-y-2">
          <SectionLabel>{t('settings.report')}</SectionLabel>
          <label className="block space-y-1">
            <span className="text-xs text-gray-600 dark:text-gray-400">{t('report.patientName')}</span>
            <input
              className={FIELD}
              value={state.report.patientName}
              onChange={(e) => setReport({ patientName: e.target.value })}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-gray-600 dark:text-gray-400">{t('report.patientAge')}</span>
            <input
              className={FIELD}
              value={state.report.patientAge}
              onChange={(e) => setReport({ patientAge: e.target.value })}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-gray-600 dark:text-gray-400">{t('report.quoteNumber')}</span>
            <input
              className={FIELD}
              value={state.report.quoteNumber}
              onChange={(e) => setReport({ quoteNumber: e.target.value })}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-gray-600 dark:text-gray-400">{t('report.status')}</span>
            <textarea
              rows={2}
              className={`${FIELD} resize-none`}
              value={state.report.statusDescription}
              onChange={(e) => setReport({ statusDescription: e.target.value })}
            />
          </label>
        </div>

        {/* Window/Level presets */}
        <div className="space-y-2">
          <SectionLabel>{t('settings.wlPresets')}</SectionLabel>
          <WindowLevelPresets vertical />
          <p className="text-xs text-gray-500 dark:text-gray-500">{t('settings.wlHint')}</p>
        </div>

        {/* Implant safety-margin halo */}
        <div className="space-y-2">
          <SectionLabel>{t('settings.safety')}</SectionLabel>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-600 dark:text-gray-400">{t('safety.margin')}</span>
              <span className="text-xs font-mono text-gray-700 dark:text-gray-300">{state.safety.marginMm} mm</span>
            </div>
            <input
              type="range"
              min={0}
              max={5}
              step={0.5}
              value={state.safety.marginMm}
              onChange={(e) => dispatch({ type: 'SET_SAFETY', payload: { marginMm: Number(e.target.value) } })}
              className="w-full h-1 accent-dental-400"
            />
          </div>
          <label className="flex items-center justify-between">
            <span className="text-xs text-gray-600 dark:text-gray-400">{t('safety.color')}</span>
            <input
              type="color"
              value={state.safety.color}
              onChange={(e) => dispatch({ type: 'SET_SAFETY', payload: { color: e.target.value } })}
              className="h-6 w-10 rounded border border-gray-300 dark:border-gray-600 bg-transparent cursor-pointer"
            />
          </label>

          <div className="text-[10px] text-gray-500 pt-1 select-none">{t('safety.thresholds')}</div>
          <div className="grid grid-cols-3 gap-2">
            {([
              ['nerveMm', t('safety.nerve')],
              ['sinusMm', t('safety.sinus')],
              ['neighborMm', t('safety.neighbor')],
            ] as const).map(([key, label]) => (
              <label key={key} className="space-y-1">
                <span className="block text-[11px] text-gray-600 dark:text-gray-400">{label}</span>
                <input
                  type="number"
                  min={0}
                  max={10}
                  step={0.5}
                  value={state.safety[key]}
                  onChange={(e) => dispatch({ type: 'SET_SAFETY', payload: { [key]: Number(e.target.value) } })}
                  className={FIELD}
                />
              </label>
            ))}
          </div>
        </div>

        {/* Drill-guide (surgical template) export parameters */}
        <div className="space-y-2">
          <SectionLabel>{t('settings.guide')}</SectionLabel>
          <div className="grid grid-cols-2 gap-2">
            {([
              ['wallMm', t('guide.wall'), 0.5, 4, 0.1],
              ['baseWidthMm', t('guide.baseWidth'), 2, 10, 0.5],
              ['baseHeightMm', t('guide.baseHeight'), 2, 10, 0.5],
              ['channelTolMm', t('guide.channelTol'), 0, 0.5, 0.05],
            ] as const).map(([key, label, min, max, step]) => (
              <label key={key} className="space-y-1">
                <span className="block text-[11px] text-gray-600 dark:text-gray-400">{label}</span>
                <input
                  type="number"
                  min={min}
                  max={max}
                  step={step}
                  value={state.guide[key]}
                  onChange={(e) => dispatch({ type: 'SET_GUIDE', payload: { [key]: Number(e.target.value) } })}
                  className={FIELD}
                />
              </label>
            ))}
          </div>
        </div>

        {/* Panoramic / cross-section controls */}
        {state.study && isOPG && (
          <div className="space-y-3">
            <SectionLabel>{t('settings.opg')}</SectionLabel>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-600 dark:text-gray-400">{t('opg.width')}</span>
                <span className="text-xs font-mono text-gray-700 dark:text-gray-300">{state.panoramicSlabWidth} mm</span>
              </div>
              <input
                type="range"
                min={5}
                max={50}
                step={1}
                value={state.panoramicSlabWidth}
                onChange={(e) => dispatch({ type: 'SET_PANORAMIC_SLAB', payload: Number(e.target.value) })}
                className="w-full h-1 accent-dental-400"
              />
            </div>

            <div className="flex gap-1">
              {(['AVG', 'MIP'] as ProjectionMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => dispatch({ type: 'SET_PANORAMIC_PROJECTION', payload: mode })}
                  className={`
                    flex-1 px-2 py-1 text-xs rounded transition-colors
                    ${state.panoramicProjection === mode
                      ? 'bg-dental-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'}
                  `}
                >
                  {mode}
                </button>
              ))}
            </div>

            <label className="block space-y-1">
              <span className="text-xs text-gray-600 dark:text-gray-400">{t('opg.resolution')}</span>
              <select
                value={state.panoramicResolution}
                onChange={(e) => dispatch({ type: 'SET_PANORAMIC_RESOLUTION', payload: Number(e.target.value) })}
                className={FIELD}
              >
                <option value={0.15}>150 µm</option>
                <option value={0.3}>300 µm</option>
                <option value={0.45}>450 µm</option>
                <option value={0.75}>750 µm</option>
                <option value={1.0}>1.0 mm</option>
                <option value={2.0}>2.0 mm</option>
                <option value={3.0}>3.0 mm</option>
                <option value={5.0}>5.0 mm</option>
              </select>
            </label>
          </div>
        )}
      </div>
    </SidePanel>
  );
}
