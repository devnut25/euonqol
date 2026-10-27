import { prisma } from '../config/database.js';
import { ServiceError } from '../helpers/ServiceError.js';
import { AuthUser } from '../middleware/auth.js';
import { emailService, EmailType } from './email/index.js';
import { attachUserRefOne, getUserRefs } from './keycloakUserRefs.js';

const MANAGER_FIELDS = ['id', 'username', 'email', 'first_name', 'last_name'] as const;

/** "First Last" of the acting user, falling back to username, then email. */
function authUserDisplayName(user: AuthUser): string {
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return fullName || user.username || user.email;
}

export class SurveyManagerService {
  /**
   * Loads the survey and checks that the acting user is its creator or an admin.
   */
  private static async getOwnedSurvey(surveyId: number, authUser: AuthUser, action: string) {
    const survey = await prisma.surveys.findUnique({
      where: { id: surveyId },
      select: { id: true, name: true, created_by: true },
    });
    if (!survey) {
      throw new ServiceError('Survey not found', 404);
    }
    if (authUser.user_type !== 'admin' && survey.created_by !== authUser.id) {
      throw new ServiceError(`Only the survey creator or admin can ${action} managers`, 403);
    }
    return survey;
  }

  /**
   * Grants a manager access to a survey and notifies them by email.
   * The email is fire-and-forget: a delivery failure does not fail the invitation.
   */
  static async invite(surveyId: number, managerId: string, accessType: string, authUser: AuthUser) {
    if (!managerId) {
      throw new ServiceError('manager_id is required', 400, 'manager_id');
    }
    if (!['view', 'edit'].includes(accessType)) {
      throw new ServiceError('access_type must be "view" or "edit"', 400, 'access_type');
    }

    const survey = await this.getOwnedSurvey(surveyId, authUser, 'invite');

    if (managerId === survey.created_by) {
      throw new ServiceError('Cannot invite the survey creator (already has full access)', 400);
    }

    const existingInvite = await prisma.users_surveys.findUnique({
      where: { user_id_survey_id: { user_id: managerId, survey_id: surveyId } },
    });
    if (existingInvite) {
      throw new ServiceError('Manager already has access to this survey', 409);
    }

    const invitation = await prisma.users_surveys.create({
      data: { user_id: managerId, survey_id: surveyId, access_type: accessType },
    });

    const invitationWithUser = await attachUserRefOne(invitation, (i) => i.user_id, 'user', [
      ...MANAGER_FIELDS,
    ]);

    const managerEmail = invitationWithUser.user?.email;
    if (managerEmail) {
      emailService
        .sendEmail(EmailType.SURVEY_MANAGER_INVITED, managerEmail, {
          surveyId: survey.id,
          surveyName: survey.name,
          inviterName: authUserDisplayName(authUser),
          accessType: invitation.access_type,
        })
        .catch((err: any) => console.error('⚠️ Error send email:', err?.message ?? err));
    }

    return { ...invitationWithUser, survey };
  }

  /**
   * Revokes a manager's access to a survey and notifies them by email.
   * The email is fire-and-forget: a delivery failure does not fail the removal.
   */
  static async remove(surveyId: number, managerId: string, authUser: AuthUser) {
    const survey = await this.getOwnedSurvey(surveyId, authUser, 'remove');

    const invitation = await prisma.users_surveys.findUnique({
      where: { user_id_survey_id: { user_id: managerId, survey_id: surveyId } },
    });
    if (!invitation) {
      throw new ServiceError('Manager does not have access to this survey', 404);
    }

    const removedUser = (await getUserRefs([invitation.user_id], [...MANAGER_FIELDS])).get(
      invitation.user_id
    );

    await prisma.users_surveys.delete({
      where: { user_id_survey_id: { user_id: managerId, survey_id: surveyId } },
    });

    if (removedUser?.email) {
      emailService
        .sendEmail(EmailType.SURVEY_MANAGER_REMOVED, removedUser.email, {
          surveyName: survey.name,
          removedByName: authUserDisplayName(authUser),
        })
        .catch((err: any) => console.error('⚠️ Error send email:', err?.message ?? err));
    }

    return { removedManager: removedUser?.username ?? null };
  }
}
