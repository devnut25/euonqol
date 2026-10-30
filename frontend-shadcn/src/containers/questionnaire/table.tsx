import apiClient from '@/api/client';
import { CrudDataTable } from '@/components/CrudDataTable';
import DevnutSection from '@/components/DevnutSection';
import { ModuleTypeBadge } from '@/components/ModuleTypeBadge';
import { Alert, AlertTitle } from '@/components/ui/alert';
import type { Values } from '@/hooks/useCrudDataTable';
import { AccessModeEnum, type QuestionnaireStatusEnum, SurveyStatusEnum } from '@/utils/enum';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangleIcon, Globe, Info } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { QuestionnaireDetailDrawer } from './_components/detail-drawer';
import { PublicLinkManager } from './_components/public-link-manager';
import { StatusBadge } from './_components/status-badge';
import { QuestionnaireForm } from './form';

interface QuestionnaireTableProps {
  surveyId: string | number;
  surveyAccessMode?: string;
  surveyStatus?: string;
  parentBreadcrumbs?: { label: string; onClick?: () => void }[];
}

export const QuestionnaireTable = ({
  surveyId,
  surveyAccessMode,
  surveyStatus,
  parentBreadcrumbs,
}: QuestionnaireTableProps) => {
  const { t } = useTranslation(['questionnaire']);

  const [previewId, setPreviewId] = useState<string | number | null>(null);
  const [linkModalId, setLinkModalId] = useState<string | number | null>(null);
  const [questionnairesTotal, setQuestionnairesTotal] = useState(0);

  const isAnonymousSpontaneous = surveyAccessMode === AccessModeEnum.AnonymousSpontaneous;
  const linkReloadRef = useRef<(() => void) | null>(null);

  // A questionnaire can only be created once the survey has at least one presentation,
  // one active eligibility question, one active privacy policy and one closing message
  // set up (Info & Consent is optional). Default to "not ready" (disabled) until the check
  // resolves, rather than briefly allowing a click that the backend would reject anyway.
  const [prerequisitesMet, setPrerequisitesMet] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get(`/surveys/${surveyId}/prerequisites`)
      .then((res) => {
        if (!cancelled) setPrerequisitesMet(!!res.data?.data?.canCreateQuestionnaire);
      })
      .catch(() => {
        if (!cancelled) setPrerequisitesMet(false);
      });
    return () => {
      cancelled = true;
    };
  }, [surveyId]);

  const columns: ColumnDef<Values>[] = [
    {
      id: 'title',
      header: t('columns.name', 'Name'),
      accessorKey: 'title',
      meta: { searchable: true, mobileCardRole: 'title', mobileCardOrder: 1 },
    },
    {
      id: 'patientGroup',
      header: t('header_columns.group'),
      accessorKey: 'patient_group.name',
      enableSorting: false,
      meta: { mobileCardRole: 'subtitle', mobileCardOrder: 2 },
      cell: ({ row }) => {
        const name = row.getValue('patientGroup');
        const desc = row.original.patient_group.description;
        return <>{`${name} - ${desc}`}</>;
      },
    },
    {
      id: 'type',
      header: t('columns.type', 'Type'),
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
      header: t('header_columns.created_at'),
      accessorKey: 'created_at',
      enableSorting: false,
      meta: {
        valueType: 'date',
        hideInMobile: true,
      },
    },
    {
      id: 'assignmentCount',
      header: t('columns.completions', 'Completions'),
      accessorKey: 'assignmentCount',
      enableSorting: false,
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
      header: t('columns.inProgress', 'Pending (not submitted)'),
      accessorKey: 'inProgressCount',
      enableSorting: false,
      cell: ({ row }) => {
        const count = (row.getValue('inProgressCount') as number) ?? 0;
        return <span className="tabular-nums text-muted-foreground">{count}</span>;
      },
    },
    {
      id: 'status',
      header: t('header_columns.status'),
      accessorKey: 'status',
      meta: {
        mobileCardRole: 'trailing',
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
      <DevnutSection.Grid>
        <CrudDataTable
          title={t('title')}
          columns={columns}
          form={QuestionnaireForm}
          formProps={{ surveyAccessMode, surveyStatus, parentBreadcrumbs }}
          createButtonProps={{
            disabled: !prerequisitesMet || (isAnonymousSpontaneous && questionnairesTotal > 0),
            title: !prerequisitesMet
              ? t('messages.prerequisites_missing')
              : isAnonymousSpontaneous
                ? t('messages.anonymous_spontaneous_limit')
                : undefined,
          }}
          // Questionnaires can be removed only while the survey is still a draft;
          // per-row rules (no assignments) come from row.authorizations.delete
          deleteButtonConfig={{
            visible: () => surveyStatus === SurveyStatusEnum.Draft,
            confirmTitle: t('messages.delete_confirm_title'),
            confirmDescription: t('messages.delete_confirm_description'),
          }}
          className="pt-0"
          url={`/surveys/${surveyId}/questionnaires`}
          onMetaChange={(meta) => setQuestionnairesTotal(meta.total ?? 0)}
          parentBreadcrumbs={parentBreadcrumbs}
          // Only the email-templates tab is a true drill-down page (type="default"),
          // so it's the only one that should replace this breadcrumb with its own.
          // Assignments is a `type="modal"` overlay (AssignmentTable) — it must NOT
          // be listed here, otherwise opening/closing its dialog would hide and
          // re-show this breadcrumb for no reason (the underlying page never changes).
          childIdKeys={['email_template_id']}
          // No detail to open for anonymous/spontaneous surveys: a no-op onRowClick would still
          // render a focusable "View" button on every row that does nothing (WCAG 4.1.2)
          disableRowClick={isAnonymousSpontaneous}
          renderBeforeTable={() => (
            <>
              {!prerequisitesMet && (
                <Alert className="rounded-md bg-amber-50 border border-amber-200 text-amber-800">
                  <AlertTriangleIcon />
                  <AlertTitle className="line-clamp-none">{t('messages.prerequisites_missing')}</AlertTitle>
                </Alert>
              )}
              {isAnonymousSpontaneous && (
                <Alert className="rounded-md bg-amber-50 border border-amber-200 text-amber-800">
                  <AlertTriangleIcon />
                  <AlertTitle className="line-clamp-none">{t('messages.anonymous_spontaneous_limit')}</AlertTitle>
                </Alert>
              )}
            </>
          )}
          actionsConfig={[
            {
              id: 'preview',
              label: t('actions.info'),
              icon: Info,
              onClick: (row) => setPreviewId(row.id),
            },
            ...(isAnonymousSpontaneous
              ? [
                  {
                    id: 'public-link',
                    label: 'Public link',
                    icon: Globe,
                    onClick: (row: Values, reload: () => void) => {
                      linkReloadRef.current = reload;
                      setLinkModalId(row.id);
                    },
                  },
                ]
              : []),
          ]}
        />
      </DevnutSection.Grid>

      <QuestionnaireDetailDrawer
        open={!!previewId}
        questionnaireId={previewId}
        onClose={() => setPreviewId(null)}
        width={1100}
      />

      {linkModalId && (
        <PublicLinkManager
          open
          onClose={() => setLinkModalId(null)}
          surveyId={surveyId}
          questionnaireId={linkModalId}
          onLinkChange={() => linkReloadRef.current?.()}
        />
      )}
    </>
  );
};
