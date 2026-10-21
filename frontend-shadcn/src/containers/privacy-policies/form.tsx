import { FormField } from '@/components/form/form-field';
import { FormFieldController } from '@/components/form/form-field-controller';
import { Form } from '@/components/form/form.tsx';
import type { FormProps } from '@/components/FormContainer';
import { zPrivacyPolicy, type PrivacyPolicy } from '@/features/schema/privacy-policies/schema';
import { PDF_MAX_SIZE } from '@/features/schema/shared/pdf-field';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

export const PrivacyPolicyForm = ({ initialValues, ...props }: FormProps) => {
  const { t } = useTranslation(['privacyPolicies']);

  const form = useForm<PrivacyPolicy>({
    mode: 'onSubmit',
    reValidateMode: 'onSubmit',
    resolver: zodResolver(zPrivacyPolicy()),
    defaultValues: {
      ...initialValues,
      language_id:
        initialValues?.language_id != null ? String(initialValues.language_id) : undefined,
    },
  });

  return (
    <Form
      {...form}
      {...props}
      initialValues={initialValues}
      className="flex flex-col gap-4"
    >
      <FormField label={t('form.title.label')} required>
        <FormFieldController name="title" type="text" />
      </FormField>

      <FormField label={t('form.language.label')} required>
        <FormFieldController
          type="api-select"
          name="language_id"
          url="/languages/all"
          getLabel={(item) => item.language}
        />
      </FormField>

      <FormField label={t('form.content.label')} required>
        <FormFieldController type="rich-text-editor" name="content" />
      </FormField>

      <FormField label={t('form.pdf.label')}>
        <FormFieldController
          type="file"
          name="pdf"
          acceptedFileTypes={{ 'application/pdf': ['.pdf'] }}
          maxSize={PDF_MAX_SIZE}
          otherText={t('form.pdf.hint')}
          existingFile={
            initialValues?.pdf_url
              ? {
                  url: initialValues.pdf_url,
                  label: t('form.pdf.current'),
                  filename: initialValues.pdf_filename,
                  removeLabel: t('form.pdf.remove'),
                }
              : undefined
          }
        />
      </FormField>
    </Form>
  );
};
