/**
 * UI languages. English is the default and the fallback for any missing key;
 * it is bundled with the viewer. Every other language is a separate chunk,
 * loaded the first time it is chosen, so a host does not ship fifteen
 * dictionaries to show one.
 *
 * Adding a language: a locales/<code>.ts mirroring locales/en.ts (the
 * i18n test checks every key and placeholder), an entry in LANGUAGES and in
 * LOADERS, and a lang/README-<code>.md.
 */

import en from './locales/en';
import type { Dict } from './types';

export type { Dict } from './types';

export type Language =
  | 'cs' | 'da' | 'de' | 'en' | 'es' | 'fi' | 'fr' | 'hu'
  | 'nb' | 'pl' | 'pt' | 'ru' | 'sk' | 'sv' | 'uk';

/** In alphabetical order of the language's own name, as the menu lists them. */
export const LANGUAGES: { id: Language; label: string; flag: string }[] = [
  { id: 'cs', label: 'Čeština', flag: '🇨🇿' },
  { id: 'da', label: 'Dansk', flag: '🇩🇰' },
  { id: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { id: 'en', label: 'English', flag: '🇬🇧' },
  { id: 'es', label: 'Español', flag: '🇪🇸' },
  { id: 'fr', label: 'Français', flag: '🇫🇷' },
  { id: 'hu', label: 'Magyar', flag: '🇭🇺' },
  { id: 'nb', label: 'Norsk', flag: '🇳🇴' },
  { id: 'pl', label: 'Polski', flag: '🇵🇱' },
  { id: 'pt', label: 'Português', flag: '🇵🇹' },
  { id: 'sk', label: 'Slovenčina', flag: '🇸🇰' },
  { id: 'fi', label: 'Suomi', flag: '🇫🇮' },
  { id: 'sv', label: 'Svenska', flag: '🇸🇪' },
  { id: 'ru', label: 'Русский', flag: '🇷🇺' },
  { id: 'uk', label: 'Українська', flag: '🇺🇦' },
];

export const DEFAULT_LANGUAGE: Language = 'en';

const LOADERS: Record<Exclude<Language, 'en'>, () => Promise<{ default: Dict }>> = {
  cs: () => import('./locales/cs'),
  da: () => import('./locales/da'),
  de: () => import('./locales/de'),
  es: () => import('./locales/es'),
  fi: () => import('./locales/fi'),
  fr: () => import('./locales/fr'),
  hu: () => import('./locales/hu'),
  nb: () => import('./locales/nb'),
  pl: () => import('./locales/pl'),
  pt: () => import('./locales/pt'),
  ru: () => import('./locales/ru'),
  sk: () => import('./locales/sk'),
  sv: () => import('./locales/sv'),
  uk: () => import('./locales/uk'),
};

const IDS: ReadonlySet<string> = new Set(LANGUAGES.map((l) => l.id));

/**
 * Whether a value names a supported language. A Set lookup, not `in`, so a
 * host- or storage-supplied string such as '__proto__' or 'toString' is
 * never taken for a language.
 */
export function isLanguage(v: unknown): v is Language {
  return typeof v === 'string' && IDS.has(v);
}

// Browser tags that mean a language under another code.
const ALIASES: Record<string, Language> = { no: 'nb', nn: 'nb' };

/**
 * The first supported language in the browser's / OS's preference list
 * (navigator.languages), matched on the primary subtag: 'pt-BR' → pt,
 * 'nn-NO' → nb. English when none matches.
 */
export function detectLanguage(preferred: readonly string[] | undefined): Language {
  for (const tag of preferred ?? []) {
    if (typeof tag !== 'string') continue;
    const primary = tag.toLowerCase().split(/[-_]/)[0];
    const lang = Object.prototype.hasOwnProperty.call(ALIASES, primary) ? ALIASES[primary] : primary;
    if (isLanguage(lang)) return lang;
  }
  return DEFAULT_LANGUAGE;
}

const loaded = new Map<Language, Dict>([['en', en]]);

/** The dictionary if it is already loaded (English always is). */
export function getDict(lang: Language): Dict | undefined {
  return loaded.get(lang);
}

/** Load a language's dictionary (cached); English resolves at once. */
export async function loadLanguage(lang: Language): Promise<Dict> {
  const have = loaded.get(lang);
  if (have) return have;
  const dict = (await LOADERS[lang as Exclude<Language, 'en'>]()).default;
  loaded.set(lang, dict);
  return dict;
}

export { en };
