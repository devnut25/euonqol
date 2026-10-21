import { FormField } from '@/components/form/form-field';
import { FormFieldController } from '@/components/form/form-field-controller';
import { useValueEnum } from '@/hooks/useValueEnum';
import { useTranslation } from 'react-i18next';

export const FallbackToggleField = () => {
  const { valueOptions } = useValueEnum();
  const { t } = useTranslation(['eligibility']);

  return (
    <FormField label={t('form.fallback.label')} required>
      <FormFieldController type="select" name="is_fallback" options={valueOptions.boolean} />
    </FormField>
  );
};
