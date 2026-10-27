import { CrudDataTable } from '@/components/CrudDataTable';
import { ModuleTypeBadge } from '@/components/ModuleTypeBadge';
import { QuestionnaireDetailDrawer } from '@/containers/questionnaire/_components/detail-drawer';
import { StatusBadge } from '@/containers/questionnaire/_components/status-badge';
import type { Values } from '@/hooks/useCrudDataTable';
import type { QuestionnaireStatusEnum } from '@/utils/enum';
import type { ColumnDef } from '@tanstack/react-table';
import { Info } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface NormQuestionnaireTableProps {
  normId: string | number;
}

/** Read-only list of the questionnaires that use a CTT norms version. */
export function NormQuestionnaireTable({ normId }: NormQuestionnaireTableProps) {
  const { t } = useTranslation(['settings', 'questionnaire']);
  const [previewId, setPreviewId] = useState<string | number | null>(null);

  const columns: ColumnDef<Values>[] = [
    {
      id: 'title',
      header: t('questionnaire:columns.name', 'Name'),
      accessorKey: 'title',
      meta: { searchable: true },
    },
    {
      id: 'survey',
      header: t('ctt_norms.columns.survey'),
      accessorKey: 'survey.name',
      enableSorting: false,
    },
    {
      id: 'patientGroup',
      header: t('questionnaire:header_columns.group'),
      accessorKey: 'patient_group.name',
      enableSorting: false,
      cell: ({ row }) => {
        const name = row.getValue('patientGroup');
        const desc = row.original.patient_group.description;
        return <>{`${name} - ${desc}`}</>;
      },
    },
    {
      id: 'type',
      header: t('questionnaire:columns.type', 'Type'),
      accessorKey: 'type',
      cell: ({ row }) => (
        <ModuleTypeBadge
          type={row.getValue('type') as string}
          className="min-w-[90px] justify-center"
        />
      ),
    },
    {
      id: 'created_at',
      header: t('questionnaire:header_columns.created_at'),
      accessorKey: 'created_at',
      enableSorting: false,
      meta: {
        valueType: 'date',
      },
    },
    {
      id: 'assignmentCount',
      header: t('questionnaire:columns.completions', 'Completions'),
      accessorKey: 'assignmentCount',
      enableSorting: false,
      meta: {
        hideInMobile: true,
      },
      cell: ({ row }) => {
        const count = (row.getValue('assignmentCount') as number) ?? 0;
        const maxCompletions = row.original?.max_completions as number | null | undefined;
        return (
          <div className="flex items-center gap-1.5 text-sm">
            {maxCompletions ? (
              <span className="tabular-nums font-medium">
                {count}
                <span className="text-muted-foreground font-normal">/{maxCompletions}</span>
              </span>
            ) : (
              <span className="tabular-nums text-muted-foreground">{count}</span>
            )}
          </div>
        );
      },
    },
    {
      id: 'inProgressCount',
      header: t('questionnaire:columns.inProgress', 'Pending (not submitted)'),
      accessorKey: 'inProgressCount',
      enableSorting: false,
      meta: {
        hideInMobile: true,
      },
      cell: ({ row }) => {
        const count = (row.getValue('inProgressCount') as number) ?? 0;
        return <span className="tabular-nums text-muted-foreground">{count}</span>;
      },
    },
    {
      id: 'status',
      header: t('questionnaire:header_columns.status'),
      accessorKey: 'status',
      meta: {
        filterVariant: 'select',
        filterable: true,
        filterEnum: 'questionnaireStatus',
      },
      cell: ({ row }) => {
        const status = row.getValue('status') as QuestionnaireStatusEnum;
        return <StatusBadge status={status} />;
      },
    },
  ];

  return (
    <>
      <CrudDataTable
        hideCreateButton
        disableRowClick
        className="p-0"
        keyName="ctt_norm_questionnaires"
        title={t('ctt_norms.detail.questionnaires')}
        url={`/ctt-norms/${normId}/questionnaires`}
        columns={columns}
        hideBuiltinActions={['edit', 'delete']}
        actionsConfig={[
          {
            id: 'preview',
            label: t('questionnaire:actions.info'),
            icon: Info,
            onClick: (row) => setPreviewId(row.id),
          },
        ]}
      />

      <QuestionnaireDetailDrawer
        open={!!previewId}
        questionnaireId={previewId}
        onClose={() => setPreviewId(null)}
        width={1100}
      />
    </>
  );
}
