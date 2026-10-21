import { PrismaClient } from '../generated/app';
import { NextFunction, Request, Response } from 'express';
import { attachUserRef, attachUserRefOne, getUserRefs } from '../services/keycloakUserRefs.js';

const prisma = new PrismaClient();

/**
 * POST /euonqol-api/surveys/:surveyId/managers
 * Invite a manager to collaborate on a survey
 * Only the survey creator can invite other managers
 */
export async function inviteManager(req: Request, res: Response, next: NextFunction) {
  try {
    const surveyId = parseInt(req.params.surveyId as string, 10);
    const { manager_id, access_type = 'edit' } = req.body;

    // req.user guaranteed by authenticate() middleware
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const currentUserId = req.user.id;  // Keycloak UUID
    const currentUserType = req.user.user_type;

    // Validations
    if (!manager_id) {
      return res.status(400).json({ error: 'manager_id is required' });
    }

    if (!['view', 'edit'].includes(access_type)) {
      return res.status(400).json({ error: 'access_type must be "view" or "edit"' });
    }

    // Check if survey exists
    const survey = await prisma.surveys.findUnique({
      where: { id: surveyId },
      // Solo created_by: il creatore non viene mai letto in questo endpoint.
      select: { id: true, name: true, created_by: true },
    });

    if (!survey) {
      return res.status(404).json({ error: 'Survey not found' });
    }

    // Only the creator or admin can invite managers
    if (currentUserType !== 'admin' && survey.created_by !== currentUserId) {
      return res.status(403).json({ 
        error: 'Only the survey creator or admin can invite managers' 
      });
    }

    // Check if manager is the creator (cannot invite yourself)
    if (manager_id === survey.created_by) {
      return res.status(400).json({ 
        error: 'Cannot invite the survey creator (already has full access)' 
      });
    }

    // Check if invitation already exists
    const existingInvite = await prisma.users_surveys.findUnique({
      where: {
        user_id_survey_id: {
          user_id: manager_id,
          survey_id: surveyId,
        },
      },
    });

    if (existingInvite) {
      return res.status(409).json({ 
        error: 'Manager already has access to this survey' 
      });
    }

    // Create invitation
    const invitation = await prisma.users_surveys.create({
      data: {
        user_id: manager_id,
        survey_id: surveyId,
        access_type,
      },
    });

    const invitationWithUser = await attachUserRefOne(invitation, (i) => i.user_id, 'user', [
      'id',
      'username',
      'email',
    ]);

    return res.status(201).json({
      message: 'Manager invited successfully',
      invitation: {
        id: invitation.id,
        surveyId: invitation.survey_id,
        surveyName: survey.name,
        manager: invitationWithUser.user,
        accessType: invitation.access_type,
        createdAt: invitation.created_at,
      },
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * GET /euonqol-api/surveys/:surveyId/managers
 * List all managers with access to a survey
 */
export async function getSurveyManagers(req: Request, res: Response, next: NextFunction) {
  try {
    const surveyId = parseInt(req.params.surveyId as string, 10);

    // req.user guaranteed by authenticate() middleware
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const currentUserId = req.user.id;  // Keycloak UUID
    const currentUserType = req.user.user_type;

    // Check if survey exists
    const survey = await prisma.surveys.findUnique({
      where: { id: surveyId },
      select: { id: true, name: true, created_by: true },
    });

    if (!survey) {
      return res.status(404).json({ error: 'Survey not found' });
    }

    // Check if user has access to view managers
    const hasAccess = 
      currentUserType === 'admin' || 
      survey.created_by === currentUserId ||
      await prisma.users_surveys.findFirst({
        where: {
          user_id: currentUserId,
          survey_id: surveyId,
        },
      });

    if (!hasAccess) {
      return res.status(403).json({ 
        error: 'You do not have access to view this survey managers' 
      });
    }

    // Get all invited managers
    const rawInvitations = await prisma.users_surveys.findMany({
      where: { survey_id: surveyId },
      orderBy: { created_at: 'desc' },
    });

    const invitations = await attachUserRef(rawInvitations, (i) => i.user_id, 'user', [
      'id',
      'username',
      'email',
    ]);

    const creators = await getUserRefs([survey.created_by], ['id', 'username', 'email']);

    const managers = invitations.map((inv) => ({
      id: inv.id,
      manager: inv.user,
      accessType: inv.access_type,
      invitedAt: inv.created_at,
    }));

    return res.status(200).json({
      surveyId: survey.id,
      surveyName: survey.name,
      creator: (survey.created_by && creators.get(survey.created_by)) || null,
      invitedManagers: managers,
      totalInvited: managers.length,
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * PATCH /euonqol-api/surveys/:surveyId/managers/:managerId
 * Update manager's access permissions
 */
export async function updateManagerAccess(req: Request, res: Response, next: NextFunction) {
  try {
    const surveyId = parseInt(req.params.surveyId as string, 10);
    const managerId = req.params.managerId as string;  // Keycloak UUID
    const { access_type } = req.body;

    // req.user guaranteed by authenticate() middleware
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const currentUserId = req.user.id;  // Keycloak UUID
    const currentUserType = req.user.user_type;

    // Validations
    if (!access_type) {
      return res.status(400).json({ error: 'access_type is required' });
    }

    if (!['view', 'edit'].includes(access_type)) {
      return res.status(400).json({ error: 'access_type must be "view" or "edit"' });
    }

    // Check if survey exists
    const survey = await prisma.surveys.findUnique({
      where: { id: surveyId },
      select: { created_by: true },
    });

    if (!survey) {
      return res.status(404).json({ error: 'Survey not found' });
    }

    // Check if current user is the creator or admin
    if (currentUserType !== 'admin' && survey.created_by !== currentUserId) {
      return res.status(403).json({ 
        error: 'Only the survey creator or admin can update permissions' 
      });
    }

    // Check if invitation exists
    const invitation = await prisma.users_surveys.findUnique({
      where: {
        user_id_survey_id: {
          user_id: managerId,
          survey_id: surveyId,
        },
      },
    });

    if (!invitation) {
      return res.status(404).json({ 
        error: 'Manager does not have access to this survey' 
      });
    }

    // Update access type
    const updated = await prisma.users_surveys.update({
      where: {
        user_id_survey_id: {
          user_id: managerId,
          survey_id: surveyId,
        },
      },
      data: { access_type },
    });

    const updatedWithUser = await attachUserRefOne(updated, (u) => u.user_id, 'user', [
      'id',
      'username',
      'email',
    ]);

    return res.status(200).json({
      message: 'Manager access updated successfully',
      invitation: {
        manager: updatedWithUser.user,
        accessType: updated.access_type,
        updatedAt: updated.updated_at,
      },
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * DELETE /euonqol-api/surveys/:surveyId/managers/:managerId
 * Remove manager's access to a survey
 */
export async function removeManager(req: Request, res: Response, next: NextFunction) {
  try {
    const surveyId = parseInt(req.params.surveyId as string, 10);
    const managerId = req.params.managerId as string;  // Keycloak UUID

    // req.user guaranteed by authenticate() middleware
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const currentUserId = req.user.id;  // Keycloak UUID
    const currentUserType = req.user.user_type;

    // Check if survey exists
    const survey = await prisma.surveys.findUnique({
      where: { id: surveyId },
      select: { created_by: true },
    });

    if (!survey) {
      return res.status(404).json({ error: 'Survey not found' });
    }

    // Check if current user is the creator or admin
    if (currentUserType !== 'admin' && survey.created_by !== currentUserId) {
      return res.status(403).json({ 
        error: 'Only the survey creator or admin can remove managers' 
      });
    }

    // Check if invitation exists
    const invitation = await prisma.users_surveys.findUnique({
      where: {
        user_id_survey_id: {
          user_id: managerId,
          survey_id: surveyId,
        },
      },
    });

    if (!invitation) {
      return res.status(404).json({ 
        error: 'Manager does not have access to this survey' 
      });
    }

    const removedUsers = await getUserRefs([invitation.user_id], ['username']);

    // Delete invitation
    await prisma.users_surveys.delete({
      where: {
        user_id_survey_id: {
          user_id: managerId,
          survey_id: surveyId,
        },
      },
    });

    return res.status(200).json({
      message: 'Manager access removed successfully',
      removedManager: removedUsers.get(invitation.user_id)?.username ?? null,
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * GET /euonqol-api/users/:userId/shared-surveys
 * Get all surveys shared with a manager
 */
export async function getSharedSurveys(req: Request, res: Response, next: NextFunction) {
  try {
    const managerId = req.params.userId as string;  // Keycloak UUID

    // req.user guaranteed by authenticate() middleware
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const currentUserId = req.user.id;  // Keycloak UUID
    const currentUserType = req.user.user_type;

    // Check permissions: user can only see their own shared surveys unless admin
    if (currentUserType !== 'admin' && managerId !== currentUserId) {
      return res.status(403).json({ 
        error: 'You can only view your own shared surveys' 
      });
    }

    // Get shared surveys
    const sharedSurveys = await prisma.users_surveys.findMany({
      where: { user_id: managerId },
      include: {
        survey: {
          include: {
            _count: {
              select: {
                surveys_questionnaires: true,
              },
            },
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    // Un'unica lookup per tutti i creatori, prima del ciclo di arricchimento.
    const surveyCreators = await getUserRefs(
      sharedSurveys.map((s) => s.survey.created_by),
      ['id', 'username']
    );

    // Enrich with assignment counts
    const enrichedSurveys = await Promise.all(
      sharedSurveys.map(async (shared) => {
        const assignmentStats = await prisma.survey_questionnaire_patients_assignment.groupBy({
          by: ['completion_status'],
          where: {
            survey_questionnaire: {
              survey_id: shared.survey_id,
            },
          },
          _count: {
            id: true,
          },
        });

        const stats = {
          totalAssignments: 0,
          pending: 0,
          in_progress: 0,
          completed: 0,
        };

        assignmentStats.forEach((stat) => {
          const count = stat._count.id;
          stats.totalAssignments += count;
          if (stat.completion_status === 'pending') stats.pending = count;
          if (stat.completion_status === 'in_progress') stats.in_progress = count;
          if (stat.completion_status === 'completed') stats.completed = count;
        });

        return {
          id: shared.survey.id,
          name: shared.survey.name,
          startingDate: shared.survey.starting_date,
          endDate: shared.survey.end_date,
          status: shared.survey.status,
          creator:
            (shared.survey.created_by && surveyCreators.get(shared.survey.created_by)) || null,
          accessType: shared.access_type,
          sharedAt: shared.created_at,
          questionnairesCount: shared.survey._count.surveys_questionnaires,
          assignmentStats: stats,
        };
      })
    );

    return res.status(200).json({
      managerId,
      sharedSurveys: enrichedSurveys,
      totalShared: enrichedSurveys.length,
    });
  } catch (error) {
    return next(error);
  }
}
