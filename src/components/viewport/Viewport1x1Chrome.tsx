/**
 * On-image chrome for the 1×1 layout: a small "Tools" box (top-left) and a
 * "View" box (top-right), so the interaction tools and the view switcher are
 * discoverable directly on the image instead of only in the side rail.
 */

import { useViewer } from '@/context/ViewerContext';
import { useI18n } from '@/i18n/I18nContext';
import { setActiveTool } from '@/core/toolManager';
import { TOOL_ICONS } from '@/components/layout/toolIcons';
import { VIEW_KEYS, WL_PRESETS, type ViewMode, type ViewportTool } from '@/types/dicom';

const NAV_TOOLS: { id: ViewportTool; icon: string; key: string }[] = [
  { id: 'windowLevel', icon: 'windowLevel', key: 'tool.windowLevel' },
  { id: 'pan', icon: 'pan', key: 'tool.pan' },
  { id: 'zoom', icon: 'zoom', key: 'tool.zoom' },
  { id: 'scroll', icon: 'scroll', key: 'tool.scroll' },
];

const MEASURE_TOOLS: { id: ViewportTool; icon: string; key: string }[] = [
  { id: 'length', icon: 'length', key: 'tool.length' },
  { id: 'angle', icon: 'angle', key: 'tool.angle' },
  { id: 'probe', icon: 'probe', key: 'tool.probe' },
  { id: 'arrowAnnotate', icon: 'arrow', key: 'tool.arrow' },
];

function IconToolButton({ icon, active, title, onClick }: {
  icon: string; active: boolean; title: string; onClick: () => void;
}) {
  const Icon = TOOL_ICONS[icon];
  return (
    <button
      onClick={onClick}
      title={title}
      className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors ${
        active ? 'bg-dental-600 text-white' : 'text-slate-200 hover:bg-slate-700/60'
      }`}
    >
      {Icon ? <Icon /> : title[0]}
    </button>
  );
}

function BoxLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-400 select-none px-0.5">
      {children}
    </div>
  );
}

export function Viewport1x1Chrome() {
  const { state, dispatch } = useViewer();
  const { t } = useI18n();
  const is3D = state.viewMode === '3D';

  const pick = (tool: ViewportTool) => {
    setActiveTool(tool);
    dispatch({ type: 'SET_ACTIVE_TOOL', payload: tool });
  };

  return (
    <>
      {/* Top-left: Tools */}
      <div className="absolute top-2 left-2 z-20 flex flex-col gap-1 rounded-lg bg-slate-900/70 backdrop-blur-sm border border-slate-700/60 px-1.5 py-1 shadow-lg">
        <BoxLabel>{t('panel.tools')}</BoxLabel>
        <div className="flex items-center gap-0.5">
          {NAV_TOOLS.map((tl) => (
            <IconToolButton key={tl.id} icon={tl.icon} active={state.activeTool === tl.id} title={t(tl.key)} onClick={() => pick(tl.id)} />
          ))}
        </div>
        {!is3D && (
          <div className="flex items-center gap-0.5">
            {MEASURE_TOOLS.map((tl) => (
              <IconToolButton key={tl.id} icon={tl.icon} active={state.activeTool === tl.id} title={t(tl.key)} onClick={() => pick(tl.id)} />
            ))}
          </div>
        )}
      </div>

      {/* Bottom-center: View switcher (+ W/L preset & contrast for non-3D) */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 rounded-lg bg-slate-900/70 backdrop-blur-sm border border-slate-700/60 px-1.5 py-1 shadow-lg">
        {VIEW_KEYS.map((k) => (
          <button
            key={k}
            onClick={() => dispatch({ type: 'SET_VIEW_MODE', payload: k as ViewMode })}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
              state.viewMode === k ? 'bg-dental-600 text-white' : 'text-slate-200 hover:bg-slate-700/60'
            }`}
          >
            {t(`view.${k.toLowerCase()}`)}
          </button>
        ))}
        {!is3D && (
          <>
            <span className="w-px h-4 bg-slate-700/60" />
            <select
              value=""
              onChange={(e) => {
                const p = WL_PRESETS.find((x) => x.key === e.target.value);
                if (p) dispatch({ type: 'SET_WINDOW_LEVEL', payload: { wc: p.windowCenter, ww: p.windowWidth } });
              }}
              title={t('settings.wlPresets')}
              className="bg-slate-800/70 text-slate-200 text-[11px] rounded-md px-1.5 py-1 border border-slate-700/60 outline-none"
            >
              <option value="">W/L</option>
              {WL_PRESETS.map((p) => (<option key={p.key} value={p.key}>{t(`preset.${p.key}`)}</option>))}
            </select>
            <input
              type="range" min={100} max={4000} step={50}
              value={state.windowLevel.ww}
              onChange={(e) => dispatch({ type: 'SET_WINDOW_LEVEL', payload: { wc: state.windowLevel.wc, ww: Number(e.target.value) } })}
              className="w-20 h-1 accent-dental-400"
              title={`${t('settings.wlPresets')} — WW ${state.windowLevel.ww}`}
            />
          </>
        )}
      </div>
    </>
  );
}
