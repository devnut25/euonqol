import { DevnutDescription } from '@/components/descriptions/DevnutDescription';
import { AssignmentCompletionStatus, AssignmentSendStatus, type Assignment } from './status-badge';

function ScheduledSendRow({ a }: { a: Assignment }) {
  if (a.send_status !== AssignmentSendStatus.PENDING) return null;
  if (a.scheduled_send_at) {
    return <DevnutDescription.DateTime value={a.scheduled_send_at} />;
  }
  return <span className="text-muted-foreground italic">Manual</span>;
}

function ReminderCountRow({ a }: { a: Assignment }) {
  if (a.reminder_count === 0) return null;
  return (
    <span className="text-orange-700">
      🔔 {a.reminder_count} reminder{a.reminder_count > 1 ? 's' : ''} sent
    </span>
  );
}

function NextReminderRow({ a }: { a: Assignment }) {
  if (!a.next_reminder_at || a.completion_status === AssignmentCompletionStatus.COMPLETED)
    return null;
  return (
    <span className="text-muted-foreground">
      Next: <DevnutDescription.Date value={a.next_reminder_at} />
    </span>
  );
}

interface ScheduledRemindersCellProps {
  assignment: Assignment;
}

export const ScheduledRemindersCell = ({ assignment }: ScheduledRemindersCellProps) => (
  <div className="flex flex-col gap-0.5">
    <ScheduledSendRow a={assignment} />
    <ReminderCountRow a={assignment} />
    <NextReminderRow a={assignment} />
  </div>
);
