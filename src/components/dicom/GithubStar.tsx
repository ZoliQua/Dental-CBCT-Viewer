/**
 * "Star on GitHub" button showing the repo's current star count, fetched live
 * from the GitHub API (cached in sessionStorage to avoid the 60/hour rate
 * limit). Falls back to no count if the request fails.
 */

import { useEffect, useState } from 'react';
import { useI18n } from '@/i18n/I18nContext';

const REPO = 'ZoliQua/React-Dental-CBCT-Viewer';
const CACHE_KEY = 'gh-stars';

export function GithubStar() {
  const { t } = useI18n();
  const [stars, setStars] = useState<number | null>(() => {
    const cached = sessionStorage.getItem(CACHE_KEY);
    return cached !== null ? Number(cached) : null;
  });

  useEffect(() => {
    if (stars !== null) return; // already have a (cached) value this session
    let cancelled = false;
    fetch(`https://api.github.com/repos/${REPO}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => {
        if (cancelled || typeof d?.stargazers_count !== 'number') return;
        setStars(d.stargazers_count);
        sessionStorage.setItem(CACHE_KEY, String(d.stargazers_count));
      })
      .catch(() => { /* rate-limited or offline — show button without a count */ });
    return () => { cancelled = true; };
  }, [stars]);

  return (
    <a
      href={`https://github.com/${REPO}`}
      target="_blank"
      rel="noreferrer"
      aria-label="Open the source repository on GitHub"
      title={t('landing.starOnGithub')}
      className="inline-flex items-center justify-center gap-1.5 rounded border motion-safe:transition-colors border-slate-300 dark:border-slate-700 bg-transparent text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 px-3 py-1.5 text-sm [&_svg]:shrink-0"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 text-slate-400">
        <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
      </svg>
      <span>{t('landing.starOnGithub')}</span>
      {stars !== null && (
        <span className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-xs font-semibold tabular-nums">
          ★ {stars}
        </span>
      )}
    </a>
  );
}
