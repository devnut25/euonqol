import { Router } from 'express';
import { downloadExternal, downloadUpload } from '../controllers/downloadController.js';

const router = Router();

// Public — no `authenticate` — patients reach uploaded PDFs from unauthenticated
// /public/... links (see downloadController.ts for details).
router.get('/uploads/*splat', downloadUpload);
router.get('/downloads/external', downloadExternal);

export default router;
