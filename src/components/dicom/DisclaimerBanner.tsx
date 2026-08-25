/**
 * Legal disclaimer shown once per browser: a banner that slides up from the
 * bottom on first visit and is dismissed with the AGREE button (remembered in
 * localStorage). Research/demo tool — protects against clinical-use liability.
 */

import { useEffect, useState } from 'react';
import { useI18n } from '@/i18n/I18nContext';

const KEY = 'disclaimer-agreed';

export function DisclaimerBanner() {
  const { t } = useI18n();
  const [agreed, setAgreed] = useState(() => localStorage.getItem(KEY) === '1');
  const [shown, setShown] = useState(false); // drives the slide-in transition

  useEffect(() => {
    if (agreed) return;
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, [agreed]);

  if (agreed) return null;

  const accept = () => {
    localStorage.setItem(KEY, '1');
    setShown(false);
    // Unmount after the slide-out transition completes
    window.setTimeout(() => setAgreed(true), 300);
  };

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label={t('disclaimer.title')}
      className={`fixed inset-x-0 bottom-0 z-[70] transition-transform duration-300 ease-out ${
        shown ? 'translate-y-0' : 'translate-y-full'
      }`}
    >
      <div className="mx-auto max-w-4xl m-3 rounded-xl border border-amber-300 dark:border-amber-700/60 bg-white dark:bg-gray-800 shadow-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-700 dark:text-amber-400 mb-1">
            ⚠ {t('disclaimer.title')}
          </p>
          <p className="text-xs leading-relaxed text-gray-600 dark:text-gray-300">
            {t('disclaimer.text')}
          </p>
        </div>
        <button
          onClick={accept}
          className="shrink-0 self-end sm:self-auto px-5 py-2 rounded-lg bg-dental-600 text-white text-sm font-semibold hover:bg-dental-700 transition-colors"
        >
          {t('disclaimer.agree')}
        </button>
      </div>
    </div>
  );
}
