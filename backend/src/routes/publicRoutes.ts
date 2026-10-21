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
  saveResponses,
  startSession,
} from '../controllers/publicController';

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

// Get study info sheet text for public link
router.get('/link/:link/study-info-sheet', getPublicStudyInfoSheet);

// Record study info sheet rejection for private (identified/traceable) links
router.post('/link/:link/study-info-reject', recordStudyInfoRejection);

// Get closing message text for public link (shown on the completed screen)
router.get('/link/:link/closing-message', getPublicClosingMessage);

export default router;
