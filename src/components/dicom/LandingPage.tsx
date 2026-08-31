/**
 * Start screen: a "what is this" box and a separate "how to use" box (with the
 * accepted file types), a two-column loader (sample on the left, file/folder
 * upload on the right), a short non-dismissable disclaimer, and an about box.
 * Loading the sample darkens the screen and shows a % progress overlay.
 */

import { useState } from 'react';
import { FileDropZone } from './FileDropZone';
import { GithubStar } from './GithubStar';
import { useI18n } from '@/i18n/I18nContext';
import { useViewer } from '@/context/ViewerContext';
import { loadSample } from '@/core/sampleLoader';

const REPO_URL = 'https://github.com/ZoliQua/Dental-CBCT-Viewer';

export function LandingPage() {
  const { t } = useI18n();
  const { dispatch } = useViewer();
  const [samplePct, setSamplePct] = useState<number | null>(null); // null = not loading

  const openSample = async () => {
    setSamplePct(0);
    try {
      const { study, volumeId, windowLevel } = await loadSample('/sample', (p) => setSamplePct(p));
      dispatch({ type: 'SET_STUDY', payload: study });
      dispatch({ type: 'SET_WINDOW_LEVEL', payload: windowLevel });
      dispatch({ type: 'SET_VOLUME_ID', payload: volumeId });
    } catch (err) {
      console.error('[sample] load failed', err);
      window.alert(t('newload.sampleError'));
      setSamplePct(null);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-8 flex flex-col gap-5">
        {/* Hero */}
        <div className="flex flex-col items-center text-center gap-3 pt-2">
          <img src="/cbct-icon.png" alt="Dental CBCT Viewer" className="w-24 h-24 rounded-2xl shadow-md object-contain" />
          <h1 className="text-2xl font-bold text-dental-600 dark:text-dental-400">{t('app.title')}</h1>
          <GithubStar />
        </div>

        {/* Box 1 — what is this */}
        <div className="bg-white border border-gray-300 dark:bg-gray-800 dark:border-gray-700 rounded-2xl p-6 shadow-sm">
          <h2 className="text-lg font-bold text-dental-600 dark:text-dental-400 mb-2">🦷 {t('landing.infoTitle')}</h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{t('landing.infoBody')}</p>
        </div>

        {/* Box 2 — how to use + accepted file types */}
        <div className="bg-white border border-gray-300 dark:bg-gray-800 dark:border-gray-700 rounded-2xl p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">📖 {t('landing.howTitle')}</h3>
          <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700 dark:text-gray-300">
            <li>{t('landing.how1')}</li>
            <li>{t('landing.how2')}</li>
            <li>{t('landing.how3')}</li>
            <li>{t('landing.how4')}</li>
          </ol>
          <p className="mt-4 text-xs text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700 pt-3">
            📁 {t('landing.fileTypes')}
          </p>
        </div>

        {/* Loader — left: sample · right: upload */}
        <div className="grid md:grid-cols-2 gap-4">
          {/* Left: sample */}
          <button
            onClick={openSample}
            disabled={samplePct !== null}
            className="group h-80 flex flex-col items-center justify-center text-center gap-3 rounded-2xl border-2 border-dental-400 bg-dental-50 hover:bg-dental-100 dark:bg-dental-900/20 dark:hover:bg-dental-900/40 transition-colors px-6 disabled:opacity-60"
          >
            <svg className="w-14 h-14 text-dental-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <h3 className="text-lg font-bold text-dental-700 dark:text-dental-300">{t('landing.sampleTitle')}</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 max-w-xs">{t('landing.sampleDesc')}</p>
            <span className="mt-1 px-4 py-2 text-sm rounded-lg bg-dental-600 text-white group-hover:bg-dental-700 transition-colors">
              {t('newload.loadSample')} · ~16 MB
            </span>
          </button>

          {/* Right: file / folder upload */}
          <div className="flex flex-col">
            <FileDropZone />
          </div>
        </div>

        {/* Short, non-dismissable disclaimer */}
        <div className="flex items-start gap-2 rounded-xl border border-amber-400/60 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700/50 px-4 py-3 text-xs text-amber-800 dark:text-amber-200">
          <span className="shrink-0">⚠️</span>
          <span>{t('landing.disclaimerShort')}</span>
        </div>

        {/* About */}
        <div className="bg-white border border-gray-300 dark:bg-gray-800 dark:border-gray-700 rounded-2xl p-6 shadow-sm">
          <h2 className="text-lg font-bold text-dental-600 dark:text-dental-400 mb-2">👋 {t('landing.aboutTitle')}</h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{t('landing.aboutBody')}</p>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed mt-2">
            {t('landing.contribute')}{' '}
            <a href={REPO_URL} target="_blank" rel="noreferrer" className="text-dental-600 dark:text-dental-400 hover:underline">GitHub ↗</a>
          </p>
          <p className="text-xs text-gray-500 mt-3">{t('landing.aboutBuilt')}</p>
        </div>
      </div>

      {/* Darken + % overlay while the sample loads */}
      {samplePct !== null && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center">
          <div className="w-72 text-center">
            <p className="text-white/90 text-sm mb-3">{t('sample.loading')}</p>
            <div className="w-full h-2 rounded-full bg-white/20 overflow-hidden">
              <div className="h-2 rounded-full bg-dental-500 transition-all duration-150" style={{ width: `${samplePct}%` }} />
            </div>
            <p className="text-white text-2xl font-semibold mt-3 tabular-nums">{samplePct}%</p>
          </div>
        </div>
      )}
    </div>
  );
}
