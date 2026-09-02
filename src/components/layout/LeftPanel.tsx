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
import { StudyTree } from '@/components/dicom/StudyTree';
import { ImplantEditPopup } from '@/components/implant/ImplantEditPopup';
import type { ViewportTool } from '@/types/dicom';

function FolderIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function WrenchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M14.7 6.3a4 4 0 00-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 005.4-5.4l-2.6 2.6-2.1-.4-.4-2.1 2.6-2.6z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** One stacked rail toggle (icon + vertical label). */
function RailButton({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`flex flex-col items-center gap-2 py-3 transition-colors ${
        active
          ? 'bg-dental-600 text-white'
          : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
      }`}
    >
      {icon}
      <span className="text-[10px] tracking-wide select-none [writing-mode:vertical-rl] rotate-180">{label}</span>
    </button>
  );
}

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
  const toolsOpen = state.toolsOpen;
  const layersOpen = state.layersOpen;
  const seriesOpen = state.seriesOpen;
  const panelOpen = toolsOpen || layersOpen;
  const hasStudies = state.studies.length > 0;
  const isMulti = state.layoutMode === '2x2' || state.layoutMode === '1+3';

  const pick = (tool: ViewportTool) => {
    setActiveTool(tool);
    dispatch({ type: 'SET_ACTIVE_TOOL', payload: tool });
  };

  return (
    <div className="flex h-full shrink-0">
      {/* Shared rail: Series (top), Layers, Tools (bottom) — each toggles independently */}
      <div className="w-10 shrink-0 flex flex-col border-r border-slate-200 dark:border-slate-700/60 bg-white/90 dark:bg-slate-900/90">
        {hasStudies && (
          <>
            <RailButton
              icon={<FolderIcon />}
              label={t('series.panel')}
              active={seriesOpen}
              onClick={() => dispatch({ type: 'TOGGLE_SERIES' })}
            />
            <div className="border-t border-slate-200 dark:border-slate-700/60" />
          </>
        )}
        <RailButton
          icon={<StackIcon />}
          label={t('layers.title')}
          active={layersOpen}
          onClick={() => dispatch({ type: 'TOGGLE_LAYERS' })}
        />
        <div className="border-t border-slate-200 dark:border-slate-700/60" />
        <RailButton
          icon={<WrenchIcon />}
          label={t('panel.tools')}
          active={toolsOpen}
          onClick={() => dispatch({ type: 'TOGGLE_TOOLS' })}
        />
      </div>

      {/* Tools + Layers share one panel column: Tools slides in above Layers,
          each in its own framed block. */}
      <div
        className={`h-full overflow-hidden border-r border-slate-200 dark:border-slate-700/60 bg-white/95 dark:bg-slate-900/85 backdrop-blur-sm shadow-xl transition-all duration-200 ${
          panelOpen ? 'w-72' : 'w-0'
        }`}
      >
        <div className="w-72 h-full overflow-y-auto p-3 space-y-3">
          {/* Tools */}
          {toolsOpen && (
          <div className="space-y-2 rounded-lg border border-slate-200 dark:border-slate-700/60 p-2">
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
          )}

          {/* Layers */}
          {layersOpen && (
          <div className="space-y-2 rounded-lg border border-slate-200 dark:border-slate-700/60 p-2">
            <SectionLabel>{t('layers.title')}</SectionLabel>
            <LayersContent />
          </div>
          )}
        </div>
      </div>

      {/* Study / series tree panel (inner) */}
      {hasStudies && (
        <div
          className={`h-full overflow-hidden border-r border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-800 transition-all duration-200 ${
            seriesOpen ? 'w-56' : 'w-0'
          }`}
        >
          <div className="w-56 h-full overflow-y-auto">
            <StudyTree />
          </div>
        </div>
      )}

      {state.editingImplantId && (
        <ImplantEditPopup
          implantId={state.editingImplantId}
          onClose={() => dispatch({ type: 'SET_EDITING_IMPLANT', payload: null })}
        />
      )}
    </div>
  );
}
