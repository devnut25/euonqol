import { Router } from 'express';
import { runEndDateReminderJob, runSchedulerJobs } from '../controllers/devController';
import { authenticate, requireUserTypes } from '../middleware/auth';

const router = Router();

// Dev-only: trigger scheduler jobs (Job A/B/C) on demand, without waiting for the
// cron tick. Route is only mounted when NODE_ENV !== 'production' (see server.ts).
router.post('/scheduler/run', authenticate, requireUserTypes(['admin']), runSchedulerJobs);
router.post(
  '/scheduler/end-date-reminder',
  authenticate,
  requireUserTypes(['admin']),
  runEndDateReminderJob
);

export default router;
