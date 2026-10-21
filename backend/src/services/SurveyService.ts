import { PrismaClient } from '../generated/app/index.js';
import { copyPdf } from '../helpers/FileStorage.js';
import { QueryBuilder } from '../helpers/QueryBuilder.js';
import { ServiceError } from '../helpers/ServiceError.js';
import { assertManualTransition } from '../helpers/statusTransitions.js';
import { getSurveyPrerequisites } from '../helpers/surveyPrerequisites.js';
import { AuthUser } from '../middleware/auth.js';
import { SurveyModelConfig } from '../models/Survey.js';
import { AssignmentService } from './AssignmentService.js';
import { EmailService, EmailType } from './email/email.js';
import { attachUserRef, attachUserRefOne, getUserRefs } from './keycloakUserRefs.js';

const prisma = new PrismaClient();
const emailService = new EmailService();

const END_DATE_REMINDER_DAYS_BEFORE = 3;

async function enrichWithStats(
  surveys: any[],
  userType: string | undefined,
  userKeycloakId: string
) {
  return Promise.all(
    surveys.map(async (survey) => {
      const assignmentStats = await prisma.survey_questionnaire_patients_assignment.groupBy({
        by: ['completion_status'],
        where: { survey_questionnaire: { survey_id: survey.id } },
        _count: { id: true },
      });

      const stats = { totalAssignments: 0, pending: 0, in_progress: 0, completed: 0 };
      for (const stat of assignmentStats) {
        const count = stat._count.id;
        stats.totalAssignments += count;
        if (stat.completion_status === 'pending') stats.pending = count;
        if (stat.completion_status === 'in_progress') stats.in_progress = count;
        if (stat.completion_status === 'completed') stats.completed = count;
      }

      let accessType: string | undefined;
      let isOwner = false;
      if (userType === 'manager') {
        isOwner = survey.created_by === userKeycloakId;
        if (!isOwner && survey.users_surveys?.length > 0) {
          accessType = survey.users_surveys[0].access_type;
        }
      }

      return { ...survey, assignmentStats: stats, isOwner, accessType };
    })
  );
}

export class SurveyService {
  // ─── Core CRUD ──────────────────────────────────────────────────────────────

  static async getList(query: Record<string, any>, user: AuthUser) {
    const userKeycloakId = user.id;
    const userType = user.user_type;

    const builder = QueryBuilder.for(SurveyModelConfig, query);
    const { where: baseWhere, orderBy, take, skip } = builder.build();

    const where: any = { ...baseWhere };

    if (userType === 'manager') {
      const sharedSurveys = await prisma.users_surveys.findMany({
        where: { user_id: userKeycloakId },
        select: { survey_id: true },
      });
      const sharedIds = sharedSurveys.map((s) => s.survey_id);
      where.OR = [{ created_by: userKeycloakId }, { id: { in: sharedIds } }];
    }

    // Date range filters (not handled by QueryBuilder)
    const { startDateFrom, startDateTo, endDateFrom, endDateTo } = query;
    if (startDateFrom || startDateTo) {
      where.starting_date = {};
      if (startDateFrom) where.starting_date.gte = new Date(startDateFrom as string);
      if (startDateTo) where.starting_date.lte = new Date(startDateTo as string);
    }
    if (endDateFrom || endDateTo) {
      where.end_date = {};
      if (endDateFrom) where.end_date.gte = new Date(endDateFrom as string);
      if (endDateTo) where.end_date.lte = new Date(endDateTo as string);
    }

    const effectiveTake = Math.min(take ?? 50, 200);

    const [rawSurveys, total] = await Promise.all([
      prisma.surveys.findMany({
        where,
        skip,
        take: effectiveTake,
        orderBy: orderBy ?? [{ status: 'asc' }, { created_at: 'desc' }],
        include: {
          _count: { select: { surveys_questionnaires: true, survey_privacy_policies: true } },
          users_surveys:
            userType === 'manager'
              ? { where: { user_id: userKeycloakId }, select: { access_type: true } }
              : undefined,
        },
      }),
      prisma.surveys.count({ where }),
    ]);

    const withCreator = await attachUserRef(rawSurveys, (s) => s.created_by, 'creator', [
      'id',
      'username',
    ]);
    const surveys = await enrichWithStats(withCreator, userType, userKeycloakId);

    return { surveys, total, take: effectiveTake, skip: skip ?? 0 };
  }

  /**
   * Whether the survey has the pre-flow/post-flow content (presentation, eligibility,
   * privacy policy, study info sheet, closing message) required before a questionnaire
   * can be created for it.
   */
  static async getPrerequisites(surveyId: number) {
    const survey = await prisma.surveys.findUnique({
      where: { id: surveyId },
      select: { id: true },
    });
    if (!survey) throw new ServiceError('Survey not found', 404);

    return getSurveyPrerequisites(surveyId);
  }

  static async getById(surveyId: number) {
    const survey = await prisma.surveys.findUnique({
      where: { id: surveyId },
      include: {
        _count: { select: { survey_privacy_policies: true } },
        surveys_questionnaires: {
          include: {
            questionnaire: {
              include: {
                patient_group: { select: { id: true, name: true, description: true } },
                _count: { select: { questionnaires_modules: true } },
              },
            },
            _count: { select: { survey_assignments: true } },
          },
        },
      },
    });

    if (!survey) throw new ServiceError('Survey not found', 404);

    const questionnairesWithStats = await Promise.all(
      survey.surveys_questionnaires.map(async (sq) => {
        const assignmentStats = await prisma.survey_questionnaire_patients_assignment.groupBy({
          by: ['completion_status'],
          where: { survey_questionnaire_id: sq.id },
          _count: { id: true },
        });

        const stats = { totalAssignments: 0, pending: 0, in_progress: 0, completed: 0 };
        for (const stat of assignmentStats) {
          const count = stat._count.id;
          stats.totalAssignments += count;
          if (stat.completion_status === 'pending') stats.pending = count;
          if (stat.completion_status === 'in_progress') stats.in_progress = count;
          if (stat.completion_status === 'completed') stats.completed = count;
        }

        return {
          id: sq.id,
          questionnaire: {
            id: sq.questionnaire.id,
            title: sq.questionnaire.title,
            description: sq.questionnaire.description,
            type: sq.questionnaire.type,
            status: sq.questionnaire.status,
            patient_group: sq.questionnaire.patient_group,
            moduleCount: sq.questionnaire._count.questionnaires_modules,
          },
          assignmentStats: stats,
          created_at: sq.created_at,
        };
      })
    );

    const overallStats = questionnairesWithStats.reduce(
      (acc, sq) => {
        acc.totalAssignments += sq.assignmentStats.totalAssignments;
        acc.pending += sq.assignmentStats.pending;
        acc.in_progress += sq.assignmentStats.in_progress;
        acc.completed += sq.assignmentStats.completed;
        return acc;
      },
      { totalAssignments: 0, pending: 0, in_progress: 0, completed: 0 }
    );

    const withCreator = await attachUserRefOne(survey, (s) => s.created_by, 'creator', [
      'id',
      'username',
      'email',
      'last_name',
      'first_name',
    ]);

    return { ...withCreator, questionnairesWithStats, overallStats };
  }

  static async create(body: Record<string, any>, userId: string | null) {
    const {
      name,
      starting_date,
      end_date,
      reminder,
      frequency_tipology,
      frequency,
      reminder_max_count,
      send_mode = 'manual',
      send_delay_hours,
      send_scheduled_at,
      access_mode = 'traced',
      ctt_norms_version_id,
    } = body;

    if (!name) throw new ServiceError('Survey name is required');
    if (!starting_date) throw new ServiceError('Starting date is required');
    if (!end_date) throw new ServiceError('End date is required');

    if (!['traced', 'anonymous_on_invitation', 'anonymous_spontaneous'].includes(access_mode)) {
      throw new ServiceError(
        'access_mode must be traced, anonymous_on_invitation, or anonymous_spontaneous'
      );
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (new Date(starting_date) < today) {
      throw new ServiceError('Starting date cannot be in the past');
    }

    if (new Date(starting_date) > new Date(end_date)) {
      throw new ServiceError('Starting date must be before end date');
    }

    if (frequency_tipology && !['daily', 'weekly', 'monthly'].includes(frequency_tipology)) {
      throw new ServiceError('Frequency tipology must be daily, weekly, or monthly');
    }

    if (!['manual', 'immediate', 'after_delay', 'scheduled'].includes(send_mode)) {
      throw new ServiceError('send_mode must be manual, immediate, after_delay, or scheduled');
    }

    const created = await prisma.surveys.create({
      data: {
        name,
        starting_date: new Date(starting_date),
        end_date: new Date(end_date),
        reminder: reminder === true || reminder === 'true' || reminder === 1,
        frequency_tipology: frequency_tipology || null,
        frequency: frequency ? parseInt(frequency, 10) : null,
        reminder_max_count: reminder_max_count ? parseInt(reminder_max_count, 10) : null,
        send_mode: send_mode || 'manual',
        send_delay_hours: send_delay_hours ? parseInt(send_delay_hours, 10) : null,
        send_scheduled_at: send_scheduled_at ? new Date(send_scheduled_at) : null,
        // A survey is always created as draft — publish() is the only way to go public.
        status: 'draft',
        access_mode,
        ctt_norms_version_id: ctt_norms_version_id ? parseInt(ctt_norms_version_id, 10) : null,
        created_by: userId,
      },
    });

    return attachUserRefOne(created, (s) => s.created_by, 'creator', ['id', 'username', 'email']);
  }

  static async update(surveyId: number, body: Record<string, any>) {
    const existing = await prisma.surveys.findUnique({
      where: { id: surveyId },
      include: { _count: { select: { surveys_questionnaires: true } } },
    });
    if (!existing) throw new ServiceError('Survey not found', 404);

    if (existing.status === 'completed') {
      throw new ServiceError('Survey is completed and can no longer be modified', 409);
    }

    const {
      name,
      starting_date,
      end_date,
      reminder,
      frequency_tipology,
      frequency,
      reminder_max_count,
      send_mode,
      send_delay_hours,
      send_scheduled_at,
      status,
      access_mode,
      ctt_norms_version_id,
    } = body;

    // DRAFT allows full edits; once the survey has left draft (public/disabled),
    // name/starting_date/access_mode/sending+reminder config are locked.
    if (existing.status !== 'draft') {
      if (name !== undefined && name !== existing.name) {
        throw new ServiceError('Name cannot be changed once the survey has left draft status', 409);
      }
      if (starting_date !== undefined) {
        const incoming = new Date(starting_date).toISOString().split('T')[0];
        const existingDate = existing.starting_date
          ? new Date(existing.starting_date).toISOString().split('T')[0]
          : null;
        if (incoming !== existingDate) {
          throw new ServiceError(
            'Starting date cannot be changed once the survey has left draft status',
            409
          );
        }
      }
      if (access_mode !== undefined && access_mode !== existing.access_mode) {
        throw new ServiceError(
          'Access mode cannot be changed once the survey has left draft status',
          409
        );
      }
      // Compare against the *normalized* existing value (mirroring the parsing done for
      // updateData below), not just presence — the edit form always resubmits every
      // sending/reminder field with its unchanged value, even when only e.g. `status`
      // is actually being changed.
      const normalizedReminder =
        reminder === undefined
          ? undefined
          : reminder === true || reminder === 'true' || reminder === 1;
      const normalizedFrequencyTipology =
        frequency_tipology === undefined ? undefined : frequency_tipology || null;
      const normalizedFrequency =
        frequency === undefined ? undefined : frequency ? parseInt(frequency, 10) : null;
      const normalizedReminderMaxCount =
        reminder_max_count === undefined
          ? undefined
          : reminder_max_count
            ? parseInt(reminder_max_count, 10)
            : null;
      const normalizedSendDelayHours =
        send_delay_hours === undefined
          ? undefined
          : send_delay_hours
            ? parseInt(send_delay_hours, 10)
            : null;
      const normalizedSendScheduledAt =
        send_scheduled_at === undefined
          ? undefined
          : send_scheduled_at
            ? new Date(send_scheduled_at).getTime()
            : null;
      const existingSendScheduledAt = existing.send_scheduled_at
        ? new Date(existing.send_scheduled_at).getTime()
        : null;

      const sendingTouched = [
        [send_mode, existing.send_mode],
        [normalizedSendDelayHours, existing.send_delay_hours],
        [normalizedSendScheduledAt, existingSendScheduledAt],
        [normalizedFrequency, existing.frequency],
        [normalizedFrequencyTipology, existing.frequency_tipology],
        [normalizedReminder, existing.reminder],
        [normalizedReminderMaxCount, existing.reminder_max_count],
      ].some(([incoming, current]) => incoming !== undefined && incoming !== current);
      if (sendingTouched) {
        throw new ServiceError(
          'Sending/reminder configuration is locked once the survey has left draft status',
          409
        );
      }
    }

    if (starting_date && end_date && new Date(starting_date) > new Date(end_date)) {
      throw new ServiceError('Starting date must be before end date');
    }

    if (frequency_tipology && !['daily', 'weekly', 'monthly'].includes(frequency_tipology)) {
      throw new ServiceError('Frequency tipology must be daily, weekly, or monthly');
    }

    if (
      send_mode !== undefined &&
      !['manual', 'immediate', 'after_delay', 'scheduled'].includes(send_mode)
    ) {
      throw new ServiceError('send_mode must be manual, immediate, after_delay, or scheduled');
    }

    if (
      access_mode !== undefined &&
      !['traced', 'anonymous_on_invitation', 'anonymous_spontaneous'].includes(access_mode)
    ) {
      throw new ServiceError(
        'access_mode must be traced, anonymous_on_invitation, or anonymous_spontaneous'
      );
    }

    if (status !== undefined && status !== existing.status) {
      if (status === 'completed') {
        throw new ServiceError('Survey completion is automatic and cannot be set manually', 400);
      }
      assertManualTransition('survey', existing.status, status);
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (starting_date !== undefined)
      updateData.starting_date = starting_date ? new Date(starting_date) : null;
    if (end_date !== undefined) updateData.end_date = end_date ? new Date(end_date) : null;
    if (reminder !== undefined)
      updateData.reminder = reminder === true || reminder === 'true' || reminder === 1;
    if (frequency_tipology !== undefined)
      updateData.frequency_tipology = frequency_tipology || null;
    if (frequency !== undefined) updateData.frequency = frequency ? parseInt(frequency, 10) : null;
    if (reminder_max_count !== undefined)
      updateData.reminder_max_count = reminder_max_count ? parseInt(reminder_max_count, 10) : null;
    if (send_mode !== undefined) updateData.send_mode = send_mode;
    if (send_delay_hours !== undefined)
      updateData.send_delay_hours = send_delay_hours ? parseInt(send_delay_hours, 10) : null;
    if (send_scheduled_at !== undefined)
      updateData.send_scheduled_at = send_scheduled_at ? new Date(send_scheduled_at) : null;
    if (status !== undefined) updateData.status = status;
    if (access_mode !== undefined) updateData.access_mode = access_mode;
    if (ctt_norms_version_id !== undefined) {
      const normsVersionId = parseInt(ctt_norms_version_id, 10);
      const normsVersion = await prisma.ctt_norms_versions.findUnique({
        where: { id: normsVersionId },
      });
      if (!normsVersion) throw new ServiceError('ctt_norms_version_id does not exist');
      updateData.ctt_norms_version_id = normsVersionId;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const updated = await tx.surveys.update({
        where: { id: surveyId },
        data: updateData,
      });

      // Cascade: PUBLIC -> DISABLED disables every currently-public linked
      // questionnaire, tagging it as survey-caused so it can be selectively restored.
      if (status === 'disabled' && existing.status === 'public') {
        await tx.questionnaires.updateMany({
          where: { status: 'public', surveys_questionnaires: { some: { survey_id: surveyId } } },
          data: { status: 'disabled', disabled_by_survey: true },
        });
      }

      // Cascade: DISABLED -> PUBLIC restores only the questionnaires that were
      // disabled *because of* the survey — manually-disabled ones stay disabled.
      if (status === 'public' && existing.status === 'disabled') {
        const candidates = await tx.questionnaires.findMany({
          where: {
            status: 'disabled',
            disabled_by_survey: true,
            surveys_questionnaires: { some: { survey_id: surveyId } },
          },
          select: { id: true },
        });
        const isAnonymousSpontaneous = existing.access_mode === 'anonymous_spontaneous';
        for (const q of candidates) {
          const assignmentCount = isAnonymousSpontaneous
            ? 1
            : await tx.survey_questionnaire_patients_assignment.count({
                where: {
                  survey_questionnaire: { questionnaire_id: q.id },
                  access_mode: { not: 'anonymous_spontaneous' },
                },
              });
          await tx.questionnaires.update({
            where: { id: q.id },
            data: {
              status: assignmentCount > 0 ? 'public' : 'draft',
              disabled_by_survey: false,
            },
          });
        }
      }

      return updated;
    });

    // Outside the transaction on purpose: it reads from Keycloak, which is a
    // different connection and has no business holding this one open.
    return attachUserRefOne(updated, (s) => s.created_by, 'creator', ['id', 'username', 'email']);
  }

  /**
   * Manual DRAFT -> PUBLIC transition. Requires starting_date <= today and at
   * least one linked questionnaire. Activates any linked questionnaire that
   * already has assignments (or is anonymous_spontaneous with a public link).
   */
  static async publish(surveyId: number) {
    const survey = await prisma.surveys.findUnique({
      where: { id: surveyId },
      include: { _count: { select: { surveys_questionnaires: true } } },
    });
    if (!survey) throw new ServiceError('Survey not found', 404);

    if (survey.status !== 'draft') {
      throw new ServiceError(`Cannot publish a survey from status '${survey.status}'`, 409);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (!survey.starting_date || new Date(survey.starting_date) > today) {
      throw new ServiceError('Cannot publish: starting date must be today or in the past', 422);
    }
    if (survey._count.surveys_questionnaires === 0) {
      throw new ServiceError('Cannot publish: the survey must have at least one questionnaire', 422);
    }

    return prisma.$transaction(async (tx) => {
      const updated = await tx.surveys.update({ where: { id: surveyId }, data: { status: 'public' } });

      const links = await tx.surveys_questionnaires.findMany({
        where: { survey_id: surveyId },
        select: { questionnaire_id: true, public_link: true },
      });

      for (const link of links) {
        if (link.public_link) {
          // anonymous_spontaneous: inherits the survey's status directly.
          await tx.questionnaires.updateMany({
            where: { id: link.questionnaire_id, status: 'draft' },
            data: { status: 'public' },
          });
          continue;
        }
        const assignmentCount = await tx.survey_questionnaire_patients_assignment.count({
          where: { survey_questionnaire: { questionnaire_id: link.questionnaire_id } },
        });
        if (assignmentCount > 0) {
          await tx.questionnaires.updateMany({
            where: { id: link.questionnaire_id, status: 'draft' },
            data: { status: 'public' },
          });
        }
      }

      return updated;
    });
  }

  /**
   * Auto-completes a survey when its end_date has passed, or when every linked
   * questionnaire is already COMPLETED. This generic "all completed" rule already
   * implements the anonymous_spontaneous exception from the spec: the survey never
   * completes solely because of it, unless it's the only (or last remaining open)
   * questionnaire.
   */
  static async autoCompleteIfEligible(tx: any, surveyId: number): Promise<boolean> {
    const survey = await tx.surveys.findUnique({
      where: { id: surveyId },
      select: { status: true, end_date: true },
    });
    if (!survey || !['public', 'disabled'].includes(survey.status)) return false;

    const endDateReached = !!survey.end_date && survey.end_date <= new Date();
    let allCompleted = false;
    if (!endDateReached) {
      const links = await tx.surveys_questionnaires.findMany({
        where: { survey_id: surveyId },
        select: { questionnaire: { select: { status: true } } },
      });
      allCompleted =
        links.length > 0 && links.every((l: any) => l.questionnaire.status === 'completed');
    }

    if (endDateReached || allCompleted) {
      await tx.surveys.update({ where: { id: surveyId }, data: { status: 'completed' } });

      // anonymous_on_invitation: the survey is done for good — anonymize any patient
      // whose assignment under any of its questionnaires never completed.
      const links = await tx.surveys_questionnaires.findMany({
        where: { survey_id: surveyId },
        select: { id: true },
      });
      await AssignmentService.anonymizePendingForClosedBatch(
        tx,
        links.map((l: { id: number }) => l.id)
      );

      return true;
    }
    return false;
  }

  static async delete(surveyId: number) {
    const survey = await prisma.surveys.findUnique({
      where: { id: surveyId },
      include: { _count: { select: { surveys_questionnaires: true } } },
    });
    if (!survey) throw new ServiceError('Survey not found', 404);

    const [completedAssignments, totalResponses, questionnaireLinks, privacyPolicyLinks] =
      await Promise.all([
        prisma.survey_questionnaire_patients_assignment.count({
          where: {
            survey_questionnaire: { survey_id: surveyId },
            completion_status: 'completed',
          },
        }),
        prisma.responses.count({
          where: { assignment: { survey_questionnaire: { survey_id: surveyId } } },
        }),
        prisma.surveys_questionnaires.findMany({
          where: { survey_id: surveyId },
          select: { questionnaire_id: true },
        }),
        prisma.survey_privacy_policies.findMany({
          where: { survey_id: surveyId },
          select: { privacy_policy_id: true },
        }),
      ]);

    const { questionnairesDeleted, privacyPoliciesDeleted, privacyPoliciesOrphanedButKept } =
      await prisma.$transaction(async (tx) => {
        await tx.surveys.delete({ where: { id: surveyId } });

        // Questionnaires are created 1:1 with the survey they belong to (see
        // QuestionnaireService.create) and are never shared across surveys, so once the
        // owning survey is gone they are true orphans — hard delete them. The defensive
        // count guard skips the delete in the anomalous case where one is still linked.
        let questionnairesDeleted = 0;
        for (const { questionnaire_id } of questionnaireLinks) {
          const stillLinked = await tx.surveys_questionnaires.count({
            where: { questionnaire_id },
          });
          if (stillLinked > 0) continue;
          await tx.questionnaires.delete({ where: { id: questionnaire_id } });
          questionnairesDeleted++;
        }

        // Privacy policies are reusable templates that can be attached to multiple surveys
        // (see SurveyPrivacyPolicyService/PrivacyPolicyService), so only delete one once no
        // other survey references it. Policies with recorded patient acceptances are kept
        // (deleting them would violate the privacy_policy_acceptances FK) rather than deleted.
        let privacyPoliciesDeleted = 0;
        let privacyPoliciesOrphanedButKept = 0;
        for (const { privacy_policy_id } of privacyPolicyLinks) {
          const stillLinked = await tx.survey_privacy_policies.count({
            where: { privacy_policy_id },
          });
          if (stillLinked > 0) continue;

          const hasAcceptances = await tx.privacy_policy_acceptances.count({
            where: { privacy_policy_id },
          });
          if (hasAcceptances > 0) {
            privacyPoliciesOrphanedButKept++;
            continue;
          }

          await tx.privacy_policies.delete({ where: { id: privacy_policy_id } });
          privacyPoliciesDeleted++;
        }

        return { questionnairesDeleted, privacyPoliciesDeleted, privacyPoliciesOrphanedButKept };
      });

    return {
      deletedSurvey: { id: survey.id, name: survey.name },
      deletedData: {
        questionnaireLinksCascaded: survey._count.surveys_questionnaires,
        questionnairesDeleted,
        privacyPoliciesDeleted,
        privacyPoliciesOrphanedButKept,
        completedAssignmentsCascaded: completedAssignments,
        responsesCascaded: totalResponses,
      },
    };
  }

  static async duplicate(surveyId: number, userId: string | null, overrides: Record<string, any> = {}) {
    const original = await prisma.surveys.findUnique({
      where: { id: surveyId },
      include: {
        surveys_questionnaires: {
          include: {
            questionnaire: {
              include: {
                questionnaires_modules: { orderBy: { position: 'asc' } },
              },
            },
            email_templates: true,
          },
        },
        survey_presentations: { where: { is_current: true } },
        survey_closing_messages: { where: { is_current: true } },
        survey_eligibility_questions: {
          where: { is_current: true, is_active: true },
          include: { translations: true },
        },
        survey_privacy_policies: { include: { privacy_policy: true } },
        survey_study_info_sheets: {
          where: { is_current: true },
          include: {
            consent_questions: { orderBy: [{ order_position: 'asc' }, { id: 'asc' }] },
          },
        },
      },
    });
    if (!original) throw new ServiceError('Survey not found', 404);

    const {
      name,
      starting_date,
      end_date,
      reminder,
      frequency_tipology,
      frequency,
      reminder_max_count,
      send_mode,
      send_delay_hours,
      send_scheduled_at,
      access_mode,
      ctt_norms_version_id,
    } = overrides;

    // Same validation rules as SurveyService.create — the prefilled form can still be edited
    // by the user, so its values must be validated the same way before persisting the copy.
    if (access_mode !== undefined) {
      if (!['traced', 'anonymous_on_invitation', 'anonymous_spontaneous'].includes(access_mode)) {
        throw new ServiceError(
          'access_mode must be traced, anonymous_on_invitation, or anonymous_spontaneous'
        );
      }
    }

    if (starting_date && end_date && new Date(starting_date) > new Date(end_date)) {
      throw new ServiceError('Starting date must be before end date');
    }

    if (frequency_tipology && !['daily', 'weekly', 'monthly'].includes(frequency_tipology)) {
      throw new ServiceError('Frequency tipology must be daily, weekly, or monthly');
    }

    if (send_mode !== undefined && !['manual', 'immediate', 'after_delay', 'scheduled'].includes(send_mode)) {
      throw new ServiceError('send_mode must be manual, immediate, after_delay, or scheduled');
    }

    const newSurvey = await prisma.$transaction(async (tx) => {
      const survey = await tx.surveys.create({
        data: {
          name: name ?? `${original.name} COPY`,
          starting_date: starting_date ? new Date(starting_date) : null,
          end_date: end_date ? new Date(end_date) : null,
          max_completions: original.max_completions,
          reminder:
            reminder !== undefined
              ? reminder === true || reminder === 'true' || reminder === 1
              : original.reminder,
          frequency_tipology: frequency_tipology ?? original.frequency_tipology,
          frequency: frequency !== undefined ? (frequency ? parseInt(frequency, 10) : null) : original.frequency,
          reminder_max_count: reminder_max_count ? parseInt(reminder_max_count, 10) : null,
          send_mode: send_mode ?? 'manual',
          send_delay_hours: send_delay_hours ? parseInt(send_delay_hours, 10) : null,
          send_scheduled_at: send_scheduled_at ? new Date(send_scheduled_at) : null,
          access_mode: access_mode ?? 'traced',
          ctt_norms_version_id: ctt_norms_version_id ? parseInt(ctt_norms_version_id, 10) : null,
          // A duplicated survey is always created as draft — publish() is the only way to go public.
          status: 'draft',
          created_by: userId ?? original.created_by,
        },
      });

      for (const sq of original.surveys_questionnaires) {
        const q = sq.questionnaire;
        const newQ = await tx.questionnaires.create({
          data: {
            title: q.title,
            description: q.description,
            patient_group_id: q.patient_group_id,
            type: q.type,
            status: 'draft',
            created_by: userId ?? q.created_by,
          },
        });

        if (q.questionnaires_modules.length > 0) {
          await tx.questionnaires_modules.createMany({
            data: q.questionnaires_modules.map((qm) => ({
              questionnaire_id: newQ.id,
              module_id: qm.module_id,
              position: qm.position,
              is_active: qm.is_active,
            })),
          });
        }

        const newSq = await tx.surveys_questionnaires.create({
          data: {
            survey_id: survey.id,
            questionnaire_id: newQ.id,
            public_link: null,
            is_active: false,
          },
        });

        if (sq.email_templates.length > 0) {
          await tx.surveys_questionnaires_email_templates.createMany({
            data: sq.email_templates.map((et) => ({
              survey_questionnaire_id: newSq.id,
              language_id: et.language_id,
              subject: et.subject,
              body: et.body,
              is_fallback: et.is_fallback,
            })),
          });
        }
      }

      if (original.survey_presentations.length > 0) {
        await tx.survey_presentations.createMany({
          data: original.survey_presentations.map((p) => {
            const newPdfUrl = copyPdf(p.pdf_url, 'presentations');
            return {
              survey_id: survey.id,
              language_id: p.language_id,
              title: p.title,
              content: p.content,
              is_fallback: p.is_fallback,
              pdf_url: newPdfUrl,
              pdf_filename: newPdfUrl ? p.pdf_filename : null,
            };
          }),
        });
      }

      if (original.survey_closing_messages.length > 0) {
        await tx.survey_closing_messages.createMany({
          data: original.survey_closing_messages.map((cm) => ({
            survey_id: survey.id,
            language_id: cm.language_id,
            content: cm.content,
            link_used_message: cm.link_used_message,
            survey_closed_message: cm.survey_closed_message,
            resume_message: cm.resume_message,
            is_current: true,
            is_fallback: cm.is_fallback,
          })),
        });
      }

      for (const eq of original.survey_eligibility_questions) {
        await tx.survey_eligibility_questions.create({
          data: {
            survey_id: survey.id,
            expected_answer: eq.expected_answer,
            order_position: eq.order_position,
            is_active: true,
            translations: {
              create: eq.translations.map((t) => ({
                language_id: t.language_id,
                question_text: t.question_text,
                disqualification_message: t.disqualification_message,
                is_fallback: t.is_fallback,
              })),
            },
          },
        });
      }

      for (const spp of original.survey_privacy_policies) {
        // privacy_policies is a shared/standalone entity (no survey_id) — clone the content into
        // a new row so editing the duplicated survey's policy never affects the original survey.
        const newPdfUrl = copyPdf(spp.privacy_policy.pdf_url, 'privacy-policies');
        const newPolicy = await tx.privacy_policies.create({
          data: {
            title: spp.privacy_policy.title,
            content: spp.privacy_policy.content,
            language_id: spp.privacy_policy.language_id,
            patient_type: spp.privacy_policy.patient_type,
            is_active: spp.privacy_policy.is_active,
            created_by: userId ?? spp.privacy_policy.created_by,
            pdf_url: newPdfUrl,
            pdf_filename: newPdfUrl ? spp.privacy_policy.pdf_filename : null,
          },
        });
        await tx.survey_privacy_policies.create({
          data: {
            survey_id: survey.id,
            privacy_policy_id: newPolicy.id,
            is_fallback: spp.is_fallback,
          },
        });
      }

      // One create per sheet (not createMany): the nested consent questions
      // can only be copied through a nested create.
      for (const s of original.survey_study_info_sheets) {
        const newPdfUrl = copyPdf(s.pdf_url, 'study-info-sheets');
        await tx.survey_study_info_sheets.create({
          data: {
            survey_id: survey.id,
            language_id: s.language_id,
            title: s.title,
            content: s.content,
            rejection_message: s.rejection_message,
            is_fallback: s.is_fallback,
            pdf_url: newPdfUrl,
            pdf_filename: newPdfUrl ? s.pdf_filename : null,
            consent_questions: {
              create: s.consent_questions.map((q) => ({
                question_text: q.question_text,
                order_position: q.order_position,
              })),
            },
          },
        });
      }

      return survey;
    });

    return { newSurvey, questionnaireCount: original.surveys_questionnaires.length };
  }

  /**
   * Job C (scheduler): auto-close surveys.
   *  - public|disabled → completed when end_date <= NOW()
   *  - public|disabled → completed when every linked questionnaire is COMPLETED
   * draft → public is no longer automatic here — see SurveyService.publish().
   */
  static async runStatusTransitionJob(): Promise<void> {
    const now = new Date();

    const surveysClosingByDate = await prisma.surveys.findMany({
      where: { status: { in: ['public', 'disabled'] }, end_date: { lte: now } },
      select: { id: true },
    });
    if (surveysClosingByDate.length > 0) {
      await prisma.surveys.updateMany({
        where: { id: { in: surveysClosingByDate.map((s) => s.id) } },
        data: { status: 'completed' },
      });
      console.log(
        `[Scheduler] Job C: ${surveysClosingByDate.length} survey(s) → completed (end_date reached)`
      );
      await SurveyService.anonymizePendingAcrossSurveys(surveysClosingByDate.map((s) => s.id));
    }

    const candidates = await prisma.surveys.findMany({
      where: { status: { in: ['public', 'disabled'] } },
      select: {
        id: true,
        surveys_questionnaires: { select: { questionnaire: { select: { status: true } } } },
      },
    });
    const toComplete = candidates
      .filter(
        (s) =>
          s.surveys_questionnaires.length > 0 &&
          s.surveys_questionnaires.every((sq) => sq.questionnaire.status === 'completed')
      )
      .map((s) => s.id);
    if (toComplete.length > 0) {
      await prisma.surveys.updateMany({
        where: { id: { in: toComplete } },
        data: { status: 'completed' },
      });
      console.log(
        `[Scheduler] Job C: ${toComplete.length} survey(s) → completed (all questionnaires completed)`
      );
      await SurveyService.anonymizePendingAcrossSurveys(toComplete);
    }
  }

  /**
   * anonymous_on_invitation: sweep every never-completed assignment across each of
   * these just-closed surveys (used by Job C, which flips survey status straight to
   * 'completed' via updateMany without going through autoCompleteIfEligible).
   */
  private static async anonymizePendingAcrossSurveys(surveyIds: number[]): Promise<void> {
    for (const surveyId of surveyIds) {
      const links = await prisma.surveys_questionnaires.findMany({
        where: { survey_id: surveyId },
        select: { id: true },
      });
      await AssignmentService.anonymizePendingForClosedBatch(prisma, links.map((l) => l.id));
    }
  }

  /**
   * Job D (scheduler): Email the survey creator and every collaborator the survey
   * was shared with through `users_surveys` with `edit` access when its end_date is
   * exactly `END_DATE_REMINDER_DAYS_BEFORE` days away, warning about the imminent
   * closure. Skipped entirely for surveys shorter than that window, and sent at
   * most once per survey (tracked via `end_date_reminder_sent_at`).
   */
  static async runEndDateReminderJob(): Promise<void> {
    const now = new Date();
    const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    const targetDate = new Date(todayUTC);
    targetDate.setUTCDate(targetDate.getUTCDate() + END_DATE_REMINDER_DAYS_BEFORE);
    const targetDateEnd = new Date(targetDate);
    targetDateEnd.setUTCDate(targetDateEnd.getUTCDate() + 1);

    const candidates = await prisma.surveys.findMany({
      where: {
        status: 'public',
        end_date: { gte: targetDate, lt: targetDateEnd },
        end_date_reminder_sent_at: null,
      },
      select: {
        id: true,
        name: true,
        starting_date: true,
        end_date: true,
        created_by: true,
        users_surveys: { where: { access_type: 'edit' }, select: { user_id: true } },
      },
    });

    // One batched Keycloak lookup for creators and collaborators of all candidates.
    const userRefs = await getUserRefs(
      candidates.flatMap((s) => [s.created_by, ...s.users_surveys.map((us) => us.user_id)]),
      ['email']
    );

    for (const survey of candidates) {
      if (!survey.starting_date || !survey.end_date) continue;

      const durationDays =
        (survey.end_date.getTime() - survey.starting_date.getTime()) / (1000 * 60 * 60 * 24);
      if (durationDays < END_DATE_REMINDER_DAYS_BEFORE) {
        continue; // Survey too short — no reminder per business rule.
      }

      const recipientIds = [survey.created_by, ...survey.users_surveys.map((us) => us.user_id)];
      const recipients = [
        ...new Set(
          recipientIds
            .map((id) => (id ? userRefs.get(id)?.email : null))
            .filter((email): email is string => !!email)
        ),
      ];

      if (recipients.length === 0) {
        console.warn(`[Scheduler] Job D: survey ${survey.id} has no recipient email, skipping`);
        continue;
      }

      const payload = {
        surveyName: survey.name,
        endDate: survey.end_date.toISOString().split('T')[0],
        daysRemaining: END_DATE_REMINDER_DAYS_BEFORE,
      };

      let sentCount = 0;
      for (const email of recipients) {
        try {
          await emailService.sendEmail(EmailType.SURVEY_END_REMINDER, email, payload);
          sentCount++;
          console.log(`[Scheduler] Job D: sent end-date reminder for survey ${survey.id} to ${email}`);
        } catch (err) {
          console.error(
            `[Scheduler] Job D: failed to send end-date reminder for survey ${survey.id} to ${email}:`,
            err
          );
        }
      }

      // Mark as sent once at least one recipient got it, so the next run does not re-notify them.
      if (sentCount > 0) {
        try {
          await prisma.surveys.update({
            where: { id: survey.id },
            data: { end_date_reminder_sent_at: new Date() },
          });
        } catch (err) {
          console.error(`[Scheduler] Job D: failed to mark reminder as sent for survey ${survey.id}:`, err);
        }
      }
    }
  }
}
