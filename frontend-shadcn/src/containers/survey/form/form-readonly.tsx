import { DevnutButton } from '@/components/DevnutButton';
import DevnutSection from '@/components/DevnutSection';
import { Form } from '@/components/form/form';
import { FormSubmitter } from '@/components/form/form-submitter';
import type { FormProps } from '@/components/FormContainer';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { useCrudDataTable } from '@/hooks/useCrudDataTable';
import { AlertTriangleIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  GeneralFields,
  RemindersFields,
  SendingFields,
  StatusField,
  UserField,
} from '../_components/survey-fields';
import { useSurveyForm } from '../_hooks/useSurveyForm';

interface ReadOnlyFormProps extends FormProps {
  onEdit?: () => void;
}

export const ReadOnlyForm = ({ initialValues, readonly, onEdit, ...props }: ReadOnlyFormProps) => {
  const { t } = useTranslation(['survey', 'common']);
  const { handleBack } = useCrudDataTable();
  const { form, isAnonymousSpontaneous, isCompleted } = useSurveyForm(initialValues);

  return (
    <DevnutSection.Grid className="gap-2">
      {isAnonymousSpontaneous && (
        <Alert className="italic border-amber-200 bg-amber-50 text-amber-900">
          <AlertTriangleIcon />
          <AlertTitle>{t('form.sending_disabled_unidentified.label')}</AlertTitle>
        </Alert>
      )}
      <Form
        {...form}
        {...props}
        readonly={readonly}
        initialValues={initialValues}
        className="w-full"
        submitter={{
          ...props.submitter,
          render: () => {
            if (!isCompleted) {
              return (
                <FormSubmitter type="default" showInReadOnly={true} onBack={handleBack}>
                  <DevnutButton type="button" variant="secondary" onClick={onEdit}>
                    {t('common:crud_data_table.actions.edit')}
                  </DevnutButton>
                </FormSubmitter>
              );
            }
          },
        }}
      >
        <DevnutSection.Grid>
          <GeneralFields />

          <SendingFields control={form.control} />

          <RemindersFields control={form.control} />

          <StatusField />

          <UserField />

          <DevnutSection.Grid className="grid-cols-2 text-center">
            <Card
              value={initialValues?.questionnaires?.length}
              description={t('form.questionnaire_count', 'Questionnaires')}
            />
            <Card
              value={initialValues?.overallStats?.length ?? 0}
              description={t('form.completions_count', 'Questionnaires completed')}
            />
          </DevnutSection.Grid>
        </DevnutSection.Grid>
      </Form>
    </DevnutSection.Grid>
  );
};

interface CardProps {
  value: number;
  description: string;
}

const Card = ({ value, description }: CardProps) => {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-2xl font-bold text-primary">{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{description}</p>
    </div>
  );
};
