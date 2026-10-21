import { Router } from 'express';
import {
  createEmailTemplate,
  deleteEmailTemplate,
  getEmailTemplate,
  listEmailTemplates,
  toggleEmailTemplateFallback,
  updateEmailTemplate,
} from '../controllers/emailTemplateController';
import { authenticate, requireUserTypes } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { createEmailTemplateSchema, updateEmailTemplateSchema } from '../validators/schemas/emailTemplate';

const router = Router();

// List all email templates for a survey+questionnaire
router.get(
  '/surveys/:surveyId/questionnaires/:questionnaireId/email-templates',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  listEmailTemplates
);

// Fetch a single email template
router.get(
  '/surveys/:surveyId/questionnaires/:questionnaireId/email-templates/:languageId',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  getEmailTemplate
);

// Create an email template for a specific language
router.post(
  '/surveys/:surveyId/questionnaires/:questionnaireId/email-templates',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  validate(createEmailTemplateSchema),
  createEmailTemplate
);

// Update an email template for a specific language
router.put(
  '/surveys/:surveyId/questionnaires/:questionnaireId/email-templates/:languageId',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  validate(updateEmailTemplateSchema),
  updateEmailTemplate
);

router.patch(
  '/surveys/:surveyId/questionnaires/:questionnaireId/email-templates/:languageId',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  validate(updateEmailTemplateSchema),
  updateEmailTemplate
);

// Toggle fallback for an email template
router.put(
  '/surveys/:surveyId/questionnaires/:questionnaireId/email-templates/:languageId/fallback',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  toggleEmailTemplateFallback
);

// Delete an email template for a specific language
router.delete(
  '/surveys/:surveyId/questionnaires/:questionnaireId/email-templates/:languageId',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  deleteEmailTemplate
);

export default router;
