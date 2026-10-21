import DevnutSection from '@/components/DevnutSection';
import { Form } from '@/components/form/form';
import { FormField } from '@/components/form/form-field';
import { FormFieldController } from '@/components/form/form-field-controller';
import type { FormProps } from '@/components/FormContainer';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { zCttNormsVersion, type CttNormsVersionFields } from '@/features/schema/ctt-norms/schema';
import { useValueEnum } from '@/hooks/useValueEnum';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { NormRowFields } from './_components/norm-row-fields';

export const CttNormsForm = ({ initialValues, ...props }: FormProps) => {
  const { valueOptions } = useValueEnum();

  const isEdit = !!initialValues?.id;

  const form = useForm<CttNormsVersionFields>({
    mode: 'onSubmit',
    reValidateMode: 'onSubmit',
    resolver: zodResolver(zCttNormsVersion()),
    defaultValues: initialValues,
  });

  return (
    <Form {...form} {...props} initialValues={initialValues} className="w-full">
      <DevnutSection.Grid className="gap-6 lg:grid-cols-3">
        <Card className="h-full">
          <CardHeader>
            <CardTitle>General</CardTitle>
          </CardHeader>
          <CardContent>
            <DevnutSection.Grid className="gap-6">
              <FormField label="Name" required>
                <FormFieldController name="name" type="text" />
              </FormField>

              <FormField label="Active" required>
                <FormFieldController type="select" name="is_active" options={valueOptions.active} />
              </FormField>

              <FormField label="Description">
                <FormFieldController
                  name="description"
                  type="textarea"
                  rows={5}
                  placeholder="Optional notes about this version..."
                />
              </FormField>
            </DevnutSection.Grid>
          </CardContent>
        </Card>

        <DevnutSection.Grid className="gap-6 col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Normative values</CardTitle>
              <CardDescription>
                Define the average and SD for each scale. These values are immutable after creation.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FormField>
                <FormFieldController
                  type="list"
                  name="norms"
                  min={1}
                  disabled={isEdit}
                  defaultItem={{ name: '', scaleCode: '', average: 0, sd: 1 }}
                  addButtonLabel="Add scale"
                  // Names each row group so the repeated fields can be told apart (WCAG 1.3.1)
                  itemLabel="Scale"
                >
                  {(index) => <NormRowFields namePrefix={`norms.${index}`} readonly={isEdit} />}
                </FormFieldController>
              </FormField>
            </CardContent>
          </Card>
        </DevnutSection.Grid>
      </DevnutSection.Grid>
    </Form>
  );
};
