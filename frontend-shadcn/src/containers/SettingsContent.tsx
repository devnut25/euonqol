import DevnutSection from '@/components/DevnutSection';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { CatApiSettings } from './cat-api-settings';
import { CatItemBanksTable } from './cat-item-banks/table';
import { CatSettingsTable } from './cat-settings/table';
import { CttNormsTable } from './ctt-norms/table';
import { EmailSettings } from './email-settings';
import { InstituteSettings } from './institute-settings';
import { UiTranslationsSettings } from './ui-translations';

export const SettingsContent = () => {
  const { t } = useTranslation(['settings', 'management']);

  const [searchParams] = useSearchParams();

  const hideTabBar =
    searchParams.has('ctt-norms_id') ||
    searchParams.has('cat-settings_id') ||
    searchParams.has('cat-item-banks_id');

  const items = [
    { key: 'institute', label: t('settings:tabs.institute'), children: <InstituteSettings /> },
    { key: 'email', label: t('settings:tabs.email'), children: <EmailSettings /> },
    { key: 'cat-api', label: t('settings:tabs.cat_api'), children: <CatApiSettings /> },
    {
      key: 'cat-item-banks',
      label: t('management:cat_item_banks.title'),
      children: <CatItemBanksTable />,
    },
    {
      key: 'cat-settings',
      label: t('management:cat_settings.title'),
      children: <CatSettingsTable />,
    },
    { key: 'ctt-norms', label: t('settings:tabs.ctt_norms'), children: <CttNormsTable /> },
    {
      key: 'ui-translations',
      label: t('settings:tabs.ui_translations'),
      children: <UiTranslationsSettings />,
    },
  ];

  return (
    <DevnutSection.Grid>
      <div className="w-full mx-auto">
        <DevnutSection.Segmented keyName="settings" items={items} hideTabBar={hideTabBar} />
      </div>
    </DevnutSection.Grid>
  );
};
