import { useViewer } from '@/context/ViewerContext';
import { useI18n } from '@/i18n/I18nContext';
import { normalizePanelViews, normalizeOpgOrder, swapOpgBig, type ViewKey, type OpgView } from '@/types/dicom';
import { Viewport2D } from './Viewport2D';
import { ViewportMPR } from './ViewportMPR';
import { Viewport3D } from './Viewport3D';
import { ViewportPanoramic } from './ViewportPanoramic';
import { ViewportCrossSection } from './ViewportCrossSection';
import { ArchCurveEditor } from '@/components/panoramic/ArchCurveEditor';
import { ImplantAxialOverlay } from '@/components/implant/ImplantAxialOverlay';
import { Viewport1x1Chrome } from './Viewport1x1Chrome';
import { PanoramaChrome } from './PanoramaChrome';

export function ViewportGrid() {
  const { state, dispatch } = useViewer();
  const { t } = useI18n();
  const vid = state.volumeId;

  // 1×1 mode: the selected view + on-image Tools / View boxes; the axial view
  // also shows the implant / anatomy markers so they are visible here too.
  if (state.layoutMode === '1x1') {
    if (!vid) return <Viewport2D />;
    return (
      <div className="relative w-full h-full">
        {state.viewMode === '3D'
          ? <Viewport3D volumeId={vid} />
          : <ViewportMPR orientation={state.viewMode} volumeId={vid} />}
        {state.viewMode === 'AXIAL' && <ImplantAxialOverlay />}
        <Viewport1x1Chrome />
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
    const { arrangement, grid } = state.panel;
    // Guarantee four distinct views (each maps to one viewport id) and key each
    // pane by its view, so changing a panel reorders panes instead of
    // re-enabling a viewport in place — which left panes black.
    const { big, small } = normalizePanelViews(state.panel.big, state.panel.small);

    if (grid === '2x2') {
      const four = [big, ...small];
      return (
        <div className="grid grid-cols-2 grid-rows-2 w-full h-full gap-px bg-gray-700">
          {four.map((k) => <div key={k} className="min-w-0 min-h-0">{renderView(k)}</div>)}
        </div>
      );
    }

    if (arrangement === 'top') {
      return (
        <div className="flex flex-col w-full h-full gap-px bg-gray-700">
          <div key={big} className="flex-1 min-h-0">{renderView(big)}</div>
          <div className="h-1/3 flex gap-px min-h-0">
            {small.map((k) => <div key={k} className="flex-1 min-w-0">{renderView(k)}</div>)}
          </div>
        </div>
      );
    }
    return (
      <div className="flex w-full h-full gap-px bg-gray-700">
        <div key={big} className="flex-1 h-full min-w-0">{renderView(big)}</div>
        <div className="w-1/3 h-full flex flex-col gap-px">
          {small.map((k) => <div key={k} className="flex-1 min-h-0">{renderView(k)}</div>)}
        </div>
      </div>
    );
  }

  // "Panoramic view" — one big pane + three small (panoramic, axial,
  // cross-section, 3D). Any small pane can be swapped into the big slot, so the
  // cross-section or the 3D view can be examined full size; clicking the pane
  // that was displaced swaps it straight back.
  if (state.layoutMode === 'OPG2+1') {
    const order = normalizeOpgOrder(state.panel.opgOrder);

    const renderOpg = (key: OpgView, isBig: boolean) => {
      switch (key) {
        case 'PANORAMA':
          return (
            <div className="relative w-full h-full">
              <ViewportPanoramic volumeId={vid} showCrossSectionLine />
              {/* The on-image tool palette is sized for the large pane — in a
                  small slot it would be unusable and would bury the swap button. */}
              {isBig && <PanoramaChrome />}
            </div>
          );
        case 'AXIAL':
          return (
            <div className="relative w-full h-full">
              <ViewportMPR orientation="AXIAL" volumeId={vid} />
              <ArchCurveEditor />
              <ImplantAxialOverlay />
            </div>
          );
        case 'CROSS':
          return <ViewportCrossSection volumeId={vid} />;
        case '3D':
          return <Viewport3D volumeId={vid} />;
      }
    };

    // Swap button: only on the small panes — promoting one demotes the current
    // big pane into the slot just vacated, which makes the action reversible.
    const pane = (key: OpgView, index: number) => (
      <div key={key} className="relative w-full h-full min-w-0 min-h-0">
        {renderOpg(key, index === 0)}
        {index > 0 && (
          <button
            onClick={() => dispatch({ type: 'SET_PANEL', payload: { opgOrder: swapOpgBig(order, index) } })}
            title={t('view.swapBig')}
            aria-label={t('view.swapBig')}
            className="absolute top-1 right-1 z-40 w-6 h-6 flex items-center justify-center rounded bg-slate-900/70 hover:bg-slate-700/90 text-slate-200 border border-slate-600/60 backdrop-blur-sm transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 3 21 3 21 9" />
              <polyline points="9 21 3 21 3 15" />
              <line x1="21" y1="3" x2="14" y2="10" />
              <line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          </button>
        )}
      </div>
    );

    const bigNode = pane(order[0], 0);
    const smallNodes = [1, 2, 3].map((i) => (
      <div key={order[i]} className="flex-1 min-w-0 min-h-0">{pane(order[i], i)}</div>
    ));

    if (state.panel.panoArrangement === 'left') {
      return (
        <div className="flex w-full h-full gap-px bg-gray-700">
          <div className="flex-1 min-w-0">{bigNode}</div>
          <div className="w-1/3 flex flex-col gap-px">{smallNodes}</div>
        </div>
      );
    }
    return (
      <div className="flex flex-col w-full h-full gap-px bg-gray-700">
        <div className="flex-1 min-h-0">{bigNode}</div>
        <div className="h-1/3 flex gap-px min-h-0">{smallNodes}</div>
      </div>
    );
  }

  return <Viewport2D />;
}
