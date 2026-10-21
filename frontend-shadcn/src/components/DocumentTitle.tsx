import { extraNavigationItems, navigationItems } from '@/features/config/navigation';
import type { ParseKeys, TFunction } from 'i18next';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';

// Chiavi di traduzione (namespace common) dei titoli delle pagine fuori dal menu
const EXACT_TITLE_KEYS: Record<string, ParseKeys<'common'>> = {
  '/login': 'document_title.login',
  '/reset-password': 'document_title.reset_password',
  '/reset-password-confirm': 'document_title.set_new_password',
  '/first-access': 'document_title.first_access',
  '/two-factor': 'document_title.two_factor',
  '/module-library/upload': 'document_title.upload_kit_version',
  '/cat-item-banks/upload': 'document_title.create_cat_item_bank',
  '/patients/upload': 'document_title.add_participants',
};

const SECTION_TITLE_KEYS = [...navigationItems, ...extraNavigationItems]
  .filter((item) => item.path !== '/')
  .map((item) => ({ path: item.path, labelKey: item.labelKey }))
  .sort((a, b) => b.path.length - a.path.length);

const getPageTitleKey = (pathname: string): ParseKeys<'common'> | undefined => {
  if (pathname === '/') return 'navbar.items.homepage';
  if (pathname.startsWith('/q/')) return 'document_title.questionnaire';
  if (pathname.endsWith('/questionnaires/preview')) return 'document_title.questionnaire_preview';
  if (EXACT_TITLE_KEYS[pathname]) return EXACT_TITLE_KEYS[pathname];
  return SECTION_TITLE_KEYS.find(
    (item) => pathname === item.path || pathname.startsWith(`${item.path}/`)
  )?.labelKey;
};

const getDocumentTitle = (pathname: string, t: TFunction<'common'>) => {
  const appName = t('document_title.app_name');
  const pageKey = getPageTitleKey(pathname);
  return pageKey ? `${t(pageKey)} - ${appName}` : appName;
};

/** Aggiorna il titolo della scheda a ogni cambio di pagina o di lingua (WCAG 2.4.2). */
export const DocumentTitle = () => {
  const { pathname } = useLocation();
  const { t, i18n } = useTranslation(['common']);

  useEffect(() => {
    document.title = getDocumentTitle(pathname, t);
  }, [pathname, t, i18n.language]);

  return null;
};
