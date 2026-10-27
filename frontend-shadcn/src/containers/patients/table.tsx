import { CrudDataTable } from '@/components/CrudDataTable';
import { PatientGroupBadge } from '@/components/PatientGroupBadge';
import { SectionInfoModal } from '@/components/SectionInfoModal';
import type { Values } from '@/hooks/useCrudDataTable';
import type { ColumnDef } from '@tanstack/react-table';
import { useTranslation } from 'react-i18next';

export const PatientsTable = () => {
  const { t } = useTranslation(['patients']);

  const columns: ColumnDef<Values>[] = [
    {
      id: 'patientId',
      header: t('header_columns.patient_id'),
      accessorKey: 'patientId',
      enableSorting: false,
      meta: {
        searchable: true,
        mobileCardRole: 'title',
        mobileCardOrder: 1,
      },
    },
    {
      id: 'isAnonymous',
      header: t('header_columns.type'),
      accessorKey: 'isAnonymous',
      enableSorting: false,
      meta: {
        filterable: true,
        filterVariant: 'switch',
        filterEnum: 'patientAnonymousFilter',
        mobileCardRole: 'leading',
        hideInMobile: true,
        hideInTable: true,
      },
    },
    {
      id: 'mail',
      header: t('header_columns.mail'),
      accessorKey: 'mail',
      enableSorting: false,
      meta: {
        mobileCardRole: 'subtitle',
        mobileCardOrder: 2,
      },
    },
    {
      id: 'survey',
      header: t('header_columns.survey'),
      accessorKey: 'survey.name',
      enableSorting: false,
      meta: { mobileCardOrder: 1 },
    },
    {
      id: 'questionnaire',
      header: t('header_columns.questionnaire'),
      accessorKey: 'questionnaire.title',
      enableSorting: false,
      meta: { mobileCardOrder: 2 },
    },
    {
      id: 'patientGroup',
      header: t('header_columns.patient_group'),
      accessorKey: 'questionnaire.patientGroup.name',
      enableSorting: false,
      cell: ({ row }) => {
        const name = row.getValue<string>('patientGroup');
        const desc = row.original.questionnaire?.patientGroup?.description;
        return <PatientGroupBadge name={name} description={desc} />;
      },
      meta: {
        filterable: true,
        filterVariant: 'apiSelect',
        filterUrl: '/patient-groups',
        mobileCardRole: 'trailing',
      },
    },
    {
      id: 'createdAt',
      header: t('header_columns.assigned_at'),
      accessorKey: 'createdAt',
      meta: { valueType: 'date', mobileCardOrder: 4 },
    },
    {
      id: 'completedAt',
      header: t('header_columns.completed_at'),
      accessorKey: 'completedAt',
      enableSorting: false,
      meta: { valueType: 'date', mobileCardOrder: 5 },
    },
    {
      id: 'privacyAccepted',
      header: t('header_columns.privacy'),
      accessorKey: 'privacyAccepted',
      enableSorting: false,
      meta: { valueType: 'boolean', mobileCardRole: 'leading' },
    },
  ];

  const infoItems = [
    {
      heading: 'Overview',
      description:
        'Read-only view of all participants enrolled in questionnaires. To add participants, go to the Assignments page of the relevant questionnaire.',
    },
    {
      heading: 'Anonymous submissions',
      description:
        'Use the Type filter to browse anonymous responses collected from public links, without a linked patient profile.',
    },
  ];

  return (
    <CrudDataTable
      type="default"
      url="/patients"
      columns={columns}
      title={t('title', 'Participants')}
      titleAddon={<SectionInfoModal title="Participants" items={infoItems} />}
      disableRowClick
      hideCreateButton
      hideActionsColumn
    />
  );
};
