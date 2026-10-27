/**
 * CAT Controller
 * Handles adaptive question selection for CAT (Computer Adaptive Testing) modules.
 *
 * A dynamic module can drive MULTIPLE scales, each backed by its own external CAT
 * engine setting (settingKey) — so a module maintains one cat_module_sessions row
 * per (assignment, module, scale), not a single session per module. The module is
 * considered complete only once every one of its scales has a completed session.
 */

import { NextFunction, Request, Response } from 'express';
import { prisma } from '../config/database.js';
import {
  getCatQuestionDetails,
  getModuleWithCatItemBank,
  getNextPendingScaleSession,
  getScalePreamble,
  getScalesForModule,
  mapCatItemToQuestion,
  ModuleScale,
} from '../services/cat/catHelpers';
import * as catService from '../services/cat/catService';
import { CatSession } from '../services/cat/types';

/**
 * Finds or creates the cat_module_sessions row for a given scale, then advances it to
 * the next item — encapsulates the logic shared by getNextCatQuestion's normal path
 * and its 401/404 recovery path.
 */
async function findOrCreateScaleSession(moduleId: number, assignmentId: number, scale: ModuleScale) {
  let catModuleSession = await prisma.cat_module_sessions.findUnique({
    where: {
      assignment_id_module_id_scale: {
        assignment_id: assignmentId,
        module_id: moduleId,
        scale: scale.scale,
      },
    },
  });

  let catSession: CatSession;

  if (!catModuleSession) {
    console.log(`[CAT] Creating new session for module ${moduleId}, scale: ${scale.scale}, setting: ${scale.settingKey}`);
    catSession = await catService.createSessionByKey(scale.settingKey);
    try {
      catModuleSession = await prisma.cat_module_sessions.create({
        data: {
          assignment_id: assignmentId,
          module_id: moduleId,
          scale: scale.scale,
          cat_setting_id: scale.catSettingId,
          session_token: catSession.token,
          session_data: catSession as any,
          current_dimension_index: catSession.progress.currentDimensionIndex,
          is_completed: false,
        },
      });
    } catch (error: any) {
      // Two concurrent requests (e.g. a resumed questionnaire firing overlapping
      // next-question calls) can both miss the findUnique above and both try to
      // create the row for this (assignment, module, scale). The loser hits the
      // unique constraint instead of a real failure — the winner's row already
      // holds a valid session, so just read it back instead of surfacing a 503.
      // The session we created above (catSession) is simply discarded.
      if (error.code === 'P2002') {
        console.log(`[CAT] Concurrent session creation detected for module ${moduleId}, scale: ${scale.scale} — reusing existing session`);
        catModuleSession = await prisma.cat_module_sessions.findUniqueOrThrow({
          where: {
            assignment_id_module_id_scale: {
              assignment_id: assignmentId,
              module_id: moduleId,
              scale: scale.scale,
            },
          },
        });
        catSession = catModuleSession.session_data as unknown as CatSession;
      } else {
        throw error;
      }
    }
  } else {
    catSession = catModuleSession.session_data as unknown as CatSession;
  }

  return { catModuleSession, catSession };
}

/**
 * POST /euonqol-api/public/link/:link/modules/:moduleId/next-question
 * Get the next adaptive question for a dynamic module — resolves which of the
 * module's scales still needs answers and drives that scale's CAT session.
 */
export async function getNextCatQuestion(req: Request, res: Response, next: NextFunction) {
  try {
    const { link, moduleId } = req.params;
    const linkStr = Array.isArray(link) ? link[0] : link;
    const modId = parseInt(moduleId as string, 10);
    const { assignment_id, language_id = 14 } = req.body;

    if (!assignment_id || isNaN(modId)) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'assignment_id and valid moduleId are required',
      });
    }

    const langId = parseInt(String(language_id), 10);

    // Verify assignment and link match
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
                  where: {
                    is_active: true,
                  },
                  include: {
                    module: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    // Get module details with its CAT item bank
    const module = await getModuleWithCatItemBank(modId);

    if (!module) {
      return res.status(404).json({ error: 'Module not found' });
    }

    if (module.type !== 'dynamic') {
      return res.status(400).json({
        error: 'Invalid module type',
        message: 'This endpoint is only for dynamic (CAT) modules',
      });
    }

    if (!module.cat_item_bank_id) {
      return res.status(400).json({
        error: 'CAT item bank missing',
        message: 'Module does not have a valid CAT item bank configured',
      });
    }

    // Which scale still needs answers? null means every scale is done — module complete.
    let pendingScale;
    try {
      pendingScale = await getNextPendingScaleSession(modId, assignment_id);
    } catch (error: any) {
      console.error('[CAT] Failed to resolve module scales:', error);
      return res.status(400).json({ error: 'CAT configuration error', message: error.message });
    }

    if (!pendingScale) {
      return res.json({ message: 'Module completed', is_complete: true });
    }

    let catModuleSession;
    let catSession: CatSession;

    try {
      const result = await findOrCreateScaleSession(modId, assignment_id, pendingScale);
      catModuleSession = result.catModuleSession;
      catSession = result.catSession;
    } catch (error: any) {
      console.error('[CAT] Failed to create CAT session:', error);
      return res.status(503).json({
        error: 'CAT service unavailable',
        message: 'Unable to connect to CAT service. Please try again later.',
        details: error.message,
      });
    }

    // Get next item from CAT — but first check whether the LAST item this session
    // ever served is still sitting unanswered (no responses row for it at all,
    // not even a skip marker). That happens when the patient enters a scale, sees
    // its item, then leaves without deciding (Prev, or navigating away) and comes
    // back later: getNextItem always advances the external engine to a brand new
    // item regardless of a prior answer, so blindly calling it here would silently
    // treat the still-undecided item as skipped. When this is the case, the item
    // is re-served entirely from our own persisted state below (see the
    // `hasUndecidedItem` branch further down) instead of asking the CAT engine —
    // once the patient actually answers OR skips it (either way a responses row
    // exists), this falls through to getNextItem as before — a real skip marker
    // must still let the scale advance normally.
    const usedItems = catSession.progress?.usedItems ?? [];
    const lastServedItem = usedItems[usedItems.length - 1];
    let hasUndecidedItem = false;
    if (lastServedItem) {
      const existingResponse = await prisma.responses.findFirst({
        where: {
          assignment_id,
          question: {
            question_kind: 'cat',
            cat_item_bank_id: module.cat_item_bank_id,
            question_code: lastServedItem.key,
          },
        },
        select: { id: true },
      });
      hasUndecidedItem = !existingResponse;
    }

    // If the last item this session ever served now HAS a saved answer, AND
    // that answer is what satisfies this scale's own stopping criteria, the
    // scale is genuinely done — mark it now and report completion immediately,
    // without calling the external CAT engine again. This is the ONLY place
    // is_completed is persisted for a naturally-finished scale (see below:
    // scale_is_complete is deliberately NEVER persisted at serve time anymore,
    // only computed for the response). Marking it at serve time — i.e. the
    // moment the item that WOULD complete the scale is served, before the
    // patient has answered it — was the bug: reloading mid-way through that
    // last unanswered item made getNextPendingScaleSession treat the scale as
    // already done and skip straight past it (as if it had been silently
    // skipped), instead of re-serving that exact pending item on resume.
    if (!hasUndecidedItem && !catModuleSession.is_completed && catService.isSessionComplete(catSession)) {
      console.log('[CAT] Last served item is now answered and stopping criteria are met — marking scale complete', {
        scale: pendingScale.scale,
      });
      await prisma.cat_module_sessions.update({
        where: { id: catModuleSession.id },
        data: { is_completed: true },
      });
      const nextPending = await getNextPendingScaleSession(modId, assignment_id);
      return res.json({
        message: 'Scale completed',
        scale: pendingScale.scale,
        scale_is_complete: true,
        is_complete: nextPending === null,
      });
    }

    let nextItemResponse;
    if (hasUndecidedItem && lastServedItem) {
      // Re-serve the exact item the patient left unanswered, entirely from our
      // own persisted state — deliberately WITHOUT calling the external CAT
      // engine's getCurrentItem. A session's OWN stopping criteria are already
      // satisfied the moment its final item is SERVED, before it's ever
      // answered (see isSessionComplete) — so by the time a patient reloads on
      // that still-unanswered last item, the external engine already considers
      // this session exhausted. Calling getCurrentItem on it was observed to
      // sometimes come back with an empty itemKey (silently caught by the
      // block below as "nothing left", skipping the scale on resume exactly
      // as if it had been skipped) and sometimes to error outright ("Error
      // loading the next question"). We already know precisely which item is
      // pending from session_data.progress.usedItems, so resolving it locally
      // sidesteps the engine's behavior for an already-exhausted session
      // entirely — nothing about the session changes here, we're not advancing.
      console.log('[CAT] Re-serving undecided last item locally (bypassing CAT API):', lastServedItem.key);
      nextItemResponse = { itemKey: lastServedItem.key, response: -1, session: catSession };
    } else {
      try {
        nextItemResponse = await catService.getNextItem(catSession);
        catSession = nextItemResponse.session;
      } catch (error: any) {
        console.error('[CAT] Failed to get next item:', error);

        // If session token is invalid, try to recreate from saved responses (scoped to this scale)
        if (error.statusCode === 401 || error.statusCode === 404) {
          console.log('[CAT] Attempting to recreate session from saved responses...');

          console.log('[CAT] Recovery: session usedItems before recreate:', usedItems.map((u) => u.key));
          const savedResponses = await prisma.responses.findMany({
            where: {
              assignment_id,
              question: {
                question_kind: 'cat',
                // Genuinely-adaptive questions (chosen at runtime by the CAT engine)
                // are never linked via modules_questions — scope by the module's own
                // item bank instead. Scoped further by the item CODES this scale's
                // session actually served (usedItems, captured above) rather than
                // question.scale text — item-bank content can use a different
                // naming convention than the ScaleCode pendingScale.scale is (e.g.
                // "Role functioning" vs "RF_S"). Filtering by that text silently
                // matched ZERO rows whenever they differed, discarding every
                // already-answered item on each session-token recovery and
                // restarting the scale from scratch — the exact bug this fixes.
                cat_item_bank_id: module.cat_item_bank_id,
                question_code: { in: usedItems.map((u) => u.key) },
              },
            },
            include: {
              question: {
                select: {
                  question_code: true,
                },
              },
              answer_option: {
                select: {
                  value: true,
                },
              },
            },
            orderBy: {
              created_at: 'asc',
            },
          });

          const catResponses = savedResponses
            .filter((r) => r.answer_option?.value !== undefined)
            .map((r) => ({
              itemKey: r.question.question_code,
              response: r.answer_option!.value,
            }));
          console.log('[CAT] Recovery: replaying', catResponses.length, 'of', savedResponses.length, 'saved responses');

          try {
            catSession = await catService.recreateSession(pendingScale.settingKey, catResponses);

            await prisma.cat_module_sessions.update({
              where: { id: catModuleSession.id },
              data: {
                session_token: catSession.token,
                session_data: catSession as any,
                current_dimension_index: catSession.progress.currentDimensionIndex,
              },
            });

            nextItemResponse = await catService.getNextItem(catSession);
            catSession = nextItemResponse.session;
          } catch (recreateError: any) {
            console.error('[CAT] Failed to recreate session:', recreateError);
            return res.status(503).json({
              error: 'CAT service error',
              message: 'Unable to resume CAT session',
              details: recreateError.message,
            });
          }
        } else {
          return res.status(503).json({
            error: 'CAT service error',
            message: error.message || 'Failed to get next question',
          });
        }
      }
    }

    const itemKey = nextItemResponse.itemKey;

    if (!itemKey) {
      // The CAT engine has nothing more to serve. This happens when a session
      // gets REBUILT by replaying prior responses (e.g. editing an answer in
      // an already-closed scale — saveResponses's rebuild replays everything
      // up to and including the edit) and that replay alone already satisfies
      // the stopping criteria: getNextItem then returns an empty itemKey
      // instead of a genuinely new item, rather than erroring. Persist the
      // session as complete and report it exactly like "nothing pending" —
      // no question to show — instead of failing to map "" to a question.
      console.log(
        '[CAT] getNextItem/getCurrentItem returned an empty itemKey — scale already complete after rebuild',
        { scale: pendingScale.scale, hasUndecidedItem }
      );
      await prisma.cat_module_sessions.update({
        where: { id: catModuleSession.id },
        data: {
          session_data: catSession as any,
          current_dimension_index: catSession.progress.currentDimensionIndex,
          is_completed: true,
        },
      });
      const nextPending = await getNextPendingScaleSession(modId, assignment_id);
      return res.json({
        message: 'Scale completed',
        scale: pendingScale.scale,
        scale_is_complete: true,
        is_complete: nextPending === null,
      });
    }

    // Map CAT itemKey to local question, scoped to the module's CAT item bank
    const question = await mapCatItemToQuestion(itemKey, module.cat_item_bank_id);

    if (!question) {
      console.error(`[CAT] Question not found in database for itemKey: ${itemKey}`);
      return res.status(404).json({
        error: 'Question not found',
        message: `CAT selected question "${itemKey}" but it is not in the local database. Please contact administrator.`,
      });
    }

    // Get full question details with translations
    const questionDetails = await getCatQuestionDetails(question.id, langId);

    if (!questionDetails) {
      return res.status(404).json({
        error: 'Question details not found',
        message: 'Unable to load question details',
      });
    }

    // Fixed preamble for this scale (from cat_item_bank_scale_preambles), shown
    // on every question of the scale, not just the first.
    questionDetails.questionPramble = await getScalePreamble(
      module.cat_item_bank_id,
      pendingScale.scale,
      module.patient_group_id,
      langId
    );

    // Update this scale's session in database with new state
    console.log('[CAT] next-question: usedItems before →', usedItems.map((u) => u.key), 'after →', (catSession.progress?.usedItems ?? []).map((u) => u.key), {
      scale: pendingScale.scale,
      hasUndecidedItem,
      itemKey,
    });
    await prisma.cat_module_sessions.update({
      where: { id: catModuleSession.id },
      data: {
        session_data: catSession as any,
        current_dimension_index: catSession.progress.currentDimensionIndex,
      },
    });

    // Whether the item just served will be this scale's LAST one, PROVIDED the
    // patient goes on to answer it — informational for the frontend only.
    // Deliberately NOT persisted as is_completed here: the item hasn't been
    // answered yet, so marking the scale done now would make a reload before
    // answering it skip straight past the scale instead of re-serving this
    // exact item (see the pre-check above, which is where completion actually
    // gets persisted, once the answer exists).
    const scaleIsComplete = catService.isSessionComplete(catSession);
    const isModuleComplete = false;

    return res.json({
      question: questionDetails,
      session_id: catModuleSession.id,
      item_key: itemKey,
      scale: pendingScale.scale,
      // Whether THIS scale just served its last item (regardless of other scales) —
      // the frontend needs this to know when to hand control back to the fixed
      // question flow at the right point, instead of only at module-completion.
      scale_is_complete: scaleIsComplete,
      is_complete: isModuleComplete,
      progress: {
        current_dimension_index: catSession.progress.currentDimensionIndex,
        dimensions: catSession.progress.dimensions.map((d) => ({
          name: d.name,
          // Other dimensions can still be null (not yet touched) for a
          // multi-dimensional scale even after this scale's serve — only the
          // dimension the just-served item belongs to is guaranteed populated.
          items_used: (d.usedItemKeys ?? []).length,
        })),
      },
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * GET /euonqol-api/public/link/:link/modules/:moduleId/status
 * Get CAT module completion status and per-scale progress.
 */
export async function getCatModuleStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const { moduleId } = req.params;
    const { assignment_id } = req.query;

    if (!assignment_id) {
      return res.status(400).json({ error: 'assignment_id is required' });
    }

    const modId = parseInt(moduleId as string, 10);
    const assignId = parseInt(assignment_id as string, 10);

    let scales;
    try {
      scales = await getScalesForModule(modId);
    } catch (error: any) {
      return res.status(400).json({ error: 'CAT configuration error', message: error.message });
    }

    if (scales.length === 0) {
      return res.json({ is_complete: false, has_started: false, can_request_next: true, scales: [] });
    }

    const sessions = await prisma.cat_module_sessions.findMany({
      where: { assignment_id: assignId, module_id: modId },
    });
    const sessionByScale = new Map(sessions.map((s) => [s.scale, s]));

    const scaleStatuses = scales.map((s) => {
      const session = sessionByScale.get(s.scale);
      const sessionData = session?.session_data as unknown as CatSession | undefined;
      return {
        scale: s.scale,
        is_completed: session?.is_completed ?? false,
        has_started: !!session,
        dimensions:
          sessionData?.progress.dimensions.map((d) => ({
            name: d.name,
            items_used: (d.usedItemKeys ?? []).length,
            information: d.information,
          })) ?? [],
      };
    });

    const isComplete = scaleStatuses.every((s) => s.is_completed);
    const hasStarted = scaleStatuses.some((s) => s.has_started);

    return res.json({
      is_complete: isComplete,
      has_started: hasStarted,
      can_request_next: !isComplete,
      scales: scaleStatuses,
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * POST /euonqol-api/public/link/:link/modules/:moduleId/prev-question
 * Go back to the previous CAT question WITHIN THE CURRENT SCALE:
 * - Determines the "current" scale from the most recently answered CAT question
 * - Returns the last answered question with its saved answer
 * - Removes that response from the DB
 * - Rebuilds that scale's CAT session from its remaining responses
 *
 * v1 limitation: if this empties the current scale's answered responses, this does
 * NOT cross back into a previous, already-completed scale — can_go_back is false.
 */
export async function getPrevCatQuestion(req: Request, res: Response, next: NextFunction) {
  try {
    const { link, moduleId } = req.params;
    const linkStr = Array.isArray(link) ? link[0] : link;
    const modId = parseInt(moduleId as string, 10);
    const { assignment_id, language_id = 14, scale: requestedScale } = req.body;

    if (!assignment_id || isNaN(modId)) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'assignment_id and valid moduleId are required',
      });
    }

    const langId = parseInt(String(language_id), 10);

    // Verify assignment and link match
    const assignment = await prisma.survey_questionnaire_patients_assignment.findFirst({
      where: {
        id: assignment_id,
        OR: [{ link: linkStr }, { survey_questionnaire: { public_link: linkStr } }],
      },
    });

    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    // Get module details with its CAT item bank
    const module = await getModuleWithCatItemBank(modId);

    if (!module || module.type !== 'dynamic') {
      return res.status(400).json({ error: 'Invalid or missing CAT module' });
    }

    if (!module.cat_item_bank_id) {
      return res.status(400).json({ error: 'Module does not have a valid CAT item bank configured' });
    }

    // Resolve which scale/session this Prev press applies to. Prefer the scale
    // the frontend explicitly says it's viewing (it always knows — activeScale)
    // over guessing from "whichever CAT response was most recently saved across
    // the WHOLE item bank": that guess breaks once scales can be revisited and
    // edited out of strict chronological order (browsing back into an
    // already-closed scale and editing an old answer in it, for instance) — an
    // edit's timestamp can outrank a genuinely more recent answer in a
    // different scale, or land on an item whose session was just rebuilt and no
    // longer matches the naive "search every session for this itemKey" guess.
    let currentScale: string;
    let sessionData: unknown;
    if (requestedScale) {
      const session = await prisma.cat_module_sessions.findUnique({
        where: {
          assignment_id_module_id_scale: { assignment_id, module_id: modId, scale: requestedScale },
        },
        select: { session_data: true },
      });
      if (!session) {
        return res.status(400).json({
          error: `No CAT session found for scale "${requestedScale}"`,
          can_go_back: false,
        });
      }
      currentScale = requestedScale;
      sessionData = session.session_data;
    } else {
      // Legacy fallback for callers that don't send a scale — query responses
      // directly, scoped to THIS module's CAT item bank (genuinely-adaptive
      // questions are never linked via modules_questions, so cat_item_bank_id
      // is the only reliable scope), ordered by created_at ASC.
      const answeredResponses = await prisma.responses.findMany({
        where: {
          assignment_id,
          question: { question_kind: 'cat', cat_item_bank_id: module.cat_item_bank_id },
        },
        include: {
          question: { select: { question_code: true } },
        },
        orderBy: { created_at: 'asc' },
      });
      if (answeredResponses.length === 0) {
        return res
          .status(400)
          .json({ error: 'No previous question to go back to', can_go_back: false });
      }
      const lastResponse = answeredResponses[answeredResponses.length - 1];
      const candidateSessions = await prisma.cat_module_sessions.findMany({
        where: { assignment_id, module_id: modId },
        select: { scale: true, session_data: true },
      });
      const found = candidateSessions.find((s) => {
        const usedItems = (s.session_data as any)?.progress?.usedItems ?? [];
        return usedItems.some((u: any) => u.key === lastResponse.question.question_code);
      });
      if (!found) {
        return res.status(400).json({
          error: 'Could not resolve the CAT session for the last answered question',
          can_go_back: false,
        });
      }
      currentScale = found.scale;
      sessionData = found.session_data;
    }

    const sessionItemCodes = new Set<string>(
      ((sessionData as any)?.progress?.usedItems ?? []).map((u: any) => u.key)
    );

    console.log('[CAT Prev] scale:', currentScale, 'served items:', sessionItemCodes.size);

    // This scale's own answered responses, in served order.
    const scaleResponses = await prisma.responses.findMany({
      where: {
        assignment_id,
        question: {
          question_kind: 'cat',
          cat_item_bank_id: module.cat_item_bank_id,
          question_code: { in: [...sessionItemCodes] },
        },
      },
      include: {
        question: { select: { id: true, question_code: true } },
        answer_option: { select: { value: true } },
      },
      orderBy: { created_at: 'asc' },
    });

    if (scaleResponses.length === 0) {
      return res
        .status(400)
        .json({ error: 'No previous question to go back to', can_go_back: false });
    }

    const lastResponse = scaleResponses[scaleResponses.length - 1];
    const remainingResponses = scaleResponses.slice(0, -1);

    // Resolve this scale's settingKey
    const scales = await getScalesForModule(modId);
    const scaleInfo = scales.find((s) => s.scale === currentScale);
    if (!scaleInfo) {
      return res.status(400).json({ error: `Scale "${currentScale}" has no CAT setting mapping` });
    }

    // Load the CAT session for this scale for session reconstruction later
    const catModuleSession = await prisma.cat_module_sessions.findUnique({
      where: {
        assignment_id_module_id_scale: {
          assignment_id,
          module_id: modId,
          scale: currentScale,
        },
      },
    });

    if (!catModuleSession) {
      return res.status(400).json({ error: 'No CAT session found', can_go_back: false });
    }

    // Delete that response from DB
    await prisma.responses.deleteMany({
      where: {
        assignment_id,
        question_id: lastResponse.question.id,
      },
    });

    // Rebuild CAT session from remaining responses of this scale. Branch on
    // whether there's anything the CAT engine can actually REPLAY, not just
    // whether `remainingResponses` is non-empty — a skip marker has no
    // answer_option value to replay, so if every remaining response is a
    // skip, recreateSession would be called with an empty list and silently
    // produce a session indistinguishable from a truly fresh one anyway.
    // Taking the "recreate" branch in that case previously left those skip
    // responses orphaned in the DB (not deleted, since they're not
    // `lastResponse` — but also not represented in the new session's
    // usedItems, since nothing was replayed), which broke this endpoint's own
    // later lookups (this scale's own responses no longer resolve to any
    // current session's usedItems, so "no previous question to go back to").
    const replayList = remainingResponses
      .filter((r) => r.answer_option?.value !== undefined)
      .map((r) => ({
        itemKey: r.question.question_code,
        response: r.answer_option!.value,
      }));

    let newSession: CatSession;
    // True when nothing was replayable — the new session starts with NO
    // memory of lastResponse.question at all, so whatever it serves next
    // won't necessarily be that same item (unlike the replay case, where
    // replaying the exact same prior answers deterministically leads the
    // engine back to the exact same next item). Showing lastResponse.question
    // here would be misleading — any answer the patient then gives would be
    // recorded (in the external CAT engine) against whatever DIFFERENT item
    // the fresh session actually served, not the one on screen.
    let freshStart = false;

    if (replayList.length > 0) {
      console.log('[CAT Prev] Recreating session with', replayList.length, 'responses');
      newSession = await catService.recreateSession(scaleInfo.settingKey, replayList);
    } else {
      freshStart = true;
      if (remainingResponses.length > 0) {
        // All remaining responses were skip markers — nothing to replay, so
        // starting fresh is correct, but clean them up too or they'd be
        // orphaned (still in the DB, no longer reflected in any session).
        console.log(
          '[CAT Prev] Remaining responses are all skips — clearing them and creating a fresh session'
        );
        await prisma.responses.deleteMany({
          where: { assignment_id, question_id: { in: remainingResponses.map((r) => r.question.id) } },
        });
      } else {
        console.log('[CAT Prev] No remaining responses — creating fresh session');
      }
      newSession = await catService.createSessionByKey(scaleInfo.settingKey);
    }

    // Advance the session to serve the next item (the question the user is going back to,
    // when the replay was able to reconstruct that exact state — see freshStart above).
    // This is critical: setResponse (called by saveAnswer on the frontend) expects
    // a current item to be served. Without this call, setResponse has no item to respond to
    // and the subsequent getNextItem in fetchNextCatQuestion returns the wrong question.
    const nextItemResult = await catService.getNextItem(newSession);
    newSession = nextItemResult.session;
    console.log('[CAT Prev] Next item served after rebuild:', nextItemResult.itemKey);

    // Which question to actually show: the historical one being rewound to
    // (the normal case, guaranteed by determinism to match what the rebuilt
    // session just served) — or, when the session had to start fresh, whatever
    // it ACTUALLY served instead, so the screen and the session never disagree
    // about which item an upcoming answer applies to.
    let questionDetails;
    if (freshStart) {
      const freshQuestion = await mapCatItemToQuestion(nextItemResult.itemKey, module.cat_item_bank_id);
      questionDetails = freshQuestion ? await getCatQuestionDetails(freshQuestion.id, langId) : null;
    } else {
      questionDetails = await getCatQuestionDetails(lastResponse.question.id, langId);
    }
    if (!questionDetails) {
      return res.status(404).json({ error: 'Could not load previous question details' });
    }

    questionDetails.questionPramble = await getScalePreamble(
      module.cat_item_bank_id,
      currentScale,
      module.patient_group_id,
      langId
    );

    // Persist the rebuilt session
    await prisma.cat_module_sessions.update({
      where: { id: catModuleSession.id },
      data: {
        session_token: newSession.token,
        session_data: newSession as any,
        current_dimension_index: newSession.progress.currentDimensionIndex,
        is_completed: false,
      },
    });

    return res.json({
      question: questionDetails,
      // Whether there's anything MEANINGFUL left to rewind into further — a
      // skip-only remainder doesn't count, since (as above) the CAT engine
      // can't replay it and it's cleared right along with this decision.
      can_go_back: replayList.length > 0,
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * GET /euonqol-api/public/link/:link/modules/:moduleId/scale/:scale/history
 * Returns every item a scale's CAT session has actually served, in served order,
 * together with the patient's saved answer (or skip marker) for each — a pure DB
 * read, never touches the external CAT API. Used so the patient can browse back
 * into (and, before review, edit) an adaptive scale's already-answered questions
 * whether that scale is still open or has already completed — a closed scale's
 * questions must not simply vanish from navigation.
 */
export async function getCatScaleHistory(req: Request, res: Response, next: NextFunction) {
  try {
    const { moduleId, scale } = req.params;
    const { assignment_id, language_id = 14 } = req.query;
    const modId = parseInt(moduleId as string, 10);
    const assignId = parseInt(assignment_id as string, 10);
    const langId = parseInt(String(language_id), 10);

    if (isNaN(modId) || isNaN(assignId) || !scale) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'moduleId, scale and assignment_id are required',
      });
    }

    const module = await getModuleWithCatItemBank(modId);
    if (!module || module.type !== 'dynamic' || !module.cat_item_bank_id) {
      return res.status(400).json({ error: 'Invalid or missing CAT module' });
    }

    const catModuleSession = await prisma.cat_module_sessions.findUnique({
      where: {
        assignment_id_module_id_scale: {
          assignment_id: assignId,
          module_id: modId,
          scale: scale as string,
        },
      },
      select: { session_data: true },
    });
    const usedItems: Array<{ key: string }> =
      (catModuleSession?.session_data as any)?.progress?.usedItems ?? [];

    // Same preamble for every item of this scale's history — from
    // cat_item_bank_scale_preambles.
    const preambleText = await getScalePreamble(
      module.cat_item_bank_id,
      scale as string,
      module.patient_group_id,
      langId
    );

    const items: Array<{
      question: NonNullable<Awaited<ReturnType<typeof getCatQuestionDetails>>>;
      answer: { answer_option_id: number | null; answer_text: string | null } | null;
    }> = [];

    for (const used of usedItems) {
      const question = await mapCatItemToQuestion(used.key, module.cat_item_bank_id);
      if (!question) continue;
      const questionDetails = await getCatQuestionDetails(question.id, langId);
      if (!questionDetails) continue;
      questionDetails.questionPramble = preambleText;

      const response = await prisma.responses.findUnique({
        where: {
          assignment_id_question_id_language_id: {
            assignment_id: assignId,
            question_id: question.id,
            language_id: langId,
          },
        },
        select: { answer_option_id: true, answer_text: true },
      });

      items.push({
        question: questionDetails,
        answer: response
          ? { answer_option_id: response.answer_option_id, answer_text: response.answer_text }
          : null,
      });
    }

    return res.json({ scale, items });
  } catch (error) {
    return next(error);
  }
}

export default {
  getNextCatQuestion,
  getCatModuleStatus,
  getPrevCatQuestion,
  getCatScaleHistory,
};
