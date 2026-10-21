import DevnutSection from '@/components/DevnutSection';
import { Form } from '@/components/form/form';
import { FormField } from '@/components/form/form-field';
import { FormFieldController } from '@/components/form/form-field-controller';
import { FormSubmitter } from '@/components/form/form-submitter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  zFormFieldsInstituteSettings,
  type FormFieldsInstituteSettings,
} from '@/features/schema/institute-settings/schema';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

export interface InstituteFormValues {
  name?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  note?: string | null;
  email?: string | null;
  phone?: string | null;
  referentName?: string | null;
  logoUrl?: string | null;
}

interface InstituteFormProps {
  initialValues: InstituteFormValues | null;
  onSaved: () => void;
}

export const InstituteForm = ({ initialValues, onSaved }: InstituteFormProps) => {
  const form = useForm<FormFieldsInstituteSettings>({
    mode: 'onSubmit',
    reValidateMode: 'onSubmit',
    resolver: zodResolver(zFormFieldsInstituteSettings()),
    defaultValues: {
      name: initialValues?.name ?? '',
      address: initialValues?.address ?? '',
      city: initialValues?.city ?? '',
      country: initialValues?.country ?? '',
      note: initialValues?.note ?? '',
      email: initialValues?.email ?? '',
      phone: initialValues?.phone ?? '',
      referentName: initialValues?.referentName ?? '',
      // Intentionally not defaulted from initialValues: this field only ever carries a
      // *new* File the admin just picked (or the removal signal). Defaulting it would
      // make every plain text-only save also resend/clear the logo — see FieldFile's
      // `existingFile` prop below, which displays the current logo out-of-band instead.
    },
  });

  return (
    <Form
      {...form}
      url="/institute"
      // messages={{ success: 'Institute info updated successfully' }}
      onSuccess={onSaved}
      submitter={{
        searchConfig: { submitText: 'Save' },
        resetButtonProps: { style: { display: 'none' } },
        render: (helpers, defaultDom) => (
          <FormSubmitter type="default" loading={helpers?.isSubmitting}>
            {defaultDom}
          </FormSubmitter>
        ),
      }}
    >
      <DevnutSection.Grid className="gap-6 lg:grid-cols-2">
        <Card className="h-full">
          <CardHeader>
            <CardTitle>Address</CardTitle>
          </CardHeader>
          <CardContent>
            <DevnutSection.Grid className="gap-6">
              <FormField label="Institute Name" required>
                <FormFieldController name="name" type="text" />
              </FormField>

              <FormField label="Address" required>
                <FormFieldController name="address" type="text" />
              </FormField>

              <FormField label="City" required>
                <FormFieldController name="city" type="text" />
              </FormField>

              <FormField label="Country" required>
                <FormFieldController name="country" type="text" />
              </FormField>
            </DevnutSection.Grid>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Contact</CardTitle>
          </CardHeader>
          <CardContent>
            <DevnutSection.Grid className="gap-6">
              <FormField label="Contact Person">
                <FormFieldController name="referentName" type="text" />
              </FormField>

              <FormField label="Email">
                <FormFieldController name="email" type="email" />
              </FormField>

              <FormField label="Phone">
                <FormFieldController name="phone" type="tel" />
              </FormField>

              <FormField label="Note">
                <FormFieldController name="note" type="textarea" />
              </FormField>
            </DevnutSection.Grid>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Other</CardTitle>
          </CardHeader>
          <CardContent>
            <DevnutSection.Grid className="gap-6">
              <FormField label="Logo">
                <FormFieldController
                  name="logo"
                  type="file"
                  acceptedFileTypes={{ 'image/png': ['.png'], 'image/jpeg': ['.jpg', '.jpeg'] }}
                  defaultText="Select or drag and drop the institute logo (PNG or JPEG, max 2MB)"
                  maxSize={2 * 1024 * 1024}
                  existingFile={
                    initialValues?.logoUrl
                      ? {
                          url: initialValues.logoUrl,
                          label: 'Current logo',
                          removeLabel: 'Remove logo',
                        }
                      : undefined
                  }
                />
              </FormField>
            </DevnutSection.Grid>
          </CardContent>
        </Card>
      </DevnutSection.Grid>
    </Form>
  );
};
