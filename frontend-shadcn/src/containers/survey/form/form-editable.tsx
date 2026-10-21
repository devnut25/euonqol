import DevnutSection from '@/components/DevnutSection';
import type { SubmitterProps } from '@/components/form/form';
import { Form } from '@/components/form/form';
import { FormSubmitterStepper } from '@/components/form/form-submitter-stepper';
import type { FormProps } from '@/components/FormContainer';
import { useApi } from '@/hooks/useApi';
import { SurveyStepIdEnum } from '@/utils/enum';
import { StepIndicator } from '../_components/step-indicator';
import {
  GeneralFields,
  RemindersFields,
  SendingFields,
  StatusField,
} from '../_components/survey-fields';
import { useSurveyForm } from '../_hooks/useSurveyForm';
import { useSurveyStepper } from '../_hooks/useSurveyStepper';

export const EditableForm = ({ initialValues, readonly, ...props }: FormProps) => {
  const { makeRequest } = useApi();
  const { form, isAnonymousSpontaneous, isEdit } = useSurveyForm(initialValues);
  const { activeStep, activeIndex, isFirst, isLast, labels, next, back } = useSurveyStepper({
    form,
    isEdit,
    isAnonymousSpontaneous,
  });

  // draft -> public is not a plain status write: it's a dedicated transition
  // (backend/src/services/SurveyService.ts publish()) with its own validation
  // (starting_date <= today, at least one questionnaire) and cascading questionnaire
  // activation. The regular PUT below is sent with status pinned back to its current
  // value so it never attempts that transition itself; publish() runs as a second
  // call once the rest of the edit has been saved.
  // Mirror useSurveyForm's status default: create AND duplicate (isEdit = false in both,
  // id stripped) always start as draft — never inherit the source row's raw status here,
  // or StatusField's NEXT_SURVEY_STATUS[currentStatus] filter would exclude 'draft' from
  // the selectable options whenever the duplicated survey wasn't itself draft.
  const currentStatus = isEdit ? ((initialValues?.status as string) ?? 'draft') : 'draft';
  const isPublishCandidate = isEdit && currentStatus === 'draft';

  const stepperSubmitter: SubmitterProps = {
    ...props.submitter,
    render: (helpers) => (
      <FormSubmitterStepper
        helpers={helpers}
        back={back}
        next={next}
        isFirst={isFirst}
        isLast={isLast}
      />
    ),
  };

  return (
    <Form
      {...form}
      {...props}
      readonly={readonly}
      initialValues={initialValues}
      submitter={stepperSubmitter}
      className="w-full"
      api={{
        ...(props as any).api,
        transformRequest: (data: any) =>
          isPublishCandidate && data.status === 'public'
            ? { ...data, status: currentStatus }
            : data,
      }}
      onSuccess={async (result) => {
        if (isPublishCandidate && form.getValues('status') === 'public' && initialValues?.id) {
          await makeRequest(`/surveys/${initialValues.id}/publish`, 'post');
        }
        await props.onSuccess?.(result);
      }}
    >
      <StepIndicator steps={labels} currentIndex={activeIndex} />

      <DevnutSection.Grid className="gap-1">
        {activeStep.id === SurveyStepIdEnum.General && (
          <GeneralFields isEdit={isEdit} disabled={activeStep.disabled} />
        )}
        {activeStep.id === SurveyStepIdEnum.Sending && (
          <SendingFields control={form.control} disabled={activeStep.disabled} />
        )}
        {activeStep.id === SurveyStepIdEnum.Reminders && (
          <RemindersFields control={form.control} disabled={activeStep.disabled} />
        )}
        {activeStep.id === SurveyStepIdEnum.Status && (
          <StatusField disabled={activeStep.disabled} currentStatus={currentStatus} />
        )}
      </DevnutSection.Grid>
    </Form>
  );
};
