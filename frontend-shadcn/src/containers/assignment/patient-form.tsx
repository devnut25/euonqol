import { Form } from '@/components/form/form';
import { FormField } from '@/components/form/form-field';
import { FormFieldController } from '@/components/form/form-field-controller';
import type { FormProps } from '@/components/FormContainer';
import { zPatient, type Patient } from '@/features/schema/patient/schema';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

/**
 * Create-only form for a new patient scoped to the survey_questionnaire behind
 * the assignment table. Wired via CrudDataTable's native `form`/`formProps.url`
 * mechanism — POST + reload-on-success are handled by the shared `Form` component.
 */
export const PatientAssignmentForm = ({ initialValues, ...props }: FormProps) => {
  const form = useForm<Patient>({
    mode: 'onSubmit',
    reValidateMode: 'onSubmit',
    resolver: zodResolver(zPatient()),
    defaultValues: initialValues,
  });

  return (
    <Form {...form} {...props} initialValues={initialValues} className="w-full">
      <div className="flex flex-col gap-3">
        <FormField label="Patient ID" required>
          <FormFieldController name="patient_id" type="text" />
        </FormField>

        <FormField label="Email" required>
          <FormFieldController name="mail" type="text" />
        </FormField>

        {/* <div className="w-full grid grid-cols-1 items-start gap-2">
          <Label className="text-sm">Phone</Label>
          <div className="flex gap-2">
            <FormField className="w-24 shrink-0">
              <FormFieldController
                name="phone_prefix"
                type="text"
                placeholder="+39"
              />
            </FormField>
            <FormField className="flex-1">
              <FormFieldController name="phone" type="text" />
            </FormField>
          </div>
        </div> */}
      </div>
    </Form>
  );
};
