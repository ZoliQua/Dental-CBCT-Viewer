import { useViewer } from '@/context/ViewerContext';
import { useI18n } from '@/i18n/I18nContext';
import { VIEW_KEYS, type ViewKey, type ViewMode } from '@/types/dicom';
import { Viewport2D } from './Viewport2D';
import { ViewportMPR } from './ViewportMPR';
import { Viewport3D } from './Viewport3D';
import { ViewportPanoramic } from './ViewportPanoramic';
import { ViewportCrossSection } from './ViewportCrossSection';
import { ArchCurveEditor } from '@/components/panoramic/ArchCurveEditor';
import { ImplantAxialOverlay } from '@/components/implant/ImplantAxialOverlay';

/** Translucent on-image view-mode switcher for the 1×1 layout. */
function ViewModeSwitcher() {
  const { state, dispatch } = useViewer();
  const { t } = useI18n();
  return (
    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 rounded-lg bg-slate-900/70 backdrop-blur-sm border border-slate-700/60 px-1.5 py-1 shadow-lg">
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
    </div>
  );
}

export function ViewportGrid() {
  const { state } = useViewer();
  const vid = state.volumeId;

  // 1×1 mode: the selected view, with an on-image view-mode switcher
  if (state.layoutMode === '1x1') {
    if (!vid) return <Viewport2D />;
    return (
      <div className="relative w-full h-full">
        {state.viewMode === '3D'
          ? <Viewport3D volumeId={vid} />
          : <ViewportMPR orientation={state.viewMode} volumeId={vid} />}
        <ViewModeSwitcher />
      </div>
    );
  }

  // Multi-viewport layouts need a volume
  if (!vid) return <Viewport2D />;

  // 2×2 — used by the registration flow (four equal MPR/3D panes)
  if (state.layoutMode === '2x2') {
    return (
      <div className="grid grid-cols-2 grid-rows-2 w-full h-full gap-px bg-gray-700">
        <ViewportMPR orientation="AXIAL" volumeId={vid} />
        <ViewportMPR orientation="SAGITTAL" volumeId={vid} />
        <ViewportMPR orientation="CORONAL" volumeId={vid} />
        <Viewport3D volumeId={vid} />
      </div>
    );
  }

  // "3D view" (1+3 or 2×2 grid), configurable via state.panel
  if (state.layoutMode === '1+3') {
    const renderView = (key: ViewKey) =>
      key === '3D' ? <Viewport3D volumeId={vid} /> : <ViewportMPR orientation={key} volumeId={vid} />;
    const { big, small, arrangement, grid } = state.panel;

    if (grid === '2x2') {
      const four = [big, ...small];
      return (
        <div className="grid grid-cols-2 grid-rows-2 w-full h-full gap-px bg-gray-700">
          {four.map((k, i) => <div key={i} className="min-w-0 min-h-0">{renderView(k)}</div>)}
        </div>
      );
    }

    if (arrangement === 'top') {
      return (
        <div className="flex flex-col w-full h-full gap-px bg-gray-700">
          <div className="flex-1 min-h-0">{renderView(big)}</div>
          <div className="h-1/3 flex gap-px min-h-0">
            {small.map((k, i) => <div key={i} className="flex-1 min-w-0">{renderView(k)}</div>)}
          </div>
        </div>
      );
    }
    return (
      <div className="flex w-full h-full gap-px bg-gray-700">
        <div className="flex-1 h-full min-w-0">{renderView(big)}</div>
        <div className="w-1/3 h-full flex flex-col gap-px">
          {small.map((k, i) => <div key={i} className="flex-1 min-h-0">{renderView(k)}</div>)}
        </div>
      </div>
    );
  }

  // "Panoramic view" — one big panoramic + three small (axial, cross-section, coronal)
  if (state.layoutMode === 'OPG2+1') {
    const smallNodes = [
      <div key="ax" className="relative flex-1 min-w-0 min-h-0">
        <ViewportMPR orientation="AXIAL" volumeId={vid} />
        <ArchCurveEditor />
        <ImplantAxialOverlay />
      </div>,
      <div key="cs" className="flex-1 min-w-0 min-h-0">
        <ViewportCrossSection volumeId={vid} />
      </div>,
      <div key="co" className="flex-1 min-w-0 min-h-0">
        <ViewportMPR orientation="CORONAL" volumeId={vid} />
      </div>,
    ];
    const pano = <ViewportPanoramic volumeId={vid} showCrossSectionLine />;

    if (state.panel.panoArrangement === 'left') {
      return (
        <div className="flex w-full h-full gap-px bg-gray-700">
          <div className="flex-1 min-w-0">{pano}</div>
          <div className="w-1/3 flex flex-col gap-px">{smallNodes}</div>
        </div>
      );
    }
    return (
      <div className="flex flex-col w-full h-full gap-px bg-gray-700">
        <div className="flex-1 min-h-0">{pano}</div>
        <div className="h-1/3 flex gap-px min-h-0">{smallNodes}</div>
      </div>
    );
  }

  return <Viewport2D />;
}
