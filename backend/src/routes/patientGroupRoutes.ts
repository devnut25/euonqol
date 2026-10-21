import { Router } from 'express';
import * as PatientGroupController from '../controllers/patientGroupController';
import { authenticate, requireUserTypes } from '../middleware/auth';

const router = Router();

/**
 * GET /euonqol-api/patient-groups
 * Lista tutti i patient groups con conteggio domande
 */
router.get('/', PatientGroupController.getPatientGroups);

/**
 * GET /euonqol-api/patient-groups/:id
 * Get details of a specific patient group
 */
router.get('/:id', PatientGroupController.getPatientGroupById);

/**
 * POST /euonqol-api/patient-groups
 * Create a new patient group (Admin only)
 */
router.post('/', authenticate, requireUserTypes(['admin']), PatientGroupController.createPatientGroup);

/**
 * PUT /euonqol-api/patient-groups/:id
 * Update an existing patient group (Admin only)
 */
router.put('/:id', authenticate, requireUserTypes(['admin']), PatientGroupController.updatePatientGroup);

/**
 * DELETE /euonqol-api/patient-groups/:id
 * Disable a patient group (Admin only)
 */
router.delete('/:id', authenticate, requireUserTypes(['admin']), PatientGroupController.deletePatientGroup);

/**
 * GET /euonqol-api/patient-groups/:id/questions
 * Ottiene tutte le domande assegnate a un patient group
 */
router.get('/:id/questions', PatientGroupController.getPatientGroupQuestions);

/**
 * PATCH /euonqol-api/patient-groups/:id/questions
 * Bulk update delle assegnazioni question-group
 */
router.patch('/:id/questions', PatientGroupController.updatePatientGroupQuestions);

export default router;
