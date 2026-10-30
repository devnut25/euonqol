import { requireUserTypes } from '@/middleware/auth.js';
import { Router } from 'express';
import {
  createQuestionnaire,
  deletePublicLink,
  deleteQuestionnaire,
  deleteSurveyQuestionnaire,
  generatePublicLink,
  getPublicLink,
  getQuestionnaireById,
  getQuestionnairePreview,
  getSurveyQuestionnaires,
  updateQuestionnaire,
  updateQuestionnaireModules,
} from '../controllers/questionnaireController.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createQuestionnaireSchema, updateQuestionnaireSchema } from '../validators/schemas/questionnaire.js';

const router = Router();

// Survey-specific questionnaires
router.post(
  '/surveys/:surveyId/questionnaires',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  validate(createQuestionnaireSchema),
  createQuestionnaire
);
router.get('/surveys/:surveyId/questionnaires', authenticate, getSurveyQuestionnaires);

// Public link management (anonymous mode)
router.post(
  '/surveys/:surveyId/questionnaires/:questionnaireId/public-link',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  generatePublicLink
);
router.get(
  '/surveys/:surveyId/questionnaires/:questionnaireId/public-link',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  getPublicLink
);
router.delete(
  '/surveys/:surveyId/questionnaires/:questionnaireId/public-link',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  deletePublicLink
);

// Individual questionnaire operations
router.get('/questionnaires/:id', authenticate, getQuestionnaireById);
// Survey-scoped detail & update (CrudDataTable uses itemUrl = baseUrl/:id)
router.get('/surveys/:surveyId/questionnaires/:id', authenticate, getQuestionnaireById);
router.put(
  '/questionnaires/:id',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  validate(updateQuestionnaireSchema),
  updateQuestionnaire
);
router.patch(
  '/questionnaires/:id',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  validate(updateQuestionnaireSchema),
  updateQuestionnaire
);
// Survey-scoped update (CrudDataTable PATCH to baseUrl/:id)
router.patch(
  '/surveys/:surveyId/questionnaires/:id',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  validate(updateQuestionnaireSchema),
  updateQuestionnaire
);
router.delete(
  '/surveys/:surveyId/questionnaires/:id',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  deleteSurveyQuestionnaire
);
router.delete(
  '/questionnaires/:id',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  deleteQuestionnaire
);

// Module management
router.put(
  '/questionnaires/:id/modules',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  updateQuestionnaireModules
);

// Preview (public - patients will use this)
router.get('/questionnaires/:id/preview', getQuestionnairePreview);

export default router;
