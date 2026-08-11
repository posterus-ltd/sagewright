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
