import { NextFunction, Request, Response } from 'express';
import { Resource } from '../resources/baseResource.js';
import { AssignmentSchedulerService } from '../services/AssignmentSchedulerService.js';
import { SurveyService } from '../services/SurveyService.js';

/**
 * POST /euonqol-api/dev/scheduler/run
 * Dev-only: run the scheduler jobs on demand instead of waiting for the cron tick.
 * Mounted only when NODE_ENV !== 'production' (see server.ts).
 */
export async function runSchedulerJobs(req: Request, res: Response, next: NextFunction) {
  try {
    await SurveyService.runStatusTransitionJob();
    await AssignmentSchedulerService.runScheduledSendJob();
    await AssignmentSchedulerService.runReminderJob();
    return res.json(Resource.respond(null, 'Scheduler jobs executed'));
  } catch (err: any) {
    console.error('Error running scheduler jobs:', err?.message ?? err);
    return next(err);
  }
}

/**
 * POST /euonqol-api/dev/scheduler/end-date-reminder
 * Dev-only: run Job D alone (survey "closing soon" email to creator and
 * collaborators) without triggering the patient-facing send/reminder jobs.
 */
export async function runEndDateReminderJob(req: Request, res: Response, next: NextFunction) {
  try {
    await SurveyService.runEndDateReminderJob();
    return res.json(Resource.respond(null, 'End-date reminder job executed'));
  } catch (err: any) {
    console.error('Error running end-date reminder job:', err?.message ?? err);
    return next(err);
  }
}
