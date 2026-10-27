import { FormField } from '@/components/form/form-field';
import { FormFieldController } from '@/components/form/form-field-controller';
import { Form } from '@/components/form/form.tsx';
import type { FormProps } from '@/components/FormContainer';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { zStudyInfoSheet, type StudyInfoSheet } from '@/features/schema/study-info-sheet/schema';
import { PDF_MAX_SIZE } from '@/features/schema/shared/pdf-field';
import { cn } from '@/lib/tailwind/utils';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, InfoIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

type StudyInfoSheetTab = 'general' | 'consent';

const GENERAL_FIELDS = ['title', 'language_id', 'content', 'rejection_message', 'pdf'] as const;

export const StudyInfoSheetForm = ({ initialValues, ...props }: FormProps) => {
  const { t } = useTranslation(['studyInfoSheet']);

  const form = useForm<StudyInfoSheet>({
    mode: 'onSubmit',
    reValidateMode: 'onSubmit',
    resolver: zodResolver(zStudyInfoSheet()),
    defaultValues: {
      ...initialValues,
      language_id:
        initialValues?.language_id != null ? String(initialValues.language_id) : undefined,
      // Only question_text is editable: ids/order are reassigned on every save.
      // Consent questions are optional: some centres have none.
      consent_questions: (initialValues?.consent_questions ?? []).map(
        (q: { question_text: string }) => ({ question_text: q.question_text })
      ),
    },
  });

  const consentQuestions = useWatch({ control: form.control, name: 'consent_questions' });
  const hasConsentQuestions = (consentQuestions?.length ?? 0) > 0;

  const [tab, setTab] = useState<StudyInfoSheetTab>('general');
  const { errors, submitCount } = form.formState;
  const generalHasErrors = GENERAL_FIELDS.some((field) => !!errors[field]);
  const consentHasErrors = !!errors.consent_questions;

  // Every tab stays mounted (forceMount), so errors register even on the hidden
  // one: after a failed submit, bring the user to the first tab holding an error.
  useEffect(() => {
    if (!submitCount) return;
    if (generalHasErrors) setTab('general');
    else if (consentHasErrors) setTab('consent');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitCount]);

  return (
    <Form
      {...form}
      {...props}
      initialValues={initialValues}
      className="flex flex-col gap-4"
    >
      <Tabs value={tab} onValueChange={(value) => setTab(value as StudyInfoSheetTab)}>
        <TabsList className="w-full h-auto">
          {/* Errors are flagged by an icon and hidden text too, not by colour alone. */}
          <TabsTrigger value="general" className={cn('h-auto whitespace-normal text-center', generalHasErrors && 'text-destructive')}>
            {generalHasErrors && <AlertCircle aria-hidden="true" />}
            {t('form.tabs.general')}
            {generalHasErrors && <span className="sr-only"> (has errors)</span>}
          </TabsTrigger>
          <TabsTrigger value="consent" className={cn('h-auto whitespace-normal text-center', consentHasErrors && 'text-destructive')}>
            {consentHasErrors && <AlertCircle aria-hidden="true" />}
            {t('form.tabs.consent_questions')}
            {consentHasErrors && <span className="sr-only"> (has errors)</span>}
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value="general"
          forceMount
          className="flex flex-col gap-4 data-[state=inactive]:hidden"
        >
          <FormField label={t('form.title.label')} required>
            <FormFieldController name="title" type="text" multiline />
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

          <FormField label={t('form.rejection_message.label')} required={hasConsentQuestions}>
            <FormFieldController name="rejection_message" type="textarea" rows={4} />
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
        </TabsContent>

        <TabsContent
          value="consent"
          forceMount
          className="flex flex-col gap-4 data-[state=inactive]:hidden"
        >
          <Alert className="bg-blue-50 border border-blue-200 text-blue-900">
            <InfoIcon />
            <AlertTitle>{t('form.consent_questions.info.title')}</AlertTitle>
            <AlertDescription className="text-blue-900">
              {t('form.consent_questions.info.description')}
            </AlertDescription>
          </Alert>

          <FormField label={t('form.consent_questions.label')}>
            <FormFieldController
              type="list"
              name="consent_questions"
              min={0}
              defaultItem={{ question_text: '' }}
              addButtonLabel={t('form.consent_questions.add')}
            >
              {(index) => (
                <div className="flex flex-col gap-2 border rounded-md p-3 bg-background w-full min-w-0 [&_[data-slot=separator]]:hidden">
                  <FormField label={`${t('form.consent_questions.question_text.label')} #${index + 1}`} required>
                    <FormFieldController
                      type="textarea"
                      name={`consent_questions.${index}.question_text`}
                      containerProps={{ className: 'flex flex-col items-start gap-2!' }}
                      rows={3}
                    />
                  </FormField>
                </div>
              )}
            </FormFieldController>
          </FormField>
        </TabsContent>
      </Tabs>
    </Form>
  );
};
