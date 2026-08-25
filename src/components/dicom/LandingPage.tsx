/**
 * Start screen: top box describing what the app does and how to use it,
 * the DICOM drop zone in the middle, and an about box at the bottom.
 */

import { FileDropZone } from './FileDropZone';
import { GithubStar } from './GithubStar';
import { useI18n } from '@/i18n/I18nContext';

export function LandingPage() {
  const { t } = useI18n();

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-8 flex flex-col gap-6">
        {/* Hero: app icon + title + star button */}
        <div className="flex flex-col items-center text-center gap-3 pt-2">
          <img src="/cbct-icon.png" alt="CBCT Viewer" className="w-24 h-24 rounded-2xl shadow-md object-contain" />
          <h1 className="text-2xl font-bold text-dental-600 dark:text-dental-400">{t('app.title')}</h1>
          <GithubStar />
        </div>

        {/* What & how */}
        <div className="bg-white border border-gray-300 dark:bg-gray-800 dark:border-gray-700 rounded-2xl p-6 shadow-sm">
          <h2 className="text-lg font-bold text-dental-600 dark:text-dental-400 mb-2">
            🦷 {t('landing.infoTitle')}
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
            {t('landing.infoBody')}
          </p>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
            {t('landing.howTitle')}
          </h3>
          <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700 dark:text-gray-300">
            <li>{t('landing.how1')}</li>
            <li>{t('landing.how2')}</li>
            <li>{t('landing.how3')}</li>
            <li>{t('landing.how4')}</li>
          </ol>
        </div>

        {/* Drop zone */}
        <FileDropZone />

        {/* About */}
        <div className="bg-white border border-gray-300 dark:bg-gray-800 dark:border-gray-700 rounded-2xl p-6 shadow-sm">
          <h2 className="text-lg font-bold text-dental-600 dark:text-dental-400 mb-2">
            👋 {t('landing.aboutTitle')}
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            {t('landing.aboutBody')}
          </p>
          <p className="text-xs text-gray-500 mt-2">
            {t('landing.aboutBuilt')}{' '}
            <a
              href="https://github.com/ZoliQua/React-Dental-CBCT-Viewer"
              target="_blank"
              rel="noreferrer"
              className="text-dental-600 dark:text-dental-400 hover:underline"
            >
              GitHub ↗
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
