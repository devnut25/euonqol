import cron from 'node-cron';
import { AssignmentSchedulerService } from './AssignmentSchedulerService.js';
import { SurveyService } from './SurveyService.js';

const SEND_CRON_EXPR = process.env.SCHEDULER_CRON_EXPR || '*/15 * * * *';
// Status transitions are date-level (starting_date/end_date), not minute-level — no need
// to run them on the same 15min cadence as email sends/reminders.
const STATUS_TRANSITION_CRON_EXPR = '0 14 * * *';

/**
 * Starts the scheduler: survey status transitions + creator end-date reminders (daily),
 * scheduled assignment sends and patient reminder emails (every 15min by default).
 * Business logic lives in AssignmentService/SurveyService — this file only wires the
 * cron ticks.
 */
export function startScheduler(): void {
  console.log(
    `⏰ Starting scheduler (status transitions: ${STATUS_TRANSITION_CRON_EXPR}, sends/reminders: ${SEND_CRON_EXPR})`
  );

  cron.schedule(STATUS_TRANSITION_CRON_EXPR, async () => {
    console.log(`[Scheduler] Job C tick at ${new Date().toISOString()}`);
    await SurveyService.runStatusTransitionJob().catch((err) =>
      console.error('[Scheduler] Job C failed:', err)
    );
    await SurveyService.runEndDateReminderJob().catch((err) =>
      console.error('[Scheduler] Job D failed:', err)
    );
  });

  cron.schedule(SEND_CRON_EXPR, async () => {
    console.log(`[Scheduler] Send/reminder tick at ${new Date().toISOString()}`);
    await AssignmentSchedulerService.runScheduledSendJob().catch((err) =>
      console.error('[Scheduler] Job A failed:', err)
    );
    await AssignmentSchedulerService.runReminderJob().catch((err) =>
      console.error('[Scheduler] Job B failed:', err)
    );
  });
}
