import DevnutSection from '@/components/DevnutSection';
import DevnutTypography from '@/components/DevnutTypography';
import type { EligibilityLanguageQuestions } from '@/features/schema/eligibility/schema';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { EligibilityQuestionForm } from './form';
import type { Language, LanguageGroup, Question } from './utils/types';

interface CreateQuestionDialogProps {
  url: string;
  languages: Language[];
  questions: Question[];
  hasQuestions: boolean;
  nextOrderPosition?: number;
  editingGroup?: LanguageGroup;
  onClose: () => void;
  onSuccess: () => void;
}

export const EligibilityDialog = ({
  url,
  languages,
  questions,
  hasQuestions,
  nextOrderPosition,
  editingGroup,
  onClose,
  onSuccess,
}: CreateQuestionDialogProps) => {
  const { t } = useTranslation(['eligibility']);

  const initialValues = useMemo<EligibilityLanguageQuestions | undefined>(() => {
    if (editingGroup) {
      return {
        language_id: String(editingGroup.language_id),
        is_fallback: editingGroup.is_fallback,
        translations: [...editingGroup.items]
          .sort((a, b) => a.order_position - b.order_position)
          .map((it) => ({
            question_id: it.question_id,
            question_text: it.question_text,
            disqualification_message: it.disqualification_message ?? '',
          })),
      };
    }

    if (hasQuestions) {
      return {
        language_id: '',
        translations: [...questions]
          .sort((a, b) => a.order_position - b.order_position)
          .map((q) => ({
            question_id: q.id,
            question_text: '',
            disqualification_message: '',
          })),
      };
    }

    return undefined;
  }, [editingGroup, hasQuestions, questions]);

  return (
    <DevnutSection.Grid className="pb-16">
      <DevnutTypography.Title
        title={
          editingGroup
            ? t('language_manager.edit_title', { language: editingGroup.language_name })
            : t('actions.add_question')
        }
      />
      <EligibilityQuestionForm
        key={editingGroup?.language_id ?? 'add'}
        languages={languages}
        questions={questions}
        hasQuestions={hasQuestions}
        nextOrderPosition={nextOrderPosition}
        editingGroup={editingGroup}
        initialValues={initialValues}
        url={url}
        onSuccess={onSuccess}
        onClose={onClose}
        submitter={{ searchConfig: { submitText: t('language_manager.save') } }}
      />
    </DevnutSection.Grid>
  );
};
