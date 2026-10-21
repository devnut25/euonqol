import { Router } from 'express';
import * as PatientController from '../controllers/patientController';
import { authenticate, requireUserTypes } from '../middleware/auth';

const router = Router();

/**
 * GET /euonqol-api/patients
 * List all patients with pagination and filters
 * Access: Admin or Manager
 */
router.get(
  '/',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  PatientController.getPatients
);

/**
 * GET /euonqol-api/patients/template
 * Download the Excel template for batch patient upload
 * Access: Admin or Manager
 * NOTE: Must come BEFORE /:id to prevent 'template' being parsed as an ID
 */
router.get(
  '/template',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  PatientController.downloadPatientsTemplate
);

/**
 * GET /euonqol-api/patients/check
 * Check if a patient_id or mail is already taken
 * Query: ?patient_id=value OR ?mail=value, optional ?excludeId=<id>
 * Access: Admin or Manager
 * NOTE: Must come BEFORE /:id
 */
router.get(
  '/check',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  PatientController.checkPatientField
);

/**
 * GET /euonqol-api/patients/:id
 * Get details of a specific patient
 * Access: Admin or Manager
 */
router.get(
  '/:id',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  PatientController.getPatientById
);

/**
 * PUT /euonqol-api/patients/:id
 * Update an existing patient
 * Access: Admin or Manager
 */
router.put(
  '/:id',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  PatientController.updatePatient
);

/**
 * PATCH /euonqol-api/patients/:id
 * Partial update of an existing patient (alias for PUT)
 * Access: Admin or Manager
 */
router.patch(
  '/:id',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  PatientController.updatePatient
);

/**
 * DELETE /euonqol-api/patients/:id
 * Deactivate a patient (soft delete)
 * Access: Admin or Manager
 */
router.delete(
  '/:id',
  authenticate,
  requireUserTypes(['admin', 'manager']),
  PatientController.deletePatient
);

export default router;
