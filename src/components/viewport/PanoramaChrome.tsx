/**
 * On-image chrome for the Panoramic (OPG2+1) layout: a "Tools" box and, below
 * it, a separate planning box (implant / nerve / sinus) in the top-right corner
 * of the panoramic — so the tools are reachable without opening the side rail.
 */

import { useViewer } from '@/context/ViewerContext';
import { useI18n } from '@/i18n/I18nContext';
import { setActiveTool } from '@/core/toolManager';
import { TOOL_ICONS } from '@/components/layout/toolIcons';
import type { ViewportTool } from '@/types/dicom';

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

function PlanButton({ active, label, title, onClick }: {
  active: boolean; label: string; title: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
        active ? 'bg-dental-600 text-white' : 'text-slate-200 hover:bg-slate-700/60'
      }`}
    >
      {label}
    </button>
  );
}

export function PanoramaChrome() {
  const { state, dispatch } = useViewer();
  const { t } = useI18n();

  const pick = (tool: ViewportTool) => {
    setActiveTool(tool);
    dispatch({ type: 'SET_ACTIVE_TOOL', payload: tool });
  };

  const toggleAnatomy = (kind: 'nerve' | 'sinus') => {
    const on = state.anatomyDrawMode === kind;
    dispatch({ type: 'SET_ANATOMY_DRAW_MODE', payload: on ? null : kind });
    if (!on) dispatch({ type: 'SET_ACTIVE_ANATOMY', payload: null });
  };

  return (
    <div className="absolute top-2 right-2 z-30 flex flex-col items-end gap-2">
      {/* Tools box */}
      <div className="flex flex-col gap-1 rounded-lg bg-slate-900/70 backdrop-blur-sm border border-slate-700/60 px-1.5 py-1 shadow-lg">
        <BoxLabel>{t('panel.tools')}</BoxLabel>
        <div className="flex items-center gap-0.5">
          {NAV_TOOLS.map((tl) => (
            <IconToolButton key={tl.id} icon={tl.icon} active={state.activeTool === tl.id} title={t(tl.key)} onClick={() => pick(tl.id)} />
          ))}
        </div>
        <div className="flex items-center gap-0.5">
          {MEASURE_TOOLS.map((tl) => (
            <IconToolButton key={tl.id} icon={tl.icon} active={state.activeTool === tl.id} title={t(tl.key)} onClick={() => pick(tl.id)} />
          ))}
        </div>
      </div>

      {/* Planning box: implant / nerve / sinus */}
      <div className="flex flex-col gap-1 rounded-lg bg-slate-900/70 backdrop-blur-sm border border-slate-700/60 px-1.5 py-1 shadow-lg">
        <BoxLabel>{t('opg.planning')}</BoxLabel>
        <div className="flex items-center gap-1">
          <PlanButton
            active={state.implantPlacementMode}
            label={t('opg.addImplant')}
            title={t('opg.addImplantTitle')}
            onClick={() => dispatch({ type: 'SET_IMPLANT_PLACEMENT_MODE', payload: !state.implantPlacementMode })}
          />
          <PlanButton active={state.anatomyDrawMode === 'nerve'} label={t('anatomy.nerve')} title={t('anatomy.nerveTitle')} onClick={() => toggleAnatomy('nerve')} />
          <PlanButton active={state.anatomyDrawMode === 'sinus'} label={t('anatomy.sinus')} title={t('anatomy.sinusTitle')} onClick={() => toggleAnatomy('sinus')} />
        </div>
      </div>
    </div>
  );
}
