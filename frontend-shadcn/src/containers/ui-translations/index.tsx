import DevnutSection from '@/components/DevnutSection';
import { Spinner } from '@/components/ui/spinner';
import { useGetItem } from '@/hooks/useGetItem';
import { useTranslation } from 'react-i18next';
import { UiTranslationsTable } from './table';

interface LanguageItem {
  id: number;
  language: string;
}

export const UiTranslationsSettings = () => {
  const { t } = useTranslation(['settings']);
  // Only to preselect English (the reference language) in the table's language filter
  const { item: languages } = useGetItem('/languages/all', { per_page: -1 });
  const list = (languages as LanguageItem[] | undefined) ?? [];
  const englishId = (list.find((l) => l.language === 'English') ?? list[0])?.id;

  return (
    <DevnutSection.Grid className="gap-6 w-full">
      <p className="text-sm text-muted-foreground">{t('ui_translations.description')}</p>
      {englishId ? (
        <UiTranslationsTable defaultLanguageId={englishId} />
      ) : (
        <div className="w-full flex justify-center">
          <Spinner />
        </div>
      )}
    </DevnutSection.Grid>
  );
};
