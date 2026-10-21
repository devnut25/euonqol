import { PrismaClient } from '../generated/app/index.js';
import { QueryBuilder } from '../helpers/QueryBuilder.js';
import { ServiceError } from '../helpers/ServiceError.js';
import { getPatientBaseFilters, PatientModelConfig } from '../models/Patient.js';
import { attachUserRef, attachUserRefOne } from './keycloakUserRefs.js';

const prisma = new PrismaClient();

export interface CheckAvailabilityInput {
  patient_id?: string;
  mail?: string;
  excludeId?: string | number;
  surveyQuestionnaireId?: string | number;
}

export interface UpdatePatientInput {
  patient_id?: string;
  mail?: string | null;
  phone_prefix?: string | null;
  phone?: string | null;
  is_active?: boolean;
}

const LIST_SELECT = {
  id: true,
  patient_id: true,
  survey_questionnaire_id: true,
  mail: true,
  phone_prefix: true,
  phone: true,
  created_by: true,
  created_at: true,
  updated_at: true,
  is_active: true,
  is_anonymous: true,
  survey_questionnaire: {
    select: {
      id: true,
      survey: { select: { id: true, name: true } },
      questionnaire: {
        select: {
          id: true,
          title: true,
          patient_group: { select: { id: true, name: true, description: true } },
        },
      },
    },
  },
  _count: {
    select: {
      survey_assignments: true,
    },
  },
  survey_assignments: {
    select: {
      completed_at: true,
      completion_status: true,
    },
    orderBy: { completed_at: 'desc' as const },
    take: 1,
  },
};

/** Fields the detail payload has always exposed for the creating user. */
const DETAIL_CREATOR_FIELDS = ['id', 'username', 'email'] as const;

const DETAIL_SELECT = {
  id: true,
  patient_id: true,
  mail: true,
  phone_prefix: true,
  phone: true,
  created_by: true,
  created_at: true,
  updated_at: true,
  is_active: true,
  is_anonymous: true,
  _count: {
    select: {
      survey_assignments: true,
      patient_sessions: true,
    },
  },
};

export class PatientService {
  /**
   * Returns a paginated list of patients matching the query params.
   */
  static async getList(query: Record<string, any>, user?: { user_type?: string; id?: string }) {
    // `patientGroup` filters by the name of the patient_group attached to the assigned
    // questionnaire — not a real column on `patients`, so it can't go through fieldMap.
    // Extract it and strip it from the filter before QueryBuilder processes the rest.
    const patientGroupFilter = query.filter?.patientGroup as string | undefined;
    const cleanedFilter = { ...query.filter };
    delete cleanedFilter.patientGroup;

    // Default to non-anonymous patients when the caller doesn't specify — same default
    // behavior as before, but now flowing through QueryBuilder like any other filter.
    if (cleanedFilter.isAnonymous === undefined) {
      cleanedFilter.isAnonymous = 'false';
    }

    // Translate camelCase filter keys (isAnonymous, isActive, ...) to their real DB column
    // name via fieldMap — queryParser.ts::parseFilters keeps filter keys literal, it does
    // NOT apply fieldMap (that only happens for `?sort=` in QueryBuilder.processOrderBy),
    // so without this the Prisma `where` clause would target a nonexistent field.
    const mappedFilter: Record<string, any> = {};
    for (const [key, value] of Object.entries(cleanedFilter)) {
      mappedFilter[PatientModelConfig.fieldMap[key] ?? key] = value;
    }

    const resolvedQuery = { ...query, filter: mappedFilter };

    const baseFilters: Record<string, any>[] = [getPatientBaseFilters(user)];
    if (patientGroupFilter) {
      baseFilters.push({
        survey_questionnaire: {
          questionnaire: {
            patient_group: { name: { equals: patientGroupFilter, mode: 'insensitive' } },
          },
        },
      });
    }

    const { where, orderBy, take, skip } = QueryBuilder.for(PatientModelConfig, resolvedQuery)
      .withBaseFilters(baseFilters)
      .build();

    console.log('[PatientService.getList] raw query.filter:', query.filter);
    console.log('[PatientService.getList] mappedFilter:', mappedFilter);
    console.log('[PatientService.getList] final where:', JSON.stringify(where, null, 2));

    const [total, rawPatients] = await Promise.all([
      prisma.patients.count({ where }),
      prisma.patients.findMany({
        where,
        select: LIST_SELECT,
        orderBy,
        skip,
        take,
      }),
    ]);

    const patients = await attachUserRef(rawPatients, (p) => p.created_by, 'creator', [
      'id',
      'username',
    ]);

    return { patients, total, take, skip };
  }

  /**
   * Returns a single patient by ID, or null if not found.
   */
  static async getById(id: number) {
    const patient = await prisma.patients.findUnique({
      where: { id },
      select: DETAIL_SELECT,
    });
    if (!patient) return null;

    return attachUserRefOne(patient, (p) => p.created_by, 'creator', DETAIL_CREATOR_FIELDS);
  }

  /**
   * Checks whether a patient_id or mail is already taken within a survey_questionnaire.
   */
  static async checkAvailability(input: CheckAvailabilityInput): Promise<{ exists: boolean }> {
    const { patient_id, mail, excludeId, surveyQuestionnaireId } = input;
    const excludeIdNum = excludeId ? parseInt(String(excludeId), 10) : undefined;
    const sqId = surveyQuestionnaireId ? parseInt(String(surveyQuestionnaireId), 10) : undefined;
    const idCondition = excludeIdNum ? { id: { not: excludeIdNum } } : {};
    const sqCondition = sqId ? { survey_questionnaire_id: sqId } : {};

    if (patient_id !== undefined) {
      const value = String(patient_id).trim();
      if (!value) return { exists: false };
      const existing = await prisma.patients.findFirst({
        where: { patient_id: value, ...sqCondition, ...idCondition },
        select: { id: true },
      });
      return { exists: !!existing };
    }

    if (mail !== undefined) {
      const value = String(mail).trim().toLowerCase();
      if (!value) return { exists: false };
      const existing = await prisma.patients.findFirst({
        where: { mail: { equals: value, mode: 'insensitive' }, ...sqCondition, ...idCondition },
        select: { id: true },
      });
      return { exists: !!existing };
    }

    throw new ServiceError('Provide patient_id or mail query parameter', 400);
  }

  /**
   * Updates an existing patient.
   * Throws ServiceError on validation/duplicate/not-found failures.
   */
  static async update(id: number, data: UpdatePatientInput) {
    const { patient_id, mail, phone_prefix, phone, is_active } = data;

    const existing = await prisma.patients.findUnique({ where: { id } });
    if (!existing) {
      throw new ServiceError(`No patient found with ID ${id}`, 404);
    }

    const updateData: any = {};

    if (patient_id !== undefined) {
      if (typeof patient_id !== 'string' || patient_id.trim().length === 0) {
        throw new ServiceError('patient_id must be a non-empty string', 400);
      }
      if (patient_id.length > 255) {
        throw new ServiceError('patient_id cannot exceed 255 characters', 400);
      }

      const duplicate = await prisma.patients.findFirst({
        where: {
          patient_id: patient_id.trim(),
          survey_questionnaire_id: existing.survey_questionnaire_id,
          id: { not: id },
        },
      });
      if (duplicate) {
        throw new ServiceError(
          `Another patient with patient_id "${patient_id}" already exists in this questionnaire`,
          409
        );
      }

      updateData.patient_id = patient_id.trim();
    }

    if (mail !== undefined) {
      if (mail && typeof mail !== 'string') {
        throw new ServiceError('mail must be a string', 400);
      }
      if (mail && mail.length > 255) {
        throw new ServiceError('mail cannot exceed 255 characters', 400);
      }
      if (mail && mail.trim().length > 0) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(mail)) {
          throw new ServiceError('Invalid email format', 400);
        }
      }
      updateData.mail = mail?.trim() || null;
    }

    if (phone_prefix !== undefined) {
      updateData.phone_prefix = phone_prefix?.trim() || null;
    }

    if (phone !== undefined) {
      updateData.phone = phone?.trim() || null;
    }

    if (is_active !== undefined) {
      updateData.is_active = Boolean(is_active);
    }

    const updated = await prisma.patients.update({
      where: { id },
      data: updateData,
      select: DETAIL_SELECT,
    });

    return attachUserRefOne(updated, (p) => p.created_by, 'creator', DETAIL_CREATOR_FIELDS);
  }

  /**
   * Deactivates a patient (soft delete).
   * Throws ServiceError if not found or already deactivated.
   */
  static async delete(id: number) {
    const existing = await prisma.patients.findUnique({
      where: { id },
      select: {
        id: true,
        patient_id: true,
        is_active: true,
        _count: {
          select: {
            survey_assignments: true,
            patient_sessions: true,
          },
        },
      },
    });

    if (!existing) {
      throw new ServiceError(`No patient found with ID ${id}`, 404);
    }

    if (!existing.is_active) {
      throw new ServiceError('This patient is already deactivated', 400);
    }

    const updated = await prisma.patients.update({
      where: { id },
      data: { is_active: false },
      select: { id: true, patient_id: true, is_active: true },
    });

    return {
      patient: updated,
      hadAssignments: existing._count.survey_assignments > 0,
      hadSessions: existing._count.patient_sessions > 0,
    };
  }
}
