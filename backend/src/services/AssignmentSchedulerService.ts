import { prisma } from '../config/database.js';
import { EmailService } from './email/email.js';

const emailService = new EmailService();
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// Batching knobs for the scheduler jobs — tunable per deployment to respect a client's
// SMTP/provider limits (e.g. "max 100 emails at a time").
const EMAIL_BATCH_SIZE = parseInt(process.env.EMAIL_BATCH_SIZE || '100', 10);
const EMAIL_SEND_DELAY_MS = parseInt(process.env.EMAIL_SEND_DELAY_MS || '200', 10);
// 0 = one batch per cron tick (safe default for a "max X per time window" limit).
// >0 = keep looping additional batches within the same tick (with this pause between
// them), up to JOB_TIME_BUDGET_MS, for a "max X per connection/batch" limit instead.
const EMAIL_BATCH_COOLDOWN_MS = parseInt(process.env.EMAIL_BATCH_COOLDOWN_MS || '0', 10);
const JOB_TIME_BUDGET_MS = 5 * 60 * 1000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Assignment email sending + reminders for the scheduler (Job A / Job B).
 * Split out from AssignmentService, which stays focused on CRUD/access-control
 * for assignments — this service owns the cron-driven send/reminder business logic.
 */
export class AssignmentSchedulerService {
  /**
   * Computes the next reminder datetime based on survey frequency settings.
   */
  private static computeNextReminderAt(
    reminderEnabled: boolean,
    frequencyTipology: string | null,
    frequency: number | null
  ): Date | null {
    if (!reminderEnabled || !frequencyTipology || !frequency || frequency <= 0) return null;

    const now = new Date();
    const ms = AssignmentSchedulerService.frequencyToMs(frequencyTipology, frequency);
    if (!ms) return null;
    return new Date(now.getTime() + ms);
  }

  private static frequencyToMs(tipology: string, frequency: number): number | null {
    const HOUR = 3600 * 1000;
    const DAY = 24 * HOUR;
    switch (tipology) {
      case 'daily':
        return frequency * DAY;
      case 'weekly':
        return frequency * 7 * DAY;
      case 'monthly':
        return frequency * 30 * DAY;
      default:
        return null;
    }
  }

  /**
   * Re-arms reminders for a survey's assignments that the scheduler had already stopped
   * at the previous reminder_max_count (next_reminder_at = null), after the cap was raised
   * or removed. Same eligibility rules as Job B, so nobody Job B would skip gets re-armed.
   */
  static async rearmReminders(surveyId: number) {
    const survey = await prisma.surveys.findUnique({
      where: { id: surveyId },
      select: { reminder: true, frequency_tipology: true, frequency: true, reminder_max_count: true },
    });
    if (!survey?.reminder) return 0;

    const nextReminderAt = AssignmentSchedulerService.computeNextReminderAt(
      survey.reminder,
      survey.frequency_tipology,
      survey.frequency
    );
    if (!nextReminderAt) return 0;

    const { count } = await prisma.survey_questionnaire_patients_assignment.updateMany({
      where: {
        survey_questionnaire: { survey_id: surveyId },
        send_status: 'delivered',
        completion_status: { not: 'completed' },
        next_reminder_at: null,
        ...(survey.reminder_max_count !== null && {
          reminder_count: { lt: survey.reminder_max_count },
        }),
        OR: [{ eligibility_status: { not: 'disqualified' } }, { eligibility_status: null }],
        AND: [{ OR: [{ study_info_status: { not: 'declined' } }, { study_info_status: null }] }],
      },
      data: { next_reminder_at: nextReminderAt },
    });
    return count;
  }

  /**
   * Persists the outcome of a send attempt: updates assignment status and appends
   * a row to assignment_email_logs so a patient's history of failures/bounces across
   * different reminder cycles isn't lost (a single column would only keep the last one).
   * On DB update failure after a successful send, retries a few times; if it still fails,
   * pushes the relevant "due" timestamp forward so the row isn't immediately re-picked
   * up and resent on every following cron tick.
   */
  private static async recordSendOutcome(
    assignmentId: number,
    status: 'sent' | 'failed',
    updateData: Record<string, any>,
    errorMessage: string | null,
    fallbackDueField: 'scheduled_send_at' | 'next_reminder_at'
  ): Promise<void> {
    const attempts = 3;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        await prisma.survey_questionnaire_patients_assignment.update({
          where: { id: assignmentId },
          data: updateData,
        });
        await prisma.assignment_email_logs.create({
          data: { assignment_id: assignmentId, status, error_message: errorMessage },
        });
        return;
      } catch (err: any) {
        if (attempt === attempts) {
          console.error(
            `[AssignmentSchedulerService] Failed to persist send outcome for assignment ${assignmentId} after ${attempts} attempts:`,
            err
          );
          // Avoid a tight resend loop every cron tick: push the due timestamp forward
          // instead of leaving it silently in the past.
          try {
            await prisma.survey_questionnaire_patients_assignment.update({
              where: { id: assignmentId },
              data: { [fallbackDueField]: new Date(Date.now() + 60 * 60 * 1000) },
            });
            await prisma.assignment_email_logs.create({
              data: {
                assignment_id: assignmentId,
                status: 'failed',
                error_message: `DB update failed after send (deferred 1h): ${err.message}`,
              },
            });
          } catch (fallbackErr) {
            console.error(
              `[AssignmentSchedulerService] Fallback defer also failed for assignment ${assignmentId}:`,
              fallbackErr
            );
          }
        } else {
          await sleep(300);
        }
      }
    }
  }

  /**
   * Marks an assignment as failed and logs the reason for a condition that prevented
   * even attempting the send (missing patient email, no email template) — permanent
   * until someone fixes the underlying data, so unlike recordSendOutcome's DB-failure
   * fallback there's nothing to defer/retry: send_status:'failed' stops it from being
   * silently re-picked up by the query on every following cron tick.
   */
  private static async recordFailureWithoutSend(
    assignmentId: number,
    errorMessage: string
  ): Promise<void> {
    await prisma.survey_questionnaire_patients_assignment
      .update({ where: { id: assignmentId }, data: { send_status: 'failed' } })
      .catch((updateErr) =>
        console.error(
          `[AssignmentSchedulerService] Failed to mark assignment ${assignmentId} as failed:`,
          updateErr
        )
      );
    await prisma.assignment_email_logs
      .create({
        data: { assignment_id: assignmentId, status: 'failed', error_message: errorMessage },
      })
      .catch((logErr) =>
        console.error(
          `[AssignmentSchedulerService] Failed to log failure for assignment ${assignmentId}:`,
          logErr
        )
      );
  }

  /**
   * Same as recordFailureWithoutSend, but for reminder failures (Job B): the assignment
   * is already send_status:'delivered' (initial send succeeded), so that field is left
   * untouched — only next_reminder_at is pushed forward, so a permanently broken reminder
   * (missing language_id/template/patient email) doesn't get silently retried every cycle.
   */
  private static async recordReminderFailureWithoutSend(
    assignmentId: number,
    errorMessage: string
  ): Promise<void> {
    await prisma.survey_questionnaire_patients_assignment
      .update({
        where: { id: assignmentId },
        data: { next_reminder_at: new Date(Date.now() + 60 * 60 * 1000) },
      })
      .catch((updateErr) =>
        console.error(
          `[AssignmentSchedulerService] Failed to defer reminder for assignment ${assignmentId}:`,
          updateErr
        )
      );
    await prisma.assignment_email_logs
      .create({
        data: { assignment_id: assignmentId, status: 'failed', error_message: errorMessage },
      })
      .catch((logErr) =>
        console.error(
          `[AssignmentSchedulerService] Failed to log reminder failure for assignment ${assignmentId}:`,
          logErr
        )
      );
  }

  /**
   * Resolves which email template language to use: the assignment's own
   * email_language_id if set, otherwise the template marked is_fallback for the
   * survey_questionnaire, otherwise the first template configured (ordered by
   * language_id). Shared by the scheduler's Job A and the immediate-send trigger
   * so both fall back the same way.
   */
  private static async resolveLanguageId(
    assignmentEmailLanguageId: number | null,
    surveyQuestionnaireId: number
  ): Promise<number | null> {
    if (assignmentEmailLanguageId) return assignmentEmailLanguageId;

    const fallbackTemplate = await prisma.surveys_questionnaires_email_templates.findFirst({
      where: { survey_questionnaire_id: surveyQuestionnaireId, is_fallback: true },
      select: { language_id: true },
    });
    if (fallbackTemplate) return fallbackTemplate.language_id;

    const firstTemplate = await prisma.surveys_questionnaires_email_templates.findFirst({
      where: { survey_questionnaire_id: surveyQuestionnaireId },
      orderBy: { language_id: 'asc' },
      select: { language_id: true },
    });
    return firstTemplate?.language_id ?? null;
  }

  /**
   * Sends an assignment's email right away instead of waiting for the next
   * scheduler tick — used for send_mode='immediate' at assignment-creation time.
   * Errors are recorded via the same recordFailureWithoutSend/sendAssignmentCore
   * paths as the scheduler, so assignment_email_logs stays the single source of
   * truth regardless of which path sent (or failed to send) the email.
   */
  static async triggerImmediateSend(
    assignmentId: number,
    surveyQuestionnaireId: number,
    emailLanguageId: number | null
  ): Promise<void> {
    const languageId = await AssignmentSchedulerService.resolveLanguageId(
      emailLanguageId,
      surveyQuestionnaireId
    );

    if (!languageId) {
      await AssignmentSchedulerService.recordFailureWithoutSend(
        assignmentId,
        'No email template configured for this questionnaire in any language'
      );
      return;
    }

    await AssignmentSchedulerService.sendAssignmentCore(assignmentId, languageId);
  }

  /**
   * "First wave" send for a bulk immediate-mode assignment operation: sends up to
   * EMAIL_BATCH_SIZE assignments right away, sequentially, with the same
   * EMAIL_SEND_DELAY_MS throttle used by the scheduler — instead of firing every
   * assignment's email concurrently and unbounded, which risks tripping SMTP/API
   * provider rate limits for large bulk assignments (e.g. Gmail's aggressive
   * anti-burst throttling).
   *
   * Anything beyond the first EMAIL_BATCH_SIZE is deliberately left with
   * send_status='pending': Job A (runScheduledSendJob) already picks those up on its
   * own over the following cron ticks, since scheduled_send_at was already set to
   * now() by computeScheduledSendAt for send_mode='immediate' — no extra tracking
   * needed to know "what's left to send".
   */
  static async triggerImmediateBatch(
    assignments: { id: number; emailLanguageId: number | null }[],
    surveyQuestionnaireId: number
  ): Promise<void> {
    const batch = assignments.slice(0, EMAIL_BATCH_SIZE);

    for (const assignment of batch) {
      try {
        await AssignmentSchedulerService.triggerImmediateSend(
          assignment.id,
          surveyQuestionnaireId,
          assignment.emailLanguageId
        );
      } catch (err) {
        console.error(
          `[AssignmentSchedulerService] Immediate batch send failed for assignment ${assignment.id}:`,
          err
        );
      }
      await sleep(EMAIL_SEND_DELAY_MS);
    }
  }

  /**
   * Core email-sending logic shared by manual send, scheduler, and reminder jobs.
   * Returns true on success, false on failure.
   */
  static async sendAssignmentCore(assignmentId: number, languageId: number): Promise<boolean> {
    const assignment = await prisma.survey_questionnaire_patients_assignment.findUnique({
      where: { id: assignmentId },
      include: {
        patient: { select: { mail: true } },
        survey_questionnaire: {
          include: {
            survey: {
              select: {
                name: true,
                status: true,
                reminder: true,
                frequency_tipology: true,
                frequency: true,
                reminder_max_count: true,
              },
            },
            questionnaire: { select: { title: true, status: true } },
          },
        },
      },
    });

    if (!assignment) return false;

    if (
      assignment.survey_questionnaire.survey.status !== 'public' ||
      assignment.survey_questionnaire.questionnaire.status !== 'public'
    ) {
      await AssignmentSchedulerService.recordFailureWithoutSend(
        assignmentId,
        'Cannot send: both the survey and the questionnaire must be public'
      );
      return false;
    }

    if (!assignment.patient.mail) {
      await AssignmentSchedulerService.recordFailureWithoutSend(
        assignmentId,
        'Patient has no email address'
      );
      return false;
    }

    const emailTemplate = await prisma.surveys_questionnaires_email_templates.findUnique({
      where: {
        survey_questionnaire_id_language_id: {
          survey_questionnaire_id: assignment.survey_questionnaire_id,
          language_id: languageId,
        },
      },
    });

    if (!emailTemplate) {
      await AssignmentSchedulerService.recordFailureWithoutSend(
        assignmentId,
        `No email template configured for language_id ${languageId}`
      );
      return false;
    }

    const surveyUrl = `${FRONTEND_URL}/q/${assignment.link}`;

    try {
      await emailService.sendCustomAssignmentEmail(
        assignment.patient.mail,
        emailTemplate.subject,
        emailTemplate.body,
        assignment.survey_questionnaire.survey.name,
        assignment.survey_questionnaire.questionnaire.title,
        surveyUrl
      );

      const survey = assignment.survey_questionnaire.survey;
      const nextReminderAt = AssignmentSchedulerService.computeNextReminderAt(
        survey.reminder ?? false,
        survey.frequency_tipology,
        survey.frequency
      );

      await AssignmentSchedulerService.recordSendOutcome(
        assignmentId,
        'sent',
        {
          send_status: 'delivered',
          sent_at: new Date(),
          email_language_id: languageId,
          scheduled_send_at: null,
          next_reminder_at: nextReminderAt,
        },
        null,
        'scheduled_send_at'
      );

      return true;
    } catch (err: any) {
      await prisma.survey_questionnaire_patients_assignment
        .update({ where: { id: assignmentId }, data: { send_status: 'failed' } })
        .catch((updateErr) =>
          console.error(
            `[AssignmentSchedulerService] Failed to mark assignment ${assignmentId} as failed:`,
            updateErr
          )
        );
      await prisma.assignment_email_logs
        .create({
          data: {
            assignment_id: assignmentId,
            status: 'failed',
            error_message: err?.message ?? String(err),
          },
        })
        .catch((logErr) =>
          console.error(
            `[AssignmentSchedulerService] Failed to log send failure for assignment ${assignmentId}:`,
            logErr
          )
        );
      return false;
    }
  }

  /**
   * Job A: Send scheduled assignments whose scheduled_send_at has arrived.
   * Processes in batches of EMAIL_BATCH_SIZE; whether it loops through multiple
   * batches within the same tick depends on EMAIL_BATCH_COOLDOWN_MS (see top of file).
   */
  static async runScheduledSendJob(): Promise<void> {
    const jobRun = await prisma.scheduler_job_runs.create({
      data: { job_name: 'scheduled_send', started_at: new Date() },
    });
    const runStartedAt = Date.now();
    let totalDue = 0;
    let sentCount = 0;
    let failedCount = 0;
    let timeBudgetExceeded = false;

    try {
      while (true) {
        const now = new Date();
        const due = await prisma.survey_questionnaire_patients_assignment.findMany({
          where: {
            send_status: 'pending',
            scheduled_send_at: { lte: now },
            survey_questionnaire: { survey: { status: { notIn: ['disabled', 'completed'] } } },
          },
          select: { id: true, email_language_id: true, survey_questionnaire_id: true },
          take: EMAIL_BATCH_SIZE,
        });

        if (due.length === 0) break;
        totalDue += due.length;
        console.log(`[Scheduler] Job A: ${due.length} scheduled assignment(s) to send`);

        for (const assignment of due) {
          const languageId = await AssignmentSchedulerService.resolveLanguageId(
            assignment.email_language_id,
            assignment.survey_questionnaire_id
          );

          if (!languageId) {
            console.warn(
              `[Scheduler] Job A: No template found for assignment ${assignment.id}, skipping`
            );
            await AssignmentSchedulerService.recordFailureWithoutSend(
              assignment.id,
              'No email template configured for this questionnaire in any language'
            );
            failedCount++;
            continue;
          }

          const ok = await AssignmentSchedulerService.sendAssignmentCore(assignment.id, languageId);
          ok ? sentCount++ : failedCount++;
          if (!ok) console.warn(`[Scheduler] Job A: Failed to send assignment ${assignment.id}`);

          if (EMAIL_SEND_DELAY_MS > 0) await sleep(EMAIL_SEND_DELAY_MS);
        }

        if (due.length < EMAIL_BATCH_SIZE) break; // queue drained
        if (EMAIL_BATCH_COOLDOWN_MS <= 0) break; // one batch per tick by design
        if (Date.now() - runStartedAt > JOB_TIME_BUDGET_MS) {
          timeBudgetExceeded = true;
          break;
        }
        await sleep(EMAIL_BATCH_COOLDOWN_MS);
      }

      await prisma.scheduler_job_runs.update({
        where: { id: jobRun.id },
        data: {
          finished_at: new Date(),
          total_due: totalDue,
          sent_count: sentCount,
          failed_count: failedCount,
          remaining_count: timeBudgetExceeded ? totalDue - sentCount - failedCount : 0,
        },
      });
    } catch (err: any) {
      await prisma.scheduler_job_runs.update({
        where: { id: jobRun.id },
        data: {
          finished_at: new Date(),
          total_due: totalDue,
          sent_count: sentCount,
          failed_count: failedCount,
          error: err?.message ?? String(err),
        },
      });
      throw err;
    }
  }

  /**
   * Job B: Send reminder emails for assignments that haven't been completed.
   * Same batching knobs as Job A.
   */
  static async runReminderJob(): Promise<void> {
    const jobRun = await prisma.scheduler_job_runs.create({
      data: { job_name: 'reminder', started_at: new Date() },
    });
    const runStartedAt = Date.now();
    let totalDue = 0;
    let sentCount = 0;
    let failedCount = 0;
    let timeBudgetExceeded = false;

    try {
      while (true) {
        const now = new Date();
        const due = await prisma.survey_questionnaire_patients_assignment.findMany({
          where: {
            send_status: 'delivered',
            completion_status: { not: 'completed' },
            next_reminder_at: { lte: now },
            survey_questionnaire: { survey: { status: { notIn: ['disabled', 'completed'] } } },
            // Never remind a patient who was terminally disqualified/declined by a pre-flow
            // gate (eligibility questions, study info sheet) — those never reach `/start` so
            // completion_status stays 'pending' forever, which would otherwise look identical
            // to "hasn't accessed the link yet" and keep getting reminded indefinitely.
            // NULL means the gate hasn't run/isn't configured, so it must be treated as
            // "not disqualified/declined" too — a bare `{ not: 'disqualified' }` compiles to
            // SQL `<> 'disqualified'`, which drops NULL rows entirely (NULL <> x is NULL, not
            // true), silently excluding them from reminders forever.
            OR: [{ eligibility_status: { not: 'disqualified' } }, { eligibility_status: null }],
            AND: [
              {
                OR: [{ study_info_status: { not: 'declined' } }, { study_info_status: null }],
              },
            ],
          },
          select: {
            id: true,
            email_language_id: true,
            survey_questionnaire_id: true,
            reminder_count: true,
            survey_questionnaire: {
              select: {
                survey: {
                  select: {
                    reminder: true,
                    frequency_tipology: true,
                    frequency: true,
                    reminder_max_count: true,
                  },
                },
              },
            },
          },
          take: EMAIL_BATCH_SIZE,
        });

        if (due.length === 0) break;
        totalDue += due.length;
        console.log(`[Scheduler] Job B: ${due.length} reminder(s) to send`);

        for (const assignment of due) {
          const survey = assignment.survey_questionnaire.survey;

          if (!survey.reminder) continue;

          const maxCount = survey.reminder_max_count;
          if (maxCount !== null && assignment.reminder_count >= maxCount) {
            await prisma.survey_questionnaire_patients_assignment.update({
              where: { id: assignment.id },
              data: { next_reminder_at: null },
            });
            continue;
          }

          const languageId = assignment.email_language_id;
          if (!languageId) {
            console.warn(
              `[Scheduler] Job B: No language_id for assignment ${assignment.id}, skipping`
            );
            await AssignmentSchedulerService.recordReminderFailureWithoutSend(
              assignment.id,
              'No language_id set for reminder'
            );
            failedCount++;
            continue;
          }

          const reminderEmailTemplate =
            await prisma.surveys_questionnaires_email_templates.findUnique({
              where: {
                survey_questionnaire_id_language_id: {
                  survey_questionnaire_id: assignment.survey_questionnaire_id,
                  language_id: languageId,
                },
              },
            });

          if (!reminderEmailTemplate) {
            await AssignmentSchedulerService.recordReminderFailureWithoutSend(
              assignment.id,
              `No reminder email template configured for language_id ${languageId}`
            );
            failedCount++;
            continue;
          }

          const fullAssignment = await prisma.survey_questionnaire_patients_assignment.findUnique({
            where: { id: assignment.id },
            include: {
              patient: { select: { mail: true } },
              survey_questionnaire: {
                include: {
                  survey: { select: { name: true } },
                  questionnaire: { select: { title: true } },
                },
              },
            },
          });

          if (!fullAssignment?.patient.mail) {
            await AssignmentSchedulerService.recordReminderFailureWithoutSend(
              assignment.id,
              'Patient has no email address'
            );
            failedCount++;
            continue;
          }

          const surveyUrl = `${FRONTEND_URL}/q/${fullAssignment.link}`;

          try {
            await emailService.sendCustomAssignmentEmail(
              fullAssignment.patient.mail,
              reminderEmailTemplate.subject,
              reminderEmailTemplate.body,
              fullAssignment.survey_questionnaire.survey.name,
              fullAssignment.survey_questionnaire.questionnaire.title,
              surveyUrl
            );

            const newReminderCount = assignment.reminder_count + 1;
            const atMax = maxCount !== null && newReminderCount >= maxCount;

            const nextReminderAt = atMax
              ? null
              : AssignmentSchedulerService.computeNextReminderAt(
                  survey.reminder ?? false,
                  survey.frequency_tipology,
                  survey.frequency
                );

            await AssignmentSchedulerService.recordSendOutcome(
              assignment.id,
              'sent',
              { reminder_count: newReminderCount, next_reminder_at: nextReminderAt },
              null,
              'next_reminder_at'
            );

            sentCount++;
            console.log(
              `[Scheduler] Job B: Reminder ${newReminderCount} sent for assignment ${assignment.id}${atMax ? ' (max reached, no more reminders)' : ''}`
            );
          } catch (err: any) {
            failedCount++;
            console.error(
              `[Scheduler] Job B: Failed to send reminder for assignment ${assignment.id}:`,
              err
            );
            await prisma.assignment_email_logs
              .create({
                data: {
                  assignment_id: assignment.id,
                  status: 'failed',
                  error_message: err?.message ?? String(err),
                },
              })
              .catch((logErr) =>
                console.error(
                  `[AssignmentSchedulerService] Failed to log reminder failure for assignment ${assignment.id}:`,
                  logErr
                )
              );
          }

          if (EMAIL_SEND_DELAY_MS > 0) await sleep(EMAIL_SEND_DELAY_MS);
        }

        if (due.length < EMAIL_BATCH_SIZE) break;
        if (EMAIL_BATCH_COOLDOWN_MS <= 0) break;
        if (Date.now() - runStartedAt > JOB_TIME_BUDGET_MS) {
          timeBudgetExceeded = true;
          break;
        }
        await sleep(EMAIL_BATCH_COOLDOWN_MS);
      }

      await prisma.scheduler_job_runs.update({
        where: { id: jobRun.id },
        data: {
          finished_at: new Date(),
          total_due: totalDue,
          sent_count: sentCount,
          failed_count: failedCount,
          remaining_count: timeBudgetExceeded ? totalDue - sentCount - failedCount : 0,
        },
      });
    } catch (err: any) {
      await prisma.scheduler_job_runs.update({
        where: { id: jobRun.id },
        data: {
          finished_at: new Date(),
          total_due: totalDue,
          sent_count: sentCount,
          failed_count: failedCount,
          error: err?.message ?? String(err),
        },
      });
      throw err;
    }
  }
}
