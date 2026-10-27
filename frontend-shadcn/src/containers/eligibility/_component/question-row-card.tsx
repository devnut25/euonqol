import { DevnutListRemoveButton } from '@/components/DevnutList';
import { FormField } from '@/components/form/form-field';
import { FormFieldController } from '@/components/form/form-field-controller';
import type { EligibilityFormValues } from '@/features/schema/eligibility/schema';
import { useId, type ReactNode } from 'react';
import type { FieldPath } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

interface QuestionRowCardProps {
  namePrefix: string;
  header: ReactNode;
  /** Accessible name of the row group, e.g. "Question 1". */
  label: string;
}

export const QuestionRowCard = ({ namePrefix, header, label }: QuestionRowCardProps) => {
  const { t } = useTranslation(['eligibility']);
  const labelId = useId();

  return (
    <div
      role="group"
      aria-labelledby={labelId}
      className="flex flex-col gap-2 border rounded-md p-3 bg-muted/30 w-full"
    >
      <span id={labelId} className="sr-only">
        {label}
      </span>
      {header}
      <FormField label={t('form.question_text.label')} required>
        <FormFieldController
          type="text"
          name={`${namePrefix}.question_text` as FieldPath<EligibilityFormValues>}
          containerProps={{ className: 'flex flex-col items-start gap-2!' }}
        />
      </FormField>
      <FormField label={t('form.disqualification_message.label')} required>
        <FormFieldController
          type="textarea"
          name={`${namePrefix}.disqualification_message` as FieldPath<EligibilityFormValues>}
          containerProps={{ className: 'flex flex-col items-start gap-2!' }}
          rows={3}
        />
      </FormField>
      <DevnutListRemoveButton />
    </div>
  );
};
