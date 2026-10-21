import { NextFunction, Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { ServiceError } from '../helpers/ServiceError.js';
import { Resource } from '../resources/baseResource.js';
import { PatientDetailResource, PatientResource } from '../resources/patients.js';
import { PatientService } from '../services/PatientService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.resolve(__dirname, '../../data/templates');

/**
 * GET /euonqol-api/patients/template
 * Download the Excel template for batch patient upload
 */
export async function downloadPatientsTemplate(req: Request, res: Response, next: NextFunction) {
  const filePath = path.join(TEMPLATES_DIR, 'Patients_Template.xlsx');
  return res.download(filePath, 'PatientsTemplate.xlsx', (err) => {
    if (err) {
      console.error('Error sending patients template:', err);
      next(err);
    }
  });
}

/**
 * GET /euonqol-api/patients/check
 * Check if a patient_id or mail already exists within the same survey_questionnaire
 * Query: ?patient_id=value or ?mail=value, with required ?surveyQuestionnaireId=<id>
 *        and optional ?excludeId=<numericPatientId>
 * Access: Admin or Manager
 */
export async function checkPatientField(req: Request, res: Response, next: NextFunction) {
  try {
    const { patient_id, mail, excludeId, surveyQuestionnaireId } = req.query;

    const result = await PatientService.checkAvailability({
      patient_id: patient_id as string | undefined,
      mail: mail as string | undefined,
      excludeId: excludeId as string | undefined,
      surveyQuestionnaireId: surveyQuestionnaireId as string | undefined,
    });

    return res.json(Resource.respond(result, 'Availability checked successfully'));
  } catch (err) {
    if (err instanceof ServiceError) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    return next(err);
  }
}

/**
 * GET /euonqol-api/patients
 * List all patients with pagination and filters
 * Query params (QueryBuilder style):
 *   ?filter[isAnonymous]=true&filter[isActive]=true&filter[patientGroup]=Diabete
 *   ?search=foo
 *   ?sort=-mail
 *   ?page=1&limit=50
 */
export async function getPatients(req: Request, res: Response, next: NextFunction) {
  try {
    const { patients, total, take, skip } = await PatientService.getList(
      req.query as Record<string, any>,
      req.user
    );

    const data = PatientResource.collection(patients);
    return res.json(Resource.paginate(data, total, take, skip, 'Patients retrieved successfully'));
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /euonqol-api/patients/:id
 * Get single patient by ID
 */
export async function getPatientById(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const patientId = parseInt(id as string, 10);

    if (isNaN(patientId)) {
      return res.status(400).json({ error: 'Invalid patient ID' });
    }

    const patient = await PatientService.getById(patientId);

    if (!patient) {
      return res.status(404).json({
        error: 'Patient not found',
        message: `No patient found with ID ${patientId}`,
      });
    }

    return res.json(
      Resource.respond(PatientDetailResource.make(patient), 'Patient retrieved successfully')
    );
  } catch (err) {
    return next(err);
  }
}

/**
 * PUT /euonqol-api/patients/:id
 * Update an existing patient (Admin or Manager)
 */
export async function updatePatient(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const patientPk = parseInt(id as string, 10);

    if (isNaN(patientPk)) {
      return res.status(400).json({ error: 'Invalid patient ID' });
    }

    const updated = await PatientService.update(patientPk, req.body);

    return res.json(
      Resource.respond(PatientDetailResource.make(updated), 'Patient updated successfully')
    );
  } catch (err) {
    if (err instanceof ServiceError) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    return next(err);
  }
}

/**
 * DELETE /euonqol-api/patients/:id
 * Deactivate a patient (soft delete, Admin or Manager)
 */
export async function deletePatient(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const patientPk = parseInt(id as string, 10);

    if (isNaN(patientPk)) {
      return res.status(400).json({ error: 'Invalid patient ID' });
    }

    const { patient, hadAssignments, hadSessions } = await PatientService.delete(patientPk);

    return res.json(
      Resource.respond(
        {
          id: patient.id,
          patientId: patient.patient_id,
          isActive: patient.is_active,
          note: 'The patient has been deactivated but not deleted. Associated data remains intact.',
          hadAssignments,
          hadSessions,
        },
        'Patient deactivated successfully'
      )
    );
  } catch (err) {
    if (err instanceof ServiceError) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    return next(err);
  }
}
