/**
 * Every language has every English key with the same {placeholders}, the menu
 * lists exactly the supported languages in alphabetical order of their own
 * names, and the browser-language detection picks the right one.
 */

import { describe, it, expect } from 'vitest';
import { LANGUAGES, detectLanguage, isLanguage, loadLanguage, type Dict } from '../src/i18n/translations';
import { translate } from '../src/i18n/I18nContext';
import en from '../src/i18n/locales/en';

const locales = import.meta.glob<{ default: Dict }>('../src/i18n/locales/*.ts', { eager: true });
const dicts: Record<string, Dict> = Object.fromEntries(
  Object.entries(locales).map(([path, m]) => [path.match(/(\w+)\.ts$/)![1], m.default]),
);

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('locales', () => {
  it('has a dictionary for every listed language and no stray files', () => {
    expect(Object.keys(dicts).sort()).toEqual(LANGUAGES.map((l) => l.id).sort());
  });

  it('lists the languages alphabetically by their own name', () => {
    const labels = LANGUAGES.map((l) => l.label);
    const latin = labels.filter((l) => !/[Ѐ-ӿ]/.test(l));
    const cyrillic = labels.filter((l) => /[Ѐ-ӿ]/.test(l));
    expect(labels).toEqual([...latin, ...cyrillic]);
    expect(latin).toEqual([...latin].sort((a, b) => a.localeCompare(b, 'en')));
    expect(cyrillic).toEqual([...cyrillic].sort((a, b) => a.localeCompare(b, 'ru')));
  });

  for (const { id } of LANGUAGES) {
    if (id === 'en') continue;
    it(`${id}: same keys and placeholders as English`, () => {
      const d = dicts[id];
      const missing = Object.keys(en).filter((k) => !(k in d));
      const extra = Object.keys(d).filter((k) => !(k in en));
      expect(missing, `${id} is missing`).toEqual([]);
      expect(extra, `${id} has keys English lacks`).toEqual([]);
      for (const [k, v] of Object.entries(en)) {
        expect(placeholders(d[k] ?? ''), `${id} ${k}`).toEqual(placeholders(v));
        expect((d[k] ?? '').trim(), `${id} ${k} is empty`).not.toBe('');
      }
    });
  }
});

describe('detectLanguage', () => {
  it('takes the first supported browser language', () => {
    expect(detectLanguage(['ja-JP', 'pt-BR', 'en'])).toBe('pt');
    expect(detectLanguage(['fr-CA'])).toBe('fr');
    expect(detectLanguage(['uk'])).toBe('uk');
  });
  it('maps the Norwegian tags to Bokmål', () => {
    expect(detectLanguage(['no'])).toBe('nb');
    expect(detectLanguage(['nn-NO'])).toBe('nb');
    expect(detectLanguage(['nb_NO'])).toBe('nb');
  });
  it('falls back to English', () => {
    expect(detectLanguage(['ja', 'zh-CN'])).toBe('en');
    expect(detectLanguage([])).toBe('en');
    expect(detectLanguage(undefined)).toBe('en');
  });
});

describe('isLanguage', () => {
  it('rejects inherited object keys and junk', () => {
    for (const v of ['__proto__', 'toString', 'constructor', '', 'EN', null, 42]) expect(isLanguage(v)).toBe(false);
    expect(isLanguage('sk')).toBe(true);
  });
});

describe('translate', () => {
  it('reads a lazily loaded language once it is loaded', async () => {
    await loadLanguage('hu');
    expect(translate('hu', 'plan.load')).toBe(dicts.hu['plan.load']);
  });
  it('never resolves a key through the prototype', () => {
    expect(translate('en', 'toString')).toBe('toString');
    expect(translate('en', '__proto__')).toBe('__proto__');
  });
});
