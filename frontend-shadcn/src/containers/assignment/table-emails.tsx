import { CrudDataTable } from '@/components/CrudDataTable';
import type { Values } from '@/hooks/useCrudDataTable';
import { QuestionnaireStatusEnum, SurveyStatusEnum } from '@/utils/enum';
import type { ColumnDef } from '@tanstack/react-table';
import { useTranslation } from 'react-i18next';
import { EmailTemplateForm } from './email-template-form';

interface EmailTemplatesTableProps {
  surveyId: string;
  questionnaireId: string;
  surveyStatus?: string;
  questionnaireStatus?: string;
  onTemplatesChanged?: () => void;
  parentBreadcrumbs?: { label: string; onClick?: () => void }[];
}

export const EmailTemplatesTable = ({
  surveyId,
  questionnaireId,
  surveyStatus,
  questionnaireStatus,
  onTemplatesChanged,
  parentBreadcrumbs,
}: EmailTemplatesTableProps) => {
  const { t } = useTranslation(['emailTemplates']);

  const isCompleted =
    surveyStatus === SurveyStatusEnum.Completed ||
    questionnaireStatus === QuestionnaireStatusEnum.Completed;

  const columns: ColumnDef<Values>[] = [
    {
      id: 'language',
      header: t('header_columns.language'),
      accessorKey: 'language.language',
      meta: { valueType: 'languageFallback' },
    },
    {
      id: 'subject',
      header: t('header_columns.subject'),
      accessorKey: 'subject',
      enableSorting: false,
      meta: {
        searchable: true,
      },
    },
    {
      id: 'body',
      header: t('header_columns.body'),
      accessorKey: 'body',
      enableSorting: false,
      meta: {
        valueType: 'longTextHtml',
      },
    },
  ];

  return (
    <CrudDataTable
      // type="modal"
      className="p-0"
      columns={columns}
      title={t('title')}
      keyName="email_template"
      keyField="language_id"
      form={EmailTemplateForm}
      createButtonProps={{ disabled: isCompleted }}
      url={`/surveys/${surveyId}/questionnaires/${questionnaireId}/email-templates`}
      onSuccess={() => onTemplatesChanged?.()}
      parentBreadcrumbs={parentBreadcrumbs}
      fallbackToggleConfig={{
        url: (row) =>
          `/surveys/${surveyId}/questionnaires/${questionnaireId}/email-templates/${row.language_id}/fallback`,
        confirmTitle: t('module.actions.toggle_fallback_confirm_title'),
        confirmDescription: t('module.actions.toggle_fallback_confirm_description'),
      }}
    />
  );
};
