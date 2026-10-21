// src/routes/errorLog.ts
import { sendErrorToTeams } from '@/helpers/teamsNotifier';
import { Request, Response, Router } from 'express';

const router = Router();

interface FrontendError {
  error: string;
  stack?: string;
  componentStack?: string;
  timestamp: string;
  url?: string;
  userAgent?: string;
}

router.post('/log-error', async (req: Request, res: Response) => {
  try {
    const errorData: FrontendError = req.body;
    console.error('[FRONTEND ERROR]', errorData.error, '\n', errorData.stack, '\n', errorData.componentStack);

    const customError = new Error(`[FRONTEND] ${errorData.error}`);
    customError.stack = errorData.stack;
    
    await sendErrorToTeams(customError, req);
    
    res.status(200).json({ message: 'Errore registrato' });
  } catch (error) {
    console.error('Errore nella registrazione del log:', error);
    res.status(500).json({ message: 'Errore nella registrazione' });
  }
});

export default router;