import { useEffect, useCallback } from 'react';
import { ViewerProvider, useViewer } from '@/context/ViewerContext';
import { I18nProvider, useI18n } from '@/i18n/I18nContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { initCornerstone } from '@/core/init';
import { setActiveTool } from '@/core/toolManager';
import { LandingPage } from '@/components/dicom/LandingPage';
import { DisclaimerBanner } from '@/components/dicom/DisclaimerBanner';
import { ViewerShell } from '@/components/layout/ViewerShell';
import { TopBar } from '@/components/layout/TopBar';
import { SettingsPanel } from '@/components/panels/SettingsPanel';
import { HelpPanel } from '@/components/panels/HelpPanel';
import type { ViewportTool } from '@/types/dicom';

const SHORTCUT_MAP: Record<string, ViewportTool> = {
  w: 'windowLevel',
  p: 'pan',
  z: 'zoom',
  s: 'scroll',
  l: 'length',
  a: 'angle',
  e: 'ellipticalRoi',
  c: 'circleRoi',
  r: 'rectangleRoi',
  f: 'freehandRoi',
  b: 'bidirectional',
  h: 'probe',
  n: 'arrowAnnotate',
  x: 'crosshairs',
};

function ViewerApp() {
  const { state, dispatch } = useViewer();
  const { t } = useI18n();

  // Keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const tool = SHORTCUT_MAP[e.key.toLowerCase()];
      if (tool) {
        setActiveTool(tool);
        dispatch({ type: 'SET_ACTIVE_TOOL', payload: tool });
      }
    },
    [dispatch],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    initCornerstone()
      .then(() => {
        dispatch({ type: 'SET_INITIALIZED' });
      })
      .catch((err) => {
        dispatch({
          type: 'SET_ERROR',
          payload: t('app.initError', { msg: err instanceof Error ? err.message : String(err) }),
        });
      });
  }, [dispatch, t]);

  let content;
  if (!state.isInitialized) {
    content = (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-dental-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">{t('app.initializing')}</p>
        </div>
      </div>
    );
  } else if (state.error && !state.study) {
    content = (
      <div className="flex items-center justify-center h-full">
        <div className="text-center max-w-md">
          <p className="text-red-500 dark:text-red-400 mb-4">{state.error}</p>
          <button
            onClick={() => dispatch({ type: 'SET_ERROR', payload: null })}
            className="px-4 py-2 bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 rounded transition-colors"
          >
            {t('app.retry')}
          </button>
        </div>
      </div>
    );
  } else if (!state.study) {
    content = <LandingPage />;
  } else {
    content = <ViewerShell />;
  }

  return (
    <div className="flex flex-col h-screen w-screen bg-gray-100 dark:bg-gray-900">
      <TopBar />
      <div className="flex-1 overflow-hidden">{content}</div>
      <SettingsPanel />
      <HelpPanel />
      <DisclaimerBanner />
    </div>
  );
}

// Props interface for future DentalQuoteCreator integration
export interface DicomViewerProps {
  patientId?: string;
  patientName?: string;
  onPlanSaved?: (plan: unknown) => void;
  embedded?: boolean;
}

export default function DicomViewer(_props: DicomViewerProps = {}) {
  return (
    <I18nProvider>
      <ThemeProvider>
        <ViewerProvider>
          <ViewerApp />
        </ViewerProvider>
      </ThemeProvider>
    </I18nProvider>
  );
}
