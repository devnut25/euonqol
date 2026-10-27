import { prisma } from '../config/database.js';
import { savePdf } from '../helpers/FileStorage.js';
import { QueryBuilder } from '../helpers/QueryBuilder.js';
import { ServiceError } from '../helpers/ServiceError.js';
import { PrivacyPolicyModelConfig } from '../models/PrivacyPolicy.js';
import { AuthUser } from '../middleware/auth.js';

const POLICY_INCLUDE = {
  language: { select: { id: true, language: true, original_lang: true } },
  _count: { select: { survey_privacy_policies: true } },
};

const VALID_PATIENT_TYPES = ['traced', 'anonymous_on_invitation', 'anonymous_spontaneous'];

export class PrivacyPolicyService {
  static async getList(
    query: Record<string, any>,
    user?: AuthUser | null
  ): Promise<{ policies: any[]; total: number; take: number; skip: number }> {
    const baseFilters: Record<string, any> = { is_current: true };
    if (user?.user_type === 'manager') {
      baseFilters.created_by = user.id;
    }

    const { where, orderBy, take, skip } = QueryBuilder.for(PrivacyPolicyModelConfig, query)
      .withBaseFilters(baseFilters)
      .build();

    const [policies, total] = await Promise.all([
      prisma.privacy_policies.findMany({
        where,
        include: POLICY_INCLUDE,
        orderBy,
        take,
        skip,
      }),
      prisma.privacy_policies.count({ where }),
    ]);

    return { policies, total, take, skip };
  }

  static async getById(id: number): Promise<any> {
    const policy = await prisma.privacy_policies.findUnique({
      where: { id },
      include: POLICY_INCLUDE,
    });
    if (!policy) throw new ServiceError('Privacy policy not found', 404);
    return policy;
  }

  static async create(
    data: Record<string, any>,
    userId?: string | null,
    file?: Express.Multer.File
  ): Promise<any> {
    const { title, content, language_id, patient_type, survey_id } = data;

    if (!title?.trim()) throw new ServiceError('Title is required', 400);
    if (!content?.trim()) throw new ServiceError('Content is required', 400);
    if (!language_id) throw new ServiceError('Language is required', 400);

    let resolvedPatientType: string = patient_type;

    if (survey_id) {
      const survey = await prisma.surveys.findUnique({
        where: { id: parseInt(survey_id, 10) },
        select: { access_mode: true },
      });
      if (!survey) throw new ServiceError('Invalid survey_id', 400);
      resolvedPatientType = survey.access_mode;
    } else {
      if (!VALID_PATIENT_TYPES.includes(patient_type)) {
        throw new ServiceError(
          'patient_type must be traced, anonymous_on_invitation or anonymous_spontaneous',
          400
        );
      }
    }

    const languageExists = await prisma.eu_countries.findUnique({
      where: { id: parseInt(language_id, 10) },
    });
    if (!languageExists) throw new ServiceError('Invalid language_id', 400);

    const parsedSurveyId = survey_id ? parseInt(survey_id, 10) : null;
    const pdf_url = file ? savePdf('privacy-policies', file.buffer) : null;
    const pdf_filename = file ? file.originalname : null;

    return prisma.$transaction(async (tx) => {
      const policy = await tx.privacy_policies.create({
        data: {
          title: title.trim(),
          content: content.trim(),
          language_id: parseInt(language_id, 10),
          patient_type: resolvedPatientType,
          is_active: true,
          pdf_url,
          pdf_filename,
          version: 1,
          is_current: true,
          created_by: userId ?? null,
        },
        include: POLICY_INCLUDE,
      });

      if (parsedSurveyId) {
        // The very first policy ever linked to a survey must always be the
        // fallback — a survey can never be left with zero fallback policies.
        const existingCount = await tx.survey_privacy_policies.count({
          where: { survey_id: parsedSurveyId },
        });
        await tx.survey_privacy_policies.create({
          data: {
            survey_id: parsedSurveyId,
            privacy_policy_id: policy.id,
            is_fallback: existingCount === 0,
          },
        });
      }

      return policy;
    });
  }

  static async update(
    id: number,
    data: Record<string, any>,
    user?: AuthUser | null,
    file?: Express.Multer.File
  ): Promise<any> {
    const existing = await prisma.privacy_policies.findUnique({
      where: { id },
      include: { survey_privacy_policies: { select: { id: true } } },
    });
    if (!existing) throw new ServiceError('Privacy policy not found', 404);

    if (user?.user_type === 'manager' && existing.created_by !== user.id) {
      throw new ServiceError('You can only edit privacy policies you created', 403);
    }

    const { title, content, language_id, patient_type } = data;

    if (language_id !== undefined) {
      const languageExists = await prisma.eu_countries.findUnique({
        where: { id: parseInt(language_id, 10) },
      });
      if (!languageExists) throw new ServiceError('Invalid language_id', 400);
    }

    if (patient_type !== undefined && !VALID_PATIENT_TYPES.includes(patient_type)) {
      throw new ServiceError(
        'patient_type must be traced, anonymous_on_invitation or anonymous_spontaneous',
        400
      );
    }

    // A new file replaces the attachment; `pdf: null` is an explicit removal signal
    // from submitWithOptionalPdf (physical file stays on disk, only the reference is
    // cleared); otherwise carry the existing one forward onto the new version (same
    // fallback pattern as title/content below).
    const pdf_removed = data.pdf === null;
    const pdf_url = file ? savePdf('privacy-policies', file.buffer) : pdf_removed ? null : existing.pdf_url;
    const pdf_filename = file ? file.originalname : pdf_removed ? null : existing.pdf_filename;

    return prisma.$transaction(async (tx) => {
      await tx.privacy_policies.update({ where: { id }, data: { is_current: false } });

      const created = await tx.privacy_policies.create({
        data: {
          title: title !== undefined ? title.trim() : existing.title,
          content: content !== undefined ? content.trim() : existing.content,
          language_id: language_id !== undefined ? parseInt(language_id, 10) : existing.language_id,
          patient_type: patient_type !== undefined ? patient_type : existing.patient_type,
          is_active: existing.is_active,
          pdf_url,
          pdf_filename,
          version: existing.version + 1,
          is_current: true,
          created_by: existing.created_by,
        },
        include: POLICY_INCLUDE,
      });

      if (existing.survey_privacy_policies.length > 0) {
        await tx.survey_privacy_policies.updateMany({
          where: { privacy_policy_id: id },
          data: { privacy_policy_id: created.id },
        });
      }

      return created;
    });
  }

}
