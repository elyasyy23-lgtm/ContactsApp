// Tiny translation runtime.
//
// `lang` is module-level (not React state) so plain helpers — Alert builders,
// formatters, anything outside a component — can translate without hooks.
// Screens subscribe with `useLang()` from LanguageContext, which re-renders them
// when the language changes; that is what makes the module-level read safe.
import { en } from './dict';

export const LANGUAGES = [
  { id: 'fa', label: 'فارسی' },
  { id: 'en', label: 'English' },
];

let lang = 'fa';

export function setLang(next) {
  lang = next === 'en' ? 'en' : 'fa';
}

export function getLang() {
  return lang;
}

/**
 * t('متن') → the English text in en mode, the same Persian text in fa mode.
 * Optional params fill {placeholders}: t('{n} مشتری', { n: '۳' }).
 */
export function t(key, params) {
  if (key == null) return '';
  const source = String(key);
  const text = lang === 'en' ? en[source] ?? source : source;
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name) =>
    params[name] == null ? match : String(params[name]),
  );
}
