import dayjs from 'dayjs';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { i18nConfig } from '@/lib/i18n/config';
import LanguageDetector from 'i18next-browser-languagedetector';

i18n.use(LanguageDetector).use(initReactI18next).init(i18nConfig);

export const syncLanguage = (langKey: string) => {
  dayjs.locale(langKey);
  document.documentElement.lang = langKey;
};

i18n.on('languageChanged', (langKey) => syncLanguage(langKey));
if (i18n.language) document.documentElement.lang = i18n.language;
export default i18n;
