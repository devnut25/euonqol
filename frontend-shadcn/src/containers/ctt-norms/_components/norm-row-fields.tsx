import { DevnutListRemoveButton } from '@/components/DevnutList';
import DevnutSection from '@/components/DevnutSection';
import { FormField } from '@/components/form/form-field';
import { FormFieldController } from '@/components/form/form-field-controller';

interface NormRowFieldsProps {
  namePrefix: string;
  readonly?: boolean;
}

export const NormRowFields = ({ namePrefix, readonly }: NormRowFieldsProps) => (
  <div className="flex flex-col gap-2 border rounded-md p-3 bg-muted/30 w-full">
    <DevnutSection.Grid className="grid-cols-2 2xl:grid-cols-4">
      <FormField label="Scale name" required>
        <FormFieldController
          type="text"
          name={`${namePrefix}.name`}
          placeholder="e.g. Physical Symptoms"
          readonly={readonly}
        />
      </FormField>

      <FormField label="Scale code" required>
        <FormFieldController
          type="text"
          name={`${namePrefix}.scaleCode`}
          placeholder="e.g. PS_S"
          readonly={readonly}
        />
      </FormField>

      <FormField label="Average" required>
        <FormFieldController type="number" name={`${namePrefix}.average`} readonly={readonly} />
      </FormField>

      <FormField label="SD" required>
        <FormFieldController type="number" name={`${namePrefix}.sd`} readonly={readonly} />
      </FormField>
    </DevnutSection.Grid>
    <DevnutListRemoveButton />
  </div>
);
