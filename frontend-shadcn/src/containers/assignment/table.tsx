import { SimpleTooltip } from '@/components/ui/tooltip';
import { DevnutDeleteButton } from '@/components/buttons/devnut-delete-button';
import { CrudDataTable } from '@/components/CrudDataTable';
import { DevnutButton } from '@/components/DevnutButton';
import { DevnutSelect } from '@/components/DevnutSelect';
import { DevnutToast } from '@/components/DevnutToast';
import { QrCodeContent } from '@/components/QrCodeContent';
import { Alert, AlertTitle } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ExcelImportModal } from '@/containers/survey/ExcelImportModal';
import { type EmailTemplate } from '@/features/schema/email-template/schema';
import { useApi } from '@/hooks/useApi';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import type { Values } from '@/hooks/useCrudDataTable';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { CARD_ACTION_LAYOUT_CLASS, CARD_ACTION_OUTLINE_CLASS } from '@/lib/dataTableActions';
import { cn } from '@/lib/tailwind/utils';
import type { TableAction } from '@/types/dataTableAction';
import { QuestionnaireStatusEnum, SurveyStatusEnum } from '@/utils/enum';
import type { ColumnDef } from '@tanstack/react-table';
import {
  AlertTriangleIcon,
  ClipboardCopy,
  History,
  Loader2,
  Mail,
  QrCode,
  Users,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { EmailHistoryDialog } from './_components/email-history-dialog';
import { ScheduledRemindersCell } from './_components/scheduled-reminders-cell';
import { AssignmentStatusBadge, type Assignment } from './_components/status-badge';
import { PatientAssignmentForm } from './patient-form';

interface AssignmentTableProps {
  surveyId: string;
  // questionnaireId scopes the native create-patient form + bulk-upload toolbar action;
  // when omitted (e.g. survey-wide assignment views) those entry points are hidden.
  questionnaireId?: string;
  emailTemplates: EmailTemplate[];
  surveyStatus?: string;
  questionnaireStatus?: string;
}

export const AssignmentTable = ({
  surveyId,
  questionnaireId,
  emailTemplates,
  surveyStatus,
  questionnaireStatus,
}: AssignmentTableProps) => {
  const { t } = useTranslation(['assignment', 'common']);
  const { makeRequest } = useApi();
  const { makeRequest: fetchQuestionnaireStatus } = useApi();
  const copyToClipboard = useCopyToClipboard();

  // Local mirror of the status props — adding a patient can silently flip the
  // questionnaire from draft to public server-side (see
  // QuestionnaireService.maybeActivateQuestionnaire). Refetching just this status
  // here (instead of reloading the parent questionnaire item) keeps the reload
  // scoped to the Assignments tab: it doesn't remount the tabs/EmailTemplatesTable
  // above it, since the parent ItemLoader shows a full-page spinner on every reload.
  const [liveSurveyStatus, setLiveSurveyStatus] = useState(surveyStatus);
  const [liveQuestionnaireStatus, setLiveQuestionnaireStatus] = useState(questionnaireStatus);

  useEffect(() => {
    setLiveSurveyStatus(surveyStatus);
  }, [surveyStatus]);

  useEffect(() => {
    setLiveQuestionnaireStatus(questionnaireStatus);
  }, [questionnaireStatus]);

  const refreshStatus = useCallback(async () => {
    if (!questionnaireId) return;
    try {
      const resp = await fetchQuestionnaireStatus(
        `/surveys/${surveyId}/questionnaires/${questionnaireId}`,
        'get'
      );
      const data = resp?.data ?? resp;
      if (data) {
        setLiveSurveyStatus(data.survey?.status);
        setLiveQuestionnaireStatus(data.status);
      }
    } catch {
      // best-effort refresh — keep showing the previous status on failure
    }
  }, [fetchQuestionnaireStatus, surveyId, questionnaireId]);

  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<number | null>(null);
  const [sendPickerAssignmentId, setSendPickerAssignmentId] = useState<number | null>(null);
  const [sendPickerLanguageId, setSendPickerLanguageId] = useState<string>('');
  const [showAddCohort, setShowAddCohort] = useState(false);
  const isMobile = useIsMobile(768);
  const [historyAssignmentId, setHistoryAssignmentId] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const tableReloadRef = useRef<(() => void) | null>(null);

  // Assignments can't be created until at least one email template exists for this
  // questionnaire — otherwise the send that follows has nothing to send.
  const noEmailTemplate = !!questionnaireId && emailTemplates.length === 0;
  const noEmailTemplateMessage =
    'Set up at least one email template for this questionnaire before assigning patients.';

  // Invites can only go out once both the survey and the questionnaire are public —
  // sending from a draft would invite patients to a link that isn't live yet.
  const notPublicYet =
    liveSurveyStatus !== SurveyStatusEnum.Public ||
    liveQuestionnaireStatus !== QuestionnaireStatusEnum.Public;
  const notPublicYetMessage = 'Both the survey and the questionnaire must be public to send.';

  const isCompleted =
    liveSurveyStatus === SurveyStatusEnum.Completed ||
    liveQuestionnaireStatus === QuestionnaireStatusEnum.Completed;

  const handleSendEmail = useCallback(
    async (assignmentId: number, reload: () => void) => {
      if (notPublicYet) {
        DevnutToast.error(notPublicYetMessage);
        return;
      }
      if (emailTemplates.length === 0) {
        DevnutToast.error('No email templates configured. Set up templates before sending.');
        return;
      }
      if (!emailTemplates.some((tmpl) => tmpl.is_fallback)) {
        DevnutToast.error(
          'No fallback email template configured. Set one as fallback before sending.'
        );
        return;
      }
      if (emailTemplates.length === 1) {
        setSendingId(assignmentId);
        try {
          await makeRequest(`/assignments/${assignmentId}/send`, 'post', {
            language_id: emailTemplates[0].language_id,
          });
          DevnutToast.success('Email sent successfully');
          reload();
        } catch (err: any) {
          DevnutToast.error(typeof err === 'string' ? err : 'Failed to send email');
        } finally {
          setSendingId(null);
        }
        return;
      }
      const fallbackTemplate = emailTemplates.find((tmpl) => tmpl.is_fallback);
      setSendPickerAssignmentId(assignmentId);
      setSendPickerLanguageId(String((fallbackTemplate ?? emailTemplates[0]).language_id));
      tableReloadRef.current = reload;
    },
    [emailTemplates, makeRequest, notPublicYet]
  );

  const columns: ColumnDef<Values>[] = [
    {
      id: 'patient_id',
      header: t('header_columns.patient_id'),
      accessorKey: 'patient.patient_id',
      enableSorting: false,
      meta: {
        searchable: true,
        mobileCardRole: 'title',
      },
    },
    {
      id: 'email',
      header: t('header_columns.email'),
      accessorKey: 'patient.mail',
      enableSorting: false,
      meta: { mobileCardRole: 'subtitle' },
    },
    {
      id: 'status',
      header: t('header_columns.status'),
      accessorKey: 'send_status',
      enableSorting: false,
      meta: { mobileCardRole: 'trailing' },
      cell: ({ row }) => <AssignmentStatusBadge assignment={row.original as Assignment} />,
    },
    {
      id: 'sent_at',
      header: 'Sent at',
      accessorKey: 'sent_at',
      meta: { valueType: 'date' },
    },
    {
      id: 'created_at',
      header: t('header_columns.assigned_on'),
      accessorKey: 'created_at',
      meta: { valueType: 'date' },
    },
    {
      id: 'completed_at',
      header: t('header_columns.completed_at'),
      accessorKey: 'completed_at',
      meta: { valueType: 'date' },
    },
    {
      id: 'scheduled',
      header: 'Scheduled / Reminders',
      enableSorting: false,
      cell: ({ row }) => <ScheduledRemindersCell assignment={row.original as Assignment} />,
    },
  ];

  // Appended to row action labels so screen reader users know which patient the button acts on.
  const forPatient = (row: Values) => {
    const patientId = (row as Assignment).patient?.patient_id;
    return patientId ? ` for patient ${patientId}` : '';
  };

  // Card mobile: bottone outlined a tutta larghezza (come le azioni built-in di CrudDataTable)
  const actionClass = (ctx?: { layout: 'card' | 'table' }) =>
    ctx?.layout === 'card' ? cn('rounded-md', CARD_ACTION_OUTLINE_CLASS) : 'hover:bg-slate-300 rounded-md';

  const actionsConfig: TableAction[] = useMemo(
    () => [
      {
        id: 'qr',
        label: 'Show QR code',
        icon: QrCode,
        visible: (row) => !!row.link,
        render: (row, _reload, ctx) => (
          <SimpleTooltip label="Show QR code">
            <DevnutButton
              variant={ctx?.layout === 'card' ? 'outline' : 'ghost'}
              size={ctx?.layout === 'card' ? 'default' : 'icon'}
              className={actionClass(ctx)}
              aria-label={`Show QR code${forPatient(row)}`}
              onClick={() => setQrUrl(`${window.location.origin}/q/${row.link}`)}
            >
              <QrCode className="size-4" />
              {ctx?.layout === 'card' && <span className="text-xs">Show QR code</span>}
            </DevnutButton>
          </SimpleTooltip>
        ),
      },
      {
        id: 'copy-link',
        label: 'Copy patient link',
        icon: ClipboardCopy,
        visible: (row) => !!row.link,
        render: (row, _reload, ctx) => (
          <SimpleTooltip label="Copy patient link">
            <DevnutButton
              variant={ctx?.layout === 'card' ? 'outline' : 'ghost'}
              size={ctx?.layout === 'card' ? 'default' : 'icon'}
              className={actionClass(ctx)}
              aria-label={`Copy patient link${forPatient(row)}`}
              onClick={() => copyToClipboard(`${window.location.origin}/q/${row.link}`)}
            >
              <ClipboardCopy className="size-4" />
              {ctx?.layout === 'card' && <span className="text-xs">Copy patient link</span>}
            </DevnutButton>
          </SimpleTooltip>
        ),
      },
      {
        id: 'send-email',
        label: 'Send email',
        icon: Mail,
        render: (row, reload, ctx) => {
          const a = row as Assignment;
          const hasFallbackTemplate = emailTemplates.some((tmpl) => tmpl.is_fallback);
          const canSend =
            !notPublicYet &&
            !!a.patient?.mail &&
            a.send_status !== 'delivered' &&
            a.completion_status !== 'completed' &&
            emailTemplates.length > 0 &&
            hasFallbackTemplate;
          const isSending = sendingId === a.id;
          const sendLabel = notPublicYet
            ? notPublicYetMessage
            : emailTemplates.length === 0
              ? 'No email templates configured'
              : !hasFallbackTemplate
                ? 'No fallback email template configured'
                : !a.patient?.mail
                  ? 'No email address'
                  : a.send_status === 'delivered'
                    ? 'Already sent'
                    : a.completion_status === 'completed'
                      ? 'Questionnaire already completed'
                      : 'Send email';
          return (
            <SimpleTooltip label={sendLabel}>
              <DevnutButton
                variant={ctx?.layout === 'card' ? 'outline' : 'ghost'}
                size={ctx?.layout === 'card' ? 'default' : 'icon'}
                className={cn(
                  actionClass(ctx),
                  'aria-disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:hover:bg-transparent'
                )}
                aria-label={`${sendLabel}${forPatient(row)}`}
                aria-disabled={!canSend || isSending}
                aria-busy={isSending || undefined}
                onClick={() => {
                  if (!canSend || isSending) return;
                  handleSendEmail(a.id, reload);
                }}
              >
                {isSending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Mail className="size-4" aria-hidden="true" />
                )}
                {ctx?.layout === 'card' && <span className="text-xs">Send email</span>}
              </DevnutButton>
            </SimpleTooltip>
          );
        },
      },
      {
        id: 'email-history',
        label: 'Email history',
        icon: History,
        render: (row, _reload, ctx) => {
          const a = row as Assignment;
          return (
            <SimpleTooltip label="Email send history">
              <DevnutButton
                variant={ctx?.layout === 'card' ? 'outline' : 'ghost'}
                size={ctx?.layout === 'card' ? 'default' : 'icon'}
                className={actionClass(ctx)}
                aria-label={`Email send history${forPatient(row)}`}
                onClick={() => setHistoryAssignmentId(a.id)}
              >
                <History className="size-4" />
                {ctx?.layout === 'card' && <span className="text-xs">Email history</span>}
              </DevnutButton>
            </SimpleTooltip>
          );
        },
      },
      {
        id: 'delete',
        label: 'Delete assignment',
        render: (row, reload, ctx) => {
          if (isCompleted) return null;

          return (
            <DevnutDeleteButton
              url={`/assignments/${row.id}`}
              onSuccess={reload}
              showLabel={ctx?.layout === 'card'}
              className={ctx?.layout === 'card' ? CARD_ACTION_LAYOUT_CLASS : 'rounded-md'}
            />
          );
        },
      },
    ],
    [emailTemplates, sendingId, handleSendEmail, notPublicYet, copyToClipboard]
  );

  const handleConfirmSend = useCallback(async () => {
    if (!sendPickerAssignmentId || !sendPickerLanguageId) return;
    const assignmentId = sendPickerAssignmentId;
    setSendPickerAssignmentId(null);
    setSendingId(assignmentId);
    try {
      await makeRequest(`/assignments/${assignmentId}/send`, 'post', {
        language_id: parseInt(sendPickerLanguageId, 10),
      });
      toast.success('Email sent successfully');
      tableReloadRef.current?.();
    } catch (err: any) {
      toast.error(typeof err === 'string' ? err : 'Failed to send email');
    } finally {
      setSendingId(null);
    }
  }, [sendPickerAssignmentId, sendPickerLanguageId, makeRequest]);

  return (
    <>
      <CrudDataTable
        key={refreshKey}
        type="modal"
        columns={columns}
        title={t('title')}
        url={`/surveys/${surveyId}/assignments`}
        className="p-0"
        disableRowClick
        params={{ filter: { questionnaireId } }}
        actionsConfig={actionsConfig}
        hideBuiltinActions={['edit', 'delete']}
        form={PatientAssignmentForm}
        formProps={{
          url: `/surveys/${surveyId}/questionnaires/${questionnaireId}/assignments/patient`,
        }}
        onSuccess={() => refreshStatus()}
        createButtonProps={{
          disabled: noEmailTemplate || isCompleted,
          title: noEmailTemplate ? noEmailTemplateMessage : undefined,
        }}
        renderBeforeTable={() => (
          <>
            {!isCompleted && noEmailTemplate && (
              <Alert className="rounded-md-md bg-amber-50 border border-amber-200 text-amber-800">
                <AlertTriangleIcon />
                <AlertTitle>{noEmailTemplateMessage}</AlertTitle>
              </Alert>
            )}
            {!isCompleted && notPublicYet && (
              <Alert className="rounded-md-md bg-amber-50 border border-amber-200 text-amber-800">
                <AlertTriangleIcon />
                <AlertTitle>{notPublicYetMessage}</AlertTitle>
              </Alert>
            )}
          </>
        )}
        toolbarButton={{
          actions: isMobile
            ? []
            : [
                <DevnutButton
                  variant="outline"
                  className="gap-2"
                  disabled={noEmailTemplate || isCompleted}
                  title={noEmailTemplate ? noEmailTemplateMessage : undefined}
                  onClick={() => setShowAddCohort(true)}
                >
                  <Users className="size-4" />
                  {t('buttons.bulk')}
                </DevnutButton>,
              ],
        }}
      />

      {/* Bulk upload (cohort) — dedicated toolbar action */}
      {questionnaireId && (
        <ExcelImportModal
          type="patients"
          open={showAddCohort}
          onClose={() => setShowAddCohort(false)}
          surveyId={surveyId}
          questionnaireId={questionnaireId}
          onSuccess={() => {
            setShowAddCohort(false);
            setRefreshKey((k) => k + 1);
            refreshStatus();
          }}
        />
      )}

      {/* Email send history */}
      <EmailHistoryDialog
        assignmentId={historyAssignmentId}
        onClose={() => setHistoryAssignmentId(null)}
      />

      {/* QR — patient link */}
      <Dialog open={!!qrUrl} onOpenChange={(v) => !v && setQrUrl(null)}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>Patient QR Code</DialogTitle>
          </DialogHeader>
          {qrUrl && <QrCodeContent url={qrUrl} />}
        </DialogContent>
      </Dialog>

      {/* Language picker — multiple email templates */}
      <Dialog
        open={sendPickerAssignmentId !== null}
        onOpenChange={(v) => !v && setSendPickerAssignmentId(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Select language</DialogTitle>
            <DialogDescription>
              Choose the language for the email to be sent to this patient.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <DevnutSelect
              value={sendPickerLanguageId}
              onValueChange={(v) => setSendPickerLanguageId(v ?? '')}
              options={emailTemplates.map((tmpl) => ({
                value: String(tmpl.language_id),
                label: `${tmpl.language.language} (${tmpl.language.original_lang})`,
              }))}
              triggerClassName="w-full"
              placeholder="Select language"
              aria-label="Email language"
            />
          </div>
          <DialogFooter>
            <DevnutButton variant="ghost" onClick={() => setSendPickerAssignmentId(null)}>
              Cancel
            </DevnutButton>
            <DevnutButton
              className="gap-2"
              disabled={!sendPickerLanguageId}
              onClick={handleConfirmSend}
            >
              <Mail className="size-4" />
              Send email
            </DevnutButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
