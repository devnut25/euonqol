import { FormField } from '@/components/form/form-field';
import { FormFieldController } from '@/components/form/form-field-controller';
import { useTranslation } from 'react-i18next';

interface LanguageSelectFieldProps {
  excludeValues?: string[];
  readonly?: boolean;
}

export const LanguageSelectField = ({ excludeValues, readonly }: LanguageSelectFieldProps) => {
  const { t } = useTranslation(['eligibility']);

  return (
    <FormField label={t('language_manager.language_label')} required>
      <FormFieldController
        type="api-select"
        name="language_id"
        url="/languages/all"
        getLabel={(item) => item.language}
        excludeValues={excludeValues}
        readonly={readonly}
      />
    </FormField>
  );
};
