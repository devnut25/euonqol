import DevnutSection from '@/components/DevnutSection';
import { Form } from '@/components/form/form';
import { FormField } from '@/components/form/form-field';
import { FormFieldController } from '@/components/form/form-field-controller';
import type { FormProps } from '@/components/FormContainer';
import { zLanguage, type LanguageFields } from '@/features/schema/languages/schema';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

export const LanguageForm = ({ initialValues, ...props }: FormProps) => {
  const { t } = useTranslation(['settings']);

  const form = useForm<LanguageFields>({
    mode: 'onSubmit',
    reValidateMode: 'onSubmit',
    resolver: zodResolver(zLanguage()),
    defaultValues: initialValues,
  });

  return (
    <Form {...form} {...props} initialValues={initialValues} className="w-full">
      <DevnutSection.Grid className="gap-6">
        <p className="text-sm text-muted-foreground">{t('languages.form.immutable_hint')}</p>

        <FormField label={t('languages.columns.language')} required>
          <FormFieldController name="language" type="text" />
        </FormField>

        <FormField label={t('languages.columns.original_lang')} required>
          <FormFieldController name="original_lang" type="text" />
        </FormField>

        <FormField label={t('languages.columns.alphabet')} required>
          <FormFieldController name="alphabet" type="text" />
        </FormField>

        <FormField label={t('languages.form.id_optional')}>
          <FormFieldController name="id" type="number" placeholder={t('languages.form.id_hint')} />
        </FormField>
      </DevnutSection.Grid>
    </Form>
  );
};
