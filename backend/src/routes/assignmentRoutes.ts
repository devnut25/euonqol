import { Router } from 'express';
import {
  bulkCreatePatientAssignments,
  createAssignments,
  createPatientAssignment,
  deleteAssignment,
  getAssignmentById,
  getAssignmentEmailLogs,
  getSurveyAssignments,
  sendAssignment,
} from '../controllers/assignmentController';
import { authenticate, requireUserTypes } from '../middleware/auth';

const router = Router();

// Create bulk assignments for a questionnaire in a survey (existing patients)
router.post(
  '/surveys/:surveyId/questionnaires/:questionnaireId/assignments',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  createAssignments
);

// Create a brand-new patient scoped to this survey_questionnaire + its assignment
router.post(
  '/surveys/:surveyId/questionnaires/:questionnaireId/assignments/patient',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  createPatientAssignment
);

// Bulk-create new patients (CSV/Excel) scoped to this survey_questionnaire + their assignments
router.post(
  '/surveys/:surveyId/questionnaires/:questionnaireId/assignments/patients/bulk',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  bulkCreatePatientAssignments
);

// List all assignments for a survey
router.get(
  '/surveys/:surveyId/assignments',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  getSurveyAssignments
);

// Get assignment details
router.get(
  '/assignments/:id',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  getAssignmentById
);

// Full send/error history for an assignment (assignment_email_logs)
router.get(
  '/assignments/:id/email-logs',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  getAssignmentEmailLogs
);

// Send assignment (mark as sent, trigger email)
router.post(
  '/assignments/:id/send',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  sendAssignment
);

// Delete assignment
router.delete(
  '/assignments/:id',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  deleteAssignment
);

export default router;
