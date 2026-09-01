/**
 * Data-driven icon cards, reused for the Why (cards with descriptions), Tools
 * and Presets (compact chips) sections.
 */
import { LandingIcon } from './LandingIcons';

export interface FeatureItem {
  icon: string;
  title: string;
  desc?: string;
}

export function FeatureGrid({
  items,
  variant = 'card',
}: {
  items: FeatureItem[];
  variant?: 'card' | 'chip';
}) {
  if (variant === 'chip') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {items.map((it, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-xl border border-gray-200/80 dark:border-gray-700/70 bg-white/70 dark:bg-gray-800/60 backdrop-blur-md p-3"
          >
            <span className="shrink-0 w-8 h-8 rounded-lg bg-dental-100 dark:bg-dental-900/40 text-dental-600 dark:text-dental-300 flex items-center justify-center">
              <LandingIcon name={it.icon} className="w-4 h-4" />
            </span>
            <span className="text-sm text-gray-800 dark:text-gray-200 leading-snug">{it.title}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {items.map((it, i) => (
        <div
          key={i}
          className="rounded-2xl border border-gray-200/80 dark:border-gray-700/70 bg-white/70 dark:bg-gray-800/60 backdrop-blur-md p-5 shadow-sm hover:border-dental-400 dark:hover:border-dental-500 transition-colors"
        >
          <div className="w-10 h-10 rounded-xl bg-dental-100 dark:bg-dental-900/40 text-dental-600 dark:text-dental-300 flex items-center justify-center mb-3">
            <LandingIcon name={it.icon} className="w-5 h-5" />
          </div>
          <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{it.title}</h4>
          {it.desc && <p className="mt-1 text-xs text-gray-600 dark:text-gray-400 leading-relaxed">{it.desc}</p>}
        </div>
      ))}
    </div>
  );
}
