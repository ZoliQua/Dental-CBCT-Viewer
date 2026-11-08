/**
 * Lightweight i18n: language state (default English, persisted) and a t()
 * lookup with {param} interpolation. English is the fallback for missing keys.
 *
 * Edition copy: text that describes the planner has a `<key>@viewer` (and
 * sometimes `<key>@noguide`) variant, which t() prefers when the running
 * edition lacks that feature — so callers keep asking for the plain key.
 */

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { translations, type Language } from './translations';
import { copyVariant } from '@/core/features';
import { useFeatures } from '@/context/FeaturesContext';

const STORAGE_KEY = 'rdcv-lang';

interface I18nValue {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

function initialLang(): Language {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && stored in translations) return stored as Language;
  return 'en';
}

/**
 * The lookup behind t(). An edition variant wins over the plain key in either
 * language — the plain text describes a feature that is not there, so English
 * edition copy is closer to right than the translated planner copy.
 * Exported for unit tests.
 */
export function translate(
  lang: Language,
  key: string,
  params?: Record<string, string | number>,
  variant?: string | null,
): string {
  const vKey = variant ? `${key}@${variant}` : null;
  let text = (vKey && (translations[lang][vKey] ?? translations.en[vKey]))
    ?? translations[lang][key] ?? translations.en[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(`{${k}}`, String(v));
    }
  }
  return text;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(initialLang);

  const setLang = useCallback((next: Language) => {
    setLangState(next);
    localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const features = useFeatures();
  const variant = copyVariant(features);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => translate(lang, key, params, variant),
    [lang, variant],
  );

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
