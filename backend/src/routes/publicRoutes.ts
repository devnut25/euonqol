import { Router } from 'express';
import {
  accessQuestionnaire,
  completeQuestionnaire,
  getAvailableLanguages,
  getProgress,
  getPublicClosingMessage,
  getPublicEligibilityQuestions,
  getPublicPresentation,
  getPublicPrivacyPolicy,
  getPublicStudyInfoSheet,
  recordEligibilityDisqualification,
  recordStudyInfoRejection,
  resetEligibilityDisqualification,
  resetStudyInfoRejection,
  saveResponses,
  startSession,
  submitScreeningOutcome,
} from '../controllers/publicController';
import { getPublicUiTranslations } from '../controllers/uiTranslationController.js';

const router = Router();

/**
 * Public API routes (no authentication required)
 * These endpoints are used by patients to access and complete questionnaires
 * via anonymous public links or private traceable/identified links
 */

// Access questionnaire by link
router.get('/link/:link', accessQuestionnaire);

// Get privacy policy for a link (before start, after language selection)
router.get('/link/:link/privacy-policy', getPublicPrivacyPolicy);

// Start or resume session
router.post('/link/:link/start', startSession);

// Save responses incrementally
router.put('/link/:link/responses', saveResponses);

// Complete questionnaire
router.post('/link/:link/complete', completeQuestionnaire);

// Get completion progress
router.get('/link/:link/progress', getProgress);

// Get available languages for the questionnaire
router.get('/link/:link/languages', getAvailableLanguages);

// Get presentation text for public link
router.get('/link/:link/presentation', getPublicPresentation);

// Get eligibility questions for public link
router.get('/link/:link/eligibility-questions', getPublicEligibilityQuestions);

// Record eligibility disqualification for private (identified/traceable) links
router.post('/link/:link/eligibility-disqualify', recordEligibilityDisqualification);

// Clear a persisted eligibility disqualification (patient went back and corrected the answer)
router.post('/link/:link/eligibility-reset', resetEligibilityDisqualification);

// Get study info sheet text for public link
router.get('/link/:link/study-info-sheet', getPublicStudyInfoSheet);

// Record study info sheet rejection for private (identified/traceable) links
router.post('/link/:link/study-info-reject', recordStudyInfoRejection);

// Clear a persisted study info rejection (patient went back and gave consent)
router.post('/link/:link/study-info-reset', resetStudyInfoRejection);

// Submit a failed eligibility / refused consent: closes the assignment as completed
router.post('/link/:link/screening-submit', submitScreeningOutcome);

// Get closing message text for public link (shown on the completed screen)
router.get('/link/:link/closing-message', getPublicClosingMessage);

// Get UI strings (buttons, errors, screen-reader texts) for a language
router.get('/ui-translations', getPublicUiTranslations);

export default router;
