import { sendErrorToTeams } from '@/helpers/teamsNotifier';
import { NextFunction, Request, Response } from 'express';

const TEAMS_NOTIFY_MIN_STATUS = Number(process.env.TEAMS_NOTIFY_MIN_STATUS) || 500;
const TEAMS_NOTIFY_THROTTLE_MS = Number(process.env.TEAMS_NOTIFY_THROTTLE_MS) || 5 * 60 * 1000;

const lastNotifiedAt = new Map<string, number>();

function shouldThrottle(key: string): boolean {
  const now = Date.now();
  const last = lastNotifiedAt.get(key);
  if (last && now - last < TEAMS_NOTIFY_THROTTLE_MS) {
    return true;
  }
  lastNotifiedAt.set(key, now);
  return false;
}

export function errorMiddleware(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const statusCode = err.statusCode || err.status || 500;

  console.error('❌ Error:', err);

  if (statusCode >= TEAMS_NOTIFY_MIN_STATUS || statusCode === 404) {
    const key = `${statusCode}:${req.method}:${req.originalUrl}:${err.message}`;
    if (!shouldThrottle(key)) {
      sendErrorToTeams(err, req).catch((notifyError) =>
        console.error('Errore invio notifica Teams:', notifyError)
      );
    }
  }

  if (res.headersSent) {
    return next(err);
  }

  res.status(statusCode).json({
    success: false,
    message:
      process.env.NODE_ENV === 'development' ? err.message : 'Errore interno del server',
  });
}
