import crypto from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { PrismaClient } from '../generated/app';
import { ServiceError } from '../helpers/ServiceError.js';
import { Resource } from '../resources/baseResource.js';
import { AssignmentDetailResource, AssignmentResource } from '../resources/assignments.js';
import { AssignmentService } from '../services/AssignmentService.js';

const prisma = new PrismaClient();

/**
 * Helper: Check if user has access to a survey
 * - Admin: always true
 * - Manager: true if created_by = user OR shared via users_surveys
 */
async function canAccessSurvey(
  userId: string,
  userType: string,
  surveyId: number
): Promise<boolean> {
  if (userType === 'admin') return true;

  // Check if manager created the survey OR has access via users_surveys
  const survey = await prisma.surveys.findFirst({
    where: {
      id: surveyId,
      OR: [
        { created_by: userId }, // userId is Keycloak UUID, created_by is VARCHAR(36)
        {
          users_surveys: {
            some: {
              user_id: userId, // user_id is VARCHAR(36)
            },
          },
        },
      ],
    },
  });

  return !!survey;
}

/**
 * Helper: Get accessible patient IDs for a user
 * - Admin: all patients
 * - Manager: own patients + patients from shared surveys
 */
async function getAccessiblePatientIds(
  userId: string,
  userType: string,
  surveyId?: number
): Promise<number[]> {
  // Admin sees all patients
  if (userType === 'admin') {
    const allPatients = await prisma.patients.findMany({
      select: { id: true },
    });
    return allPatients.map((p) => p.id);
  }

  // Manager sees own patients
  const ownPatients = await prisma.patients.findMany({
    where: { created_by: userId }, // userId is Keycloak UUID, created_by is VARCHAR(36)
    select: { id: true },
  });

  const patientIds = new Set(ownPatients.map((p) => p.id));

  // If checking for specific survey, add patients from shared surveys
  if (surveyId) {
    const sharedSurveys = await prisma.users_surveys.findMany({
      where: { user_id: userId }, // user_id is VARCHAR(36)
      select: { survey_id: true },
    });

    if (sharedSurveys.length > 0) {
      const sharedPatients = await prisma.survey_questionnaire_patients_assignment.findMany({
        where: {
          survey_questionnaire: {
            survey_id: { in: sharedSurveys.map((s) => s.survey_id) },
          },
        },
        select: { patient_id: true },
        distinct: ['patient_id'],
      });

      sharedPatients.forEach((p) => patientIds.add(p.patient_id));
    }
  }

  return Array.from(patientIds);
}

/**
 * Computes the scheduled_send_at date based on the survey's send_mode.
 */
function computeScheduledSendAt(survey: {
  send_mode: string;
  send_delay_hours: number | null;
  send_scheduled_at: Date | null;
}): Date | null {
  switch (survey.send_mode) {
    case 'immediate':
      return new Date();
    case 'after_delay':
      if (survey.send_delay_hours && survey.send_delay_hours > 0) {
        return new Date(Date.now() + survey.send_delay_hours * 3600 * 1000);
      }
      return null;
    case 'scheduled':
      return survey.send_scheduled_at ?? null;
    case 'manual':
    default:
      return null;
  }
}

/**
 * POST /euonqol-api/surveys/:surveyId/questionnaires/:questionnaireId/assignments
 * Bulk assign questionnaire to multiple patients
 */
export async function createAssignments(req: Request, res: Response, next: NextFunction) {
  try {
    const { surveyId, questionnaireId } = req.params;
    const surveyIdNum = parseInt(surveyId as string, 10);
    const questionnaireIdNum = parseInt(questionnaireId as string, 10);

    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const userId = req.user.id;
    const userType = req.user.user_type;

    if (!userType) {
      return res
        .status(401)
        .json({ success: false, message: 'User type not found in authentication token' });
    }

    const { patient_ids } = req.body;

    if (!Array.isArray(patient_ids) || patient_ids.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: 'patient_ids must be a non-empty array' });
    }

    const { assignments, created, skipped } = await AssignmentService.createBulk(
      surveyIdNum,
      questionnaireIdNum,
      patient_ids,
      userId,
      userType
    );

    return res
      .status(201)
      .json(
        Resource.respond(
          { created, skipped, assignments: AssignmentResource.collection(assignments) },
          `Successfully created ${created} assignment(s)`
        )
      );
  } catch (error) {
    if (error instanceof ServiceError) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    console.error('Error creating assignments:', error);
    return next(error);
  }
}

/**
 * POST /euonqol-api/surveys/:surveyId/questionnaires/:questionnaireId/assignments/patient
 * Create a brand-new patient scoped to this survey_questionnaire and auto-create its assignment
 * Body: { patient_id, mail?, phone_prefix?, phone?, is_active? }
 */
export async function createPatientAssignment(req: Request, res: Response, next: NextFunction) {
  try {
    const { surveyId, questionnaireId } = req.params;
    const surveyIdNum = parseInt(surveyId as string, 10);
    const questionnaireIdNum = parseInt(questionnaireId as string, 10);

    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const userId = req.user.id;
    const userType = req.user.user_type;

    if (!userType) {
      return res
        .status(401)
        .json({ success: false, message: 'User type not found in authentication token' });
    }

    const { patient_id, mail, phone_prefix, phone, is_active } = req.body;

    const result = await AssignmentService.createPatientWithAssignment(
      surveyIdNum,
      questionnaireIdNum,
      { patient_id, mail, phone_prefix, phone, is_active },
      userId,
      userType
    );

    return res.status(201).json(
      Resource.respond(
        {
          id: result.newPatient.id,
          patientId: result.newPatient.patient_id,
          surveyQuestionnaireId: result.newPatient.survey_questionnaire_id,
          mail: result.newPatient.mail,
          phone_prefix: result.newPatient.phone_prefix,
          phone: result.newPatient.phone,
          createdBy: result.newPatient.created_by,
          isActive: result.newPatient.is_active,
          createdAt: result.newPatient.created_at,
          updatedAt: result.newPatient.updated_at,
          assignment: {
            id: result.assignment.id,
            link: result.assignment.link,
            send_status: result.assignment.send_status,
            completion_status: result.assignment.completion_status,
            scheduled_send_at: result.assignment.scheduled_send_at,
          },
        },
        'Patient created successfully'
      )
    );
  } catch (error) {
    if (error instanceof ServiceError) {
      if (error.statusCode === 409) {
        return res.status(409).json({ success: false, message: error.message, error: error.message });
      }
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    console.error('Error creating patient assignment:', error);
    return next(error);
  }
}

/**
 * POST /euonqol-api/surveys/:surveyId/questionnaires/:questionnaireId/assignments/patients/bulk
 * Bulk-create new patients (CSV/Excel) scoped to this survey_questionnaire, each with an assignment
 * Body: { fileContent: string, fileType: 'csv' | 'excel' }
 */
export async function bulkCreatePatientAssignments(req: Request, res: Response, next: NextFunction) {
  try {
    const { surveyId, questionnaireId } = req.params;
    const surveyIdNum = parseInt(surveyId as string, 10);
    const questionnaireIdNum = parseInt(questionnaireId as string, 10);

    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const userId = req.user.id;
    const userType = req.user.user_type;

    if (!userType) {
      return res
        .status(401)
        .json({ success: false, message: 'User type not found in authentication token' });
    }

    const { fileContent, fileType } = req.body;

    if (!fileContent || typeof fileContent !== 'string') {
      return res
        .status(400)
        .json({ success: false, message: 'fileContent is required and must be a string' });
    }

    if (!fileType || !['csv', 'excel'].includes(fileType)) {
      return res
        .status(400)
        .json({ success: false, message: 'fileType must be either "csv" or "excel"' });
    }

    const result = await AssignmentService.bulkCreatePatientsWithAssignments(
      surveyIdNum,
      questionnaireIdNum,
      fileContent,
      fileType,
      userId,
      userType
    );

    return res.status(201).json({
      success: true,
      message:
        result.errors.length > 0
          ? `${result.errors.length} row(s) failed validation — no patients were imported`
          : 'Patients uploaded successfully',
      totalRows: result.totalRows,
      created: result.created,
      imported: result.created,
      skipped: result.skipped,
      errors: result.errors,
      results: result.results,
    });
  } catch (error) {
    if (error instanceof ServiceError) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    console.error('Error bulk creating patient assignments:', error);
    return next(error);
  }
}

/**
 * GET /euonqol-api/surveys/:surveyId/assignments
 * List all assignments for a survey with filters
 */
export async function getSurveyAssignments(req: Request, res: Response, next: NextFunction) {
  try {
    const { surveyId } = req.params;
    const surveyIdNum = parseInt(surveyId as string, 10);

    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const userId = req.user.id;
    const userType = req.user.user_type;

    if (!userType) {
      return res
        .status(401)
        .json({ success: false, message: 'User type not found in authentication token' });
    }

    const { assignments, total, take, skip } = await AssignmentService.getList(
      surveyIdNum,
      userId,
      userType,
      req.query as Record<string, any>
    );

    return res.json(
      Resource.paginate(
        AssignmentResource.resolveCollection(assignments, { policy: { authUser: req.user } }),
        total,
        take,
        skip,
        'Assignments retrieved successfully'
      )
    );
  } catch (error) {
    if (error instanceof ServiceError) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    console.error('Error fetching survey assignments:', error);
    return next(error);
  }
}

/**
 * GET /euonqol-api/assignments/:id
 * Get assignment details
 */
export async function getAssignmentById(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const assignmentId = parseInt(id as string, 10);

    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const userId = req.user.id;
    const userType = req.user.user_type;

    if (!userType) {
      return res
        .status(401)
        .json({ success: false, message: 'User type not found in authentication token' });
    }

    const assignment = await AssignmentService.getById(assignmentId, userId, userType);

    return res.json(
      Resource.respond(
        AssignmentDetailResource.make(assignment),
        'Assignment retrieved successfully'
      )
    );
  } catch (error) {
    if (error instanceof ServiceError) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    console.error('Error fetching assignment:', error);
    return next(error);
  }
}

/**
 * GET /euonqol-api/assignments/:id/email-logs
 * Full send/error history for an assignment (assignment_email_logs)
 */
export async function getAssignmentEmailLogs(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const assignmentId = parseInt(id as string, 10);

    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const userId = req.user.id;
    const userType = req.user.user_type;
    if (!userType) {
      return res
        .status(401)
        .json({ success: false, message: 'User type not found in authentication token' });
    }

    const logs = await AssignmentService.getEmailLogs(assignmentId, userId, userType);

    return res.json(Resource.respond({ logs }, 'Email logs fetched successfully'));
  } catch (error) {
    if (error instanceof ServiceError) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    console.error('Error fetching assignment email logs:', error);
    return next(error);
  }
}

/**
 * POST /euonqol-api/assignments/:id/send
 * Mark assignment as sent (prepare for email sending)
 */
export async function sendAssignment(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const assignmentId = parseInt(id as string, 10);

    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const userId = req.user.id;
    const userType = req.user.user_type;
    if (!userType) {
      return res
        .status(401)
        .json({ success: false, message: 'User type not found in authentication token' });
    }

    const { language_id } = req.body;
    let languageIdNum: number | null = null;
    if (language_id !== undefined && language_id !== null) {
      languageIdNum = parseInt(language_id, 10);
      if (isNaN(languageIdNum)) {
        return res.status(400).json({ success: false, message: 'Invalid language_id' });
      }
    }

    const assignment = await AssignmentService.send(assignmentId, languageIdNum, userId, userType);

    return res.json(Resource.respond({ assignment }, 'Assignment sent successfully'));
  } catch (error) {
    if (error instanceof ServiceError) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    console.error('Error sending assignment:', error);
    return next(error);
  }
}

/**
 * PUT /euonqol-api/surveys/:surveyId/questionnaires/:questionnaireId/assignments/sync
 * Sync assignments for a questionnaire: create missing, delete removed (unless completed)
 * Body: { patient_ids: number[] } — the full desired set of assigned patients
 */
export async function syncAssignments(req: Request, res: Response, next: NextFunction) {
  try {
    const { surveyId, questionnaireId } = req.params;
    const surveyIdNum = parseInt(surveyId as string, 10);
    const questionnaireIdNum = parseInt(questionnaireId as string, 10);

    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const userId = req.user.id;
    const userType = req.user.user_type;

    if (!userType) {
      return res
        .status(401)
        .json({ success: false, message: 'User type not found in authentication token' });
    }

    const { patient_ids } = req.body;

    if (!Array.isArray(patient_ids)) {
      return res.status(400).json({ success: false, message: 'patient_ids must be an array' });
    }

    const { created, deleted, locked } = await AssignmentService.sync(
      surveyIdNum,
      questionnaireIdNum,
      patient_ids,
      userId,
      userType
    );

    return res.json(
      Resource.respond({ created, deleted, locked }, 'Assignments synced successfully')
    );
  } catch (error) {
    if (error instanceof ServiceError) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    console.error('Error syncing assignments:', error);
    return next(error);
  }
}

/**
 * DELETE /euonqol-api/assignments/:id
 * Delete assignment (only if not completed)
 */
export async function deleteAssignment(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const assignmentId = parseInt(id as string, 10);

    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const userId = req.user.id;
    const userType = req.user.user_type;

    if (!userType) {
      return res
        .status(401)
        .json({ success: false, message: 'User type not found in authentication token' });
    }

    const deletedAssignment = await AssignmentService.delete(assignmentId, userId, userType);

    return res.json(
      Resource.respond({ deletedAssignment }, 'Assignment deleted successfully')
    );
  } catch (error) {
    if (error instanceof ServiceError) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    console.error('Error deleting assignment:', error);
    return next(error);
  }
}
