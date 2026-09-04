/**
 * Start screen — a modular marketing landing: hero with the loader (sample +
 * DICOM upload) above the fold, a metrics strip, then Why / Views / Tools /
 * Imaging / Privacy sections and a closing CTA, over a slowly rotating
 * pseudo-3D backdrop. All copy goes through t() (4 languages).
 */

import { useState } from 'react';
import { FileDropZone } from './FileDropZone';
import { GithubStar } from './GithubStar';
import { MetricsStrip } from './landing/MetricsStrip';
import { FeatureGrid, type FeatureItem } from './landing/FeatureGrid';
import { ViewsShowcase } from './landing/ViewsShowcase';
import { SectionHeading } from './landing/SectionHeading';
import { OtherProjects } from '@/components/common/OtherProjects';
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

  const scrollToStart = () => document.getElementById('get-started')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const metrics = [
    { value: '6', label: t('landing.metricViews') },
    { value: 'MIT', label: t('landing.metricFree') },
    { value: '0s', label: t('landing.metricInstall') },
    { value: '100%', label: t('landing.metricPrivate') },
  ];

  const why: FeatureItem[] = [
    { icon: 'code', title: t('landing.why1t'), desc: t('landing.why1d') },
    { icon: 'shield', title: t('landing.why2t'), desc: t('landing.why2d') },
    { icon: 'target', title: t('landing.why3t'), desc: t('landing.why3d') },
    { icon: 'printer', title: t('landing.why4t'), desc: t('landing.why4d') },
    { icon: 'doc', title: t('landing.why5t'), desc: t('landing.why5d') },
    { icon: 'tooth', title: t('landing.why6t'), desc: t('landing.why6d') },
  ];

  const tools: FeatureItem[] = [
    { icon: 'ruler', title: t('landing.tool1') },
    { icon: 'layers', title: t('landing.tool2') },
    { icon: 'target', title: t('landing.tool3') },
    { icon: 'shield', title: t('landing.tool4') },
    { icon: 'bone', title: t('landing.tool5') },
    { icon: 'printer', title: t('landing.tool6') },
    { icon: 'doc', title: t('landing.tool7') },
    { icon: 'wave', title: t('landing.tool8') },
  ];

  const presets: FeatureItem[] = [
    { icon: 'sun', title: t('landing.preset1') },
    { icon: 'contrast', title: t('landing.preset2') },
    { icon: 'opacity', title: t('landing.preset3') },
    { icon: 'plane', title: t('landing.preset4') },
    { icon: 'crop', title: t('landing.preset5') },
  ];

  return (
    <div className="relative h-full overflow-y-auto">
      {/* Slowly rotating, pseudo-volumetric 3D backdrop (stacked icon layers). */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 flex items-center justify-center overflow-hidden">
        <div style={{ perspective: '1200px' }}>
          <div
            className="relative w-[560px] h-[560px] max-w-[85vw] max-h-[85vw]"
            style={{ transformStyle: 'preserve-3d', animation: 'dcvSpin3d 30s linear infinite', filter: 'blur(0.5px)' }}
          >
            {[-3, -2, -1, 0, 1, 2, 3].map((i) => (
              <img
                key={i}
                src="/cbct-icon.png"
                alt=""
                aria-hidden
                draggable={false}
                className="absolute inset-0 w-full h-full object-contain select-none"
                style={{ transform: `translateZ(${i * 16}px)`, opacity: 0.07 }}
              />
            ))}
          </div>
        </div>
        <style>{'@keyframes dcvSpin3d{from{transform:rotateY(0deg) rotateX(14deg)}to{transform:rotateY(360deg) rotateX(14deg)}}'}</style>
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-6 py-8 flex flex-col gap-12">
        {/* ── Hero + loader ─────────────────────────────── */}
        <section id="get-started" className="scroll-mt-24 flex flex-col items-center text-center gap-4 pt-2">
          <img src="/cbct-icon.png" alt="DenCT" className="w-24 h-24 rounded-2xl shadow-md object-contain" />
          <h1 className="text-3xl sm:text-4xl font-bold text-dental-600 dark:text-dental-400">{t('landing.title')}</h1>
          <p className="max-w-2xl text-base text-gray-700 dark:text-gray-300 leading-relaxed">{t('landing.heroSub')}</p>
          <GithubStar />

          {/* Loader — left: sample · right: upload */}
          <div className="w-full grid md:grid-cols-2 gap-4 mt-3 text-left">
            <button
              onClick={openSample}
              disabled={samplePct !== null}
              data-testid="load-sample"
              className="group h-80 flex flex-col items-center justify-center text-center gap-3 rounded-2xl border-2 border-dental-400 bg-dental-50/80 hover:bg-dental-100 dark:bg-dental-900/20 dark:hover:bg-dental-900/40 transition-colors px-6 disabled:opacity-60 backdrop-blur-md"
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

            <div className="flex flex-col">
              <FileDropZone />
            </div>
          </div>

          {/* Short, non-dismissable disclaimer */}
          <div className="w-full flex items-start gap-2 rounded-xl border border-amber-400/60 bg-amber-50/90 dark:bg-amber-900/20 dark:border-amber-700/50 px-4 py-3 text-xs text-amber-800 dark:text-amber-200 text-left">
            <span className="shrink-0">⚠️</span>
            <span>{t('landing.disclaimerShort')}</span>
          </div>
        </section>

        {/* ── Metrics ───────────────────────────────────── */}
        <MetricsStrip items={metrics} />

        {/* ── Why ───────────────────────────────────────── */}
        <section>
          <SectionHeading id="why" title={t('landing.why.title')} />
          <FeatureGrid items={why} />
        </section>

        {/* ── Views ─────────────────────────────────────── */}
        <section>
          <SectionHeading id="views" title={t('landing.views.title')} />
          <ViewsShowcase />
        </section>

        {/* ── Tools ─────────────────────────────────────── */}
        <section>
          <SectionHeading id="tools" title={t('landing.tools.title')} />
          <FeatureGrid variant="chip" items={tools} />
        </section>

        {/* ── Presets / imaging ─────────────────────────── */}
        <section>
          <SectionHeading id="presets" title={t('landing.presets.title')} />
          <FeatureGrid variant="chip" items={presets} />
        </section>

        {/* ── Privacy ───────────────────────────────────── */}
        <section
          id="privacy"
          className="scroll-mt-24 bg-white/80 border border-gray-300 dark:bg-gray-800/75 dark:border-gray-700 rounded-2xl p-6 shadow-sm backdrop-blur-md"
        >
          <h3 className="text-lg font-bold text-dental-600 dark:text-dental-400 mb-2">{t('landing.privacy.title')}</h3>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{t('landing.privacy.body')}</p>
          <p className="mt-4 text-xs text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700 pt-3">
            📁 {t('landing.fileTypes')}
          </p>
        </section>

        {/* ── Closing CTA ───────────────────────────────── */}
        <section className="text-center flex flex-col items-center gap-4">
          <h3 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">{t('landing.cta.title')}</h3>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={openSample}
              disabled={samplePct !== null}
              className="px-5 py-2.5 text-sm font-semibold rounded-lg bg-dental-600 text-white hover:bg-dental-700 transition-colors disabled:opacity-60"
            >
              {t('newload.loadSample')}
            </button>
            <button
              onClick={scrollToStart}
              className="px-5 py-2.5 text-sm font-semibold rounded-lg border border-dental-500 text-dental-700 hover:bg-dental-100 dark:text-dental-300 dark:hover:bg-dental-900/30 transition-colors"
            >
              {t('landing.cta.upload')}
            </button>
          </div>
        </section>

        {/* ── About + other projects ────────────────────── */}
        <section className="bg-white/80 border border-gray-300 dark:bg-gray-800/75 dark:border-gray-700 rounded-2xl p-6 shadow-sm backdrop-blur-md">
          <h2 className="text-lg font-bold text-dental-600 dark:text-dental-400 mb-2">👋 {t('landing.aboutTitle')}</h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{t('landing.aboutBody')}</p>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed mt-2">
            {t('landing.contribute')}{' '}
            <a href={REPO_URL} target="_blank" rel="noreferrer" className="text-dental-600 dark:text-dental-400 hover:underline">GitHub ↗</a>
          </p>

          <div className="mt-4 border-t border-gray-200 dark:border-gray-700 pt-4">
            <p className="text-sm text-gray-700 dark:text-gray-300 mb-2.5">{t('about.otherProjects')}</p>
            <OtherProjects />
          </div>

          <p className="text-xs text-gray-500 mt-4">{t('landing.aboutBuilt')}</p>
        </section>
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
