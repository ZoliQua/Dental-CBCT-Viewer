/** Sticky in-page anchor pills (landing only); smooth-scrolls to each section. */
import { useI18n } from '@/i18n/I18nContext';

const LINKS = [
  { id: 'why', key: 'landing.nav.why' },
  { id: 'views', key: 'landing.nav.views' },
  { id: 'tools', key: 'landing.nav.tools' },
  { id: 'presets', key: 'landing.nav.presets' },
  { id: 'privacy', key: 'landing.nav.privacy' },
];

export function LandingNav() {
  const { t } = useI18n();
  const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return (
    <nav className="hidden sm:flex items-center justify-center gap-1 flex-wrap">
      {LINKS.map((l) => (
        <button
          key={l.id}
          onClick={() => go(l.id)}
          className="px-3 py-1.5 text-xs font-medium rounded-full text-gray-600 hover:text-dental-600 hover:bg-dental-50 dark:text-gray-300 dark:hover:text-dental-300 dark:hover:bg-dental-900/30 transition-colors"
        >
          {t(l.key)}
        </button>
      ))}
    </nav>
  );
}
