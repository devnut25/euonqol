import { DevnutBadge } from '@/components/DevnutBadge';
import { cn } from '@/lib/tailwind/utils';

export enum AssignmentSendStatus {
  PENDING = 'pending',
  DELIVERED = 'delivered',
  FAILED = 'failed',
  BOUNCED = 'bounced',
}

export enum AssignmentCompletionStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
}

export interface Assignment {
  id: number;
  patient: { id: number; patient_id: string; mail: string | null };
  link: string;
  send_status: AssignmentSendStatus;
  completion_status: AssignmentCompletionStatus;
  sent_at: string | null;
  created_at: string | null;
  scheduled_send_at: string | null;
  reminder_count: number;
  next_reminder_at: string | null;
  last_email_error?: string | null;
}

const SEND_STATUS_STYLES: Record<string, string> = {
  [AssignmentSendStatus.PENDING]: 'bg-yellow-100 text-yellow-800',
  [AssignmentSendStatus.DELIVERED]: 'bg-blue-100 text-blue-800',
  [AssignmentSendStatus.FAILED]: 'bg-red-100 text-red-800',
  [AssignmentSendStatus.BOUNCED]: 'bg-red-100 text-red-800',
  [AssignmentCompletionStatus.COMPLETED]: 'bg-green-100 text-green-800',
};

const SEND_STATUS_LABELS: Record<string, string> = {
  [AssignmentSendStatus.PENDING]: 'Pending',
  [AssignmentSendStatus.DELIVERED]: 'Sent',
  [AssignmentSendStatus.FAILED]: 'Failed',
  [AssignmentSendStatus.BOUNCED]: 'Bounced',
};

export function AssignmentStatusBadge({ assignment }: { assignment: Assignment }) {
  if (assignment.completion_status === AssignmentCompletionStatus.COMPLETED) {
    return (
      <DevnutBadge className={cn('font-medium capitalize', SEND_STATUS_STYLES[AssignmentCompletionStatus.COMPLETED])}>
        Completed
      </DevnutBadge>
    );
  }

  const isError =
    assignment.send_status === AssignmentSendStatus.FAILED ||
    assignment.send_status === AssignmentSendStatus.BOUNCED;

  return (
    <DevnutBadge
      className={cn('font-medium capitalize', SEND_STATUS_STYLES[assignment.send_status])}
      title={isError ? (assignment.last_email_error ?? 'Delivery failed') : undefined}
    >
      {SEND_STATUS_LABELS[assignment.send_status] ?? assignment.send_status}
      {/* The title tooltip is mouse-only: expose the failure reason as text too (WCAG 1.3.1) */}
      {isError && (
        <span className="sr-only">: {assignment.last_email_error ?? 'Delivery failed'}</span>
      )}
    </DevnutBadge>
  );
}
