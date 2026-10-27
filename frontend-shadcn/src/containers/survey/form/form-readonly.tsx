import { DevnutButton } from '@/components/DevnutButton';
import DevnutSection from '@/components/DevnutSection';
import { Form } from '@/components/form/form';
import { FormSubmitter } from '@/components/form/form-submitter';
import type { FormProps } from '@/components/FormContainer';
import { Alert, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useCrudDataTable } from '@/hooks/useCrudDataTable';
import { SurveyStatusEnum } from '@/utils/enum';
import { AlertTriangleIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  GeneralFields,
  RemindersFields,
  SendingFields,
  StatusField,
  UserField,
} from '../_components/survey-fields';
import { usePublishSurvey } from '../_hooks/usePublishSurvey';
import { useSurveyForm } from '../_hooks/useSurveyForm';

interface ReadOnlyFormProps extends FormProps {
  onEdit?: () => void;
}

export const ReadOnlyForm = ({ initialValues, readonly, onEdit, ...props }: ReadOnlyFormProps) => {
  const { t } = useTranslation(['survey', 'common']);
  const { handleBack, reloadTable } = useCrudDataTable();
  const { form, isAnonymousSpontaneous, isCompleted } = useSurveyForm(initialValues);
  const { publish, isPublishing } = usePublishSurvey();
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);

  const canPublish = initialValues?.status === SurveyStatusEnum.Draft && !!initialValues?.id;

  const handlePublish = async () => {
    await publish(initialValues!.id, reloadTable);
    setPublishConfirmOpen(false);
  };

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
                  {canPublish && (
                    <DevnutButton
                      type="button"
                      variant="outline"
                      loading={isPublishing}
                      onClick={() => setPublishConfirmOpen(true)}
                    >
                      {t('actions.publish')}
                    </DevnutButton>
                  )}
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

      <AlertDialog open={publishConfirmOpen} onOpenChange={setPublishConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('actions.publish_confirm_title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('actions.publish_confirm_description')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPublishing}>
              {t('common:crud_data_table.actions.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isPublishing}
              onClick={(e) => {
                // Keep the dialog open until the request settles.
                e.preventDefault();
                handlePublish();
              }}
            >
              {t('actions.publish')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
