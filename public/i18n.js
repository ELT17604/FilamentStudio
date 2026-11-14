import en from './en.js';
import ja from './ja.js';

const storageKey = 'filament-language';
const messages = { en, ja };
const supported = ['zh-CN', 'en', 'ja'];

export function resolveLocale(preference, browserLocales = []) {
  if (supported.includes(preference)) return preference;
  for (const tag of browserLocales) {
    const language = tag.toLowerCase().split('-')[0];
    if (language === 'zh') return 'zh-CN';
    if (language === 'en' || language === 'ja') return language;
  }
  return 'en';
}

export function languagePreference() {
  if (preferenceOverride) return preferenceOverride;
  if (typeof document === 'undefined') return 'auto';
  try {
    const stored = globalThis.localStorage?.getItem(storageKey);
    return supported.includes(stored) ? stored : 'auto';
  } catch {
    return 'auto';
  }
}

let preferenceOverride;
let locale = resolveLocale(
  languagePreference(),
  globalThis.navigator?.languages ?? [globalThis.navigator?.language ?? ''],
);

export const currentLocale = () => locale;

export function setLanguage(preference) {
  preferenceOverride = supported.includes(preference) ? preference : 'auto';
  try {
    if (preference === 'auto') localStorage.removeItem(storageKey);
    else if (supported.includes(preference)) localStorage.setItem(storageKey, preference);
  } catch {
    // Language switching still works for the current session.
  }
  locale = resolveLocale(preference, navigator.languages ?? [navigator.language]);
  document.documentElement.lang = locale;
}

export function t(key, values = {}) {
  if (typeof key !== 'string') return key;
  const dictionary = messages[locale];
  const message = dictionary && Object.hasOwn(dictionary, key) ? dictionary[key] : key;
  return message.replace(/\{(\w+)\}/g, (token, name) =>
    Object.hasOwn(values, name) ? values[name] : token,
  );
}
