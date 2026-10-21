import type { Survey } from '@/features/schema/survey/schema';
import { SurveyStepIdEnum } from '@/utils/enum';
import { useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

type StepDef = {
  id: SurveyStepIdEnum;
  labelKey: string;
  labelFallback: string;
  fields: (keyof Survey)[];
};

export type StepItem = StepDef & { disabled: boolean };

export type StepLabel = { label: string; disabled: boolean };

const ALL_STEPS: StepDef[] = [
  {
    id: SurveyStepIdEnum.General,
    labelKey: 'form.step_general',
    labelFallback: 'General',
    fields: ['name', 'starting_date', 'end_date', 'access_mode'],
  },
  {
    id: SurveyStepIdEnum.Sending,
    labelKey: 'form.step_sending',
    labelFallback: 'Sending',
    fields: ['send_mode', 'send_delay_hours', 'send_scheduled_at'],
  },
  {
    id: SurveyStepIdEnum.Reminders,
    labelKey: 'form.step_reminders',
    labelFallback: 'Reminders',
    fields: ['reminder', 'frequency', 'frequency_tipology', 'reminder_max_count'],
  },
  {
    id: SurveyStepIdEnum.Status,
    labelKey: 'form.step_status',
    labelFallback: 'Status',
    fields: ['status'],
  },
];

export function useSurveyStepper(opts: {
  form: UseFormReturn<Survey>;
  isEdit: boolean;
  isAnonymousSpontaneous: boolean;
}) {
  const { form, isEdit, isAnonymousSpontaneous } = opts;
  const { t } = useTranslation(['survey']);
  const [currentId, setCurrentId] = useState<SurveyStepIdEnum>(SurveyStepIdEnum.General);

  const steps: StepItem[] = ALL_STEPS.map((s) => ({
    ...s,
    disabled:
      ((s.id === SurveyStepIdEnum.Sending || s.id === SurveyStepIdEnum.Reminders) &&
        (isAnonymousSpontaneous || isEdit)) ||
      (s.id === 'status' && !isEdit),
  }));

  const activeStep = steps.find((s) => s.id === currentId) ?? steps[0];
  const activeIndex = steps.indexOf(activeStep);

  const isFirst = activeIndex === 0;
  const isLast = activeIndex === steps.length - 1;

  const labels: StepLabel[] = steps.map((s) => ({
    label: t(s.labelKey, s.labelFallback),
    disabled: s.disabled,
  }));

  function goTo(id: SurveyStepIdEnum) {
    setCurrentId(id);
  }

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

  return { activeStep, activeIndex, steps, isFirst, isLast, labels, next, back, goTo };
}
