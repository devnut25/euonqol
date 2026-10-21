import type { Questionnaire } from '@/features/schema/questionnaire/schema';
import { useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

export type QuestionnaireStepId = 'general' | 'modules' | 'norms';

type StepDef = {
  id: QuestionnaireStepId;
  labelKey: string;
  labelFallback: string;
  fields: (keyof Questionnaire)[];
};

export type StepItem = StepDef & { disabled: boolean };
export type StepLabel = { label: string; disabled: boolean };

const ALL_STEPS: StepDef[] = [
  {
    id: 'general',
    labelKey: 'form.step_general',
    labelFallback: 'General',
    fields: ['title', 'patient_group_id', 'status', 'max_completions'],
  },
  {
    id: 'modules',
    labelKey: 'form.step_modules',
    labelFallback: 'Modules',
    fields: ['modules'],
  },
  {
    id: 'norms',
    labelKey: 'form.step_norms',
    labelFallback: 'Norms',
    fields: ['ctt_norms_version_id'],
  },
];

export function useQuestionnaireStepper(opts: {
  form: UseFormReturn<Questionnaire>;
  isEdit: boolean;
  isQuestionnaireLocked: boolean;
  canEditModules: boolean;
  isCompleted: boolean;
}) {
  const { form, isQuestionnaireLocked, canEditModules, isCompleted } = opts;
  const { t } = useTranslation(['questionnaire']);
  const [currentId, setCurrentId] = useState<QuestionnaireStepId>('general');

  const steps: StepItem[] = ALL_STEPS.map((s) => ({
    ...s,
    disabled:
      s.id === 'modules' || s.id === 'norms'
        ? isCompleted || isQuestionnaireLocked || !canEditModules
        : isCompleted,
  }));

  const activeStep = steps.find((s) => s.id === currentId) ?? steps[0];
  const activeIndex = steps.indexOf(activeStep);
  const isFirst = activeIndex === 0;
  const isLast = activeIndex === steps.length - 1;

  const labels: StepLabel[] = steps.map((s) => ({
    label: t(s.labelKey, s.labelFallback),
    disabled: s.disabled,
  }));

  async function next() {
    if (!activeStep.disabled) {
      const valid = await form.trigger(activeStep.fields, { shouldFocus: true });
      if (!valid) return;
    }
    if (activeIndex < steps.length - 1) setCurrentId(steps[activeIndex + 1].id);
  }

  function back() {
    if (activeIndex > 0) setCurrentId(steps[activeIndex - 1].id);
  }

  return { activeStep, activeIndex, steps, isFirst, isLast, labels, next, back };
}
