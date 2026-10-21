/**
 * CAT Routes
 * Routes for CAT (Computer Adaptive Testing) dynamic questionnaires
 */

import { Router } from 'express';
import * as catController from '../controllers/catController';

const router = Router();

/**
 * POST /euonqol-api/public/link/:link/modules/:moduleId/next-question
 * Get next adaptive question for CAT module
 * Public route - no authentication required (uses link validation)
 */
router.post('/link/:link/modules/:moduleId/next-question', catController.getNextCatQuestion);

/**
 * GET /euonqol-api/public/link/:link/modules/:moduleId/status
 * Get CAT module status and progress
 * Public route - no authentication required (uses link validation)
 */
router.get('/link/:link/modules/:moduleId/status', catController.getCatModuleStatus);

/**
 * POST /euonqol-api/public/link/:link/modules/:moduleId/prev-question
 * Go back to the previous CAT question (removes last response and rebuilds session)
 * Public route - no authentication required (uses link validation)
 */
router.post('/link/:link/modules/:moduleId/prev-question', catController.getPrevCatQuestion);

/**
 * GET /euonqol-api/public/link/:link/modules/:moduleId/scale/:scale/history
 * Every item a scale's session has served, in served order, with the patient's
 * saved answer for each — lets the patient browse back into (and, before
 * review, edit) an adaptive scale's questions whether it's open or closed.
 * Public route - no authentication required (uses link validation)
 */
router.get('/link/:link/modules/:moduleId/scale/:scale/history', catController.getCatScaleHistory);

export default router;
