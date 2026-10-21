import DevnutSection from '@/components/DevnutSection';
import { ItemLoader } from '@/components/ItemLoader';
import { useTranslation } from 'react-i18next';
import { CatApiSettingsForm, type CatApiSettingsValues } from './form';

export const CatApiSettings = () => {
  const { t } = useTranslation(['settings']);

  return (
    <DevnutSection.Grid className="gap-6 w-full">
      <p className="text-sm text-muted-foreground">{t('cat_api.description')}</p>
      <ItemLoader<CatApiSettingsValues> url="/settings/cat-api">
        {(item, mutate) => <CatApiSettingsForm initialValues={item} onSaved={() => mutate?.()} />}
      </ItemLoader>
    </DevnutSection.Grid>
  );
};
