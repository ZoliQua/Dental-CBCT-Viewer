/**
 * Lightweight i18n: language state (default English, persisted) and a t()
 * lookup with {param} interpolation. English is the fallback for missing keys.
 * The first language is the user's saved choice, else the browser's, else English.
 *
 * Edition copy: text that describes the planner has a `<key>@viewer` (and
 * sometimes `<key>@noguide`) variant, which t() prefers when the running
 * edition lacks that feature — so callers keep asking for the plain key.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  DEFAULT_LANGUAGE, detectLanguage, getDict, isLanguage, loadLanguage, type Language,
} from './translations';
import { copyVariant } from '@/core/features';
import { useFeatures } from '@/context/FeaturesContext';

const STORAGE_KEY = 'rdcv-lang';

interface I18nValue {
  /** The language whose text is on screen (a newly chosen one shows once loaded). */
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

/**
 * The user's own choice if they made one, else the browser / OS language when
 * the viewer has it, else English.
 */
export function initialLang(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isLanguage(stored)) return stored;
  } catch { /* storage blocked */ }
  if (typeof navigator === 'undefined') return DEFAULT_LANGUAGE;
  return detectLanguage(navigator.languages?.length ? navigator.languages : [navigator.language]);
}

/**
 * The lookup behind t(). An edition variant wins over the plain key in either
 * language — the plain text describes a feature that is not there, so English
 * edition copy is closer to right than the translated planner copy.
 * A language not loaded yet reads as English. Exported for unit tests.
 */
export function translate(
  lang: Language,
  key: string,
  params?: Record<string, string | number>,
  variant?: string | null,
): string {
  const dict = getDict(lang) ?? {};
  const en = getDict('en') ?? {};
  const own = (d: Record<string, string>, k: string) => (Object.prototype.hasOwnProperty.call(d, k) ? d[k] : undefined);
  const vKey = variant ? `${key}@${variant}` : null;
  let text = (vKey && (own(dict, vKey) ?? own(en, vKey)))
    || (own(dict, key) ?? own(en, key) ?? key);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.split(`{${k}}`).join(String(v));
    }
  }
  return text;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  // `wanted` is the choice; `lang` follows it once its dictionary is loaded,
  // so switching never flashes English text in between.
  const [wanted, setWanted] = useState<Language>(initialLang);
  const [lang, setShown] = useState<Language>(() => (getDict(wanted) ? wanted : DEFAULT_LANGUAGE));

  useEffect(() => {
    let live = true;
    loadLanguage(wanted)
      .then(() => { if (live) setShown(wanted); })
      .catch((e) => console.warn('[DenCT] language failed to load:', wanted, e));
    return () => { live = false; };
  }, [wanted]);

  const setLang = useCallback((next: Language) => {
    if (!isLanguage(next)) return;
    setWanted(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* storage blocked */ }
  }, []);

  const features = useFeatures();
  const variant = copyVariant(features);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => translate(lang, key, params, variant),
    [lang, variant],
  );

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
