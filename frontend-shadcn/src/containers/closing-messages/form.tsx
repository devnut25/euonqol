import { FormField } from '@/components/form/form-field';
import { FormFieldController } from '@/components/form/form-field-controller';
import { Form } from '@/components/form/form.tsx';
import type { FormProps } from '@/components/FormContainer';
import { zClosingMessage, type ClosingMessage } from '@/features/schema/closing-messages/schema';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { EXTRA_MESSAGE_FIELDS } from './utils/types';

interface ClosingMessageFormProps extends FormProps {
  /** Languages already configured for the survey: hidden from the select when adding. */
  excludeLanguageIds?: number[];
}

export const ClosingMessageForm = ({
  initialValues,
  excludeLanguageIds = [],
  ...props
}: ClosingMessageFormProps) => {
  const { t } = useTranslation(['closingMessages']);
  const isEdit = initialValues?.language_id != null;

  const form = useForm<ClosingMessage>({
    mode: 'onSubmit',
    reValidateMode: 'onSubmit',
    resolver: zodResolver(zClosingMessage()),
    defaultValues: {
      ...initialValues,
      language_id: isEdit ? String(initialValues.language_id) : undefined,
    },
  });

  return (
    // Always POST: the backend upserts a new version for the (survey, language) pair.
    <Form
      {...form}
      {...props}
      method="post"
      type="default"
      initialValues={initialValues}
      className="flex flex-col gap-4"
    >
      <FormField label={t('form.language.label')} required>
        <FormFieldController
          type="api-select"
          name="language_id"
          url="/languages/all"
          getLabel={(item) => item.language}
          excludeValues={isEdit ? undefined : excludeLanguageIds.map(String)}
          readonly={isEdit}
        />
      </FormField>

      {/* Hint ids follow FormField's `${id}-description` convention (descriptionId in context). */}
      <FormField id="closing-content" label={t('form.content.label')} required>
        <p id="closing-content-description" className="text-xs text-muted-foreground mb-1">
          {t('form.content.hint')}
        </p>
        <FormFieldController type="rich-text-editor" name="content" />
      </FormField>

      {EXTRA_MESSAGE_FIELDS.map((field) => (
        <FormField key={field} id={`closing-${field}`} label={t(`form.${field}.label`)} required>
          <p id={`closing-${field}-description`} className="text-xs text-muted-foreground mb-1">
            {t(`form.${field}.hint`)}
          </p>
          <FormFieldController type="rich-text-editor" name={field} />
        </FormField>
      ))}
    </Form>
  );
};
