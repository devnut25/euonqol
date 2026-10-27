import crypto from 'crypto';
import { NextFunction, Request, Response } from 'express';
import type { CttNormEntry } from '../config/cttNorms.js';
import { DEFAULT_LANGUAGE_ID } from '../config/language.js';
import { prisma } from '../config/database.js';
import * as catService from '../services/cat/catService.js';
import { getNextPendingScaleSession, getScalesForModule } from '../services/cat/catHelpers.js';
import { CatSession } from '../services/cat/types.js';
import { ServiceError } from '../helpers/ServiceError.js';
import { PublicSurveyClosingMessageResource } from '../resources/surveyClosingMessages.js';
import { AssignmentService } from '../services/AssignmentService.js';
import { LanguageService } from '../services/LanguageService.js';
import { PublicScreeningService } from '../services/PublicScreeningService.js';
import { ResponseValidationService } from '../services/ResponseValidationService.js';
import { orchestrateModuleScoring } from '../services/scoring/scoringOrchestrator.js';
import { SurveyClosingMessageService } from '../services/SurveyClosingMessageService.js';
import { SurveyService } from '../services/SurveyService.js';

/** Validates that a survey is currently accessible (status and date window). */
function validateSurveyAccess(survey: {
  status: string | null;
  starting_date: Date | null;
  end_date: Date | null;
}): { error: string; error_code: string } | null {
  const now = new Date();

  if (survey.status === 'draft') {
    return { error: 'Survey is not yet active', error_code: 'SURVEY_NOT_ACTIVE' };
  }
  if (survey.status === 'disabled') {
    return { error: 'Survey has been disabled', error_code: 'SURVEY_DISABLED' };
  }
  if (survey.status === 'completed') {
    return {
      error: 'Survey has reached its maximum number of responses',
      error_code: 'SURVEY_COMPLETED',
    };
  }
  if (survey.starting_date && now < new Date(survey.starting_date)) {
    return { error: 'Survey has not yet started', error_code: 'SURVEY_NOT_STARTED' };
  }
  if (survey.end_date && now > new Date(survey.end_date)) {
    return { error: 'Survey has ended', error_code: 'SURVEY_ENDED' };
  }

  return null;
}

/**
 * GET /euonqol-api/public/link/:link
 * Access questionnaire by link (public anonymous or private traceable/identified)
 * Returns questionnaire structure and existing responses if resuming
 */
export async function accessQuestionnaire(req: Request, res: Response, next: NextFunction) {
  try {
    const { link } = req.params;
    const linkStr = Array.isArray(link) ? link[0] : link;

    // First, try to find a private assignment (traceable/identified)
    const privateAssignment = await prisma.survey_questionnaire_patients_assignment.findUnique({
      where: { link: linkStr },
      include: {
        survey_questionnaire: {
          include: {
            survey: {
              select: {
                id: true,
                name: true,
                status: true,
                starting_date: true,
                end_date: true,
              },
            },
            questionnaire: {
              select: {
                id: true,
                title: true,
                description: true,
                type: true,
              },
            },
          },
        },
        patient: {
          select: {
            id: true,
            patient_id: true,
          },
        },
        responses: {
          select: {
            id: true,
            question_id: true,
            language_id: true,
            answer_option_id: true,
            answer_text: true,
            socio_demo_answer_id: true,
            feedback_answer_id: true,
          },
        },
      },
    });

    if (privateAssignment) {
      // Private link (traceable or identified)
      const accessMode = privateAssignment.access_mode ?? 'traced';
      const survey = privateAssignment.survey_questionnaire.survey;
      const surveyId = survey.id;

      // "Already completed" takes priority over survey-closed: a link that already
      // finished the survey must keep showing the completed screen even after the
      // survey window later closes, so this check runs before validateSurveyAccess.
      const alreadyCompleted = privateAssignment.completion_status === 'completed';

      if (!alreadyCompleted) {
        // Validate survey is accessible (status, date window)
        const accessError = validateSurveyAccess(survey);
        if (accessError) {
          return res.status(403).json(accessError);
        }
      }

      // has_privacy_policy: true if there's a policy for this patient_type OR any policy (general fallback)
      const [hasPrivacyPolicy, hasPresentation, hasEligibility, hasStudyInfoSheet, hasClosingMessage] =
        await Promise.all([
          prisma.survey_privacy_policies
            .count({ where: { survey_id: surveyId, privacy_policy: { is_active: true } } })
            .then((c) => c > 0),
          prisma.survey_presentations
            .count({ where: { survey_id: surveyId, is_current: true } })
            .then((c) => c > 0),
          prisma.survey_eligibility_questions
            .count({ where: { survey_id: surveyId, is_current: true, is_active: true } })
            .then((c) => c > 0),
          prisma.survey_study_info_sheets
            .count({ where: { survey_id: surveyId, is_current: true } })
            .then((c) => c > 0),
          prisma.survey_closing_messages
            .count({ where: { survey_id: surveyId, is_current: true } })
            .then((c) => c > 0),
        ]);

      return res.json({
        access_mode: accessMode,
        assignment_id: privateAssignment.id,
        survey: privateAssignment.survey_questionnaire.survey,
        questionnaire: privateAssignment.survey_questionnaire.questionnaire,
        patient_group_id: null,
        completion_status: privateAssignment.completion_status,
        eligibility_status: privateAssignment.eligibility_status ?? null,
        eligibility_disqualification_msg:
          privateAssignment.eligibility_disqualification_msg ?? null,
        study_info_status: privateAssignment.study_info_status ?? null,
        study_info_rejection_msg: privateAssignment.study_info_rejection_msg ?? null,
        session_language_id: privateAssignment.responses[0]?.language_id ?? null,
        has_privacy_policy: hasPrivacyPolicy,
        has_presentation: hasPresentation,
        has_eligibility: hasEligibility,
        has_study_info_sheet: hasStudyInfoSheet,
        has_closing_message: hasClosingMessage,
        existing_responses: privateAssignment.responses.map((r) => ({
          question_id: r.question_id,
          answer_option_id: r.answer_option_id,
          answer_text: r.answer_text,
          socio_demo_answer_id: r.socio_demo_answer_id,
          feedback_answer_id: r.feedback_answer_id,
        })),
        can_resume: privateAssignment.completion_status !== 'completed',
      });
    }

    // If not found, try to find a public link (anonymous)
    const publicQuestionnaire = await prisma.surveys_questionnaires.findUnique({
      where: { public_link: linkStr },
      include: {
        survey: {
          select: {
            id: true,
            name: true,
            status: true,
            starting_date: true,
            end_date: true,
          },
        },
        questionnaire: {
          select: {
            id: true,
            title: true,
            description: true,
            type: true,
            patient_group_id: true,
          },
        },
      },
    });

    if (publicQuestionnaire) {
      // Public anonymous link
      const survey = publicQuestionnaire.survey;
      const surveyId = survey.id;

      // Validate survey is accessible (status, date window)
      const accessError = validateSurveyAccess(survey);
      if (accessError) {
        return res.status(403).json(accessError);
      }

      const [hasPrivacyPolicy, hasPresentation, hasEligibility, hasStudyInfoSheet, hasClosingMessage] =
        await Promise.all([
          prisma.survey_privacy_policies
            .count({ where: { survey_id: surveyId, privacy_policy: { is_active: true } } })
            .then((c) => c > 0),
          prisma.survey_presentations
            .count({ where: { survey_id: surveyId, is_current: true } })
            .then((c) => c > 0),
          prisma.survey_eligibility_questions
            .count({ where: { survey_id: surveyId, is_current: true, is_active: true } })
            .then((c) => c > 0),
          prisma.survey_study_info_sheets
            .count({ where: { survey_id: surveyId, is_current: true } })
            .then((c) => c > 0),
          prisma.survey_closing_messages
            .count({ where: { survey_id: surveyId, is_current: true } })
            .then((c) => c > 0),
        ]);

      return res.json({
        access_mode: 'anonymous',
        survey_questionnaire_id: publicQuestionnaire.id,
        survey: publicQuestionnaire.survey,
        questionnaire: publicQuestionnaire.questionnaire,
        patient_group_id: publicQuestionnaire.questionnaire.patient_group_id,
        completion_status: 'pending',
        has_privacy_policy: hasPrivacyPolicy,
        has_presentation: hasPresentation,
        has_eligibility: hasEligibility,
        has_study_info_sheet: hasStudyInfoSheet,
        has_closing_message: hasClosingMessage,
        existing_responses: [],
        can_resume: false, // Anonymous mode always starts fresh
      });
    }

    // Link not found
    return res.status(404).json({
      error: 'Link not found',
      message: 'The provided link is invalid or has expired',
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * POST /euonqol-api/public/link/:link/start
 * Start or resume a questionnaire session
 * For anonymous mode: creates temporary patient and assignment
 * For traceable/identified: resumes existing assignment
 */
export async function startSession(req: Request, res: Response, next: NextFunction) {
  try {
    const { link } = req.params;
    const linkStr = Array.isArray(link) ? link[0] : link;
    const { language_id, privacy_policy_id } = req.body;

    if (!language_id) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'language_id is required',
      });
    }

    // Check if it's a private link
    const privateAssignment = await prisma.survey_questionnaire_patients_assignment.findUnique({
      where: { link: linkStr },
      include: {
        survey_questionnaire: {
          include: {
            survey: true,
          },
        },
        patient: true,
      },
    });

    if (privateAssignment) {
      // Private link - check if already completed
      if (privateAssignment.completion_status === 'completed') {
        return res.status(400).json({
          error: 'Already completed',
          message: 'This questionnaire has already been completed',
        });
      }

      // Reaching start means the patient passed screening: drop a stale disqualification
      // left by an earlier wrong answer / "I do not consent" that was later revised (the
      // frontend reset call is best-effort and may have failed).
      if (privateAssignment.eligibility_status === 'disqualified') {
        await PublicScreeningService.resetEligibility(linkStr);
      }
      if (privateAssignment.study_info_status === 'declined') {
        await PublicScreeningService.resetStudyInfo(linkStr);
      }

      // Update status to in_progress if pending
      if (privateAssignment.completion_status === 'pending') {
        await prisma.survey_questionnaire_patients_assignment.update({
          where: { id: privateAssignment.id },
          data: { completion_status: 'in_progress' },
        });
      }

      // Create or get existing session
      const existingSession = await prisma.patient_sessions.findFirst({
        where: {
          survey_assignment_id: privateAssignment.id,
          end_time: null,
        },
      });

      let session;
      if (existingSession) {
        session = existingSession;
      } else {
        session = await prisma.patient_sessions.create({
          data: {
            survey_id: privateAssignment.survey_questionnaire.survey.id,
            survey_assignment_id: privateAssignment.id,
            patient_id: privateAssignment.patient_id,
          },
        });
      }

      // Record privacy policy acceptance if provided
      if (privacy_policy_id) {
        await prisma.privacy_policy_acceptances
          .upsert({
            where: {
              id:
                (
                  await prisma.privacy_policy_acceptances.findFirst({
                    where: {
                      assignment_id: privateAssignment.id,
                      privacy_policy_id: Number(privacy_policy_id),
                    },
                    select: { id: true },
                  })
                )?.id ?? 0,
            },
            create: {
              privacy_policy_id: Number(privacy_policy_id),
              assignment_id: privateAssignment.id,
            },
            update: {},
          })
          .catch(() => {
            // Acceptance may already exist — ignore duplicate
          });
      }

      return res.json({
        message: 'Session started/resumed',
        session_id: session.id,
        assignment_id: privateAssignment.id,
        access_mode: privateAssignment.access_mode,
        language_id,
      });
    }

    // Check if it's a public anonymous link
    const publicQuestionnaire = await prisma.surveys_questionnaires.findUnique({
      where: { public_link: linkStr },
      include: {
        survey: true,
        questionnaire: {
          select: {
            id: true,
            patient_group_id: true,
          },
        },
      },
    });

    if (publicQuestionnaire) {
      // Anonymous mode - create temporary patient and assignment
      const anonymousToken = crypto.randomBytes(16).toString('hex');

      // Create temporary anonymous patient
      const anonymousPatient = await prisma.patients.create({
        data: {
          patient_id: `ANON_${anonymousToken}`,
          survey_questionnaire_id: publicQuestionnaire.id,
          // A spontaneous respondent still belongs to the group the questionnaire
          // targets. Without it the patient has no group at all, which leaves the
          // export's group column empty and hides them from the dashboard's group
          // filter.
          group_id: publicQuestionnaire.questionnaire.patient_group_id,
          mail: null,
          is_anonymous: true,
          created_by: null,
          is_active: false,
        },
      });

      // Create temporary assignment
      const anonymousAssignment = await prisma.survey_questionnaire_patients_assignment.create({
        data: {
          survey_questionnaire_id: publicQuestionnaire.id,
          patient_id: anonymousPatient.id,
          link: crypto.randomBytes(32).toString('hex'), // Unique link for this session
          access_mode: 'anonymous_spontaneous',
          send_status: 'delivered',
          completion_status: 'in_progress',
        },
      });

      // Create session
      const session = await prisma.patient_sessions.create({
        data: {
          survey_id: publicQuestionnaire.survey.id,
          survey_assignment_id: anonymousAssignment.id,
          patient_id: anonymousPatient.id,
        },
      });

      // Record privacy policy acceptance if provided
      if (privacy_policy_id) {
        await prisma.privacy_policy_acceptances
          .create({
            data: {
              privacy_policy_id: Number(privacy_policy_id),
              assignment_id: anonymousAssignment.id,
            },
          })
          .catch(() => {});
      }

      return res.status(201).json({
        message: 'Anonymous session started',
        session_id: session.id,
        assignment_id: anonymousAssignment.id,
        access_mode: 'anonymous',
        language_id,
        note: 'Responses will be saved but session cannot be resumed if you leave',
      });
    }

    return res.status(404).json({
      error: 'Link not found',
      message: 'The provided link is invalid or has expired',
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * PUT /euonqol-api/public/link/:link/responses
 * Save or update responses for a questionnaire
 * Supports incremental saving
 */
export async function saveResponses(req: Request, res: Response, next: NextFunction) {
  try {
    const { link } = req.params;
    const linkStr = Array.isArray(link) ? link[0] : link;
    const { assignment_id, responses: responseData } = req.body;

    if (!assignment_id || !Array.isArray(responseData)) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'assignment_id and responses array are required',
      });
    }

    // Verify assignment exists and link matches
    const assignment = await prisma.survey_questionnaire_patients_assignment.findFirst({
      where: {
        id: assignment_id,
        OR: [
          { link: linkStr },
          {
            survey_questionnaire: {
              public_link: linkStr,
            },
          },
        ],
      },
      include: {
        survey_questionnaire: {
          include: {
            questionnaire: {
              include: {
                questionnaires_modules: {
                  where: { is_active: true, module: { type: 'dynamic' } },
                  include: { module: { select: { id: true, cat_item_bank_id: true } } },
                },
              },
            },
          },
        },
      },
    });

    if (!assignment) {
      return res.status(404).json({
        error: 'Assignment not found',
        message: 'Invalid assignment_id or link',
      });
    }

    if (assignment.completion_status === 'completed') {
      return res.status(400).json({
        error: 'Already completed',
        message: 'Cannot modify responses of a completed questionnaire',
      });
    }

    // Reject out-of-range numeric answers (Answers sheet Min/Max) before anything is written
    await ResponseValidationService.assertNumericAnswersInRange(responseData);

    // Maps a CAT item bank -> its active dynamic module for this assignment's
    // questionnaire. Needed because a genuinely-adaptive question (chosen at
    // runtime by the external CAT engine, via mapCatItemToQuestion) is NEVER
    // linked through modules_questions — that link only exists for FIXED
    // dynamic-module questions (CTT-scored, or IRT with no CatSettings mapping),
    // which were pre-assigned to the module at import time. So an adaptive
    // response has to be traced back to its module via the question's own
    // cat_item_bank_id instead of the modules_questions join used below.
    const dynamicModuleByBank = new Map<number, { id: number }>();
    for (const qm of assignment.survey_questionnaire?.questionnaire?.questionnaires_modules ?? []) {
      if (qm.module.cat_item_bank_id) {
        dynamicModuleByBank.set(qm.module.cat_item_bank_id, { id: qm.module.id });
      }
    }

    // Save/update responses
    const savedResponses = [];
    const catResponsesProcessed: Array<{
      module_id: number;
      scale: string;
      question_id: number;
      response_value: number;
      was_update: boolean;
    }> = [];
    // Cache of adaptiveScales per dynamic module — a dynamic module can mix
    // genuinely-adaptive scales (driven by a CAT session) with fixed ones (CTT, or
    // IRT with no CatSettings mapping); only the former go through CAT session
    // invalidation/setResponse below. Lazily populated, one lookup per module.
    const adaptiveScalesByModule = new Map<number, Set<string>>();
    async function isScaleAdaptive(moduleId: number, scale: string): Promise<boolean> {
      let scales = adaptiveScalesByModule.get(moduleId);
      if (!scales) {
        try {
          scales = new Set((await getScalesForModule(moduleId)).map((s) => s.scale));
        } catch {
          scales = new Set();
        }
        adaptiveScalesByModule.set(moduleId, scales);
      }
      return scales.has(scale);
    }

    for (const response of responseData) {
      const {
        question_id,
        language_id,
        answer_option_id,
        answer_text,
        socio_demo_answer_id,
        feedback_answer_id,
      } = response;

      // Validate required fields
      if (!question_id || !language_id) {
        throw new Error('question_id and language_id are required for each response');
      }

      // At least one answer field must be provided
      if (!answer_option_id && !answer_text && !socio_demo_answer_id && !feedback_answer_id) {
        throw new Error(
          'At least one of answer_option_id, answer_text, socio_demo_answer_id, or feedback_answer_id must be provided'
        );
      }

      // Check if response already exists (for detecting updates)
      const existingResponse = await prisma.responses.findUnique({
        where: {
          assignment_id_question_id_language_id: {
            assignment_id: assignment.id,
            question_id,
            language_id,
          },
        },
      });

      const wasUpdate = !!existingResponse;

      // Resolve which module (if any) this response's question belongs to, and its
      // scale. FIXED dynamic-module questions (CTT, or IRT with no CatSettings
      // mapping) are linked via modules_questions at import time, same as any
      // static question. Genuinely-adaptive questions are chosen at runtime by the
      // external CAT engine (via mapCatItemToQuestion) and are NEVER linked through
      // modules_questions — they're traced back to their module via the question's
      // own cat_item_bank_id against this assignment's active dynamic modules instead.
      let resolvedModuleId: number | null = null;
      let resolvedCatItemBankId: number | null = null;
      let editedScale: string | null = null;

      const moduleQuestion = await prisma.modules_questions.findFirst({
        where: {
          question_id,
        },
        include: {
          module: {
            select: {
              id: true,
              type: true,
              cat_item_bank_id: true,
            },
          },
          question: {
            select: {
              scale: true,
            },
          },
        },
      });

      if (moduleQuestion && moduleQuestion.module.type === 'dynamic') {
        resolvedModuleId = moduleQuestion.module.id;
        resolvedCatItemBankId = moduleQuestion.module.cat_item_bank_id;
        editedScale = moduleQuestion.question.scale;
      } else if (!moduleQuestion) {
        const bankQuestion = await prisma.questions.findUnique({
          where: { id: question_id },
          select: { question_code: true, cat_item_bank_id: true, question_kind: true },
        });
        if (bankQuestion?.cat_item_bank_id && bankQuestion.question_kind === 'cat') {
          const dynMod = dynamicModuleByBank.get(bankQuestion.cat_item_bank_id);
          if (dynMod) {
            // Genuinely-adaptive response. Neither the question's own `scale` field
            // NOR "the one session that isn't completed yet" can be trusted here:
            // item-bank content may use a different scale-naming convention (e.g.
            // "Physical functioning") than the ScaleCode cat_item_bank_scales/
            // cat_module_sessions use ("PF_S") — they only need to agree on
            // question_code (the CAT engine's itemKey). And a session gets marked
            // is_completed as soon as its LAST item is SERVED, before the patient has
            // necessarily submitted an answer to it yet — so "is_completed: false"
            // can miss the very session this answer belongs to. The reliable signal
            // is which session's session_data actually served this question_code.
            const candidateSessions = await prisma.cat_module_sessions.findMany({
              where: { assignment_id: assignment.id, module_id: dynMod.id },
              select: { scale: true, session_data: true },
            });
            const matchingSession = candidateSessions.find((s) => {
              const usedItems = (s.session_data as any)?.progress?.usedItems ?? [];
              return usedItems.some((u: any) => u.key === bankQuestion.question_code);
            });
            if (matchingSession) {
              resolvedModuleId = dynMod.id;
              resolvedCatItemBankId = bankQuestion.cat_item_bank_id;
              editedScale = matchingSession.scale;
            }
          }
        }
      }

      // Only scales that are genuinely adaptive (have a CAT session) go through the
      // invalidation/rebuild below — fixed scales (CTT, or IRT with no CatSettings
      // mapping) inside the same dynamic module are saved like any plain response,
      // no session involved.
      const editedScaleIsAdaptive =
        !!editedScale &&
        resolvedModuleId != null &&
        (await isScaleAdaptive(resolvedModuleId, editedScale));

      // Upsert response FIRST — so that if this turns out to be an edit needing CAT
      // rebuild (below), the DB already holds this item's fresh value and the
      // replay can just re-read it, instead of juggling the incoming payload
      // separately from what's already stored for the items before it.
      const savedResponse = await prisma.responses.upsert({
        where: {
          assignment_id_question_id_language_id: {
            assignment_id: assignment.id,
            question_id,
            language_id,
          },
        },
        update: {
          answer_option_id: answer_option_id || null,
          answer_text: answer_text || null,
          socio_demo_answer_id: socio_demo_answer_id || null,
          feedback_answer_id: feedback_answer_id || null,
        },
        create: {
          assignment_id: assignment.id,
          question_id,
          language_id,
          answer_option_id: answer_option_id || null,
          answer_text: answer_text || null,
          socio_demo_answer_id: socio_demo_answer_id || null,
          feedback_answer_id: feedback_answer_id || null,
        },
        include: {
          answer_option: {
            select: {
              value: true,
            },
          },
        },
      });

      savedResponses.push(savedResponse);

      if (wasUpdate && resolvedModuleId != null && editedScaleIsAdaptive && editedScale) {
        // Edit to an already-served adaptive item — scoped to the same SCALE as the
        // edited question, since a dynamic module can drive several independent
        // scale sessions. CAT (adaptive) item order is per-patient and decided by
        // the external engine, NOT the static import-time `position` field — so
        // ordering must be derived from `responses.created_at`, matching
        // getPrevCatQuestion.
        console.log(
          `[CAT] Detected update to CAT question ${question_id} (scale "${editedScale}") in module ${resolvedModuleId}`
        );

        // Delete all responses answered after this one, for the same scale's session.
        // Scoped by which question_codes that scale's own session actually served
        // (session_data.progress.usedItems), not by `question.scale` text — item-bank
        // content may use a different scale-naming convention (e.g. "Physical
        // functioning") than the ScaleCode this module's sessions are keyed by
        // ("PF_S"), so a text match here would silently find nothing to delete.
        const scaleSession = await prisma.cat_module_sessions.findUnique({
          where: {
            assignment_id_module_id_scale: {
              assignment_id: assignment.id,
              module_id: resolvedModuleId,
              scale: editedScale,
            },
          },
          select: { session_data: true },
        });
        const scaleItemCodes: string[] = (
          (scaleSession?.session_data as any)?.progress?.usedItems ?? []
        ).map((u: any) => u.key);

        const deletedResponses = await prisma.responses.deleteMany({
          where: {
            assignment_id: assignment.id,
            created_at: { gt: existingResponse!.created_at ?? undefined },
            question: {
              question_kind: 'cat',
              cat_item_bank_id: resolvedCatItemBankId,
              question_code: { in: scaleItemCodes },
            },
          },
        });

        console.log(
          `[CAT] Deleted ${deletedResponses.count} subsequent responses for module ${resolvedModuleId}, scale "${editedScale}"`
        );

        // Reset this scale's CAT session — other scales of the same module (already
        // complete or in progress) are left untouched — then immediately rebuild it
        // by replaying every response up to and including this edit (in served
        // order), so the very next next-question call continues from the correct
        // adaptive state instead of a fresh, context-less session. Without this
        // rebuild, re-entering the scale would silently restart it from item 1,
        // ignoring every answer that came before the edit too.
        await prisma.cat_module_sessions.deleteMany({
          where: {
            assignment_id: assignment.id,
            module_id: resolvedModuleId,
            scale: editedScale,
          },
        });

        try {
          const scales = await getScalesForModule(resolvedModuleId);
          const scaleInfo = scales.find((s) => s.scale === editedScale);
          if (scaleInfo) {
            const responsesUpToEdit = await prisma.responses.findMany({
              where: {
                assignment_id: assignment.id,
                created_at: { lte: existingResponse!.created_at ?? undefined },
                question: {
                  question_kind: 'cat',
                  cat_item_bank_id: resolvedCatItemBankId,
                  question_code: { in: scaleItemCodes },
                },
              },
              include: {
                question: { select: { question_code: true } },
                answer_option: { select: { value: true } },
              },
              orderBy: { created_at: 'asc' },
            });
            // A skip marker has no numeric value to feed the CAT engine and is
            // dropped from the replay — same simplification already used by
            // getPrevCatQuestion and the 401/404 session-recreate path, since the
            // engine has no concept of "skipped".
            const replayList = responsesUpToEdit
              .filter((r) => r.answer_option?.value !== undefined)
              .map((r) => ({ itemKey: r.question.question_code, response: r.answer_option!.value }));

            if (replayList.length > 0) {
              const rebuiltSession = await catService.recreateSession(scaleInfo.settingKey, replayList);
              await prisma.cat_module_sessions.create({
                data: {
                  assignment_id: assignment.id,
                  module_id: resolvedModuleId,
                  scale: editedScale,
                  cat_setting_id: scaleInfo.catSettingId,
                  session_token: rebuiltSession.token,
                  session_data: rebuiltSession as any,
                  current_dimension_index: rebuiltSession.progress.currentDimensionIndex,
                  is_completed: false,
                },
              });
              console.log(
                `[CAT] Rebuilt session for module ${resolvedModuleId}, scale "${editedScale}" with ${replayList.length} replayed responses`
              );
            }
            // If replayList is empty (the edit itself was left as a skip, and
            // nothing with a real value precedes it), leave the session deleted —
            // the next next-question call will start a fresh one, which is
            // correct since there's no real prior answer to seed it with.
          }
        } catch (error) {
          console.error(
            `[CAT] Failed to rebuild session for module ${resolvedModuleId}, scale "${editedScale}":`,
            error
          );
          // Best-effort — the session stays deleted; next-question will just
          // start fresh next time this scale is needed, rather than failing
          // this save.
        }

        // The rebuild above already replays this edit's own value into the new
        // session (when one was created) — never also queue it for the
        // setResponse loop below, which would double-apply it to a session that
        // no longer expects it.
      } else if (
        resolvedModuleId != null &&
        editedScaleIsAdaptive &&
        editedScale &&
        savedResponse.answer_option?.value !== undefined
      ) {
        // Fresh (non-edit) adaptive answer — advance the live session normally.
        catResponsesProcessed.push({
          module_id: resolvedModuleId,
          scale: editedScale,
          question_id,
          response_value: savedResponse.answer_option.value,
          was_update: wasUpdate,
        });
      }
    }

    // Update CAT sessions with new responses
    for (const catResp of catResponsesProcessed) {
      try {
        const catSession = await prisma.cat_module_sessions.findUnique({
          where: {
            assignment_id_module_id_scale: {
              assignment_id: assignment.id,
              module_id: catResp.module_id,
              scale: catResp.scale,
            },
          },
        });

        if (catSession) {
          const session = catSession.session_data as unknown as CatSession;

          // Update CAT service with response
          const updatedSession = await catService.setResponse(session, catResp.response_value);

          // Save updated session
          await prisma.cat_module_sessions.update({
            where: { id: catSession.id },
            data: {
              session_data: updatedSession as any,
              current_dimension_index: updatedSession.progress.currentDimensionIndex,
            },
          });

          console.log(
            `[CAT] Updated CAT session for module ${catResp.module_id}, response: ${catResp.response_value}`
          );
        }
      } catch (error) {
        console.error(`[CAT] Failed to update CAT session for module ${catResp.module_id}:`, error);
        // Don't fail the whole request if CAT update fails
      }
    }

    return res.json({
      message: 'Responses saved successfully',
      saved_count: savedResponses.length,
      assignment_id: assignment.id,
      cat_updates: catResponsesProcessed.length,
    });
  } catch (error: any) {
    if (error instanceof ServiceError) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    if (error.message && error.message.includes('required')) {
      return res.status(400).json({
        error: 'Validation error',
        message: error.message,
      });
    }

    return next(error);
  }
}

/**
 * POST /euonqol-api/public/link/:link/complete
 * Mark questionnaire as completed
 * Closes the session and updates completion status
 */
export async function completeQuestionnaire(req: Request, res: Response, next: NextFunction) {
  try {
    const { link } = req.params;
    const linkStr = Array.isArray(link) ? link[0] : link;
    const { assignment_id } = req.body;

    if (!assignment_id) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'assignment_id is required',
      });
    }

    // Verify assignment exists and link matches
    const assignment = await prisma.survey_questionnaire_patients_assignment.findFirst({
      where: {
        id: assignment_id,
        OR: [
          { link: linkStr },
          {
            survey_questionnaire: {
              public_link: linkStr,
            },
          },
        ],
      },
      include: {
        responses: {
          select: {
            id: true,
          },
        },
        survey_questionnaire: {
          include: {
            survey: {
              include: {
                ctt_norms_version: {
                  select: { id: true, name: true, norms: true },
                },
              },
            },
            questionnaire: {
              include: {
                ctt_norms_version: {
                  select: { id: true, name: true, norms: true },
                },
                questionnaires_modules: {
                  where: {
                    is_active: true,
                  },
                  include: {
                    module: {
                      include: {
                        cat_item_bank: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!assignment) {
      return res.status(404).json({
        error: 'Assignment not found',
        message: 'Invalid assignment_id or link',
      });
    }

    if (assignment.completion_status === 'completed') {
      return res.status(400).json({
        error: 'Already completed',
        message: 'This questionnaire has already been marked as completed',
      });
    }

    // Get all modules for this questionnaire
    const modules = assignment.survey_questionnaire.questionnaire.questionnaires_modules;

    // Verify every scale of every dynamic module is completed — a dynamic module can
    // drive multiple scales, each with its own cat_module_sessions row.
    const catModules = modules.filter((qm) => qm.module.type === 'dynamic');

    for (const qm of catModules) {
      const pendingScale = await getNextPendingScaleSession(qm.module.id, assignment.id);
      if (pendingScale) {
        return res.status(400).json({
          error: 'Incomplete CAT module',
          message: `CAT module "${qm.module.name}" is not yet completed (scale "${pendingScale.scale}" pending)`,
          module_id: qm.module.id,
        });
      }
    }

    // Resolve CTT norms: questionnaire-level first, fall back to survey-level, then static file
    const questionnairNormsVersion = (assignment.survey_questionnaire as any).questionnaire
      ?.ctt_norms_version;
    const surveyNormsVersion = (assignment.survey_questionnaire as any).survey?.ctt_norms_version;
    const normsVersion = questionnairNormsVersion ?? surveyNormsVersion;
    const cttNorms = normsVersion?.norms
      ? (normsVersion.norms as CttNormEntry[])
      : undefined; // undefined → orchestrator uses CTT_SCALE_NORMS fallback

    // Calculate scores for all modules
    console.log('[Scoring] Calculating scores for all modules...');
    const scores: Record<string, any> = {};

    for (const qm of modules) {
      const moduleResult = await orchestrateModuleScoring(
        assignment.id,
        qm.module,
        prisma,
        cttNorms
      );
      scores[`module_${qm.module.id}`] = {
        ...moduleResult,
        ctt_norms_version_id: normsVersion?.id ?? null,
        ctt_norms_version_name: normsVersion?.name ?? null,
      };
      console.log(
        `[Scoring] Module ${qm.module.id} scored:`,
        moduleResult.irt_status,
        `CTT scales: ${moduleResult.ctt_scales.length}`
      );
    }

    // Update assignment to completed with scores
    const updated = await prisma.survey_questionnaire_patients_assignment.update({
      where: { id: assignment.id },
      data: {
        completion_status: 'completed',
        completed_at: new Date(),
        scores: scores as any,
      },
    });

    // anonymous_on_invitation: once submitted, staff must no longer be able to trace the
    // identity behind these specific responses. The assignment row itself (completion_status/
    // completed_at/patient_id FK) is left untouched — it still shows up in the survey's
    // Assignments tab — but the linked `patients` row is scrubbed exactly like an
    // anonymous_spontaneous patient, and moves into the "Anonymous Submissions" tab on the
    // Participants page (is_anonymous: true).
    const accessMode = (assignment.survey_questionnaire as any).survey?.access_mode;
    if (accessMode === 'anonymous_on_invitation') {
      await AssignmentService.anonymizePatientIfEligible(prisma, assignment.patient_id, [assignment.id]);
    }

    // Close all open sessions for this assignment
    await prisma.patient_sessions.updateMany({
      where: {
        survey_assignment_id: assignment.id,
        end_time: null,
      },
      data: {
        end_time: new Date(),
      },
    });

    // Auto-close the questionnaire (surveys_questionnaires.is_active + questionnaires.status)
    // if max_completions is reached, and propagate to the survey if that closure leaves
    // every linked questionnaire COMPLETED.
    const sqWithLimit = await prisma.surveys_questionnaires.findFirst({
      where: { id: assignment.survey_questionnaire_id },
      select: {
        id: true,
        is_active: true,
        questionnaire: { select: { id: true, status: true, max_completions: true } },
        survey: { select: { id: true } },
      },
    });

    if (
      sqWithLimit?.questionnaire?.max_completions &&
      sqWithLimit.is_active &&
      sqWithLimit.questionnaire.status !== 'completed'
    ) {
      // Assignments closed by a submitted screening outcome (failed eligibility / refused
      // consent) are 'completed' too but carry no answers: they don't use up a completion.
      const completedCount = await prisma.survey_questionnaire_patients_assignment.count({
        where: {
          survey_questionnaire_id: sqWithLimit.id,
          completion_status: 'completed',
          AND: [
            { OR: [{ eligibility_status: null }, { eligibility_status: { not: 'disqualified' } }] },
            { OR: [{ study_info_status: null }, { study_info_status: { not: 'declined' } }] },
          ],
        },
      });
      if (completedCount >= sqWithLimit.questionnaire.max_completions) {
        await prisma.$transaction([
          prisma.surveys_questionnaires.update({
            where: { id: sqWithLimit.id },
            data: { is_active: false },
          }),
          prisma.questionnaires.update({
            where: { id: sqWithLimit.questionnaire.id },
            data: { status: 'completed' },
          }),
        ]);
        console.log(
          `[AutoClose] surveys_questionnaires ${sqWithLimit.id} (questionnaire ${sqWithLimit.questionnaire.id}) auto-closed: reached max_completions (${sqWithLimit.questionnaire.max_completions})`
        );
        // This questionnaire alone just closed for good — anonymize any patient whose
        // assignment here never completed (pending/in_progress), even if the survey
        // itself stays public because other questionnaires are still open.
        await AssignmentService.anonymizePendingForClosedBatch(prisma, [sqWithLimit.id]);
        await SurveyService.autoCompleteIfEligible(prisma, sqWithLimit.survey.id);
      }
    }

    return res.json({
      message: 'Questionnaire completed successfully',
      assignment_id: updated.id,
      completion_status: updated.completion_status,
      completed_at: updated.completed_at,
      response_count: assignment.responses.length,
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * GET /euonqol-api/public/link/:link/progress
 * Get current progress of questionnaire completion
 */
export async function getProgress(req: Request, res: Response, next: NextFunction) {
  try {
    const { link } = req.params;
    const linkStr = Array.isArray(link) ? link[0] : link;
    const { assignment_id } = req.query;

    if (!assignment_id) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'assignment_id query parameter is required',
      });
    }

    const assignmentIdNum = parseInt(assignment_id as string, 10);

    // Get assignment with responses
    const assignment = await prisma.survey_questionnaire_patients_assignment.findFirst({
      where: {
        id: assignmentIdNum,
        OR: [
          { link: linkStr },
          {
            survey_questionnaire: {
              public_link: linkStr,
            },
          },
        ],
      },
      include: {
        survey_questionnaire: {
          include: {
            questionnaire: {
              select: {
                id: true,
                title: true,
                _count: {
                  select: {
                    questionnaires_modules: true,
                  },
                },
              },
            },
          },
        },
        responses: {
          select: {
            question_id: true,
          },
          distinct: ['question_id'],
        },
      },
    });

    if (!assignment) {
      return res.status(404).json({
        error: 'Assignment not found',
        message: 'Invalid assignment_id or link',
      });
    }

    // Count total questions in questionnaire
    const totalQuestions = await prisma.modules_questions.count({
      where: {
        module: {
          questionnaires_modules: {
            some: {
              questionnaire_id: assignment.survey_questionnaire.questionnaire.id,
            },
          },
        },
      },
    });

    const answeredQuestions = assignment.responses.length;
    const progress = totalQuestions > 0 ? (answeredQuestions / totalQuestions) * 100 : 0;

    return res.json({
      assignment_id: assignment.id,
      questionnaire_title: assignment.survey_questionnaire.questionnaire.title,
      total_questions: totalQuestions,
      answered_questions: answeredQuestions,
      progress_percentage: Math.round(progress * 100) / 100,
      completion_status: assignment.completion_status,
      is_completed: assignment.completion_status === 'completed',
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * GET /euonqol-api/public/link/:link/languages
 * Get available languages for the questionnaire associated with the link.
 * Languages are derived from the question content available in the kit versions used by the modules
 * (union across static, cat and socio-demo questions).
 */
export async function getAvailableLanguages(req: Request, res: Response, next: NextFunction) {
  try {
    const { link } = req.params;
    const linkStr = Array.isArray(link) ? link[0] : link;

    // Find the questionnaire ID from either a private assignment or a public link
    let questionnaireId: number | null = null;

    const privateAssignment = await prisma.survey_questionnaire_patients_assignment.findUnique({
      where: { link: linkStr },
      select: {
        survey_questionnaire: {
          select: {
            questionnaire_id: true,
          },
        },
      },
    });

    if (privateAssignment) {
      questionnaireId = privateAssignment.survey_questionnaire.questionnaire_id;
    } else {
      const publicQuestionnaire = await prisma.surveys_questionnaires.findUnique({
        where: { public_link: linkStr },
        select: { questionnaire_id: true },
      });
      if (publicQuestionnaire) {
        questionnaireId = publicQuestionnaire.questionnaire_id;
      }
    }

    if (!questionnaireId) {
      return res.status(404).json({ error: 'Link not found' });
    }

    const languages = await LanguageService.getAvailableForQuestionnaire(questionnaireId);
    return res.json(languages);
  } catch (error) {
    return next(error);
  }
}

/**
 * GET /euonqol-api/public/link/:link/privacy-policy?language_id=X
 * Get the privacy policy applicable to a questionnaire link.
 * Resolves to the policy matching the patient type + requested language,
 * with fallback to English (language_id = DEFAULT_LANGUAGE_ID).
 */
export async function getPublicPrivacyPolicy(req: Request, res: Response, next: NextFunction) {
  try {
    const { link } = req.params;
    const linkStr = Array.isArray(link) ? link[0] : link;
    const requestedLanguageId = req.query.language_id
      ? parseInt(req.query.language_id as string, 10)
      : DEFAULT_LANGUAGE_ID;

    // Resolve link to survey_id + access_mode
    let surveyId: number | null = null;
    let patientType = 'anonymous_spontaneous';

    const privateAssignment = await prisma.survey_questionnaire_patients_assignment.findFirst({
      where: { link: linkStr },
      select: {
        access_mode: true,
        survey_questionnaire: { select: { survey_id: true } },
      },
    });

    if (privateAssignment) {
      surveyId = privateAssignment.survey_questionnaire.survey_id;
      patientType = privateAssignment.access_mode ?? 'traced';
    } else {
      const publicQuestionnaire = await prisma.surveys_questionnaires.findUnique({
        where: { public_link: linkStr },
        select: { survey_id: true },
      });
      if (publicQuestionnaire) {
        surveyId = publicQuestionnaire.survey_id;
        patientType = 'anonymous_spontaneous';
      }
    }

    if (!surveyId) {
      return res.status(404).json({ error: 'Link not found' });
    }

    // Step 1: exact match — patient_type + requested language
    // Step 2: survey-level fallback policy (is_fallback = true)
    const exactMatch = await prisma.survey_privacy_policies.findFirst({
      where: {
        survey_id: surveyId,
        privacy_policy: {
          patient_type: patientType,
          language_id: requestedLanguageId,
          is_active: true,
        },
      },
      include: {
        privacy_policy: {
          select: { id: true, title: true, content: true, language_id: true, pdf_url: true, pdf_filename: true },
        },
      },
    });

    const link_record =
      exactMatch ??
      (await prisma.survey_privacy_policies.findFirst({
        where: {
          survey_id: surveyId,
          is_fallback: true,
          privacy_policy: { is_active: true },
        },
        include: {
          privacy_policy: {
            select: { id: true, title: true, content: true, language_id: true, pdf_url: true, pdf_filename: true },
          },
        },
      }));

    if (!link_record) {
      return res.json({ has_policy: false });
    }

    return res.json({
      has_policy: true,
      policy: {
        id: link_record.privacy_policy.id,
        title: link_record.privacy_policy.title,
        content: link_record.privacy_policy.content,
        pdf_url: link_record.privacy_policy.pdf_url ?? null,
        pdf_filename: link_record.privacy_policy.pdf_filename ?? null,
      },
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * POST /euonqol-api/public/link/:link/eligibility-disqualify
 * Record that a patient failed the eligibility screening on a private link.
 * Only applies to traced/anonymous_on_invitation assignments (not anonymous_spontaneous/anonymous).
 * Body: { disqualification_message?: string }
 */
export async function recordEligibilityDisqualification(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { link } = req.params;
    const linkStr = Array.isArray(link) ? link[0] : link;
    const { disqualification_message } = req.body;

    const assignment = await prisma.survey_questionnaire_patients_assignment.findUnique({
      where: { link: linkStr },
      select: { id: true, access_mode: true },
    });

    if (!assignment) {
      return res.status(404).json({ error: 'Link not found' });
    }

    // Only persist disqualification for non-anonymous_spontaneous (private) links
    if (
      assignment.access_mode === 'anonymous_spontaneous' ||
      assignment.access_mode === 'anonymous'
    ) {
      return res.json({ ok: true, persisted: false });
    }

    await prisma.survey_questionnaire_patients_assignment.update({
      where: { id: assignment.id },
      data: {
        eligibility_status: 'disqualified',
        eligibility_disqualification_msg: disqualification_message ?? null,
      },
    });

    return res.json({ ok: true, persisted: true });
  } catch (error) {
    return next(error);
  }
}

/**
 * POST /euonqol-api/public/link/:link/study-info-reject
 * Record that a patient declined the study info sheet on a private link.
 * Only applies to traced/anonymous_on_invitation assignments (not anonymous_spontaneous/anonymous).
 * Body: { rejection_message?: string }
 */
export async function recordStudyInfoRejection(req: Request, res: Response, next: NextFunction) {
  try {
    const { link } = req.params;
    const linkStr = Array.isArray(link) ? link[0] : link;
    const { rejection_message } = req.body;

    const assignment = await prisma.survey_questionnaire_patients_assignment.findUnique({
      where: { link: linkStr },
      select: { id: true, access_mode: true },
    });

    if (!assignment) {
      return res.status(404).json({ error: 'Link not found' });
    }

    // Only persist rejection for non-anonymous_spontaneous (private) links
    if (
      assignment.access_mode === 'anonymous_spontaneous' ||
      assignment.access_mode === 'anonymous'
    ) {
      return res.json({ ok: true, persisted: false });
    }

    await prisma.survey_questionnaire_patients_assignment.update({
      where: { id: assignment.id },
      data: {
        study_info_status: 'declined',
        study_info_rejection_msg: rejection_message ?? null,
      },
    });

    return res.json({ ok: true, persisted: true });
  } catch (error) {
    return next(error);
  }
}

/**
 * POST /euonqol-api/public/link/:link/screening-submit
 * The patient confirmed (Submit) a failed eligibility screening or a refused Info & Consent
 * on a private link: the questionnaire can no longer be resumed, so the assignment is marked
 * completed (completed_at = now), like a submitted questionnaire.
 * Only applies to traced/anonymous_on_invitation assignments (not anonymous_spontaneous/anonymous).
 * Body: { kind: 'eligibility' | 'study-info', message?: string }
 */
export async function submitScreeningOutcome(req: Request, res: Response, next: NextFunction) {
  try {
    const { link } = req.params;
    const linkStr = Array.isArray(link) ? link[0] : link;
    const { kind, message } = req.body ?? {};

    if (kind !== 'eligibility' && kind !== 'study-info') {
      return res.status(400).json({
        success: false,
        message: "kind must be 'eligibility' or 'study-info'",
      });
    }

    const result = await PublicScreeningService.submit(
      linkStr,
      kind,
      typeof message === 'string' ? message : null
    );
    if (!result) return res.status(404).json({ error: 'Link not found' });
    return res.json({ ok: true, ...result });
  } catch (error) {
    return next(error);
  }
}

/**
 * POST /euonqol-api/public/link/:link/eligibility-reset
 * Clear a persisted eligibility disqualification (patient went back and corrected the answer).
 */
export async function resetEligibilityDisqualification(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { link } = req.params;
    const linkStr = Array.isArray(link) ? link[0] : link;
    const result = await PublicScreeningService.resetEligibility(linkStr);
    if (!result) return res.status(404).json({ error: 'Link not found' });
    return res.json({ ok: true, ...result });
  } catch (error) {
    return next(error);
  }
}

/**
 * POST /euonqol-api/public/link/:link/study-info-reset
 * Clear a persisted study info rejection (patient went back and gave consent).
 */
export async function resetStudyInfoRejection(req: Request, res: Response, next: NextFunction) {
  try {
    const { link } = req.params;
    const linkStr = Array.isArray(link) ? link[0] : link;
    const result = await PublicScreeningService.resetStudyInfo(linkStr);
    if (!result) return res.status(404).json({ error: 'Link not found' });
    return res.json({ ok: true, ...result });
  } catch (error) {
    return next(error);
  }
}

/**
 * GET /euonqol-api/public/link/:link/presentation?language_id=X
 * Return the current presentation content for a link + language (no auth).
 * Falls back to the version marked is_fallback=true if no exact language match.
 */
export async function getPublicPresentation(req: Request, res: Response, next: NextFunction) {
  try {
    const { link } = req.params;
    const linkStr = Array.isArray(link) ? link[0] : link;
    const languageId = parseInt(req.query.language_id as string, 10);
    if (isNaN(languageId)) return res.status(400).json({ error: 'language_id is required' });

    // Resolve link to survey_id
    let surveyId: number | null = null;
    const privateAssignment = await prisma.survey_questionnaire_patients_assignment.findFirst({
      where: { link: linkStr },
      select: { survey_questionnaire: { select: { survey_id: true } } },
    });
    if (privateAssignment) {
      surveyId = privateAssignment.survey_questionnaire.survey_id;
    } else {
      const pub = await prisma.surveys_questionnaires.findUnique({
        where: { public_link: linkStr },
        select: { survey_id: true },
      });
      if (pub) surveyId = pub.survey_id;
    }

    if (!surveyId) return res.status(404).json({ error: 'Link not found' });

    // Try exact language match first, then fall back to the version marked is_fallback=true
    const presentation =
      (await prisma.survey_presentations.findFirst({
        where: { survey_id: surveyId, language_id: languageId, is_current: true },
        select: {
          id: true,
          title: true,
          content: true,
          pdf_url: true,
          pdf_filename: true,
          language_id: true,
          version: true,
          is_fallback: true,
        },
      })) ??
      (await prisma.survey_presentations.findFirst({
        where: { survey_id: surveyId, is_current: true, is_fallback: true },
        select: {
          id: true,
          title: true,
          content: true,
          pdf_url: true,
          pdf_filename: true,
          language_id: true,
          version: true,
          is_fallback: true,
        },
      }));

    if (!presentation) return res.json({ has_presentation: false });

    return res.json({ has_presentation: true, presentation });
  } catch (error) {
    return next(error);
  }
}

/**
 * GET /euonqol-api/public/link/:link/closing-message?language_id=X
 * Return the current closing messages (end of questionnaire, link already used,
 * survey closed, resume) for a link + language (no auth). Each field falls back to
 * the version marked is_fallback=true when the exact language has none.
 */
export async function getPublicClosingMessage(req: Request, res: Response, next: NextFunction) {
  try {
    const { link } = req.params;
    const linkStr = Array.isArray(link) ? link[0] : link;
    const languageId = parseInt(req.query.language_id as string, 10);
    if (isNaN(languageId)) return res.status(400).json({ error: 'language_id is required' });

    const closingMessage = await SurveyClosingMessageService.getPublicMessages(linkStr, languageId);
    if (!closingMessage) return res.json({ has_closing_message: false });

    return res.json({
      has_closing_message: true,
      closing_message: PublicSurveyClosingMessageResource.make(closingMessage),
    });
  } catch (error) {
    if (error instanceof ServiceError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    return next(error);
  }
}

/**
 * GET /euonqol-api/public/link/:link/study-info-sheet?language_id=X
 * Return the current study info sheet content for a link + language (no auth).
 * Falls back to the version marked is_fallback=true if no exact language match.
 */
export async function getPublicStudyInfoSheet(req: Request, res: Response, next: NextFunction) {
  try {
    const { link } = req.params;
    const linkStr = Array.isArray(link) ? link[0] : link;
    const languageId = parseInt(req.query.language_id as string, 10);
    if (isNaN(languageId)) return res.status(400).json({ error: 'language_id is required' });

    // Resolve link to survey_id
    let surveyId: number | null = null;
    const privateAssignment = await prisma.survey_questionnaire_patients_assignment.findFirst({
      where: { link: linkStr },
      select: { survey_questionnaire: { select: { survey_id: true } } },
    });
    if (privateAssignment) {
      surveyId = privateAssignment.survey_questionnaire.survey_id;
    } else {
      const pub = await prisma.surveys_questionnaires.findUnique({
        where: { public_link: linkStr },
        select: { survey_id: true },
      });
      if (pub) surveyId = pub.survey_id;
    }

    if (!surveyId) return res.status(404).json({ error: 'Link not found' });

    // Try exact language match first, then fall back to the version marked is_fallback=true
    const studyInfoSheet =
      (await prisma.survey_study_info_sheets.findFirst({
        where: { survey_id: surveyId, language_id: languageId, is_current: true },
        select: {
          id: true,
          title: true,
          content: true,
          rejection_message: true,
          consent_questions: {
            select: { id: true, question_text: true, order_position: true },
            orderBy: [{ order_position: 'asc' }, { id: 'asc' }],
          },
          pdf_url: true,
          pdf_filename: true,
          language_id: true,
          version: true,
          is_fallback: true,
        },
      })) ??
      (await prisma.survey_study_info_sheets.findFirst({
        where: { survey_id: surveyId, is_current: true, is_fallback: true },
        select: {
          id: true,
          title: true,
          content: true,
          rejection_message: true,
          consent_questions: {
            select: { id: true, question_text: true, order_position: true },
            orderBy: [{ order_position: 'asc' }, { id: 'asc' }],
          },
          pdf_url: true,
          pdf_filename: true,
          language_id: true,
          version: true,
          is_fallback: true,
        },
      }));

    if (!studyInfoSheet) return res.json({ has_study_info_sheet: false });

    return res.json({ has_study_info_sheet: true, study_info_sheet: studyInfoSheet });
  } catch (error) {
    return next(error);
  }
}

/**
 * GET /euonqol-api/public/link/:link/eligibility-questions?language_id=X
 * Return active eligibility questions with translations for the requested language (no auth).
 */
export async function getPublicEligibilityQuestions(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { link } = req.params;
    const linkStr = Array.isArray(link) ? link[0] : link;
    const languageId = parseInt(req.query.language_id as string, 10);
    if (isNaN(languageId)) return res.status(400).json({ error: 'language_id is required' });

    // Resolve link to survey_id
    let surveyId: number | null = null;
    const privateAssignment = await prisma.survey_questionnaire_patients_assignment.findFirst({
      where: { link: linkStr },
      select: { survey_questionnaire: { select: { survey_id: true } } },
    });
    if (privateAssignment) {
      surveyId = privateAssignment.survey_questionnaire.survey_id;
    } else {
      const pub = await prisma.surveys_questionnaires.findUnique({
        where: { public_link: linkStr },
        select: { survey_id: true },
      });
      if (pub) surveyId = pub.survey_id;
    }

    if (!surveyId) return res.status(404).json({ error: 'Link not found' });

    const questions = await prisma.survey_eligibility_questions.findMany({
      where: { survey_id: surveyId, is_current: true, is_active: true },
      include: {
        translations: {
          select: {
            question_text: true,
            disqualification_message: true,
            language_id: true,
            is_fallback: true,
          },
        },
      },
      orderBy: { order_position: 'asc' },
    });

    // For each question pick the best translation: exact language > fallback translation
    const result = questions
      .map((q) => {
        const exact = q.translations.find((t) => t.language_id === languageId);
        const fallback = q.translations.find((t) => t.is_fallback);
        const best = exact ?? fallback;
        if (!best) return null;
        return {
          id: q.id,
          expected_answer: q.expected_answer,
          order_position: q.order_position,
          question_text: best.question_text,
          disqualification_message: best.disqualification_message,
          is_fallback_translation: !exact && !!fallback,
        };
      })
      .filter((q): q is NonNullable<typeof q> => q !== null);

    return res.json(result);
  } catch (error) {
    return next(error);
  }
}
