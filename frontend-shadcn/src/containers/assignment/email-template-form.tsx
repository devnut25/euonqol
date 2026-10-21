import { Form } from '@/components/form/form';
import { FormField } from '@/components/form/form-field';
import { FormFieldController } from '@/components/form/form-field-controller';
import type { FormProps } from '@/components/FormContainer';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  zEmailTemplate,
  type EmailTemplateFormValues,
} from '@/features/schema/email-template/schema';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { EmailTemplatePreview } from './email-template-preview';

const PLACEHOLDER_HINT =
  'Available placeholders: {{survey_name}}, {{questionnaire_name}}, {{link}}, {{qr_code}}';

// Templates saved before the rich-text editor existed store `body` as plain text with
// real newlines. Tiptap parses the value as HTML, so bare newlines would visually collapse.
// Upgrade them to <br> on load only when the value isn't HTML yet; saving re-serializes it
// as real Tiptap HTML from then on.
function migratePlainTextBody(body: string | undefined): string | undefined {
  if (!body || /<[a-z][\s\S]*>/i.test(body)) return body;
  return body.replace(/\n/g, '<br>');
}

export const EmailTemplateForm = ({ initialValues, ...props }: FormProps) => {
  const { t } = useTranslation(['emailTemplates']);

  const form = useForm<EmailTemplateFormValues>({
    mode: 'onSubmit',
    reValidateMode: 'onSubmit',
    resolver: zodResolver(zEmailTemplate()),
    defaultValues: initialValues
      ? {
          ...initialValues,
          language_id: initialValues.language_id?.toString(),
          body: migratePlainTextBody(initialValues.body as string | undefined),
        }
      : initialValues,
  });

  const [subject, body] = useWatch({ control: form.control, name: ['subject', 'body'] });

  return (
    <Form {...form} {...props} initialValues={initialValues} className="w-full">
      <Tabs defaultValue="edit">
        <TabsList className="w-full">
          <TabsTrigger value="edit">Edit</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
        </TabsList>
        <TabsContent value="edit">
          <div className="flex flex-col gap-3">
            <FormField label={t('form.language.label')} required>
              <FormFieldController
                type="api-select"
                name="language_id"
                url="/countries"
                getLabel={(item) => item.language}
              />
            </FormField>

            <FormField label={t('form.subject.label')} required>
              <FormFieldController name="subject" type="text" maxLength={255} />
            </FormField>

            <FormField label={t('form.body.label')} required>
              <FormFieldController type="rich-text-editor" name="body" />
            </FormField>

            <p className="text-xs text-muted-foreground text-right">{PLACEHOLDER_HINT}</p>
          </div>
        </TabsContent>
        <TabsContent value="preview">
          <EmailTemplatePreview subject={subject ?? ''} body={body ?? ''} />
        </TabsContent>
      </Tabs>
    </Form>
  );
};
