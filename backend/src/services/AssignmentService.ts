import crypto from 'crypto';
import * as XLSX from 'xlsx';
import { PrismaClient } from '../generated/app/index.js';
import { QueryBuilder } from '../helpers/QueryBuilder.js';
import { ServiceError } from '../helpers/ServiceError.js';
import { AssignmentModelConfig, computeScheduledSendAt } from '../models/Assignment.js';
import { AssignmentSchedulerService } from './AssignmentSchedulerService.js';
import { attachUserRef, attachUserRefOne } from './keycloakUserRefs.js';
import { QuestionnaireService } from './QuestionnaireService.js';

export interface NewPatientData {
  patient_id: string;
  mail?: string | null;
  phone_prefix?: string | null;
  phone?: string | null;
  is_active?: boolean;
}

const prisma = new PrismaClient();

export interface GetListOptions {
  page?: string;
  pageSize?: string;
  questionnaireId?: string;
  patientGroupId?: string;
  send_status?: string;
  completion_status?: string;
  search?: string;
  filter?: Record<string, any>;
  sort?: string;
}

export class AssignmentService {
  /**
   * An assignment can't be created until at least one email template exists for its
   * survey_questionnaire — otherwise the scheduled/immediate send has nothing to send
   * and silently fails later (recorded as a failed email log instead of blocking here).
   */
  private static async assertEmailTemplateExists(surveyQuestionnaireId: number) {
    const template = await prisma.surveys_questionnaires_email_templates.findFirst({
      where: { survey_questionnaire_id: surveyQuestionnaireId },
      select: { id: true },
    });
    if (!template) {
      throw new ServiceError(
        'Cannot create an assignment: no email template has been configured for this questionnaire yet',
        400
      );
    }
  }

  /** Assignments can only be created or modified while the survey is draft or public. */
  private static assertSurveyAcceptsAssignments(survey: { status: string }) {
    if (!['draft', 'public'].includes(survey.status)) {
      throw new ServiceError(
        'Cannot create or modify assignments: the survey is not open (must be draft or public)',
        409
      );
    }
  }

  /**
   * Check if user has access to a survey.
   * - Admin: always true
   * - Manager: true if created_by = user OR shared via users_surveys
   */
  static async canAccessSurvey(
    userId: string,
    userType: string,
    surveyId: number
  ): Promise<boolean> {
    if (userType === 'admin') return true;

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
   * Get accessible patient IDs for a user.
   * - Admin: all patients
   * - Manager: own patients + patients from shared surveys
   */
  static async getAccessiblePatientIds(
    userId: string,
    userType: string,
    surveyId?: number
  ): Promise<number[]> {
    if (userType === 'admin') {
      const allPatients = await prisma.patients.findMany({
        select: { id: true },
      });
      return allPatients.map((p) => p.id);
    }

    const ownPatients = await prisma.patients.findMany({
      where: { created_by: userId }, // userId is Keycloak UUID, created_by is VARCHAR(36)
      select: { id: true },
    });

    const patientIds = new Set(ownPatients.map((p) => p.id));

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
   * Builds a manual patient-relation search where-fragment (mail / patient_id contains),
   * since QueryBuilder's own ?search= only supports flat columns on the queried table.
   */
  private static buildPatientSearchFilter(search?: string): Record<string, any> | null {
    if (!search) return null;
    return {
      patient: {
        OR: [
          { patient_id: { contains: search, mode: 'insensitive' } },
          { mail: { contains: search, mode: 'insensitive' } },
        ],
      },
    };
  }

  /**
   * Paginated list of assignments for a survey, with filters.
   */
  static async getList(surveyId: number, userId: string, userType: string, query: Record<string, any>) {
    const hasAccess = await AssignmentService.canAccessSurvey(userId, userType, surveyId);
    if (!hasAccess) {
      throw new ServiceError('You do not have permission to view assignments in this survey', 403);
    }

    // questionnaireId / patientGroupId are relation-nested — extracted before QueryBuilder,
    // same technique as ModuleService.getList's scope stripping.
    const filter = { ...(query.filter as Record<string, any>) };
    const questionnaireId = filter.questionnaireId;
    const patientGroupId = filter.patientGroupId;
    delete filter.questionnaireId;
    delete filter.patientGroupId;

    const relationFilters: Record<string, any>[] = [];
    if (questionnaireId) {
      relationFilters.push({
        survey_questionnaire: { questionnaire_id: parseInt(questionnaireId as string, 10) },
      });
    }
    if (patientGroupId) {
      relationFilters.push({
        survey_questionnaire: {
          questionnaire: { patient_group_id: parseInt(patientGroupId as string, 10) },
        },
      });
    }

    const searchFilter = AssignmentService.buildPatientSearchFilter(query.search as string);

    const accessiblePatientIds = await AssignmentService.getAccessiblePatientIds(
      userId,
      userType,
      surveyId
    );

    const resolvedQuery = { ...query, filter };

    const { where, orderBy, take, skip } = QueryBuilder.for(AssignmentModelConfig, resolvedQuery)
      .withBaseFilters([
        { survey_questionnaire: { survey_id: surveyId } },
        { patient_id: { in: accessiblePatientIds } },
        ...relationFilters,
        ...(searchFilter ? [searchFilter] : []),
      ])
      .build();

    const [total, rawAssignments] = await Promise.all([
      prisma.survey_questionnaire_patients_assignment.count({ where }),
      prisma.survey_questionnaire_patients_assignment.findMany({
        where,
        skip,
        take,
        orderBy,
        include: {
          patient: {
            select: {
              id: true,
              patient_id: true,
              mail: true,
            },
          },
          survey_questionnaire: {
            include: {
              questionnaire: {
                select: {
                  id: true,
                  title: true,
                  type: true,
                },
              },
            },
          },
          email_logs: {
            orderBy: { attempted_at: 'desc' },
            take: 1,
          },
        },
      }),
    ]);

    const assignments = await attachUserRef(rawAssignments, (a) => a.sent_by, 'sender', [
      'id',
      'username',
    ]);

    return { assignments, total, take, skip };
  }

  /**
   * Get assignment details, checking survey and patient access.
   */
  static async getById(assignmentId: number, userId: string, userType: string) {
    const assignment = await prisma.survey_questionnaire_patients_assignment.findUnique({
      where: { id: assignmentId },
      include: {
        patient: {
          select: {
            id: true,
            patient_id: true,
            mail: true,
          },
        },
        survey_questionnaire: {
          include: {
            survey: {
              select: {
                id: true,
                name: true,
                created_by: true,
              },
            },
            questionnaire: {
              select: {
                id: true,
                title: true,
                description: true,
                type: true,
                status: true,
              },
            },
          },
        },
        responses: {
          select: {
            id: true,
            question_id: true,
            answer_option_id: true,
            answer_text: true,
            created_at: true,
          },
        },
      },
    });

    if (!assignment) {
      throw new ServiceError('Assignment not found', 404);
    }

    const hasAccess = await AssignmentService.canAccessSurvey(
      userId,
      userType,
      assignment.survey_questionnaire.survey.id
    );
    if (!hasAccess) {
      throw new ServiceError('You do not have permission to view this assignment', 403);
    }

    const accessiblePatientIds = await AssignmentService.getAccessiblePatientIds(
      userId,
      userType,
      assignment.survey_questionnaire.survey.id
    );
    if (!accessiblePatientIds.includes(assignment.patient_id)) {
      throw new ServiceError('You do not have permission to view this patient', 403);
    }

    return attachUserRefOne(assignment, (a) => a.sent_by, 'sender', ['id', 'username', 'email']);
  }

  /**
   * Full send/error history for an assignment (reuses getById's access checks).
   */
  static async getEmailLogs(assignmentId: number, userId: string, userType: string) {
    await AssignmentService.getById(assignmentId, userId, userType);

    return prisma.assignment_email_logs.findMany({
      where: { assignment_id: assignmentId },
      orderBy: { attempted_at: 'desc' },
    });
  }

  /**
   * Bulk assign a questionnaire to multiple patients.
   */
  static async createBulk(
    surveyId: number,
    questionnaireId: number,
    patientIds: number[],
    userId: string,
    userType: string
  ) {
    const hasAccess = await AssignmentService.canAccessSurvey(userId, userType, surveyId);
    if (!hasAccess) {
      throw new ServiceError(
        'You do not have permission to assign questionnaires in this survey',
        403
      );
    }

    const surveyQuestionnaire = await prisma.surveys_questionnaires.findFirst({
      where: {
        survey_id: surveyId,
        questionnaire_id: questionnaireId,
      },
      include: {
        survey: {
          select: {
            id: true,
            status: true,
            access_mode: true,
            send_mode: true,
            send_delay_hours: true,
            send_scheduled_at: true,
          },
        },
        questionnaire: {
          select: {
            id: true,
            title: true,
            status: true,
            patient_group_id: true,
          },
        },
      },
    });

    if (!surveyQuestionnaire) {
      throw new ServiceError('Questionnaire not found in this survey', 404);
    }

    if (surveyQuestionnaire.survey.access_mode === 'anonymous_spontaneous') {
      throw new ServiceError(
        'Cannot assign individual patients to an anonymous_spontaneous questionnaire. Anonymous spontaneous questionnaires only support public anonymous links.',
        400
      );
    }

    AssignmentService.assertSurveyAcceptsAssignments(surveyQuestionnaire.survey);
    if (surveyQuestionnaire.questionnaire.status === 'completed') {
      throw new ServiceError('Cannot create assignments: this questionnaire is completed', 409);
    }

    await AssignmentService.assertEmailTemplateExists(surveyQuestionnaire.id);

    const accessiblePatientIds = await AssignmentService.getAccessiblePatientIds(
      userId,
      userType,
      surveyId
    );

    const patients = await prisma.patients.findMany({
      where: {
        id: { in: patientIds },
        is_active: true,
      },
      select: {
        id: true,
        patient_id: true,
        created_by: true,
      },
    });

    if (patients.length !== patientIds.length) {
      throw new ServiceError(
        `Some patients not found or inactive (requested: ${patientIds.length}, found: ${patients.length})`,
        404
      );
    }

    const inaccessiblePatients = patients.filter((p) => !accessiblePatientIds.includes(p.id));
    if (inaccessiblePatients.length > 0) {
      throw new ServiceError(
        'You can only assign questionnaires to your own patients or patients from shared surveys',
        403
      );
    }

    const existingAssignments = await prisma.survey_questionnaire_patients_assignment.findMany({
      where: {
        survey_questionnaire_id: surveyQuestionnaire.id,
        patient_id: { in: patientIds },
      },
      select: { patient_id: true },
    });

    const existingPatientIds = new Set(existingAssignments.map((a) => a.patient_id));
    const newPatientIds = patientIds.filter((id) => !existingPatientIds.has(id));

    if (newPatientIds.length === 0) {
      throw new ServiceError('All patients already have assignments for this questionnaire', 409);
    }

    const questionnaireAccessMode = surveyQuestionnaire.survey.access_mode;
    const scheduledSendAt = computeScheduledSendAt(surveyQuestionnaire.survey);

    const assignments = await Promise.all(
      newPatientIds.map(async (patientId) => {
        const uniqueLink = crypto.randomBytes(32).toString('hex');

        return prisma.survey_questionnaire_patients_assignment.create({
          data: {
            survey_questionnaire_id: surveyQuestionnaire.id,
            patient_id: patientId,
            link: uniqueLink,
            access_mode: questionnaireAccessMode,
            send_status: 'pending',
            completion_status: 'pending',
            scheduled_send_at: scheduledSendAt,
          },
          include: {
            patient: {
              select: {
                id: true,
                patient_id: true,
                mail: true,
              },
            },
          },
        });
      })
    );

    if (assignments.length > 0) {
      await QuestionnaireService.maybeActivateQuestionnaire(prisma, questionnaireId);
    }

    if (surveyQuestionnaire.survey.send_mode === 'immediate') {
      void AssignmentSchedulerService.triggerImmediateBatch(
        assignments.map((a) => ({ id: a.id, emailLanguageId: a.email_language_id })),
        surveyQuestionnaire.id
      ).catch((err) => console.error('[AssignmentService] Immediate batch send failed:', err));
    }

    return { assignments, created: assignments.length, skipped: existingPatientIds.size };
  }

  /**
   * Resolve the surveys_questionnaires record for a (surveyId, questionnaireId) pair,
   * shared setup for creating a brand-new patient + its assignment.
   */
  private static async resolveSurveyQuestionnaireForPatientCreate(
    surveyId: number,
    questionnaireId: number,
    userId: string,
    userType: string
  ) {
    const hasAccess = await AssignmentService.canAccessSurvey(userId, userType, surveyId);
    if (!hasAccess) {
      throw new ServiceError('You do not have permission to add patients to this survey', 403);
    }

    const surveyQuestionnaire = await prisma.surveys_questionnaires.findFirst({
      where: { survey_id: surveyId, questionnaire_id: questionnaireId },
      include: {
        survey: {
          select: {
            id: true,
            status: true,
            access_mode: true,
            send_mode: true,
            send_delay_hours: true,
            send_scheduled_at: true,
          },
        },
        // The patient group is a property of the questionnaire, and every patient
        // enrolled in it inherits it.
        questionnaire: { select: { status: true, patient_group_id: true } },
      },
    });

    if (!surveyQuestionnaire) {
      throw new ServiceError('Questionnaire not found in this survey', 404);
    }

    if (surveyQuestionnaire.survey.access_mode === 'anonymous_spontaneous') {
      throw new ServiceError(
        'Cannot add individual patients to an anonymous_spontaneous questionnaire. Anonymous spontaneous questionnaires only support public anonymous links.',
        400
      );
    }

    AssignmentService.assertSurveyAcceptsAssignments(surveyQuestionnaire.survey);
    if (surveyQuestionnaire.questionnaire.status === 'completed') {
      throw new ServiceError('Cannot create assignments: this questionnaire is completed', 409);
    }

    await AssignmentService.assertEmailTemplateExists(surveyQuestionnaire.id);

    return surveyQuestionnaire;
  }

  /**
   * Create a brand-new patient scoped to a survey_questionnaire and its assignment
   * (send_status='pending') in a single transaction.
   */
  static async createPatientWithAssignment(
    surveyId: number,
    questionnaireId: number,
    patientData: NewPatientData,
    userId: string,
    userType: string
  ) {
    const patientId = patientData.patient_id?.trim();
    if (!patientId) {
      throw new ServiceError('patient_id is required and must be a non-empty string', 400);
    }
    if (patientId.length > 255) {
      throw new ServiceError('patient_id cannot exceed 255 characters', 400);
    }

    const mail = patientData.mail?.trim().toLowerCase() || null;
    if (mail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (mail.length > 255) {
        throw new ServiceError('mail cannot exceed 255 characters', 400);
      }
      if (!emailRegex.test(mail)) {
        throw new ServiceError('Invalid email format', 400);
      }
    }

    const surveyQuestionnaire = await AssignmentService.resolveSurveyQuestionnaireForPatientCreate(
      surveyId,
      questionnaireId,
      userId,
      userType
    );

    const existing = await prisma.patients.findFirst({
      where: { patient_id: patientId, survey_questionnaire_id: surveyQuestionnaire.id },
    });
    if (existing) {
      throw new ServiceError(
        `A patient with patient_id "${patientId}" already exists in this questionnaire`,
        409
      );
    }

    if (mail) {
      const existingMail = await prisma.patients.findFirst({
        where: {
          survey_questionnaire_id: surveyQuestionnaire.id,
          mail: { equals: mail, mode: 'insensitive' },
        },
      });
      if (existingMail) {
        throw new ServiceError(
          `A patient with mail "${mail}" already exists in this questionnaire`,
          409
        );
      }
    }

    const scheduledSendAt = computeScheduledSendAt(surveyQuestionnaire.survey);

    const result = await prisma.$transaction(async (tx) => {
      const newPatient = await tx.patients.create({
        data: {
          patient_id: patientId,
          survey_questionnaire_id: surveyQuestionnaire.id,
          group_id: surveyQuestionnaire.questionnaire.patient_group_id,
          mail,
          phone_prefix: patientData.phone_prefix?.trim() || null,
          phone: patientData.phone?.trim() || null,
          created_by: userId,
          is_active: patientData.is_active !== undefined ? Boolean(patientData.is_active) : true,
        },
      });

      const assignment = await tx.survey_questionnaire_patients_assignment.create({
        data: {
          survey_questionnaire_id: surveyQuestionnaire.id,
          patient_id: newPatient.id,
          link: crypto.randomBytes(32).toString('hex'),
          access_mode: surveyQuestionnaire.survey.access_mode,
          send_status: 'pending',
          completion_status: 'pending',
          scheduled_send_at: scheduledSendAt,
        },
      });

      await QuestionnaireService.maybeActivateQuestionnaire(tx, questionnaireId);

      return { newPatient, assignment };
    });

    if (surveyQuestionnaire.survey.send_mode === 'immediate') {
      AssignmentSchedulerService.triggerImmediateSend(
        result.assignment.id,
        surveyQuestionnaire.id,
        result.assignment.email_language_id
      ).catch((err) =>
        console.error(
          `[AssignmentService] Immediate send failed for assignment ${result.assignment.id}:`,
          err
        )
      );
    }

    return result;
  }

  /**
   * Bulk-create new patients (CSV or Excel) scoped to a survey_questionnaire, each with its
   * own assignment (send_status='pending'), in a single transaction.
   */
  static async bulkCreatePatientsWithAssignments(
    surveyId: number,
    questionnaireId: number,
    fileContent: string,
    fileType: 'csv' | 'excel',
    userId: string,
    userType: string
  ) {
    const surveyQuestionnaire = await AssignmentService.resolveSurveyQuestionnaireForPatientCreate(
      surveyId,
      questionnaireId,
      userId,
      userType
    );

    let rows: any[] = [];

    try {
      if (fileType === 'csv') {
        const lines = fileContent.trim().split('\n');
        if (lines.length < 2) {
          throw new ServiceError(
            'CSV file must contain at least a header row and one data row',
            400
          );
        }

        const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
        if (!headers.includes('patient_id')) {
          throw new ServiceError('CSV must contain a "patient_id" column', 400);
        }

        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(',').map((v) => v.trim());
          const row: any = {};
          headers.forEach((header, index) => {
            row[header] = values[index] || null;
          });
          rows.push(row);
        }
      } else {
        const buffer = Buffer.from(fileContent, 'base64');
        const workbook = XLSX.read(buffer, { type: 'buffer' });

        if (workbook.SheetNames.length === 0) {
          throw new ServiceError('Excel file contains no sheets', 400);
        }

        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: null });

        if (jsonData.length === 0) {
          throw new ServiceError('Excel sheet is empty', 400);
        }

        rows = jsonData.map((row: any) => {
          const normalizedRow: any = {};
          Object.keys(row).forEach((key) => {
            normalizedRow[key.toLowerCase().trim()] = row[key];
          });
          return normalizedRow;
        });

        if (!rows[0].hasOwnProperty('patient_id')) {
          throw new ServiceError('Excel must contain a "patient_id" column', 400);
        }
      }
    } catch (parseError: any) {
      if (parseError instanceof ServiceError) throw parseError;
      throw new ServiceError(
        `Failed to parse ${fileType.toUpperCase()} file: ${parseError.message}`,
        400
      );
    }

    const validPatients: any[] = [];
    const validPatientMeta: { rowNum: number; patientId: string; mail: string | null }[] = [];
    const errors: any[] = [];
    const seenInFile = new Set<string>();
    const seenMailsInFile = new Set<string>();

    const existingInQuestionnaire = await prisma.patients.findMany({
      where: { survey_questionnaire_id: surveyQuestionnaire.id },
      select: { patient_id: true, mail: true },
    });
    const existingPatientIds = new Set<string>(existingInQuestionnaire.map((p) => p.patient_id));
    const existingMails = new Set<string>(
      existingInQuestionnaire.filter((p) => p.mail).map((p) => p.mail!.toLowerCase())
    );

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;

      if (row.patient_id == null || String(row.patient_id).trim().length === 0) {
        errors.push({
          row: rowNum,
          field: 'patient_id',
          message: 'patient_id is required and must be non-empty',
          data: row,
        });
        continue;
      }

      const patientId = String(row.patient_id).trim();

      if (patientId.length > 255) {
        errors.push({
          row: rowNum,
          field: 'patient_id',
          message: 'patient_id exceeds 255 characters',
          data: row,
        });
        continue;
      }

      if (existingPatientIds.has(patientId)) {
        errors.push({
          row: rowNum,
          field: 'patient_id',
          message: `patient_id "${patientId}" already exists in database`,
          data: row,
        });
        continue;
      }

      if (seenInFile.has(patientId)) {
        errors.push({
          row: rowNum,
          field: 'patient_id',
          message: `patient_id "${patientId}" appears multiple times in file`,
          data: row,
        });
        continue;
      }

      seenInFile.add(patientId);

      let mail = null;
      if (row.mail && String(row.mail).trim().length > 0) {
        const mailStr = String(row.mail).trim().toLowerCase();
        if (mailStr.length > 255) {
          errors.push({
            row: rowNum,
            field: 'mail',
            message: 'mail exceeds 255 characters',
            data: row,
          });
          continue;
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(mailStr)) {
          errors.push({ row: rowNum, field: 'mail', message: 'Invalid email format', data: row });
          continue;
        }
        if (existingMails.has(mailStr)) {
          errors.push({
            row: rowNum,
            field: 'mail',
            message: `mail "${mailStr}" already exists in database`,
            data: row,
          });
          continue;
        }
        if (seenMailsInFile.has(mailStr)) {
          errors.push({
            row: rowNum,
            field: 'mail',
            message: `mail "${mailStr}" appears multiple times in file`,
            data: row,
          });
          continue;
        }
        seenMailsInFile.add(mailStr);
        mail = mailStr;
      }

      let isActive = true;
      if (row.is_active !== undefined && row.is_active !== null) {
        const val = String(row.is_active).toLowerCase();
        if (['false', '0', 'no', 'inactive'].includes(val)) {
          isActive = false;
        }
      }

      const phonePrefix =
        row.phone_prefix !== undefined && row.phone_prefix !== null
          ? String(row.phone_prefix).trim() || null
          : null;
      const phoneNumber =
        row.phone !== undefined && row.phone !== null ? String(row.phone).trim() || null : null;

      validPatients.push({
        patient_id: patientId,
        survey_questionnaire_id: surveyQuestionnaire.id,
        group_id: surveyQuestionnaire.questionnaire.patient_group_id,
        mail,
        phone_prefix: phonePrefix,
        phone: phoneNumber,
        created_by: userId,
        is_active: isActive,
      });
      validPatientMeta.push({ rowNum, patientId, mail });
    }

    const composeLabel = (patientId: unknown, mail: unknown): string => {
      const idLabel = patientId != null ? String(patientId) : '—';
      return mail ? `${idLabel} (${String(mail).trim().toLowerCase()})` : idLabel;
    };

    if (errors.length > 0) {
      const results = [
        ...errors.map((e) => ({
          row: e.row,
          label: composeLabel(e.data?.patient_id, e.data?.mail),
          status: 'skipped' as const,
          reason: e.message,
        })),
        ...validPatientMeta.map(({ rowNum, patientId, mail }) => ({
          row: rowNum,
          label: composeLabel(patientId, mail),
          status: 'skipped' as const,
          reason: 'Not imported — other rows in the file failed validation',
        })),
      ].sort((a, b) => a.row - b.row);

      return {
        totalRows: rows.length,
        created: 0,
        skipped: results.length,
        errors: errors.slice(0, 50),
        results,
      };
    }

    if (validPatients.length === 0) {
      throw new ServiceError('No valid patients found in file', 400);
    }

    const scheduledSendAt = computeScheduledSendAt(surveyQuestionnaire.survey);

    const createdPatients = await prisma.$transaction(async (tx) => {
      const inserted: any[] = [];
      for (const patientData of validPatients) {
        const p = await tx.patients.create({ data: patientData });
        inserted.push(p);
      }

      const assignmentData = inserted.map((p) => ({
        survey_questionnaire_id: surveyQuestionnaire.id,
        patient_id: p.id,
        link: crypto.randomBytes(32).toString('hex'),
        access_mode: surveyQuestionnaire.survey.access_mode,
        send_status: 'pending',
        completion_status: 'pending',
        scheduled_send_at: scheduledSendAt,
      }));

      await tx.survey_questionnaire_patients_assignment.createMany({ data: assignmentData });

      if (assignmentData.length > 0) {
        await QuestionnaireService.maybeActivateQuestionnaire(tx, questionnaireId);
      }

      return inserted;
    });

    if (surveyQuestionnaire.survey.send_mode === 'immediate' && createdPatients.length > 0) {
      const newAssignments = await prisma.survey_questionnaire_patients_assignment.findMany({
        where: {
          survey_questionnaire_id: surveyQuestionnaire.id,
          patient_id: { in: createdPatients.map((p) => p.id) },
        },
        select: { id: true, email_language_id: true },
      });

      void AssignmentSchedulerService.triggerImmediateBatch(
        newAssignments.map((a) => ({ id: a.id, emailLanguageId: a.email_language_id })),
        surveyQuestionnaire.id
      ).catch((err) => console.error('[AssignmentService] Immediate batch send failed:', err));
    }

    return {
      totalRows: rows.length,
      created: createdPatients.length,
      skipped: validPatients.length - createdPatients.length,
      errors: [],
      results: validPatientMeta.map(({ rowNum, patientId, mail }) => ({
        row: rowNum,
        label: composeLabel(patientId, mail),
        status: 'imported' as const,
      })),
    };
  }

  /**
   * Mark assignment as sent, triggering email delivery.
   */
  static async send(
    assignmentId: number,
    languageId: number | null,
    userId: string,
    userType: string
  ) {
    const assignment = await prisma.survey_questionnaire_patients_assignment.findUnique({
      where: { id: assignmentId },
      include: {
        patient: { select: { id: true, patient_id: true, mail: true } },
        survey_questionnaire: {
          include: {
            survey: { select: { id: true, name: true, status: true } },
            questionnaire: { select: { id: true, title: true, status: true } },
          },
        },
      },
    });

    if (!assignment) {
      throw new ServiceError('Assignment not found', 404);
    }

    const hasAccess = await AssignmentService.canAccessSurvey(
      userId,
      userType,
      assignment.survey_questionnaire.survey.id
    );
    if (!hasAccess) {
      throw new ServiceError('You do not have permission to send this assignment', 403);
    }

    // The invite can only go out once both the survey and the questionnaire are
    // public — sending from a draft would invite patients to a link that isn't
    // actually live yet.
    if (
      assignment.survey_questionnaire.survey.status !== 'public' ||
      assignment.survey_questionnaire.questionnaire.status !== 'public'
    ) {
      throw new ServiceError(
        'Cannot send: both the survey and the questionnaire must be public',
        409
      );
    }

    if (!assignment.patient.mail) {
      throw new ServiceError(
        `Patient has no email address (patient_id: ${assignment.patient.patient_id})`,
        400
      );
    }

    if (assignment.send_status === 'delivered') {
      throw new ServiceError('Assignment already sent', 400);
    }

    let resolvedLanguageId: number;

    if (languageId) {
      const emailTemplate = await prisma.surveys_questionnaires_email_templates.findUnique({
        where: {
          survey_questionnaire_id_language_id: {
            survey_questionnaire_id: assignment.survey_questionnaire_id,
            language_id: languageId,
          },
        },
      });

      if (!emailTemplate) {
        throw new ServiceError(
          `No email template configured for this language (survey_questionnaire_id: ${assignment.survey_questionnaire_id}, language_id: ${languageId})`,
          400
        );
      }
      resolvedLanguageId = languageId;
    } else {
      const fallback = await prisma.surveys_questionnaires_email_templates.findFirst({
        where: { survey_questionnaire_id: assignment.survey_questionnaire_id, is_fallback: true },
        select: { language_id: true },
      });

      if (!fallback) {
        throw new ServiceError(
          "Impossibile inviare l'email: nessun template di fallback configurato per questo questionario",
          400
        );
      }
      resolvedLanguageId = fallback.language_id;
    }

    await prisma.survey_questionnaire_patients_assignment.update({
      where: { id: assignmentId },
      data: { email_language_id: resolvedLanguageId, sent_by: userId },
    });

    const ok = await AssignmentSchedulerService.sendAssignmentCore(assignmentId, resolvedLanguageId);
    if (!ok) {
      await prisma.survey_questionnaire_patients_assignment.update({
        where: { id: assignmentId },
        data: { email_language_id: null, sent_by: null },
      });
      throw new ServiceError('Failed to send assignment email', 500);
    }

    const updated = await prisma.survey_questionnaire_patients_assignment.findUnique({
      where: { id: assignmentId },
      select: { id: true, link: true, send_status: true, sent_at: true, next_reminder_at: true },
    });

    return {
      id: updated!.id,
      patient_email: assignment.patient.mail,
      link: updated!.link,
      send_status: updated!.send_status,
      sent_at: updated!.sent_at,
      next_reminder_at: updated!.next_reminder_at,
    };
  }

  /**
   * Sync assignments for a questionnaire: create missing, delete removed (unless completed).
   */
  static async sync(
    surveyId: number,
    questionnaireId: number,
    patientIds: number[],
    userId: string,
    userType: string
  ) {
    const hasAccess = await AssignmentService.canAccessSurvey(userId, userType, surveyId);
    if (!hasAccess) {
      throw new ServiceError('You do not have permission to manage assignments in this survey', 403);
    }

    const surveyQuestionnaire = await prisma.surveys_questionnaires.findFirst({
      where: {
        survey_id: surveyId,
        questionnaire_id: questionnaireId,
      },
      include: {
        survey: {
          select: { id: true, status: true, access_mode: true },
        },
        questionnaire: {
          select: { id: true, status: true, patient_group_id: true },
        },
      },
    });

    if (!surveyQuestionnaire) {
      throw new ServiceError('Questionnaire not found in this survey', 404);
    }

    if (patientIds.length > 0 && surveyQuestionnaire.survey.access_mode === 'anonymous_spontaneous') {
      throw new ServiceError(
        'Cannot assign individual patients to an anonymous_spontaneous questionnaire. Anonymous spontaneous questionnaires only support public anonymous links.',
        400
      );
    }

    if (patientIds.length > 0) {
      AssignmentService.assertSurveyAcceptsAssignments(surveyQuestionnaire.survey);
      if (surveyQuestionnaire.questionnaire.status === 'completed') {
        throw new ServiceError('Cannot create assignments: this questionnaire is completed', 409);
      }
      await AssignmentService.assertEmailTemplateExists(surveyQuestionnaire.id);
    }

    const accessiblePatientIds = await AssignmentService.getAccessiblePatientIds(
      userId,
      userType,
      surveyId
    );

    const desiredPatients =
      patientIds.length > 0
        ? await prisma.patients.findMany({
            where: {
              id: { in: patientIds },
              is_active: true,
            },
            select: { id: true, patient_id: true },
          })
        : [];

    if (desiredPatients.length !== patientIds.length) {
      throw new ServiceError(
        `Some patients not found or inactive (requested: ${patientIds.length}, found: ${desiredPatients.length})`,
        404
      );
    }

    const inaccessiblePatients = desiredPatients.filter((p) => !accessiblePatientIds.includes(p.id));
    if (inaccessiblePatients.length > 0) {
      throw new ServiceError('Access denied to some patients', 403);
    }

    const currentAssignments = await prisma.survey_questionnaire_patients_assignment.findMany({
      where: {
        survey_questionnaire_id: surveyQuestionnaire.id,
        access_mode: { not: 'anonymous_spontaneous' },
      },
      select: { id: true, patient_id: true, completion_status: true },
    });

    const currentPatientIds = new Set(currentAssignments.map((a) => a.patient_id));
    const desiredPatientIds = new Set(patientIds);

    const toAdd = desiredPatients.filter((p) => !currentPatientIds.has(p.id));

    const toRemove = currentAssignments.filter(
      (a) => !desiredPatientIds.has(a.patient_id) && a.completion_status !== 'completed'
    );

    const locked = currentAssignments
      .filter((a) => !desiredPatientIds.has(a.patient_id) && a.completion_status === 'completed')
      .map((a) => a.patient_id);

    const createdAssignments = await Promise.all(
      toAdd.map(async (patient) => {
        const uniqueLink = crypto.randomBytes(32).toString('hex');
        return prisma.survey_questionnaire_patients_assignment.create({
          data: {
            survey_questionnaire_id: surveyQuestionnaire.id,
            patient_id: patient.id,
            link: uniqueLink,
            access_mode: surveyQuestionnaire.survey.access_mode,
            send_status: 'pending',
            completion_status: 'pending',
          },
        });
      })
    );

    if (createdAssignments.length > 0) {
      await QuestionnaireService.maybeActivateQuestionnaire(prisma, questionnaireId);
    }

    if (toRemove.length > 0) {
      AssignmentService.assertSurveyAcceptsAssignments(surveyQuestionnaire.survey);
      await prisma.survey_questionnaire_patients_assignment.deleteMany({
        where: { id: { in: toRemove.map((a) => a.id) } },
      });
      await QuestionnaireService.maybeRevertToDraftIfNoAssignments(prisma, questionnaireId);
    }

    return { created: createdAssignments.length, deleted: toRemove.length, locked };
  }

  /**
   * anonymous_on_invitation: scrub the identifiable `patients` row exactly like a
   * completed submission does (patient_id -> ANON_<token>, mail/phone nulled,
   * is_anonymous: true), unless the patient still has another NOT-completed
   * assignment outside `excludeAssignmentIds` — that contact info is still needed
   * (e.g. to send/remind for that other invite, or because it's still traceable
   * elsewhere). No-op if the patient is already anonymous. Returns whether it
   * anonymized anything.
   */
  static async anonymizePatientIfEligible(
    tx: any,
    patientId: number,
    excludeAssignmentIds: number[]
  ): Promise<boolean> {
    const patient = await tx.patients.findUnique({
      where: { id: patientId },
      select: { is_anonymous: true },
    });
    if (!patient || patient.is_anonymous) return false;

    const otherOpenCount = await tx.survey_questionnaire_patients_assignment.count({
      where: {
        patient_id: patientId,
        id: { notIn: excludeAssignmentIds },
        completion_status: { not: 'completed' },
      },
    });
    if (otherOpenCount > 0) return false;

    const anonymousToken = crypto.randomBytes(16).toString('hex');
    await tx.patients.update({
      where: { id: patientId },
      data: {
        patient_id: `ANON_${anonymousToken}`,
        mail: null,
        phone_prefix: null,
        phone: null,
        is_anonymous: true,
      },
    });
    return true;
  }

  /**
   * anonymous_on_invitation: called when one or more `surveys_questionnaires` close
   * together for good (every questionnaire of a survey that just completed, or a
   * single questionnaire that alone hit max_completions) — any assignment in that
   * batch that never got completed (pending/in_progress) will now never complete,
   * so its patient should be anonymized too, exactly like a normal completion would.
   * The assignment itself is left untouched (completion_status stays whatever it
   * was) — only the linked `patients` row is scrubbed.
   *
   * The whole batch is excluded together from `anonymizePatientIfEligible`'s guard
   * (not just each assignment individually): if the same patient has two still-open
   * assignments inside this same closing batch (e.g. baseline + follow-up never
   * done), neither would ever pass a single-assignment exclusion — they'd block each
   * other forever. A genuinely separate open assignment elsewhere (a different,
   * still-active survey/questionnaire) still blocks anonymization, same as always.
   *
   * Returns the number of patients anonymized.
   */
  static async anonymizePendingForClosedBatch(
    tx: any,
    surveyQuestionnaireIds: number[]
  ): Promise<number> {
    if (surveyQuestionnaireIds.length === 0) return 0;

    const pending = await tx.survey_questionnaire_patients_assignment.findMany({
      where: {
        survey_questionnaire_id: { in: surveyQuestionnaireIds },
        completion_status: { not: 'completed' },
        survey_questionnaire: { survey: { access_mode: 'anonymous_on_invitation' } },
        patient: { is_anonymous: false },
      },
      select: { id: true, patient_id: true },
    });
    if (pending.length === 0) return 0;

    const excludeIds = pending.map((a: { id: number }) => a.id);
    let anonymizedCount = 0;
    for (const { patient_id } of pending) {
      if (await AssignmentService.anonymizePatientIfEligible(tx, patient_id, excludeIds)) {
        anonymizedCount++;
      }
    }
    return anonymizedCount;
  }

  /**
   * Delete assignment (only if not completed).
   */
  static async delete(assignmentId: number, userId: string, userType: string) {
    const assignment = await prisma.survey_questionnaire_patients_assignment.findUnique({
      where: { id: assignmentId },
      include: {
        survey_questionnaire: {
          include: {
            survey: {
              select: {
                id: true,
                name: true,
                status: true,
              },
            },
          },
        },
        responses: {
          select: { id: true },
        },
      },
    });

    if (!assignment) {
      throw new ServiceError('Assignment not found', 404);
    }

    const hasAccess = await AssignmentService.canAccessSurvey(
      userId,
      userType,
      assignment.survey_questionnaire.survey.id
    );
    if (!hasAccess) {
      throw new ServiceError('You do not have permission to delete this assignment', 403);
    }

    if (assignment.completion_status === 'completed') {
      throw new ServiceError(
        `Cannot delete completed assignment: assignment has been completed and has ${assignment.responses.length} associated response(s)`,
        400
      );
    }

    AssignmentService.assertSurveyAcceptsAssignments(assignment.survey_questionnaire.survey);

    const questionnaireId = assignment.survey_questionnaire.questionnaire_id;

    await prisma.$transaction(async (tx) => {
      await tx.survey_questionnaire_patients_assignment.delete({
        where: { id: assignmentId },
      });

      const remainingAssignments = await tx.survey_questionnaire_patients_assignment.count({
        where: { patient_id: assignment.patient_id },
      });
      if (remainingAssignments === 0) {
        await tx.patients.delete({ where: { id: assignment.patient_id } });
      }

      await QuestionnaireService.maybeRevertToDraftIfNoAssignments(tx, questionnaireId);
    });

    return { id: assignment.id, completion_status: assignment.completion_status };
  }
}
