import { prisma } from '../config/database.js';
import { AssignmentService } from './AssignmentService.js';

export type ScreeningKind = 'eligibility' | 'study-info';

export type ScreeningSubmitResult =
  | { persisted: false }
  | { persisted: true; completion_status: string | null; completed_at: Date | null };

/**
 * Clears the screening outcomes (eligibility / study info) persisted on a private link
 * when the patient goes back from the disqualified screen, revises the answer and passes.
 * Only traced links persist an outcome (see recordEligibilityDisqualification /
 * recordStudyInfoRejection); anonymous ones have nothing to clear.
 */
export class PublicScreeningService {
  static async resetEligibility(link: string): Promise<{ persisted: boolean } | null> {
    return PublicScreeningService.reset(link, {
      eligibility_status: null,
      eligibility_disqualification_msg: null,
    });
  }

  static async resetStudyInfo(link: string): Promise<{ persisted: boolean } | null> {
    return PublicScreeningService.reset(link, {
      study_info_status: null,
      study_info_rejection_msg: null,
    });
  }

  /**
   * The patient confirmed (Submit) a failed eligibility screening or a refused Info &
   * Consent: the questionnaire can never be resumed, so the assignment is closed exactly
   * like a submitted one — completion_status 'completed' + completed_at, open sessions
   * ended, and the patient anonymized on anonymous_on_invitation surveys. The outcome is
   * (re)written in the same update, so this does not depend on the earlier best-effort
   * disqualify/reject call having landed. Returns null when the link doesn't exist.
   */
  static async submit(
    link: string,
    kind: ScreeningKind,
    message: string | null
  ): Promise<ScreeningSubmitResult | null> {
    const assignment = await prisma.survey_questionnaire_patients_assignment.findUnique({
      where: { link },
      select: {
        id: true,
        access_mode: true,
        patient_id: true,
        completion_status: true,
        completed_at: true,
        survey_questionnaire: { select: { survey: { select: { access_mode: true } } } },
      },
    });
    if (!assignment) return null;

    if (
      assignment.access_mode === 'anonymous_spontaneous' ||
      assignment.access_mode === 'anonymous'
    ) {
      return { persisted: false };
    }

    // Idempotent: a double click or a retry after a lost response must not fail.
    if (assignment.completion_status === 'completed') {
      return {
        persisted: true,
        completion_status: assignment.completion_status,
        completed_at: assignment.completed_at,
      };
    }

    const outcome =
      kind === 'eligibility'
        ? { eligibility_status: 'disqualified', eligibility_disqualification_msg: message }
        : { study_info_status: 'declined', study_info_rejection_msg: message };

    const now = new Date();
    const updated = await prisma.survey_questionnaire_patients_assignment.update({
      where: { id: assignment.id },
      data: { ...outcome, completion_status: 'completed', completed_at: now },
      select: { completion_status: true, completed_at: true },
    });

    await prisma.patient_sessions.updateMany({
      where: { survey_assignment_id: assignment.id, end_time: null },
      data: { end_time: now },
    });

    if (assignment.survey_questionnaire.survey?.access_mode === 'anonymous_on_invitation') {
      await AssignmentService.anonymizePatientIfEligible(prisma, assignment.patient_id, [
        assignment.id,
      ]);
    }

    return { persisted: true, ...updated };
  }

  /** Returns null when the link doesn't exist. */
  private static async reset(
    link: string,
    data: Record<string, null>
  ): Promise<{ persisted: boolean } | null> {
    const assignment = await prisma.survey_questionnaire_patients_assignment.findUnique({
      where: { link },
      select: { id: true, access_mode: true, completion_status: true },
    });
    if (!assignment) return null;

    // A submitted screening outcome is final (it closed the questionnaire): never revert it.
    if (
      assignment.access_mode === 'anonymous_spontaneous' ||
      assignment.access_mode === 'anonymous' ||
      assignment.completion_status === 'completed'
    ) {
      return { persisted: false };
    }

    await prisma.survey_questionnaire_patients_assignment.update({
      where: { id: assignment.id },
      data,
    });
    return { persisted: true };
  }
}
