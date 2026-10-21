import { Router } from 'express';
import {
  getHomepageActivities,
  getHomepageAlerts,
  getHomepageHighlights,
  getHomepageOngoingSurveys,
  getHomepageSummary,
} from '../controllers/homepageController';
import { authenticate, requireUserTypes } from '../middleware/auth.js';

const router = Router();

const auth = [authenticate, requireUserTypes(['admin', 'manager'])];

router.get('/summary', ...auth, getHomepageSummary);
router.get('/highlights', ...auth, getHomepageHighlights);
router.get('/activities', ...auth, getHomepageActivities);
router.get('/alerts', ...auth, getHomepageAlerts);
router.get('/ongoing-surveys', ...auth, getHomepageOngoingSurveys);

export default router;
