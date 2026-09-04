/**
 * Settings — a centered modal with a left tab rail. Tabs: General, Patient,
 * Panoramic view, Implant planning, Guide. Each control has a short help line.
 * Replaces the old right-slide-in settings panel.
 */

import { useState } from 'react';
import { useViewer, type ReportFields, type DisplayConfig } from '@/context/ViewerContext';
import { useI18n } from '@/i18n/I18nContext';
import { useTheme } from '@/context/ThemeContext';
import { WindowLevelPresets } from '@/components/tools/WindowLevel';
import { IMPLANT_SYSTEMS, VOLUME_3D_PRESETS, type ProjectionMode } from '@/types/dicom';
import { XRAY_PRESET_ID, VOLUME_3D_COLORMAPS } from '@/core/volume3DPreset';

const QUALITY_IDS = ['low', 'medium', 'high'] as const;
import { APP_VERSION } from '@/version';
import { OtherProjects } from '@/components/common/OtherProjects';

const FIELD =
  'w-full bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-600 text-xs rounded-md px-2 py-1.5 border outline-none focus:border-dental-500';

/** Open-source libraries the viewer is built on (shown in the About tab). */
const CREDITS: { name: string; url: string; desc: string }[] = [
  { name: 'Cornerstone3D', url: 'https://www.cornerstonejs.org/', desc: 'DICOM rendering, MPR & 3D volume' },
  { name: 'vtk.js', url: 'https://kitware.github.io/vtk.js/', desc: 'WebGL 3D mesh actors' },
  { name: 'dicom-parser', url: 'https://github.com/cornerstonejs/dicomParser', desc: 'DICOM P10 parsing' },
  { name: 'jsPDF', url: 'https://github.com/parallax/jsPDF', desc: 'PDF report generation' },
  { name: 'manifold-3d', url: 'https://github.com/elalish/manifold', desc: 'CSG for the drill guide' },
  { name: 'React', url: 'https://react.dev/', desc: 'UI framework' },
  { name: 'Tailwind CSS', url: 'https://tailwindcss.com/', desc: 'Styling' },
  { name: 'Roboto (Apache-2.0)', url: 'https://fonts.google.com/specimen/Roboto', desc: 'Embedded PDF font' },
];

type Tab = 'general' | 'patient' | 'threed' | 'panoramic' | 'implant' | 'guide' | 'about';

function Help({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] leading-snug text-slate-500 dark:text-slate-400">{children}</p>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{label}</span>
      {children}
    </label>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{title}</div>
      {children}
    </div>
  );
}

export function SettingsPanel() {
  const { state, dispatch } = useViewer();
  const { t } = useI18n();
  const { theme, toggleTheme } = useTheme();
  const [tab, setTab] = useState<Tab>('general');

  const open = state.activePanel === 'settings';
  if (!open) return null;

  const close = () => dispatch({ type: 'SET_ACTIVE_PANEL', payload: null });
  const setReport = (p: Partial<ReportFields>) => dispatch({ type: 'SET_REPORT', payload: p });
  const setDisplay = (p: Partial<DisplayConfig>) => dispatch({ type: 'SET_DISPLAY', payload: p });
  const d = state.display;

  const TABS: { id: Tab; label: string }[] = [
    { id: 'general', label: t('settings.tab.general') },
    { id: 'patient', label: t('settings.tab.patient') },
    { id: 'threed', label: t('settings.tab.threed') },
    { id: 'panoramic', label: t('settings.tab.panoramic') },
    { id: 'implant', label: t('settings.tab.implant') },
    { id: 'guide', label: t('settings.guide') },
    { id: 'about', label: t('settings.tab.about') },
  ];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onMouseDown={close}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />
      <div
        className="relative flex w-full max-w-3xl h-[80vh] rounded-xl overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Tab rail */}
        <div className="w-44 shrink-0 border-r border-slate-200 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-900/60 p-2 space-y-1">
          <div className="px-2 py-1.5 text-sm font-semibold text-dental-600 dark:text-dental-400">{t('settings.title')}</div>
          {TABS.map((tb) => (
            <button
              key={tb.id}
              onClick={() => setTab(tb.id)}
              className={`w-full text-left px-3 py-2 rounded-md text-xs transition-colors ${
                tab === tb.id
                  ? 'bg-dental-600 text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
              }`}
            >
              {tb.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">
              {TABS.find((tb) => tb.id === tab)?.label}
            </h2>
            <button onClick={close} title={t('layers.close')} className="w-7 h-7 flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800">✕</button>
          </div>

          {tab === 'general' && (
            <>
              <Section title={t('settings.theme')}>
                <div className="flex gap-1">
                  {(['light', 'dark'] as const).map((th) => (
                    <button
                      key={th}
                      onClick={() => { if (theme !== th) toggleTheme(); }}
                      className={`flex-1 px-2 py-1.5 text-xs rounded-md transition-colors ${
                        theme === th ? 'bg-dental-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      {t(`settings.theme.${th}`)}
                    </button>
                  ))}
                </div>
              </Section>

              <Section title={t('settings.onImage')}>
                <Help>{t('settings.help.display')}</Help>
                <div className="grid grid-cols-2 gap-1.5">
                  {([
                    ['showName', t('report.patientName')],
                    ['showBirth', t('report.birthDate')],
                    ['showDate', t('settings.studyDate')],
                    ['showClinic', t('settings.clinic')],
                    ['showSeries', t('settings.seriesName')],
                    ['showModality', t('settings.modality')],
                    ['showSlice', t('settings.sliceNumber')],
                  ] as [keyof DisplayConfig, string][]).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                      <input type="checkbox" checked={d[key] as boolean} onChange={(e) => setDisplay({ [key]: e.target.checked })} className="accent-dental-500 w-3.5 h-3.5" />
                      {label}
                    </label>
                  ))}
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-[11px] text-slate-500">{t('settings.scope')}</span>
                  {(['main', 'all'] as const).map((sc) => (
                    <button key={sc} onClick={() => setDisplay({ scope: sc })}
                      className={`px-2 py-1 text-[11px] rounded-md transition-colors ${d.scope === sc ? 'bg-dental-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'}`}>
                      {t(`settings.scope.${sc}`)}
                    </button>
                  ))}
                </div>
              </Section>

              <Section title={t('settings.labels')}>
                <Help>{t('settings.help.labels')}</Help>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                    {t('safety.color')}
                    <input type="color" value={d.labelColor} onChange={(e) => setDisplay({ labelColor: e.target.value })} className="h-6 w-8 rounded border border-slate-300 dark:border-slate-600 bg-transparent cursor-pointer" />
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                    {t('settings.labelMain')}
                    <input type="number" min={8} max={40} value={d.labelSizeMain} onChange={(e) => setDisplay({ labelSizeMain: Number(e.target.value) })} className="w-14 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded px-1.5 py-1 text-xs" />
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                    {t('settings.labelSide')}
                    <input type="number" min={8} max={40} value={d.labelSizeSide} onChange={(e) => setDisplay({ labelSizeSide: Number(e.target.value) })} className="w-14 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded px-1.5 py-1 text-xs" />
                  </label>
                </div>
                <div className="flex gap-1">
                  {(['left', 'center', 'right'] as const).map((al) => (
                    <button key={al} onClick={() => setDisplay({ labelAlign: al })}
                      className={`flex-1 px-2 py-1 text-xs rounded-md transition-colors ${d.labelAlign === al ? 'bg-dental-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'}`}>
                      {t(`settings.align.${al}`)}
                    </button>
                  ))}
                </div>
              </Section>

              <Section title={t('settings.wlPresets')}>
                <WindowLevelPresets vertical />
                <Help>{t('settings.wlHint')}</Help>
              </Section>
            </>
          )}

          {tab === 'threed' && (
            <>
              <Section title={t('settings.default3dPreset')}>
                <Help>{t('settings.help.threed')}</Help>
                <select value={d.preset3d} onChange={(e) => setDisplay({ preset3d: e.target.value })} className={FIELD}>
                  {VOLUME_3D_PRESETS.map((p) => (<option key={p.id} value={p.id}>{t(p.labelKey)}</option>))}
                  <option value={XRAY_PRESET_ID}>{t('preset3d.xray')}</option>
                </select>
              </Section>
              <Section title={t('view3d.quality')}>
                <select value={d.quality3d} onChange={(e) => setDisplay({ quality3d: e.target.value as DisplayConfig['quality3d'] })} className={FIELD}>
                  {QUALITY_IDS.map((q) => (<option key={q} value={q}>{t(`quality.${q}`)}</option>))}
                </select>
              </Section>
              <Section title={t('view3d.color')}>
                <select value={d.colormap3d} onChange={(e) => setDisplay({ colormap3d: e.target.value as DisplayConfig['colormap3d'] })} className={FIELD}>
                  {VOLUME_3D_COLORMAPS.map((c) => (<option key={c} value={c}>{t(`colormap.${c}`)}</option>))}
                </select>
              </Section>
              <Section title={t('settings.slice3dOpacity')}>
                <Help>{t('settings.help.sliceOpacity')}</Help>
                <div className="flex items-center gap-2">
                  <input type="range" min={0.05} max={1} step={0.05} value={d.sliceOpacity} onChange={(e) => setDisplay({ sliceOpacity: Number(e.target.value) })} className="flex-1 h-1 accent-dental-400" />
                  <span className="text-xs font-mono text-slate-600 dark:text-slate-300 w-10">{Math.round(d.sliceOpacity * 100)}%</span>
                </div>
              </Section>
            </>
          )}

          {tab === 'patient' && (
            <Section title={t('settings.report')}>
              <Help>{t('settings.help.patient')}</Help>
              <Field label={t('report.patientName')}>
                <input className={FIELD} value={state.report.patientName} onChange={(e) => setReport({ patientName: e.target.value })} />
              </Field>
              <Field label={t('report.birthDate')}>
                <input type="date" className={FIELD} value={state.report.patientBirthDate} onChange={(e) => setReport({ patientBirthDate: e.target.value })} />
              </Field>
              <Field label={t('report.quoteNumber')}>
                <input className={FIELD} value={state.report.quoteNumber} onChange={(e) => setReport({ quoteNumber: e.target.value })} />
              </Field>
              <Field label={t('report.status')}>
                <textarea rows={2} className={`${FIELD} resize-none`} value={state.report.statusDescription} onChange={(e) => setReport({ statusDescription: e.target.value })} />
              </Field>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 pt-1">{t('settings.onImage')}</div>
              <Help>{t('settings.help.overrides')}</Help>
              <Field label={t('settings.clinic')}>
                <input className={FIELD} placeholder={state.study?.institution ?? ''} value={state.report.clinic} onChange={(e) => setReport({ clinic: e.target.value })} />
              </Field>
              <Field label={t('settings.studyDate')}>
                <input className={FIELD} placeholder={state.study?.studyDate ?? ''} value={state.report.studyDate} onChange={(e) => setReport({ studyDate: e.target.value })} />
              </Field>
              <Field label={t('settings.seriesName')}>
                <input className={FIELD} value={state.report.seriesName} onChange={(e) => setReport({ seriesName: e.target.value })} />
              </Field>
            </Section>
          )}

          {tab === 'panoramic' && (
            <Section title={t('settings.opg')}>
              <Help>{t('settings.help.panoramic')}</Help>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-600 dark:text-slate-300">{t('opg.width')}</span>
                  <span className="text-xs font-mono text-slate-500">{state.panoramicSlabWidth} mm</span>
                </div>
                <input type="range" min={5} max={50} step={1} value={state.panoramicSlabWidth} onChange={(e) => dispatch({ type: 'SET_PANORAMIC_SLAB', payload: Number(e.target.value) })} className="w-full h-1 accent-dental-400" />
              </div>
              <div className="flex gap-1">
                {(['AVG', 'MIP'] as ProjectionMode[]).map((mode) => (
                  <button key={mode} onClick={() => dispatch({ type: 'SET_PANORAMIC_PROJECTION', payload: mode })}
                    className={`flex-1 px-2 py-1 text-xs rounded-md transition-colors ${state.panoramicProjection === mode ? 'bg-dental-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'}`}>
                    {mode}
                  </button>
                ))}
              </div>
              <Field label={t('opg.resolution')}>
                <select value={state.panoramicResolution} onChange={(e) => dispatch({ type: 'SET_PANORAMIC_RESOLUTION', payload: Number(e.target.value) })} className={FIELD}>
                  <option value={0.15}>150 µm</option><option value={0.3}>300 µm</option><option value={0.45}>450 µm</option>
                  <option value={0.75}>750 µm</option><option value={1.0}>1.0 mm</option><option value={2.0}>2.0 mm</option>
                  <option value={3.0}>3.0 mm</option><option value={5.0}>5.0 mm</option>
                </select>
              </Field>
            </Section>
          )}

          {tab === 'implant' && (
            <Section title={t('settings.safety')}>
              <Help>{t('settings.help.implant')}</Help>
              <Field label={t('settings.defaultImplant')}>
                <select value={state.defaultSystemId} onChange={(e) => dispatch({ type: 'SET_DEFAULT_SYSTEM', payload: e.target.value })} className={FIELD}>
                  {IMPLANT_SYSTEMS.map((sys) => (
                    <option key={sys.id} value={sys.id}>{sys.brand} · {sys.line}</option>
                  ))}
                </select>
              </Field>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-600 dark:text-slate-300">{t('safety.margin')}</span>
                  <span className="text-xs font-mono text-slate-500">{state.safety.marginMm} mm</span>
                </div>
                <input type="range" min={0} max={5} step={0.5} value={state.safety.marginMm} onChange={(e) => dispatch({ type: 'SET_SAFETY', payload: { marginMm: Number(e.target.value) } })} className="w-full h-1 accent-dental-400" />
              </div>
              <label className="flex items-center justify-between">
                <span className="text-xs text-slate-600 dark:text-slate-300">{t('safety.color')}</span>
                <input type="color" value={state.safety.color} onChange={(e) => dispatch({ type: 'SET_SAFETY', payload: { color: e.target.value } })} className="h-6 w-10 rounded border border-slate-300 dark:border-slate-600 bg-transparent cursor-pointer" />
              </label>
              <div className="text-[11px] text-slate-500 pt-1">{t('safety.thresholds')}</div>
              <div className="grid grid-cols-3 gap-2">
                {([['nerveMm', t('safety.nerve')], ['sinusMm', t('safety.sinus')], ['neighborMm', t('safety.neighbor')]] as const).map(([key, label]) => (
                  <label key={key} className="space-y-1">
                    <span className="block text-[11px] text-slate-600 dark:text-slate-300">{label}</span>
                    <input type="number" min={0} max={10} step={0.5} value={state.safety[key]} onChange={(e) => dispatch({ type: 'SET_SAFETY', payload: { [key]: Number(e.target.value) } })} className={FIELD} />
                  </label>
                ))}
              </div>
              <Help>{t('settings.safetyHint')}</Help>
              <Help>{t('safety.notChecked')}</Help>
            </Section>
          )}

          {tab === 'guide' && (
            <Section title={t('settings.guide')}>
              <Help>{t('settings.help.guide')}</Help>
              <label className="flex items-center gap-2 mb-2 text-[12px] text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={state.guide.sleeveSeat}
                  onChange={(e) => dispatch({ type: 'SET_GUIDE', payload: { sleeveSeat: e.target.checked } })}
                />
                {t('guide.sleeveSeat')}
              </label>
              <div className="grid grid-cols-2 gap-2">
                {([
                  ['wallMm', t('guide.wall'), 0.5, 4, 0.1],
                  ['baseWidthMm', t('guide.baseWidth'), 2, 10, 0.5],
                  ['baseHeightMm', t('guide.baseHeight'), 2, 10, 0.5],
                  ['channelTolMm', t('guide.channelTol'), 0, 0.5, 0.05],
                  ['seatClearanceMm', t('guide.seatClearance'), 0, 0.5, 0.01],
                  ['sleeveWallMm', t('guide.sleeveWall'), 0.3, 2, 0.1],
                ] as const).map(([key, label, min, max, step]) => (
                  <label key={key} className="space-y-1">
                    <span className="block text-[11px] text-slate-600 dark:text-slate-300">{label}</span>
                    <input type="number" min={min} max={max} step={step} value={state.guide[key]} onChange={(e) => dispatch({ type: 'SET_GUIDE', payload: { [key]: Number(e.target.value) } })} className={FIELD} />
                  </label>
                ))}
              </div>
              <Help>{t('guide.seatHint')}</Help>
            </Section>
          )}

          {tab === 'about' && (
            <>
              <Section title={t('settings.about.contributor')}>
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  <span className="font-semibold">Zoltán Dul</span> (ZoliQua) —{' '}
                  <a href="https://github.com/ZoliQua" target="_blank" rel="noreferrer" className="text-dental-600 dark:text-dental-400 hover:underline">github.com/ZoliQua ↗</a>
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  DenCT v{APP_VERSION} · MIT ·{' '}
                  <a href="https://github.com/ZoliQua/Dental-CBCT-Viewer" target="_blank" rel="noreferrer" className="text-dental-600 dark:text-dental-400 hover:underline">Repository ↗</a>
                </p>
              </Section>

              <Section title={t('settings.about.builtWith')}>
                <ul className="space-y-1.5 text-xs">
                  {CREDITS.map((c) => (
                    <li key={c.name}>
                      <a href={c.url} target="_blank" rel="noreferrer" className="text-dental-600 dark:text-dental-400 hover:underline font-medium">{c.name}</a>
                      <span className="text-slate-500 dark:text-slate-400"> — {c.desc}</span>
                    </li>
                  ))}
                </ul>
              </Section>

              <div className="space-y-2">
                <p className="text-xs text-slate-600 dark:text-slate-300">{t('about.otherProjects')}</p>
                <OtherProjects />
              </div>

              <p className="text-[11px] text-amber-700 dark:text-amber-300">⚠️ {t('landing.disclaimerShort')}</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
