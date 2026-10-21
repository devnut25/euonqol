import DevnutSection from '@/components/DevnutSection';
import { ItemLoader } from '@/components/ItemLoader';
import { useTranslation } from 'react-i18next';
import { EmailSettingsForm, type EmailSettingsValues } from './form';

export const EmailSettings = () => {
  const { t } = useTranslation(['settings']);

  return (
    <DevnutSection.Grid className="gap-6 w-full">
      <p className="text-sm text-muted-foreground">{t('email.description')}</p>
      <ItemLoader<EmailSettingsValues> url="/settings/email">
        {(item, mutate) => <EmailSettingsForm initialValues={item} onSaved={() => mutate?.()} />}
      </ItemLoader>
    </DevnutSection.Grid>
  );
};
