import DevnutSection from '@/components/DevnutSection';
import { Spinner } from '@/components/ui/spinner';
import { useGetItem } from '@/hooks/useGetItem';
import { useTranslation } from 'react-i18next';
import { UiTranslationsTable } from './table';

// Same as DEFAULT_LANGUAGE_ID in backend/src/config/language.ts
const ENGLISH_LANGUAGE_ID = 29;

interface LanguageItem {
  id: number;
  language: string;
}

export const UiTranslationsSettings = () => {
  const { t } = useTranslation(['settings']);
  // Only to preselect English (the reference language) in the table's language filter
  const { item: languages } = useGetItem('/languages/all', { per_page: -1 });
  const list = (languages as LanguageItem[] | undefined) ?? [];
  // Language ids are fixed (eu_countries is append-only): English is always id 29
  const englishId = (list.find((l) => l.id === ENGLISH_LANGUAGE_ID) ?? list[0])?.id;

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
