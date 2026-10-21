
import locales from '@/locales';  // Le tue traduzioni
import type { InitOptions } from 'i18next';
import { DEFAULT_LANGUAGE_KEY, DEFAULT_NAMESPACE } from './constants';

export const i18nConfig: InitOptions = {
  // ✅ Namespace di default (es: 'common', 'auth', 'errors')
  defaultNS: DEFAULT_NAMESPACE,
  
  // ✅ Tutti i namespace disponibili
  ns: Object.keys(locales[DEFAULT_LANGUAGE_KEY]),
  
  // ✅ Le traduzioni vere e proprie
  // Struttura: { it: { common: {...}, auth: {...} }, en: {...} }
  resources: locales,
  
  // ✅ Lingua di fallback se la traduzione non esiste
  fallbackLng: DEFAULT_LANGUAGE_KEY,
  
  // ✅ Lingue supportate
  supportedLngs: Object.keys(locales),
  
  // ✅ Configurazione del rilevamento automatico lingua
  detection: {
    caches: ['cookie'],              // Salva la scelta in un cookie
    cookieMinutes: 43200,            // 30 giorni
    cookieOptions: { 
      path: '/', 
      sameSite: 'lax'               // Sicurezza CSRF
    },
  },

  // ✅ Fix per TypeScript
  // Evita che i18next ritorni null invece di string
  returnNull: false,

  // ✅ Sicurezza XSS
  interpolation: {
    escapeValue: false,  // React già gestisce l'escape automatico
  },
};