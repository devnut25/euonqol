import { Router } from 'express';
import {
  createPrivacyPolicy,
  getPrivacyPolicies,
  getPrivacyPolicyById,
} from '../controllers/privacyPolicyController.js';
import { authenticate, requireUserTypes } from '../middleware/auth.js';
import { pdfUpload } from '../middleware/upload.js';

const router = Router();

// CRUD — admin and manager
router.get('/', authenticate, requireUserTypes(['admin', 'manager']), getPrivacyPolicies);
router.get('/:id', authenticate, requireUserTypes(['admin', 'manager']), getPrivacyPolicyById);
router.post(
  '/',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  pdfUpload,
  createPrivacyPolicy
);

export default router;
