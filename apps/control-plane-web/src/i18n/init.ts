import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from './translations/en.json';

export const initI18N = () =>
  i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      fallbackLng: 'en',
      resources: {
        en,
      },
      // debug: true,
      interpolation: {
        escapeValue: false, // not needed for react as it escapes by default
      },
    });

// i18next is a module singleton, so it must be initialised exactly once per page.
// The demo web component can mount several instances (and remount on re-attach);
// this memoises the single init promise so they all await the same one.
let initPromise: ReturnType<typeof initI18N> | null = null;
export const ensureI18N = (): ReturnType<typeof initI18N> => (initPromise ??= initI18N());
