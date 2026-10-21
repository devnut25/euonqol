import { Router } from 'express';
import {
  getDashboardFilters,
  getDownloadSurveyQuestionnaires,
  getDownloadSurveys,
  getOverall,
  getOverallSurveys,
  getQuestionnaireDistributions,
  getSocioDemo,
} from '../controllers/dashboardController';
import {
  countSurveyLongExport,
  exportSurveyLongData,
} from '../controllers/dashboardExportController.js';
import { getScoreCrossOptions, getScoreCrossTab } from '../controllers/scoresController.js';
import { authenticate, requireUserTypes } from '../middleware/auth.js';

const router = Router();

const auth = [authenticate, requireUserTypes(['admin', 'manager'])];

router.get('/overall', ...auth, getOverall);
router.get('/overall/surveys', ...auth, getOverallSurveys);
router.get('/filters', ...auth, getDashboardFilters);
router.get('/socio', ...auth, getSocioDemo);

// Static, Dynamic and Feedback tabs: answer distributions of one questionnaire
router.get(
  '/distributions/questionnaires/:questionnaireId',
  ...auth,
  getQuestionnaireDistributions
);

// Scores tab: interactive socio-demo × score-scale cross-tab
router.get('/scores/options', ...auth, getScoreCrossOptions);
router.get('/scores/cross', ...auth, getScoreCrossTab);

// Download tab
router.get('/download/surveys', ...auth, getDownloadSurveys);
router.get('/download/surveys/:surveyId/questionnaires', ...auth, getDownloadSurveyQuestionnaires);

// Long-format XLSX export of a whole survey, driven by the dashboard dock filters
router.get('/download/surveys/:surveyId/export', ...auth, exportSurveyLongData);
// Row count of that export with the dialog's filters, for the live preview
router.get('/download/surveys/:surveyId/export/count', ...auth, countSurveyLongExport);

export default router;
