import { CrudDataTable } from '@/components/CrudDataTable';
import { SectionInfoModal } from '@/components/SectionInfoModal';
import { QuestionnaireTable } from '@/containers/questionnaire/table';
import { useAuth } from '@/hooks/useAuth';
import type { Values } from '@/hooks/useCrudDataTable';
import { SurveyStatusEnum } from '@/utils/enum';
import type { ColumnDef } from '@tanstack/react-table';
import { Share2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ClosingMessagesTable } from '../closing-messages/table';
import { EligibilityTable } from '../eligibility/table';
import { PresentationTable } from '../presentation/table';
import { PrivacyPolicyTable } from '../privacy-policies/table';
import { StudyInfoSheetTable } from '../study-info-sheet/table';
import { StatusBadge } from './_components/status-badge';
import { SurveyShareModal } from './_components/survey-shere-modal';
import { SurveyForm } from './form';

export const SurveyTable = () => {
  const { t } = useTranslation(['survey']);
  const { user } = useAuth();

  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [sharingSurvey, setSharingSurvey] = useState<{ id: number | string; name: string } | null>(
    null
  );

  const columns: ColumnDef<Values>[] = [
    {
      id: 'name',
      header: t('header_columns.name'),
      accessorKey: 'name',
      meta: {
        searchable: true,
        mobileCardRole: 'title',
        mobileCardOrder: 1,
      },
    },
    {
      id: 'access_mode',
      header: t('header_columns.access_mode'),
      accessorKey: 'access_mode',
      enableSorting: false,
      meta: {
        hideInMobile: true,
        valueEnum: 'accessMode',
      },
    },
    {
      id: 'questionnaireCount',
      header: t('header_columns.questionnaires'),
      accessorKey: 'questionnaireCount',
      meta: {
        valueType: 'number',
        hideInMobile: true,
      },
    },
    {
      id: 'starting_date',
      header: t('header_columns.starting_date'),
      accessorKey: 'starting_date',
      enableSorting: false,
      meta: {
        valueType: 'date',
      },
    },
    {
      id: 'end_date',
      header: t('header_columns.end_date'),
      accessorKey: 'end_date',
      enableSorting: false,
      meta: {
        valueType: 'date',
      },
    },
    {
      id: 'status',
      header: t('header_columns.status'),
      accessorKey: 'status',
      enableSorting: false,
      meta: {
        filterVariant: 'select',
        filterMode: 'multiple',
        filterable: true,
        showAllOption: false,
        filterEnum: 'surveyStatus',
        mobileCardRole: 'leading',
      },
      cell: ({ row }) => {
        const status = row.getValue('status') as string;
        return <StatusBadge status={status} />;
      },
    },
  ];

  const infoItems = [
    {
      heading: 'Create a survey',
      description:
        'Add a new survey and configure its name, dates, access mode and completion limits.',
    },
    {
      heading: 'Manage questionnaires',
      description:
        'Open a survey to assign questionnaires, preview questions and track assignments.',
    },
    {
      heading: 'Pre-Flow Configuration',
      description:
        'Set up presentations, eligibility questions and privacy & consent policies that patients see before starting the survey.',
    },
    {
      heading: 'Share',
      description:
        'Generate and share access links for identified, traceable or anonymous participation.',
    },
    {
      heading: 'Duplicate',
      description: 'Clone an existing survey to reuse its structure without copying assignments.',
    },
  ];

  return (
    <>
      <CrudDataTable
        showDuplicate
        url="/surveys"
        title={t('title')}
        columns={columns}
        form={SurveyForm}
        defaultParams={{ status: [SurveyStatusEnum.Draft, SurveyStatusEnum.Public] }}
        createButtonLabel={t('buttons.values.add')}
        titleAddon={<SectionInfoModal title="Survey" items={infoItems} />}
        hideBuiltinActions={['edit']} //TODO: da fixare usando le policy come risposta dal backend
        tabs={(item: Values) => [
          {
            key: 'presentation',
            label: t('tabs.presentation', 'Presentation'),
            children: ({ parentBreadcrumbs }) => (
              <PresentationTable surveyId={item.id} parentBreadcrumbs={parentBreadcrumbs} />
            ),
          },
          {
            key: 'eligibility',
            label: t('tabs.eligibility', 'Eligibility'),
            children: <EligibilityTable survey={item} />,
          },
          {
            key: 'privacy',
            label: t('tabs.privacy', 'Privacy Policy'),
            children: ({ parentBreadcrumbs }) => (
              <PrivacyPolicyTable survey={item} parentBreadcrumbs={parentBreadcrumbs} />
            ),
          },
          {
            key: 'study-info-sheet',
            label: t('tabs.study_info_sheet', 'Info & Consent'),
            children: ({ parentBreadcrumbs }) => (
              <StudyInfoSheetTable surveyId={item.id} parentBreadcrumbs={parentBreadcrumbs} />
            ),
          },
          {
            key: 'closing-messages',
            label: t('tabs.closing_messages', 'Closing Messages'),
            children: (
              <ClosingMessagesTable
                surveyId={item.id}
                surveyCompleted={item.status === SurveyStatusEnum.Completed}
              />
            ),
          },
          {
            key: 'questionnaire',
            label: t('tabs.questionnaires', 'Questionnaires'),
            children: ({ parentBreadcrumbs }) => (
              <QuestionnaireTable
                surveyId={item.id}
                surveyAccessMode={item.access_mode}
                surveyStatus={item.status}
                parentBreadcrumbs={parentBreadcrumbs}
              />
            ),
          },
        ]}
        actionsConfig={[
          {
            id: 'share',
            label: t('actions.share', 'Share'),
            icon: Share2,
            visible: (row) => user?.user_type === 'admin' || row.isOwner === true,
            onClick: (row) => {
              setSharingSurvey({ id: row.id as number | string, name: row.name as string });
              setShareModalOpen(true);
            },
          },
        ]}
      />

      {sharingSurvey && (
        <SurveyShareModal
          open={shareModalOpen}
          onOpenChange={setShareModalOpen}
          surveyId={sharingSurvey.id}
          surveyName={sharingSurvey.name}
        />
      )}
    </>
  );
};
