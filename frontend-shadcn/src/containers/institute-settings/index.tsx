import DevnutSection from '@/components/DevnutSection';
import { ItemLoader } from '@/components/ItemLoader';
import { useTranslation } from 'react-i18next';
import { InstituteForm, type InstituteFormValues } from './form';

export const InstituteSettings = () => {
  const { t } = useTranslation(['settings']);

  return (
    <DevnutSection.Grid className="gap-6 w-full">
      <p className="text-sm text-muted-foreground">{t('institute.description')}</p>
      <ItemLoader<InstituteFormValues | null> url="/institute">
        {(item, mutate) => <InstituteForm initialValues={item} onSaved={() => mutate?.()} />}
      </ItemLoader>
    </DevnutSection.Grid>
  );
};
