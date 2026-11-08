/**
 * Step-by-step intro tour — a standalone, self-paced walkthrough of what the
 * app does and how to use it. Launched from the top-bar button; a centered
 * modal with Back / Next / progress dots. Text is fully localized. The
 * implant-planning step is skipped in an edition without planning.
 */

import { useState } from 'react';
import { useViewer } from '@/context/ViewerContext';
import { useI18n } from '@/i18n/I18nContext';
import { useFeatures } from '@/context/FeaturesContext';

const STEPS = [
  { key: 's1', icon: '🦷' },
  { key: 's2', icon: '📂' },
  { key: 's3', icon: '🗂️' },
  { key: 's4', icon: '🧰' },
  { key: 's5', icon: '🦿', planning: true },
  { key: 's6', icon: '📄' },
];

export function IntroTour() {
  const { state, dispatch } = useViewer();
  const { t } = useI18n();
  const { implantPlanning } = useFeatures();
  const [i, setI] = useState(0);
  const steps = STEPS.filter((s) => implantPlanning || !s.planning);

  if (state.activePanel !== 'intro') return null;

  const close = () => { setI(0); dispatch({ type: 'SET_ACTIVE_PANEL', payload: null }); };
  const last = steps.length - 1;
  const { key, icon } = steps[Math.min(i, last)];

  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center p-4" onMouseDown={close}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />
      <div
        className="relative w-full max-w-md rounded-xl overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="p-6 text-center space-y-3">
          <div className="text-4xl">{icon}</div>
          <h2 className="text-lg font-semibold text-dental-600 dark:text-dental-400">{t(`intro.${key}t`)}</h2>
          <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">{t(`intro.${key}b`)}</p>
        </div>

        {/* Progress dots */}
        <div className="flex justify-center gap-1.5 pb-4">
          {steps.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setI(idx)}
              className={`h-1.5 rounded-full transition-all ${idx === i ? 'w-5 bg-dental-500' : 'w-1.5 bg-slate-300 dark:bg-slate-600'}`}
              aria-label={`Step ${idx + 1}`}
            />
          ))}
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-200 dark:border-slate-700/60">
          <button onClick={close} className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-white transition-colors">
            {t('intro.skip')}
          </button>
          <div className="flex items-center gap-2">
            {i > 0 && (
              <button onClick={() => setI(i - 1)} className="px-3 py-1.5 rounded-md text-xs bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                {t('intro.back')}
              </button>
            )}
            <button
              onClick={() => (i === last ? close() : setI(i + 1))}
              className="px-4 py-1.5 rounded-md text-xs font-semibold bg-dental-600 text-white hover:bg-dental-700 transition-colors"
            >
              {i === last ? t('intro.done') : t('intro.next')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
