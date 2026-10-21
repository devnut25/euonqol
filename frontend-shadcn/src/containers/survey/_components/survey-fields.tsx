import { FormField } from '@/components/form/form-field';
import { FormFieldController } from '@/components/form/form-field-controller';
import type { Survey } from '@/features/schema/survey/schema';
import { useFormReadOnly } from '@/hooks/useFormReadOnly';
import { useValueEnum } from '@/hooks/useValueEnum';
import { SendModeEnum } from '@/utils/enum';
import { useFormContext, useWatch, type Control } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

interface FieldControlProps {
  control: Control<Survey>;
}

export function UserField() {
  const { t } = useTranslation(['survey']);
  return (
    <>
      <FormField label={t('form.full_name', 'Created by')}>
        <FormFieldController type="text" name="full_name" readonly />
      </FormField>
      <FormField label={t('form.created_at', 'Created at')}>
        <FormFieldController type="date" name="created_at" readonly />
      </FormField>
      <FormField label={t('form.updated_at', 'Last updated')}>
        <FormFieldController type="date" name="updated_at" readonly />
      </FormField>
    </>
  );
}

interface GeneralFieldsProps {
  isEdit?: boolean;
  disabled?: boolean;
}

export function GeneralFields({ isEdit = false, disabled }: GeneralFieldsProps) {
  const { t } = useTranslation(['survey']);
  const { valueOptions } = useValueEnum();
  const { setValue, control } = useFormContext<Survey>();

  const startingDateValue = useWatch({ control, name: 'starting_date' });

  return (
    <>
      <FormField label={t('form.name.label')} required>
        <FormFieldController name="name" type="text" disabled={disabled} />
      </FormField>

      <FormField label={t('form.starting_date.label')} required>
        <FormFieldController
          name="starting_date"
          type="date"
          disabled={disabled}
          minDate={isEdit ? undefined : new Date()}
        />
      </FormField>

      <FormField label={t('form.end_date.label')} required>
        <FormFieldController
          name="end_date"
          type="date"
          disabled={disabled}
          minDate={startingDateValue || undefined}
        />
      </FormField>

      <FormField label={t('form.access_mode.label')} required>
        <FormFieldController
          type="select"
          name="access_mode"
          options={valueOptions.accessMode}
          disabled={disabled || isEdit}
          onValueChange={() => {
            setValue('send_mode', 'manual');
            setValue('send_delay_hours', null);
            setValue('send_scheduled_at', null);
            setValue('reminder', null);
            setValue('frequency', null);
            setValue('frequency_tipology', null);
            setValue('reminder_max_count', null);
          }}
        />
      </FormField>
    </>
  );
}

interface SendingFieldsProps extends FieldControlProps {
  disabled?: boolean;
}

export function SendingFields({ control, disabled }: SendingFieldsProps) {
  const { t } = useTranslation(['survey']);
  const { valueOptions } = useValueEnum();

  const sendModeValue = useWatch({ control, name: 'send_mode' });

  return (
    <>
      <FormField label={t('form.send_mode.label')} required>
        <FormFieldController
          type="select"
          name="send_mode"
          options={valueOptions.sendMode}
          disabled={disabled}
        />
      </FormField>

      {sendModeValue === SendModeEnum.AfterDelay && (
        <FormField label={t('form.send_delay_hours.label')} required>
          <FormFieldController
            name="send_delay_hours"
            type="number"
            disabled={disabled}
            withControls
            integerOnly
          />
        </FormField>
      )}

      {sendModeValue === SendModeEnum.Scheduled && (
        <FormField label={t('form.send_scheduled_at.label')} required>
          <FormFieldController name="send_scheduled_at" type="datetime-local" disabled={disabled} />
        </FormField>
      )}
    </>
  );
}

interface RemindersFieldsProps extends FieldControlProps {
  disabled?: boolean;
}

export function RemindersFields({ control, disabled }: RemindersFieldsProps) {
  const { t } = useTranslation(['survey']);
  const { valueOptions } = useValueEnum();
  const { setValue } = useFormContext<Survey>();

  const reminderValue = useWatch({ control, name: 'reminder' });

  return (
    <>
      <FormField label={t('form.reminder.label')} required>
        <FormFieldController
          type="select"
          name="reminder"
          options={valueOptions.booleanReverse}
          disabled={disabled}
          onValueChange={(value) => {
            const isYes = value === 'true';
            // Unmounting the fields below doesn't clear their RHF values (no
            // shouldUnregister) — without this, switching reminder back to "No"
            // (e.g. after duplicating a survey that had it "Yes") would still
            // submit the old frequency/frequency_tipology/reminder_max_count.
            if (!isYes) {
              setValue('frequency', null);
              setValue('frequency_tipology', null);
              setValue('reminder_max_count', null);
            }
          }}
        />
      </FormField>

      {reminderValue && (
        <>
          <FormField label={t('form.frequency_tipology.label')} required>
            <FormFieldController
              type="select"
              name="frequency_tipology"
              options={valueOptions.frequencyTipology}
              disabled={disabled}
            />
          </FormField>
          <FormField label={t('form.frequency.label')} required>
            <FormFieldController
              type="number"
              name="frequency"
              disabled={disabled}
              withControls
              integerOnly
            />
          </FormField>
          <FormField label={t('form.reminder_max_count.label')}>
            <FormFieldController name="reminder_max_count" type="number" disabled={disabled} />
          </FormField>
        </>
      )}
    </>
  );
}

interface StatusFieldProps {
  disabled?: boolean;
  /** The survey's currently-persisted status — determines which target statuses
   * are legal to pick from the dropdown (mirrors backend/src/helpers/statusTransitions.ts).
   * draft->public still shows here for visibility, but is actually carried out via
   * the dedicated publish flow (see form-editable.tsx), not a plain status write. */
  currentStatus?: string;
}

const NEXT_SURVEY_STATUS: Record<string, string[]> = {
  draft: ['draft', 'public'],
  public: ['public', 'disabled'],
  disabled: ['disabled', 'public'],
  completed: ['completed'],
};

export function StatusField({ disabled, currentStatus }: StatusFieldProps) {
  const { t } = useTranslation(['survey']);
  const { valueOptions } = useValueEnum();

  const isReadOnly = useFormReadOnly();

  // In readOnly mode il campo mostra solo il valore attualmente persistito, non un input
  // per una nuova transizione: servono TUTTE le options per risolvere correttamente la
  // label dello status corrente (es. "completed"), anche quando quello status non compare
  // fra le transizioni legali future e verrebbe escluso dal filtro sotto.
  const allowedStatuses = NEXT_SURVEY_STATUS[currentStatus ?? 'draft'] ?? [currentStatus];
  const options = isReadOnly
    ? valueOptions.surveyStatus
    : // In modalità editabile invece il campo è un vero picker: le options vanno ristrette
      // alle sole transizioni legali dallo stato corrente (mirror di
      // backend/src/helpers/statusTransitions.ts), per impedire scelte non valide.
      valueOptions.surveyStatus?.filter((opt: { value: string }) =>
        allowedStatuses.includes(opt.value)
      );

  return (
    <FormField label={t('form.status', 'Status')}>
      <FormFieldController type="select" name="status" options={options} disabled={disabled} />
    </FormField>
  );
}
