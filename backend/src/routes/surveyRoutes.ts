import { Router } from 'express';
import { pdfUpload } from '../middleware/upload.js';
import {
  createSurvey,
  deleteSurvey,
  duplicateSurvey,
  getSurveyById,
  getSurveyPrerequisites,
  getSurveys,
  getSurveysAll,
  publishSurvey,
  updateSurvey,
} from '../controllers/surveyController.js';
import {
  createEligibilityQuestion,
  deleteEligibilityLanguage,
  deleteEligibilityQuestion,
  getEligibilityQuestions,
  reorderEligibilityQuestions,
  setEligibilityLanguageFallback,
  toggleEligibilityTranslationFallback,
  updateEligibilityQuestion,
  upsertEligibilityTranslations,
} from '../controllers/surveyEligibilityController.js';
import {
  downloadClosingMessagesTemplate,
  downloadEligibilityTemplate,
  downloadPresentationsTemplate,
  downloadPrivacyPoliciesTemplate,
  downloadStudyInfoSheetTemplate,
  importClosingMessages,
  importEligibilityQuestions,
  importPresentations,
  importPrivacyPolicies,
  importStudyInfoSheet,
} from '../controllers/surveyImportController.js';
import {
  getSurveyManagers,
  inviteManager,
  removeManager,
  updateManagerAccess,
} from '../controllers/surveyManagerController.js';
import {
  deleteSurveyClosingMessage,
  getSurveyClosingMessageById,
  getSurveyClosingMessageHistory,
  getSurveyClosingMessages,
  toggleClosingMessageFallback,
  updateSurveyClosingMessage,
  upsertSurveyClosingMessage,
} from '../controllers/surveyClosingMessageController.js';
import {
  deleteSurveyPresentation,
  getSurveyPresentationById,
  getSurveyPresentationHistory,
  getSurveyPresentations,
  togglePresentationFallback,
  updateSurveyPresentation,
  upsertSurveyPresentation,
} from '../controllers/surveyPresentationController.js';
import {
  addSurveyPrivacyPolicy,
  createSurveyPrivacyPolicy,
  getSurveyPrivacyPolicies,
  getSurveyPrivacyPolicyById,
  removeSurveyPrivacyPolicy,
  setSurveyFallbackPolicy,
  updateSurveyPrivacyPolicies,
  updateSurveyPrivacyPolicy,
} from '../controllers/surveyPrivacyPolicyController.js';
import {
  deleteSurveyStudyInfoSheet,
  getSurveyStudyInfoSheetById,
  getSurveyStudyInfoSheetHistory,
  getSurveyStudyInfoSheets,
  toggleStudyInfoSheetFallback,
  updateSurveyStudyInfoSheet,
  upsertSurveyStudyInfoSheet,
} from '../controllers/surveyStudyInfoSheetController.js';
import { authenticate, requireUserTypes } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { upsertClosingMessageSchema } from '../validators/schemas/surveyClosingMessage.js';
import {
  createEligibilityQuestionSchema,
  reorderEligibilitySchema,
  setLanguageFallbackSchema,
  updateEligibilityQuestionSchema,
  upsertEligibilityTranslationsSchema,
} from '../validators/schemas/surveyEligibility.js';

const router = Router();

/**
 * Survey routes
 * Base path: /euonqol-api/surveys
 */

// ─── Excel template downloads (must come before /:id routes) ─────────────────
router.get(
  '/templates/presentations',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  downloadPresentationsTemplate
);
router.get(
  '/templates/eligibility-questions',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  downloadEligibilityTemplate
);
router.get(
  '/templates/privacy-policies',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  downloadPrivacyPoliciesTemplate
);
router.get(
  '/templates/study-info-sheet',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  downloadStudyInfoSheetTemplate
);
router.get(
  '/templates/closing-messages',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  downloadClosingMessagesTemplate
);

// GET /euonqol-api/surveys - List all surveys with filters
router.get('/', authenticate, requireUserTypes(['admin', 'manager']), getSurveys);

// GET /euonqol-api/surveys/all - Every visible survey, unpaginated (must come before /:id)
router.get('/all', authenticate, requireUserTypes(['admin', 'manager']), getSurveysAll);

// POST /euonqol-api/surveys/:id/duplicate - Duplicate a survey (must be before /:id routes)
router.post(
  '/:id/duplicate',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  duplicateSurvey
);

// POST /euonqol-api/surveys/:id/publish - Manual DRAFT -> PUBLIC transition (must be before /:id routes)
router.post(
  '/:id/publish',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  publishSurvey
);

// POST /euonqol-api/surveys - Create new survey (ADMIN or MANAGER)
router.post('/', authenticate, requireUserTypes(['admin', 'manager']), createSurvey);

// GET /euonqol-api/surveys/:id - Get survey details
router.get('/:id', authenticate, requireUserTypes(['admin', 'manager']), getSurveyById);

// GET /euonqol-api/surveys/:id/prerequisites - Presentation/eligibility/privacy-policy readiness
// for questionnaire creation (must come before other /:id/... routes for clarity, though
// the segment name doesn't collide with any existing sub-route)
router.get(
  '/:id/prerequisites',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  getSurveyPrerequisites
);

// PUT /euonqol-api/surveys/:id - Update survey (ADMIN or MANAGER)
router.put('/:id', authenticate, requireUserTypes(['admin', 'manager']), updateSurvey);

// PATCH /euonqol-api/surveys/:id - Partial update (alias for PUT)
router.patch('/:id', authenticate, requireUserTypes(['admin', 'manager']), updateSurvey);

// PATCH /euonqol-api/surveys/:id - Partial update (alias for PUT)
router.patch('/:id', authenticate, requireUserTypes(['admin', 'manager']), updateSurvey);

// DELETE /euonqol-api/surveys/:id - Delete survey (ADMIN or MANAGER)
router.delete('/:id', authenticate, requireUserTypes(['admin', 'manager']), deleteSurvey);

// GET /euonqol-api/surveys/:id/privacy-policies - Get privacy policies for a survey
router.get(
  '/:id/privacy-policies',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  getSurveyPrivacyPolicies
);

// PUT /euonqol-api/surveys/:id/privacy-policies - Set privacy policies for a survey
router.put(
  '/:id/privacy-policies',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  updateSurveyPrivacyPolicies
);

// POST /euonqol-api/surveys/:id/privacy-policies - Create a new privacy policy and link it to the survey
router.post(
  '/:id/privacy-policies',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  pdfUpload,
  createSurveyPrivacyPolicy
);

// PUT /euonqol-api/surveys/:id/privacy-policies/:policyId/fallback - Toggle fallback (BEFORE /:policyId)
router.put(
  '/:id/privacy-policies/:policyId/fallback',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  setSurveyFallbackPolicy
);

// POST /euonqol-api/surveys/:id/privacy-policies/import - Bulk import from Excel (BEFORE /:policyId)
router.post(
  '/:id/privacy-policies/import',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  importPrivacyPolicies
);

// GET /euonqol-api/surveys/:id/privacy-policies/:policyId - Get single policy linked to survey
router.get(
  '/:id/privacy-policies/:policyId',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  getSurveyPrivacyPolicyById
);

// POST /euonqol-api/surveys/:id/privacy-policies/:policyId - Add a single policy to survey
router.post(
  '/:id/privacy-policies/:policyId',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  addSurveyPrivacyPolicy
);

// PATCH /euonqol-api/surveys/:id/privacy-policies/:policyId - Update a single policy linked to survey
router.patch(
  '/:id/privacy-policies/:policyId',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  pdfUpload,
  updateSurveyPrivacyPolicy
);

// DELETE /euonqol-api/surveys/:id/privacy-policies/:policyId - Remove a single policy from survey
router.delete(
  '/:id/privacy-policies/:policyId',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  removeSurveyPrivacyPolicy
);

/**
 * Survey Manager Collaboration routes
 */

// POST /euonqol-api/surveys/:surveyId/managers - Invite manager to survey
router.post(
  '/:surveyId/managers',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  inviteManager
);

// GET /euonqol-api/surveys/:surveyId/managers - List managers with access
router.get(
  '/:surveyId/managers',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  getSurveyManagers
);

// PATCH /euonqol-api/surveys/:surveyId/managers/:managerId - Update manager permissions
router.patch(
  '/:surveyId/managers/:managerId',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  updateManagerAccess
);

// DELETE /euonqol-api/surveys/:surveyId/managers/:managerId - Remove manager access
router.delete(
  '/:surveyId/managers/:managerId',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  removeManager
);

/**
 * Presentation routes
 */

// GET /euonqol-api/surveys/:id/presentation/history - History for a language (BEFORE /:id/presentation)
router.get(
  '/:id/presentation/history',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  getSurveyPresentationHistory
);

// GET /euonqol-api/surveys/:id/presentation - List current presentations
router.get(
  '/:id/presentation',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  getSurveyPresentations
);

// GET /euonqol-api/surveys/:id/presentation/:presentationId - Get single presentation by id
router.get(
  '/:id/presentation/:presentationId',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  getSurveyPresentationById
);

// POST /euonqol-api/surveys/:id/presentation - Upsert (versioned)
router.post(
  '/:id/presentation',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  pdfUpload,
  upsertSurveyPresentation
);

// PATCH /euonqol-api/surveys/:id/presentation/:presentationId - Update (versioned upsert)
router.patch(
  '/:id/presentation/:presentationId',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  pdfUpload,
  updateSurveyPresentation
);

// DELETE /euonqol-api/surveys/:id/presentation/:presentationId - Soft-delete a presentation
router.delete(
  '/:id/presentation/:presentationId',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  deleteSurveyPresentation
);

// PUT /euonqol-api/surveys/:id/presentation/:presentationId/fallback - Toggle fallback
router.put(
  '/:id/presentation/:presentationId/fallback',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  togglePresentationFallback
);

/**
 * Closing message routes
 */

// GET /euonqol-api/surveys/:id/closing-message/history - History for a language (BEFORE /:id/closing-message)
router.get(
  '/:id/closing-message/history',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  getSurveyClosingMessageHistory
);

// GET /euonqol-api/surveys/:id/closing-message - List current closing messages
router.get(
  '/:id/closing-message',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  getSurveyClosingMessages
);

// GET /euonqol-api/surveys/:id/closing-message/:closingMessageId - Get single closing message by id
router.get(
  '/:id/closing-message/:closingMessageId',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  getSurveyClosingMessageById
);

// POST /euonqol-api/surveys/:id/closing-message - Upsert (versioned)
router.post(
  '/:id/closing-message',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  validate(upsertClosingMessageSchema),
  upsertSurveyClosingMessage
);

// PATCH /euonqol-api/surveys/:id/closing-message/:closingMessageId - Update (versioned upsert)
router.patch(
  '/:id/closing-message/:closingMessageId',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  validate(upsertClosingMessageSchema),
  updateSurveyClosingMessage
);

// DELETE /euonqol-api/surveys/:id/closing-message/:closingMessageId - Soft-delete a closing message
router.delete(
  '/:id/closing-message/:closingMessageId',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  deleteSurveyClosingMessage
);

// PUT /euonqol-api/surveys/:id/closing-message/:closingMessageId/fallback - Toggle fallback
router.put(
  '/:id/closing-message/:closingMessageId/fallback',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  toggleClosingMessageFallback
);

/**
 * Study Info Sheet routes
 */

// GET /euonqol-api/surveys/:id/study-info-sheet/history - History for a language (BEFORE /:id/study-info-sheet)
router.get(
  '/:id/study-info-sheet/history',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  getSurveyStudyInfoSheetHistory
);

// GET /euonqol-api/surveys/:id/study-info-sheet - List current study info sheets
router.get(
  '/:id/study-info-sheet',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  getSurveyStudyInfoSheets
);

// POST /euonqol-api/surveys/:id/study-info-sheet/import - Bulk import from Excel (BEFORE /:sheetId)
router.post(
  '/:id/study-info-sheet/import',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  importStudyInfoSheet
);

// GET /euonqol-api/surveys/:id/study-info-sheet/:sheetId - Get single study info sheet by id
router.get(
  '/:id/study-info-sheet/:sheetId',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  getSurveyStudyInfoSheetById
);

// POST /euonqol-api/surveys/:id/study-info-sheet - Upsert (versioned)
router.post(
  '/:id/study-info-sheet',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  pdfUpload,
  upsertSurveyStudyInfoSheet
);

// PATCH /euonqol-api/surveys/:id/study-info-sheet/:sheetId - Update (versioned upsert)
router.patch(
  '/:id/study-info-sheet/:sheetId',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  pdfUpload,
  updateSurveyStudyInfoSheet
);

// DELETE /euonqol-api/surveys/:id/study-info-sheet/:sheetId - Soft-delete a study info sheet
router.delete(
  '/:id/study-info-sheet/:sheetId',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  deleteSurveyStudyInfoSheet
);

// PUT /euonqol-api/surveys/:id/study-info-sheet/:sheetId/fallback - Toggle fallback
router.put(
  '/:id/study-info-sheet/:sheetId/fallback',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  toggleStudyInfoSheetFallback
);

/**
 * Eligibility Questions routes
 */

// PUT /euonqol-api/surveys/:id/eligibility-questions/reorder - Bulk reorder (BEFORE /:qid)
router.put(
  '/:id/eligibility-questions/reorder',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  validate(reorderEligibilitySchema),
  reorderEligibilityQuestions
);

// PATCH /euonqol-api/surveys/:id/eligibility-questions/language-fallback - Set whole-language fallback
router.patch(
  '/:id/eligibility-questions/language-fallback',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  validate(setLanguageFallbackSchema),
  setEligibilityLanguageFallback
);

// PATCH /euonqol-api/surveys/:id/eligibility-questions/translations/:langId - Batch upsert translations
router.patch(
  '/:id/eligibility-questions/translations/:langId',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  validate(upsertEligibilityTranslationsSchema),
  upsertEligibilityTranslations
);

// DELETE /euonqol-api/surveys/:id/eligibility-questions/language/:langId - Remove all translations for a language
router.delete(
  '/:id/eligibility-questions/language/:langId',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  deleteEligibilityLanguage
);

// GET /euonqol-api/surveys/:id/eligibility-questions - List all with translations
router.get(
  '/:id/eligibility-questions',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  getEligibilityQuestions
);

// POST /euonqol-api/surveys/:id/eligibility-questions - Create question + translations
router.post(
  '/:id/eligibility-questions',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  validate(createEligibilityQuestionSchema),
  createEligibilityQuestion
);

// PUT /euonqol-api/surveys/:id/eligibility-questions/:qid - Versioned update
router.put(
  '/:id/eligibility-questions/:qid',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  validate(updateEligibilityQuestionSchema),
  updateEligibilityQuestion
);

// DELETE /euonqol-api/surveys/:id/eligibility-questions/:qid - Soft-delete
router.delete(
  '/:id/eligibility-questions/:qid',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  deleteEligibilityQuestion
);

// PATCH /euonqol-api/surveys/:id/eligibility-questions/:qid/translations/:langId/fallback - Toggle translation fallback
router.patch(
  '/:id/eligibility-questions/:qid/translations/:langId/fallback',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  toggleEligibilityTranslationFallback
);

// ─── Excel bulk import endpoints ──────────────────────────────────────────────
router.post(
  '/:id/presentations/import',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  importPresentations
);
router.post(
  '/:id/eligibility-questions/import',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  importEligibilityQuestions
);
router.post(
  '/:id/closing-messages/import',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  importClosingMessages
);

export default router;
