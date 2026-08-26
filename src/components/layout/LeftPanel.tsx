/**
 * Unified left panel: a thin always-visible rail that expands into a Tools
 * section (interaction modes + measurement/annotation tools) over the Layers
 * list. Lives in the shell's flex row, so expanding it shrinks the viewport
 * instead of covering it. Replaces the old top Toolbar + floating LayersPanel.
 */

import { useViewer } from '@/context/ViewerContext';
import { useI18n } from '@/i18n/I18nContext';
import { setActiveTool } from '@/core/toolManager';
import { TOOL_ICONS } from './toolIcons';
import { LayersContent, StackIcon } from '@/components/layers/LayersPanel';
import { ImplantEditPopup } from '@/components/implant/ImplantEditPopup';
import type { ViewportTool } from '@/types/dicom';

const NAV_TOOLS: { id: ViewportTool; key: string; sc: string }[] = [
  { id: 'windowLevel', key: 'tool.windowLevel', sc: 'W' },
  { id: 'pan', key: 'tool.pan', sc: 'P' },
  { id: 'zoom', key: 'tool.zoom', sc: 'Z' },
  { id: 'scroll', key: 'tool.scroll', sc: 'S' },
];

const MEASURE_TOOLS: { id: ViewportTool; key: string; sc: string }[] = [
  { id: 'length', key: 'tool.length', sc: 'L' },
  { id: 'angle', key: 'tool.angle', sc: 'A' },
  { id: 'ellipticalRoi', key: 'tool.ellipse', sc: 'E' },
  { id: 'circleRoi', key: 'tool.circle', sc: 'C' },
  { id: 'rectangleRoi', key: 'tool.rectangle', sc: 'R' },
  { id: 'freehandRoi', key: 'tool.freehand', sc: 'F' },
  { id: 'bidirectional', key: 'tool.bidirectional', sc: 'B' },
  { id: 'probe', key: 'tool.probe', sc: 'H' },
  { id: 'arrowAnnotate', key: 'tool.arrow', sc: 'N' },
];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 px-1 select-none">
      {children}
    </div>
  );
}

function ToolButton({
  iconKey, label, active, disabled, title, onClick,
}: {
  iconKey: string; label: string; active: boolean; disabled?: boolean; title: string; onClick: () => void;
}) {
  const Icon = TOOL_ICONS[iconKey];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`flex items-center gap-1.5 px-2 py-1.5 text-xs rounded-md border transition-colors ${
        disabled
          ? 'border-transparent text-slate-400 dark:text-slate-600 cursor-not-allowed'
          : active
            ? 'border-dental-500 bg-dental-600 text-white'
            : 'border-slate-200 dark:border-slate-700/60 bg-slate-100/60 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
      }`}
    >
      {Icon && <Icon />}
      <span className="truncate">{label}</span>
    </button>
  );
}

export function LeftPanel() {
  const { state, dispatch } = useViewer();
  const { t } = useI18n();
  const open = state.layersOpen;
  const isMulti = state.layoutMode === '2x2' || state.layoutMode === '1+3';

  const pick = (tool: ViewportTool) => {
    setActiveTool(tool);
    dispatch({ type: 'SET_ACTIVE_TOOL', payload: tool });
  };

  return (
    <div className="flex h-full shrink-0">
      <button
        onClick={() => dispatch({ type: 'TOGGLE_LAYERS' })}
        title={t('panel.tools')}
        className={`w-10 shrink-0 flex flex-col items-center gap-2 pt-3 border-r transition-colors ${
          open
            ? 'bg-dental-600 text-white border-dental-700'
            : 'bg-white/90 text-slate-600 border-slate-200 hover:bg-slate-100 dark:bg-slate-900/90 dark:text-slate-300 dark:border-slate-700/60 dark:hover:bg-slate-800'
        }`}
      >
        <StackIcon />
        <span className="text-[10px] tracking-wide select-none [writing-mode:vertical-rl] rotate-180">
          {t('panel.tools')}
        </span>
      </button>

      <div
        className={`h-full overflow-hidden border-r border-slate-200 dark:border-slate-700/60 bg-white/95 dark:bg-slate-900/85 backdrop-blur-sm shadow-xl transition-all duration-200 ${
          open ? 'w-72' : 'w-0'
        }`}
      >
        <div className="w-72 h-full overflow-y-auto p-3 space-y-4">
          {/* Tools */}
          <div className="space-y-2">
            <SectionLabel>{t('toolbar.view')}</SectionLabel>
            <div className="grid grid-cols-2 gap-1">
              {NAV_TOOLS.map((tl) => (
                <ToolButton
                  key={tl.id}
                  iconKey={tl.id}
                  label={t(tl.key)}
                  active={state.activeTool === tl.id}
                  title={`${t(tl.key)} (${tl.sc})`}
                  onClick={() => pick(tl.id)}
                />
              ))}
              <ToolButton
                iconKey="crosshairs"
                label={t('tool.crosshairs')}
                active={state.activeTool === 'crosshairs'}
                disabled={!isMulti}
                title={isMulti ? `${t('tool.crosshairs')} (X)` : t('toolbar.crosshairsOnlyMulti')}
                onClick={() => pick('crosshairs')}
              />
            </div>

            <SectionLabel>{t('toolbar.tools')}</SectionLabel>
            <div className="grid grid-cols-2 gap-1">
              {MEASURE_TOOLS.map((tl) => (
                <ToolButton
                  key={tl.id}
                  iconKey={tl.key.replace('tool.', '')}
                  label={t(tl.key)}
                  active={state.activeTool === tl.id}
                  title={`${t(tl.key)} (${tl.sc})`}
                  onClick={() => pick(tl.id)}
                />
              ))}
            </div>

            {/* Context tools on the panoramic/cross-section layout */}
            {state.layoutMode === 'OPG2+1' && (
              <div className="grid grid-cols-3 gap-1 pt-1">
                <button
                  onClick={() => dispatch({ type: 'SET_IMPLANT_PLACEMENT_MODE', payload: !state.implantPlacementMode })}
                  title={t('opg.addImplantTitle')}
                  className={`px-2 py-1 text-[11px] rounded-md border transition-colors ${
                    state.implantPlacementMode ? 'border-dental-500 bg-dental-600 text-white'
                      : 'border-slate-200 dark:border-slate-700/60 bg-slate-100/60 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {t('opg.addImplant')}
                </button>
                {(['nerve', 'sinus'] as const).map((kind) => (
                  <button
                    key={kind}
                    onClick={() => {
                      const on = state.anatomyDrawMode === kind;
                      dispatch({ type: 'SET_ANATOMY_DRAW_MODE', payload: on ? null : kind });
                      if (!on) dispatch({ type: 'SET_ACTIVE_ANATOMY', payload: null });
                    }}
                    title={t(`anatomy.${kind}Title`)}
                    className={`px-2 py-1 text-[11px] rounded-md border transition-colors ${
                      state.anatomyDrawMode === kind ? 'border-dental-500 bg-dental-600 text-white'
                        : 'border-slate-200 dark:border-slate-700/60 bg-slate-100/60 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    {t(`anatomy.${kind}`)}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-slate-200 dark:border-slate-700/60" />

          {/* Layers */}
          <div className="space-y-2">
            <SectionLabel>{t('layers.title')}</SectionLabel>
            <LayersContent />
          </div>
        </div>
      </div>

      {state.editingImplantId && (
        <ImplantEditPopup
          implantId={state.editingImplantId}
          onClose={() => dispatch({ type: 'SET_EDITING_IMPLANT', payload: null })}
        />
      )}
    </div>
  );
}
