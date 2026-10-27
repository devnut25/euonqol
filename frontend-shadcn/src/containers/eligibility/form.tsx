import { FormField } from '@/components/form/form-field';
import { FormFieldController } from '@/components/form/form-field-controller';
import { Form } from '@/components/form/form.tsx';
import type { FormProps } from '@/components/FormContainer';
import {
  zEligibilityBootstrap,
  zEligibilityLanguageQuestions,
  type EligibilityFormValues,
} from '@/features/schema/eligibility/schema';
import { useApi } from '@/hooks/useApi';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type Resolver } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { FallbackToggleField } from './_component/fallback-toggle-field';
import { LanguageSelectField } from './_component/language-select-field';
import { QuestionRowCard } from './_component/question-row-card';
import { useEligibilityFormSubmit } from './hooks/useEligibilityFormSubmit';
import type { Language, LanguageGroup, Question } from './utils/types';

interface EligibilityQuestionFormProps extends FormProps {
  languages?: Language[];
  hasQuestions?: boolean;
  nextOrderPosition?: number;
  questions?: Question[];
  editingGroup?: LanguageGroup;
}

/**
 * Dispatcher a 2 vie:
 * - bootstrap (nessuna domanda esistente): scelta lingua + N domande libere (dinamico).
 * - add-language (domande già esistenti): scelta nuova lingua + una riga per ciascuna
 *   domanda già esistente (count fisso, già definito).
 */
export const EligibilityQuestionForm = (props: EligibilityQuestionFormProps) => {
  if (!props.hasQuestions) return <BootstrapForm {...props} />;
  return <AddLanguageForm {...props} />;
};

const BootstrapForm = ({
  languages: _languages,
  hasQuestions: _hasQuestions,
  nextOrderPosition: _nextOrderPosition,
  initialValues,
  url,
  onSuccess,
  onLoadingChange,
  ...props
}: EligibilityQuestionFormProps) => {
  const { t } = useTranslation(['eligibility']);
  const { makeRequest } = useApi();
  const submit = useEligibilityFormSubmit(onLoadingChange, onSuccess);

  const form = useForm<EligibilityFormValues>({
    mode: 'onSubmit',
    reValidateMode: 'onSubmit',
    resolver: zodResolver(zEligibilityBootstrap()) as Resolver<EligibilityFormValues>,
    defaultValues: initialValues,
  });

  const handleSubmit = (data: EligibilityFormValues) => {
    if (!url) return;
    const questions = data.questions ?? [];
    return submit(async () => {
      const languageId = parseInt(data.language_id, 10);
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        await makeRequest(url, 'post', {
          expected_answer: q.expected_answer,
          order_position: i,
          translations: [
            {
              language_id: languageId,
              question_text: q.question_text.trim(),
              disqualification_message: q.disqualification_message?.trim() || null,
              is_fallback: data.is_fallback ?? true,
            },
          ],
        });
      }
    });
  };

  return (
    <Form
      {...form}
      {...props}
      type="default"
      initialValues={initialValues}
      className="flex flex-col gap-4"
      onSubmit={handleSubmit}
    >
      {/* No fallback choice here: the first-ever language for a survey always
          becomes the fallback (both here and enforced by the backend regardless). */}
      <LanguageSelectField />

      <FormField label={t('form.translations.label')}>
        <FormFieldController
          type="list"
          name="questions"
          min={1}
          defaultItem={{ expected_answer: 'yes', question_text: '', disqualification_message: '' }}
          addButtonLabel={t('language_manager.add_question_row')}
        >
          {(index) => (
            <QuestionRowCard
              namePrefix={`questions.${index}`}
              label={`Question ${index + 1}`}
              header={
                <FormField label={t('form.expected_answer.label')} required>
                  <FormFieldController
                    type="select"
                    name={`questions.${index}.expected_answer`}
                    options={[
                      { label: t('form.expected_answer.yes'), value: 'yes' },
                      { label: t('form.expected_answer.no'), value: 'no' },
                    ]}
                  />
                </FormField>
              }
            />
          )}
        </FormFieldController>
      </FormField>
    </Form>
  );
};

const AddLanguageForm = ({
  questions = [],
  languages: existingLanguages = [],
  hasQuestions: _hasQuestions,
  nextOrderPosition: _nextOrderPosition,
  editingGroup,
  initialValues,
  url,
  onSuccess,
  onLoadingChange,
  ...props
}: EligibilityQuestionFormProps) => {
  const { t } = useTranslation(['eligibility']);
  const { makeRequest } = useApi();
  const submit = useEligibilityFormSubmit(onLoadingChange, onSuccess);

  const sortedQuestions = [...questions].sort((a, b) => a.order_position - b.order_position);
  const isEdit = !!editingGroup;

  const form = useForm<EligibilityFormValues>({
    mode: 'onSubmit',
    reValidateMode: 'onSubmit',
    resolver: zodResolver(zEligibilityLanguageQuestions()) as Resolver<EligibilityFormValues>,
    defaultValues: initialValues,
  });

  const handleSubmit = (data: EligibilityFormValues) => {
    if (!url) return;
    return submit(async () => {
      await makeRequest(`${url}/translations/${data.language_id}`, 'patch', {
        is_fallback: data.is_fallback ?? false,
        translations: (data.translations ?? []).map((tr) => ({
          question_id: tr.question_id,
          question_text: tr.question_text.trim(),
          disqualification_message: tr.disqualification_message?.trim() || null,
        })),
      });
    });
  };

  return (
    <Form
      {...form}
      {...props}
      type="default"
      initialValues={initialValues}
      className="flex flex-col gap-4"
      onSubmit={handleSubmit}
    >
      <LanguageSelectField
        excludeValues={existingLanguages.map((l) => String(l.id))}
        readonly={isEdit}
      />
      <FallbackToggleField />

      <FormField label={t('form.translations.label')}>
        <FormFieldController
          type="list"
          name="translations"
          min={sortedQuestions.length}
          max={sortedQuestions.length}
        >
          {(index) => {
            const q = sortedQuestions[index];
            return (
              <QuestionRowCard
                namePrefix={`translations.${index}`}
                label={`Question ${index + 1}`}
                header={
                  <p className="text-xs font-medium text-muted-foreground">
                    #{index + 1} · {t(`form.expected_answer.${q.expected_answer}`)}
                  </p>
                }
              />
            );
          }}
        </FormFieldController>
      </FormField>
    </Form>
  );
};
