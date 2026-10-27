import axios from 'axios';
import { ChevronDown, ChevronLeft, ChevronRight, Menu, X } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import EUonQoLLogo from '../../assets/EUonQoL_logo.webp';
import { LoadingStatus } from '@/components/public/LoadingStatus';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { focusRing } from '@/lib/a11y';
import { RichText } from '../../lib/rich-text';
import type { PublicUIStrings } from './labels';
import { NumberAnswerInput } from './NumberAnswerInput';
import { YearAnswerSelect } from './YearAnswerSelect';
import {
  buildSkipAnswer,
  getVisibleQuestions,
  getWispCompanion,
  isDisclaimerQuestion,
  isQuestionVisible,
  isMultiChoiceOption,
  isWispCompanion,
  parseMultiChoiceSelection,
  parseMultiChoiceText,
} from './player-helpers';
import type { Module, Question, SavedAnswer } from './types';

//  QuestionnairePlayer

type PlayerPhase = 'loading' | 'answering' | 'review-prompt' | 'review' | 'error';

/**
 * Resolves which adaptive scale (if any) should run BEFORE the module's fixed
 * question at `idx` is shown (or before the module ends, when `idx` is the
 * length of `mod.questions`) — i.e. the earliest not-yet-done scale whose
 * entryPosition falls strictly between the previous and the current fixed
 * question's position. This is what lets a dynamic module walk fixed and
 * adaptive content in the same order they had in the original Excel sheet,
 * instead of always deferring every adaptive scale to the end of the module.
 */
function getPendingScaleAt(mod: Module, idx: number, doneScales: Set<string>): string | null {
  const fixed = mod.questions;
  const prevPos = idx > 0 ? fixed[idx - 1].position : -Infinity;
  const boundaryPos = idx < fixed.length ? fixed[idx].position : Infinity;
  const candidates = (mod.adaptiveScales ?? [])
    .filter(
      (s) => s.entryPosition > prevPos && s.entryPosition < boundaryPos && !doneScales.has(s.scale)
    )
    .sort((a, b) => a.entryPosition - b.entryPosition);
  return candidates[0]?.scale ?? null;
}

/**
 * The already-DONE adaptive scales sitting in the same gap getPendingScaleAt
 * looks at (between fixed[idx-1] and fixed[idx]), position-ordered. A closed
 * scale's questions must stay navigable — going Prev from fixed[idx] should
 * walk back INTO these scales' saved answers instead of jumping straight past
 * them to whatever fixed question came before the whole gap.
 */
function getDoneScalesInGap(mod: Module, idx: number, doneScales: Set<string>): string[] {
  const fixed = mod.questions;
  const prevPos = idx > 0 ? fixed[idx - 1].position : -Infinity;
  const boundaryPos = idx < fixed.length ? fixed[idx].position : Infinity;
  return (mod.adaptiveScales ?? [])
    .filter(
      (s) => s.entryPosition > prevPos && s.entryPosition < boundaryPos && doneScales.has(s.scale)
    )
    .sort((a, b) => a.entryPosition - b.entryPosition)
    .map((s) => s.scale);
}

/**
 * Walks a dynamic module's merged fixed/adaptive flow (same order rules as
 * getPendingScaleAt) to find where a resuming patient should land: the first
 * slot with either a pending adaptive scale or an unanswered fixed question.
 * Returns mod.questions.length when everything in the module is already done.
 */
function computeResumeIndex(
  mod: Module,
  answeredIds: Set<number>,
  doneScales: Set<string>
): number {
  const fixed = mod.questions;
  for (let i = 0; i <= fixed.length; i++) {
    if (getPendingScaleAt(mod, i, doneScales)) return i;
    if (
      i < fixed.length &&
      !answeredIds.has(fixed[i].questionId) &&
      !isDisclaimerQuestion(fixed[i])
    ) {
      return i;
    }
  }
  return fixed.length;
}

interface PlayerProps {
  link: string;
  assignmentId: number;
  questionnaireId: number;
  languageId: number;
  initialAnswers?: Record<number, SavedAnswer>;
  onComplete: () => void;
  /** UI texts of the patient's language, already loaded by the page. */
  t: PublicUIStrings;
}

function QuestionnairePlayer({
  link,
  assignmentId,
  questionnaireId,
  languageId,
  initialAnswers,
  onComplete,
  t,
}: PlayerProps) {
  const [modules, setModules] = useState<Module[]>([]);
  const [playerPhase, setPlayerPhase] = useState<PlayerPhase>('loading');
  const [moduleIdx, setModuleIdx] = useState(0);
  const [questionIdx, setQuestionIdx] = useState(0);
  // Name of the adaptive scale currently driving catQuestion, or null while
  // walking fixed questions. Replaces the old "isCat = past the last fixed
  // question" derivation now that adaptive scales can sit anywhere in a
  // dynamic module's flow, not just at the very end.
  const [activeScale, setActiveScale] = useState<string | null>(null);
  // Whether the most recently fetched CAT question is the last one of
  // activeScale — set from the backend's scale_is_complete flag. Drives
  // whether "Next" fetches another item of the same scale, or hands control
  // back to the merged fixed/adaptive flow.
  const [catScaleComplete, setCatScaleComplete] = useState(false);
  const [catQuestion, setCatQuestion] = useState<Question | null>(null);
  const [catHistory, setCatHistory] = useState<Array<{ question: Question; answer: SavedAnswer }>>(
    []
  );
  const [answers, setAnswers] = useState<Record<number, SavedAnswer>>({});
  // Scales already fully completed, per (assignment, module) — populated as
  // scales finish during the forward walk, and seeded from the backend on
  // resume. Keyed by assignmentId too, not just moduleId — a ref survives
  // across re-renders (and can survive a dev-time Fast Refresh hot-reload) of
  // the SAME component instance, so if this player ever got reused for a
  // DIFFERENT assignment on the same module (rare, but exactly what a stale
  // dev session looks like) without a full remount, the old assignment's
  // "done" marks must never leak into the new one and make it look like the
  // patient has already finished scales they haven't even started.
  const doneScalesRef = useRef<Map<string, Set<string>>>(new Map());
  const getDoneScalesFor = useCallback(
    (moduleId: number): Set<string> => {
      const key = `${assignmentId}:${moduleId}`;
      let s = doneScalesRef.current.get(key);
      if (!s) {
        s = new Set();
        doneScalesRef.current.set(key, s);
      }
      return s;
    },
    [assignmentId]
  );
  // Development-time navigation logging — prints a snapshot of the key
  // player/CAT state at each significant navigation event, so it's possible
  // to see exactly what data the player is tracking while moving through a
  // dynamic module. Filter the browser console by "[Nav]" to follow just
  // this. References state/derived values declared further down (isCat,
  // viewingClosedScale) — safe because this is only ever CALLED from event
  // handlers after render, never during the render that defines them.
  function logNav(action: string, extra?: Record<string, unknown>) {
    console.log(`[Nav] ${action}`, {
      moduleIdx,
      questionIdx,
      isCat,
      activeScale,
      catScaleComplete,
      catHistoryLength: catHistory.length,
      viewingClosedScale,
      doneScales: modules[moduleIdx] ? [...getDoneScalesFor(modules[moduleIdx].module.id)] : [],
      ...extra,
    });
  }

  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Non-fatal: the last answer save failed. Shown inline (role="alert") and blocks
  // navigation until a retry succeeds, so an answer is never silently lost.
  const [saveError, setSaveError] = useState<string | null>(null);
  // Synchronous re-entrancy lock for handleNext/handlePrev — `saving` (React
  // state) is NOT enough on its own: handleNext is async, so it yields back to
  // the browser's event loop at its first `await` (inside saveAnswer, before
  // `saving` has actually been re-rendered as true and the button's disabled
  // attribute has updated in the DOM). A fast double-click/tap in that window
  // starts a SECOND handleNext with a stale closure — e.g. still pointing at
  // the question the first click already saved — corrupting a CAT scale's
  // history (skip 3 items, land with only 2 actually saved). A ref updates
  // immediately, with no render cycle involved, so it closes that window.
  const navBusyRef = useRef(false);
  // Incremented at the start of every fetchNextCatQuestion call. Lets a
  // network response recognize it's been superseded by a NEWER call (e.g. a
  // second concurrent activation chain from a StrictMode-duplicated mount
  // effect, or any other overlap) and skip writing state entirely, instead of
  // "last resolves wins" silently overwriting whatever the newer call already
  // set (activeScale/catQuestion/catScaleComplete) with stale data.
  const catFetchSeqRef = useRef(0);

  // A CLOSED adaptive scale's questions must stay navigable, pre-filled with
  // their saved answer, and editable — right up until the patient reaches
  // review (where they become visible but read-only). closedScaleHistory
  // caches each scale's served items (question + saved answer), keyed via
  // scaleHistoryKey (assignment + module + scale — see its comment for why
  // assignmentId is part of the key); populated either from a just-finished
  // LIVE session (finishActiveScaleAndResume snapshots catHistory) or lazily
  // from the backend's scale/:scale/history endpoint (resume, or review).
  const [closedScaleHistory, setClosedScaleHistory] = useState<
    Record<string, Array<{ question: Question; answer: SavedAnswer | null }>>
  >({});
  // Builds closedScaleHistory's cache key. Always includes assignmentId, not
  // just moduleId+scale — a ref/state value survives across re-renders (and
  // can survive a dev-time Fast Refresh hot-reload) of the SAME component
  // instance, so if this player ever got reused for a DIFFERENT assignment on
  // the same module without a full remount, one assignment's cached answers
  // must never leak into another's display.
  function scaleHistoryKey(moduleId: number, scale: string): string {
    return `${assignmentId}:${moduleId}:${scale}`;
  }
  // Non-null while browsing a closed scale's history: stackScales are the done
  // scales sharing the same gap between two fixed questions (position-ordered),
  // stackPos which of them is being viewed, itemIdx which of its items. If an
  // answer in the currently-viewed scale gets edited, forward navigation
  // resumes its LIVE adaptive session once its own items are exhausted (the
  // backend has already rebuilt it up to that edit) — see the "reopened"
  // handling in handleNextInClosedScaleView, driven by doneScalesRef rather
  // than a flag stored here (see below).
  // Whether a scale is "reopened" (edited mid-browse, so forward navigation
  // must resume its LIVE session instead of treating it as still resolved) is
  // NOT tracked as a flag on viewingClosedScale itself — doneScalesRef is the
  // single source of truth (handleClosedScaleAnswerChange removes the edited
  // scale from it), naturally scoped per scale name regardless of which scale
  // is currently being browsed. A flag living on viewingClosedScale would leak
  // across stackPos transitions via object spread and misattribute to the
  // wrong (untouched) scale once browsing moves on.
  const [viewingClosedScale, setViewingClosedScale] = useState<{
    moduleId: number;
    fixedIdx: number;
    stackScales: string[];
    stackPos: number;
    itemIdx: number;
  } | null>(null);

  const fetchScaleHistory = useCallback(
    async (
      mod: Module,
      scale: string
    ): Promise<Array<{ question: Question; answer: SavedAnswer | null }>> => {
      const key = scaleHistoryKey(mod.module.id, scale);
      const cached = closedScaleHistory[key];
      if (cached) {
        console.log('[Nav] fetchScaleHistory: cache hit', { scale, itemCount: cached.length });
        return cached;
      }
      console.log('[Nav] fetchScaleHistory: cache MISS, fetching', { scale });
      try {
        const res = await axios.get(
          `/euonqol-api/public/link/${link}/modules/${mod.module.id}/scale/${encodeURIComponent(scale)}/history`,
          { params: { assignment_id: assignmentId, language_id: languageId } }
        );
        console.log('[Nav] fetchScaleHistory: fetched', {
          scale,
          itemCount: res.data.items?.length ?? 0,
        });
        const items: Array<{ question: Question; answer: SavedAnswer | null }> = (
          res.data.items ?? []
        ).map((it: any) => ({
          question: {
            position: 0,
            questionId: it.question.questionId,
            questionCode: it.question.questionCode,
            questionKind: 'cat' as const,
            questionType: it.question.questionType ?? null,
            questionHead: '',
            questionPramble: it.question.questionPramble ?? '',
            questionText: it.question.questionText,
            parentQid: null,
            operator: null,
            conditionValue: null,
            answerProfile: it.question.answerProfile ?? null,
            answerOptions: it.question.answerOptions ?? [],
          },
          answer: it.answer
            ? {
                questionId: it.question.questionId,
                answer_option_id: it.answer.answer_option_id ?? undefined,
                answer_text: it.answer.answer_text ?? undefined,
              }
            : null,
        }));
        setClosedScaleHistory((prev) => ({ ...prev, [key]: items }));
        // Seed `answers` so the shared currentAnswer/AnswerOptions lookup by
        // questionId works uniformly for these items too, no special-casing.
        setAnswers((prev) => {
          const updated = { ...prev };
          for (const item of items) {
            if (item.answer && !updated[item.question.questionId]) {
              updated[item.question.questionId] = item.answer;
            }
          }
          return updated;
        });
        return items;
      } catch {
        return [];
      }
    },
    [closedScaleHistory, link, assignmentId, languageId]
  );

  const [reviewQuestion, setReviewQuestion] = useState<Question | null>(null);
  const [reviewExpanded, setReviewExpanded] = useState<Record<number, boolean>>({});
  const [reviewMobileSidebarOpen, setReviewMobileSidebarOpen] = useState(false);

  // Load questionnaire structure
  useEffect(() => {
    // Guards against React 18 StrictMode's dev-time double-invoke of this
    // effect (mount → cleanup → mount again): without this, the FIRST run's
    // promise can resolve after the second run's and clobber it with stale
    // data (setModules with an old array reference re-triggers the
    // module-entry effect below, which can fire a second concurrent
    // next-question POST for the same scale). Only the run that's still
    // mounted when its promise resolves is allowed to write state.
    let cancelled = false;
    axios
      .get(`/euonqol-api/questionnaires/${questionnaireId}/preview`, { params: { languageId } })
      .then(async (res) => {
        if (cancelled) return;
        const mods: Module[] = res.data.modules ?? [];
        setModules(mods);

        // Resume: pre-populate answers and navigate to the first module/slot that
        // still has something pending — a fixed question OR an adaptive scale not
        // yet completed server-side, whichever comes first in the merged order.
        if (initialAnswers && Object.keys(initialAnswers).length > 0) {
          setAnswers(initialAnswers);
          const answeredIds = new Set(Object.keys(initialAnswers).map(Number));
          let startMi = 0;
          let startQi = 0;
          let found = false;

          for (let mi = 0; mi < mods.length && !found; mi++) {
            if (cancelled) return; // re-checked after every awaited GET status below
            const m = mods[mi];
            let doneScales = new Set<string>();
            if (m.module.type === 'dynamic' && (m.adaptiveScales?.length ?? 0) > 0) {
              try {
                const statusRes = await axios.get(
                  `/euonqol-api/public/link/${link}/modules/${m.module.id}/status`,
                  { params: { assignment_id: assignmentId } }
                );
                doneScales = new Set(
                  (statusRes.data.scales ?? [])
                    .filter((s: any) => s.is_completed)
                    .map((s: any) => s.scale)
                );
              } catch {
                // Best-effort — worst case we re-enter an already-completed scale,
                // which the backend/activateScaleIfPending fallback handles.
              }
              doneScalesRef.current.set(`${assignmentId}:${m.module.id}`, doneScales);
            }
            const qi = computeResumeIndex(m, answeredIds, doneScales);
            if (qi < m.questions.length || getPendingScaleAt(m, m.questions.length, doneScales)) {
              startMi = mi;
              startQi = qi;
              found = true;
            }
          }
          if (cancelled) return;
          setModuleIdx(startMi);
          setQuestionIdx(startQi);
          console.log('[Nav] resume: landed on', {
            startMi,
            startQi,
            doneScalesByModule: Object.fromEntries(
              [...doneScalesRef.current.entries()].map(([id, s]) => [id, [...s]])
            ),
          });
        }

        if (cancelled) return;
        const firstModuleWithQuestions = mods.find((m) => m.questions.length > 0);
        if (firstModuleWithQuestions) {
          setReviewExpanded({ [firstModuleWithQuestions.module.id]: true });
        }
        setPlayerPhase('answering');
      })
      .catch(() => {
        if (cancelled) return;
        setError(t.errorGeneric);
        setPlayerPhase('error');
      });
    return () => {
      cancelled = true;
    };
  }, [questionnaireId, languageId]);

  // On landing on a dynamic module (fresh advance, or resume), check whether an
  // adaptive scale is pending at the current slot and enter it if so — this
  // replaces the old "only if the module has zero fixed questions" special case
  // now that adaptive scales can be interleaved anywhere in the module's flow.
  useEffect(() => {
    if (playerPhase !== 'answering') return;
    const mod = modules[moduleIdx];
    if (!mod || mod.module.type !== 'dynamic') return;
    console.log('[Nav] module-entry effect firing', {
      moduleId: mod.module.id,
      moduleIdx,
      questionIdx,
    });
    // Same StrictMode double-invoke concern as the structure-load effect
    // above: don't kick off a second activation chain if this effect itself
    // gets cleaned up before the first one starts. The response-level race
    // (two chains already in flight) is handled by fetchNextCatQuestion's
    // own request-generation guard, not by this flag.
    let cancelled = false;
    void (async () => {
      if (cancelled) return;
      await activateScaleIfPending(mod, questionIdx);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleIdx, modules, playerPhase]);

  // 'done' means the BACKEND positively confirmed nothing is pending (a
  // successful response with no question) — activateScaleIfPending relies on
  // this to know a scale is genuinely resolved and it's safe to mark it done
  // and try the next one. 'error' means the REQUEST ITSELF failed (network,
  // 503 from the external CAT service being down, etc.) — we have NO
  // information about whether the scale is actually done, so it must never
  // be treated the same as 'done': doing so previously made a transient CAT
  // service outage cascade through marking every remaining scale in the
  // module "done" (each next-question attempt failing, then immediately
  // "succeeding" at nothing for the following one), silently corrupting
  // navigation for the rest of the session.
  const fetchNextCatQuestion = useCallback(async (): Promise<
    'question' | 'done' | 'error' | 'stale'
  > => {
    const mod = modules[moduleIdx];
    if (!mod) return 'error';
    const mySeq = ++catFetchSeqRef.current;
    setSaving(true);
    try {
      console.log('[Nav] POST next-question', { moduleId: mod.module.id, assignmentId, seq: mySeq });
      const res = await axios.post(
        `/euonqol-api/public/link/${link}/modules/${mod.module.id}/next-question`,
        { assignment_id: assignmentId, language_id: languageId }
      );
      if (mySeq !== catFetchSeqRef.current) {
        console.log('[Nav] next-question response DISCARDED (stale)', {
          mySeq,
          current: catFetchSeqRef.current,
        });
        return 'stale';
      }
      const q = res.data.question;
      if (!q) {
        // Nothing pending at all for this module server-side.
        console.log('[Nav] next-question: nothing pending server-side', res.data);
        setCatQuestion(null);
        return 'done';
      }
      console.log('[Nav] next-question response', {
        scale: res.data.scale,
        item_key: res.data.item_key,
        questionCode: q.questionCode,
        questionId: q.questionId,
        scale_is_complete: res.data.scale_is_complete,
        is_complete: res.data.is_complete,
      });
      setCatQuestion({
        position: 0,
        questionId: q.questionId,
        questionCode: q.questionCode,
        questionKind: 'cat',
        questionType: q.questionType ?? null,
        questionHead: '',
        questionPramble: q.questionPramble ?? '',
        questionText: q.questionText,
        parentQid: null,
        operator: null,
        conditionValue: null,
        answerProfile: q.answerProfile ?? null,
        answerOptions: q.answerOptions ?? [],
      });
      setCatScaleComplete(!!res.data.scale_is_complete);
      if (res.data.scale) setActiveScale(res.data.scale);
      return 'question';
    } catch (err) {
      if (mySeq !== catFetchSeqRef.current) {
        console.log('[Nav] next-question FAILED but already superseded — discarding', err);
        return 'stale';
      }
      console.log('[Nav] next-question FAILED', err);
      setError(t.errorLoadCat);
      return 'error';
    } finally {
      setSaving(false);
    }
  }, [modules, moduleIdx, link, assignmentId, languageId]);

  // Activates the earliest not-yet-done adaptive scale pending at slot `idx` of
  // `mod` (see getPendingScaleAt), if any. Returns whether one was entered.
  const activateScaleIfPending = useCallback(
    async (mod: Module, idx: number): Promise<boolean> => {
      const done = getDoneScalesFor(mod.module.id);
      const pending = getPendingScaleAt(mod, idx, done);
      console.log('[Nav] activateScaleIfPending', {
        moduleId: mod.module.id,
        idx,
        doneScales: [...done],
        pending,
      });
      if (!pending) return false;
      // Resume support: seed catHistory from whatever this scale's session has
      // ALREADY served + saved an answer for. scale/:scale/history is a pure DB
      // read that works for a still-OPEN scale just as well as a closed one
      // (see its own docstring) — it simply returns [] when no session exists
      // yet, which is exactly right for a genuinely brand-new scale. Without
      // this, re-entering a scale (typically after a reload/resume) always
      // started catHistory empty, so "Indietro" had nothing to rewind into and
      // backed all the way OUT of the scale instead of stepping back into its
      // already-answered items (e.g. landing on a disclaimer question instead
      // of the scale's own first item).
      const history = await fetchScaleHistory(mod, pending);
      const answeredHistory = history.filter(
        (h): h is { question: Question; answer: SavedAnswer } => h.answer !== null
      );
      setCatHistory(answeredHistory);
      setCatQuestion(null);
      setActiveScale(pending);
      const result = await fetchNextCatQuestion();
      if (result === 'error') {
        // A genuine failure talking to the CAT service (e.g. temporarily
        // down) — never mark this scale done or try the next one, which
        // would silently corrupt doneScalesRef into thinking scales
        // completed that were never even attempted. Stop the whole player on
        // a hard error screen instead, so a reload/retry correctly
        // re-attempts THIS scale rather than skipping past it.
        console.log(
          '[Nav] activateScaleIfPending: next-question FAILED for',
          pending,
          '— stopping, NOT marking done'
        );
        setPlayerPhase('error');
        return true; // "handled" — callers must not ALSO try to advance elsewhere
      }
      if (result === 'stale') {
        // A newer fetchNextCatQuestion call has already superseded this one
        // (see catFetchSeqRef) — it owns activeScale/catQuestion/doneScales
        // for this slot now. Treat as handled: no error screen, no marking
        // this scale done, no retry from this (superseded) chain.
        console.log('[Nav] activateScaleIfPending: next-question result stale — a newer call is handling it');
        return true;
      }
      if (result === 'done') {
        // This scale turned out to already be fully done server-side (e.g. a
        // resume race) — mark it and try the next one pending at this slot.
        console.log(
          '[Nav] activateScaleIfPending: server says',
          pending,
          'already done — trying next'
        );
        done.add(pending);
        setActiveScale(null);
        return activateScaleIfPending(mod, idx);
      }
      return true;
    },
    [fetchNextCatQuestion, fetchScaleHistory, getDoneScalesFor]
  );

  // Advances the fixed-question flow of the current module starting at
  // `fromIdx`, scanning for the next VISIBLE question (handling WISP companions
  // and system-skips along the way, exactly like the old inline logic did).
  // Once resolved, either re-enters a CLOSED scale sitting in the gap right
  // before it (retracing forward through territory a backward excursion
  // already visited — see tryEnterClosedScaleGapForward; skipped when
  // `retrace` is false, so finishActiveScaleAndResume's own call doesn't
  // immediately re-show the scale that JUST finished), enters a still-PENDING
  // adaptive scale there, lands on that fixed question, or — if nothing
  // remains — advances to the next module.
  const advanceFixedFlow = useCallback(
    async (fromIdx: number, pendingAnswersBase: Record<number, SavedAnswer>, retrace = true) => {
      const mod = modules[moduleIdx];
      if (!mod) return;
      const pendingAnswers = { ...pendingAnswersBase };
      const systemSkips: SavedAnswer[] = [];
      let nextQi: number | null = null;

      for (let i = fromIdx; i < mod.questions.length; i++) {
        const q = mod.questions[i];
        if (isWispCompanion(q, mod.questions)) {
          if (!pendingAnswers[q.questionId]) {
            const sysAnswer = buildSkipAnswer(q, 'skipped by system');
            systemSkips.push(sysAnswer);
            pendingAnswers[q.questionId] = sysAnswer;
          }
          continue;
        }
        if (isQuestionVisible(q, mod.questions, pendingAnswers)) {
          nextQi = i;
          break;
        }
        const sysAnswer = buildSkipAnswer(q, 'skipped by system');
        systemSkips.push(sysAnswer);
        pendingAnswers[q.questionId] = sysAnswer;
      }

      for (const sysAnswer of systemSkips) {
        // A failed save stops the advance — pressing Next again recomputes and retries.
        if (!(await saveAnswer(sysAnswer))) return;
      }
      if (systemSkips.length > 0) {
        setAnswers((prev) => {
          const updated = { ...prev };
          for (const a of systemSkips) updated[a.questionId] = a;
          return updated;
        });
      }

      const targetIdx = nextQi !== null ? nextQi : mod.questions.length;
      setQuestionIdx(targetIdx);
      console.log('[Nav] advanceFixedFlow', {
        fromIdx,
        targetIdx,
        retrace,
        systemSkipped: systemSkips.map((s) => s.questionId),
        reachedEndOfModule: nextQi === null,
      });
      if (retrace && (await tryEnterClosedScaleGapForward(mod, targetIdx))) return;
      const entered = await activateScaleIfPending(mod, targetIdx);
      if (!entered && nextQi === null) {
        console.log('[Nav] advanceFixedFlow: end of module, nothing pending — advancing module');
        advanceModule();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [modules, moduleIdx, activateScaleIfPending]
  );

  // Resolves to whether the answer is safely persisted (true also when there was
  // nothing to save) — callers must not advance past a question on false.
  const saveAnswer = useCallback(
    async (answer: SavedAnswer): Promise<boolean> => {
      const hasContent =
        answer.answer_option_id ||
        answer.answer_text ||
        answer.socio_demo_answer_id ||
        answer.feedback_answer_id;
      if (!hasContent) {
        console.log('[Nav] saveAnswer: skipped (no content)', answer);
        return true;
      }
      console.log('[Nav] PUT responses', answer);
      setSaving(true);
      try {
        const res = await axios.put(`/euonqol-api/public/link/${link}/responses`, {
          assignment_id: assignmentId,
          responses: [
            {
              question_id: answer.questionId,
              language_id: languageId,
              answer_option_id: answer.answer_option_id ?? null,
              answer_text: answer.answer_text ?? null,
              socio_demo_answer_id: answer.socio_demo_answer_id ?? null,
              feedback_answer_id: answer.feedback_answer_id ?? null,
            },
          ],
        });
        console.log('[Nav] PUT responses OK', res.data);
        setSaveError(null);
        return true;
      } catch (err) {
        console.log('[Nav] PUT responses FAILED', err);
        setSaveError(t.errorSavingAnswer);
        return false;
      } finally {
        setSaving(false);
      }
    },
    [link, assignmentId, languageId]
  );

  // Deferred save for answers that persist immediately on change (review edits,
  // closed-scale edits). Native radios change selection on every arrow key, so
  // saving on each change would fire a burst of concurrent PUTs (and, for a closed
  // adaptive scale, a backend session rebuild per keystroke) that can land out of
  // order. The UI updates instantly; the save runs once the selection settles, or
  // right away via flushPendingSave() before any navigation or submit. `baseline` is
  // the answer as persisted before the burst, so settling back on it saves nothing.
  const pendingSaveRef = useRef<{
    timer: ReturnType<typeof setTimeout> | null;
    questionId: number;
    baseline: SavedAnswer | undefined;
    run: () => Promise<boolean>;
  } | null>(null);

  async function flushPendingSave(): Promise<boolean> {
    const pending = pendingSaveRef.current;
    if (!pending) return true;
    if (pending.timer) clearTimeout(pending.timer);
    pendingSaveRef.current = null;
    const ok = await pending.run();
    // Keep a failed save queued (no timer) so the next flush — Next/Prev/Submit — retries it.
    if (!ok && !pendingSaveRef.current) pendingSaveRef.current = { ...pending, timer: null };
    return ok;
  }

  function scheduleSave(
    questionId: number,
    baseline: SavedAnswer | undefined,
    run: () => Promise<boolean>
  ) {
    const pending = pendingSaveRef.current;
    if (pending && pending.questionId !== questionId) {
      // A different question's edit is still pending — persist it now, never drop it.
      void flushPendingSave();
    } else if (pending?.timer) {
      clearTimeout(pending.timer);
    }
    const entry = { timer: null as ReturnType<typeof setTimeout> | null, questionId, baseline, run };
    entry.timer = setTimeout(() => {
      if (pendingSaveRef.current === entry) void flushPendingSave();
    }, 500);
    pendingSaveRef.current = entry;
  }

  // Baseline for a new edit: the one already captured by a pending burst on the same
  // question, else the currently stored answer.
  function saveBaseline(questionId: number): SavedAnswer | undefined {
    const pending = pendingSaveRef.current;
    return pending?.questionId === questionId ? pending.baseline : answers[questionId];
  }

  // Navigation must never run on state older than a save it just flushed: the flushed
  // edit updates state (e.g. a closed scale's history gets truncated after its CAT
  // session is rebuilt) that THIS render's handlers can't see yet — navigating now
  // would target items that no longer exist. So when a deferred save was pending,
  // flush it and re-run the navigation after the next render, with fresh state.
  // Returns true when the caller must stop (save failed, or navigation deferred).
  const deferredNavRef = useRef<'next' | 'prev' | null>(null);
  const [deferredNavTick, setDeferredNavTick] = useState(0);
  async function flushThenDeferNav(dir: 'next' | 'prev'): Promise<boolean> {
    if (!pendingSaveRef.current) return false;
    if (!(await flushPendingSave())) return true;
    deferredNavRef.current = dir;
    setDeferredNavTick((n) => n + 1);
    return true;
  }
  useEffect(() => {
    const dir = deferredNavRef.current;
    if (!dir) return;
    deferredNavRef.current = null;
    void (dir === 'next' ? handleNext() : handlePrev());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deferredNavTick]);

  // Never lose a deferred edit when the player unmounts.
  useEffect(
    () => () => {
      const pending = pendingSaveRef.current;
      if (!pending) return;
      if (pending.timer) clearTimeout(pending.timer);
      pendingSaveRef.current = null;
      void pending.run();
    },
    []
  );

  //  Derived state
  const currentModule = modules[moduleIdx];
  const staticQuestions = currentModule?.questions ?? [];
  // A dynamic module can mix FIXED questions (CTT-scored, or IRT-scored with no
  // CatSettings mapping — presented like static, walked via questionIdx same as
  // staticQuestions above) with adaptive scales interleaved at their original
  // Excel position (see getPendingScaleAt/activateScaleIfPending). We're in the
  // adaptive phase whenever a scale has actually been activated, not merely
  // because questionIdx has passed the last fixed question.
  const isCat = activeScale !== null;

  // Browsing a CLOSED scale's saved history (see viewingClosedScale) — its
  // questions stay navigable and, before review, editable instead of
  // vanishing once the scale completes.
  const closedScaleViewItems = viewingClosedScale
    ? (closedScaleHistory[
        scaleHistoryKey(
          viewingClosedScale.moduleId,
          viewingClosedScale.stackScales[viewingClosedScale.stackPos]
        )
      ] ?? [])
    : [];
  const closedScaleViewQuestion = viewingClosedScale
    ? (closedScaleViewItems[viewingClosedScale.itemIdx]?.question ?? null)
    : null;

  const currentQuestion: Question | null = isCat
    ? catQuestion
    : viewingClosedScale
      ? closedScaleViewQuestion
      : (staticQuestions[questionIdx] ?? null);

  // WISP companion: the question immediately after currentQuestion that shares the same
  // parent+condition – shown inline once currentQuestion is answered.
  const companion =
    currentQuestion && !isCat && !viewingClosedScale
      ? getWispCompanion(currentQuestion, staticQuestions)
      : null;

  // Disclaimer: no answer options and not a text question
  const isDisclaimer = !!currentQuestion && isDisclaimerQuestion(currentQuestion);
  const currentAnswer = currentQuestion ? answers[currentQuestion.questionId] : undefined;
  // Every question kind (static, feedback, socio-demo, cat) is skippable — Next
  // auto-saves "Skipped by patient" — including a genuinely adaptive one: the CAT
  // session's minimum-items criterion can still be satisfied by items that were
  // served but left unanswered, so a scale must be closable without forcing an
  // answer on every one of its questions.
  const hasAnswerContent =
    !!currentAnswer?.answer_option_id ||
    !!currentAnswer?.socio_demo_answer_id ||
    !!currentAnswer?.feedback_answer_id ||
    (currentAnswer?.answer_text !== undefined && currentAnswer.answer_text.trim().length > 0);
  // Companion is shown inline when the main question has a real answer
  const companionTriggered = companion != null && hasAnswerContent;

  // First visible NON-COMPANION question across all modules with a fixed question
  // list — a dynamic module contributes its FIXED questions here (empty array for
  // a fully-adaptive one, which is naturally skipped by the visible.length check).
  const isFirstQuestion = (() => {
    if (isCat || viewingClosedScale) return false;
    for (let mi = 0; mi < modules.length; mi++) {
      const m = modules[mi];
      const visible = getVisibleQuestions(m.questions, answers).filter(
        (q) => !isWispCompanion(q, m.questions)
      );
      if (visible.length === 0) continue;
      return mi === moduleIdx && visible[0].questionId === staticQuestions[questionIdx]?.questionId;
    }
    return false;
  })();

  // Progress counts visible NON-COMPANION fixed questions PLUS, for each
  // adaptive scale, its CAT setting's own minimum-items-to-stop count
  // (adaptiveScales[].minItems, from the setting's api_configuration) — the
  // engine can end up asking more, but the minimum is the only count known
  // up front, and it's what lets the bar move WHILE inside a CAT scale
  // instead of sitting frozen until the whole scale closes.
  function moduleFixedCount(m: Module): number {
    return getVisibleQuestions(m.questions, answers).filter((q) => !isWispCompanion(q, m.questions))
      .length;
  }
  function moduleAdaptiveTotal(m: Module): number {
    return (m.adaptiveScales ?? []).reduce((sum, s) => sum + s.minItems, 0);
  }
  // How many of a module's adaptive items count as "done": a CLOSED scale
  // counts fully (its minItems), the scale currently LIVE counts however many
  // items have actually been answered so far (capped at its minItems so an
  // engine that ends up asking more doesn't temporarily push progress past
  // 100%), everything else counts as 0.
  function moduleAdaptiveDone(m: Module): number {
    const doneScales = getDoneScalesFor(m.module.id);
    return (m.adaptiveScales ?? []).reduce((sum, s) => {
      if (doneScales.has(s.scale)) return sum + s.minItems;
      if (activeScale === s.scale) return sum + Math.min(catHistory.length, s.minItems);
      return sum;
    }, 0);
  }

  const totalItems = modules.reduce(
    (sum, m) => sum + moduleFixedCount(m) + moduleAdaptiveTotal(m),
    0
  );

  // Prior modules count as fully passed (same simplification already used for
  // their fixed questions: once you've moved past a module, it — and every
  // adaptive scale in it — counts as done regardless of literal answered
  // state, since skip logic can hide questions without an answer ever
  // existing for them).
  const itemsBeforeCurrentModule = modules
    .slice(0, moduleIdx)
    .reduce((sum, m) => sum + moduleFixedCount(m) + moduleAdaptiveTotal(m), 0);

  // Fixed items passed within the CURRENT module — questionIdx always marks
  // this boundary correctly, whether we're literally on a fixed question,
  // paused live in an adaptive scale at this slot, or browsing a closed
  // scale's history at it, so this no longer special-cases isCat.
  const fixedItemsBeforeCurrentQuestion = staticQuestions
    .slice(0, questionIdx)
    .filter(
      (q) => isQuestionVisible(q, staticQuestions, answers) && !isWispCompanion(q, staticQuestions)
    ).length;

  // Total items the player has already moved past
  const itemsDone =
    itemsBeforeCurrentModule +
    fixedItemsBeforeCurrentQuestion +
    (currentModule ? moduleAdaptiveDone(currentModule) : 0);

  const progressPct =
    playerPhase === 'review-prompt' || playerPhase === 'review'
      ? 100
      : totalItems > 0
        ? Math.min(100, Math.round((itemsDone / totalItems) * 100))
        : 0;

  // If we resume and land on a WISP companion question, go back to its main
  useEffect(() => {
    if (isCat || playerPhase !== 'answering' || !staticQuestions.length) return;
    const q = staticQuestions[questionIdx];
    if (q && isWispCompanion(q, staticQuestions)) {
      setQuestionIdx(questionIdx - 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerPhase, staticQuestions.length, questionIdx, isCat]);

  // Focus management (WCAG 2.4.3 / 4.1.3): every time a new question (or the
  // review prompt) replaces the previous screen, move focus to its text so screen
  // reader and keyboard users land on — and hear — the new content instead of
  // staying on the Next button with no clue anything changed. Review is excluded:
  // there the patient drives navigation from the sidebar and keeps their place.
  const focusTargetRef = useRef<HTMLElement | null>(null);
  const setFocusTarget = useCallback((el: HTMLElement | null) => {
    focusTargetRef.current = el;
  }, []);
  // Review mounts only ONE of its mobile/desktop layouts (Tailwind md breakpoint),
  // so the question body — and its element ids used by aria-labelledby — exists once.
  const isReviewDesktop = useMediaQuery('(min-width: 768px)');
  const focusKey =
    playerPhase === 'answering' ? `q:${currentQuestion?.questionId ?? ''}` : playerPhase;
  useEffect(() => {
    if (playerPhase !== 'answering' && playerPhase !== 'review-prompt') return;
    focusTargetRef.current?.focus();
  }, [focusKey, playerPhase]);

  // Entering review: pre-fetch every dynamic module's adaptive scales' saved
  // history so they can be listed, interleaved with fixed questions in true
  // answered order, as visible-but-read-only rows (see getModuleReviewOrder)
  // instead of the old flat "✓ CAT" badge.
  useEffect(() => {
    if (playerPhase !== 'review') return;
    for (const mod of modules) {
      if (mod.module.type !== 'dynamic') continue;
      for (const s of mod.adaptiveScales ?? []) {
        void fetchScaleHistory(mod, s.scale);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerPhase, modules]);

  // A module's reviewable items (fixed questions + adaptive scales' served
  // items) in the SAME order the patient actually walked through them while
  // answering — fixed questions in position order, with each adaptive
  // scale's items (from the lazily-fetched closedScaleHistory cache) spliced
  // in at its entryPosition, exactly the same merge rule getPendingScaleAt /
  // getDoneScalesInGap use for live navigation. WISP companions and
  // system-hidden fixed questions are excluded, same as before.
  function getModuleReviewOrder(mod: Module): Array<{ question: Question; isAdaptive: boolean }> {
    const fixed = mod.questions;
    const scales = [...(mod.adaptiveScales ?? [])].sort(
      (a, b) => a.entryPosition - b.entryPosition
    );
    const result: Array<{ question: Question; isAdaptive: boolean }> = [];
    let scaleIdx = 0;

    for (let i = 0; i <= fixed.length; i++) {
      const boundaryPos = i < fixed.length ? fixed[i].position : Infinity;
      while (scaleIdx < scales.length && scales[scaleIdx].entryPosition < boundaryPos) {
        const items =
          closedScaleHistory[scaleHistoryKey(mod.module.id, scales[scaleIdx].scale)] ?? [];
        for (const it of items) result.push({ question: it.question, isAdaptive: true });
        scaleIdx++;
      }
      if (i < fixed.length) {
        const q = fixed[i];
        if (isQuestionVisible(q, fixed, answers) && !isWispCompanion(q, fixed)) {
          result.push({ question: q, isAdaptive: false });
        }
      }
    }
    return result;
  }

  // A 'cat'-kind review question is read-only when it's genuinely adaptive —
  // i.e. it does NOT appear in any module's fixed question list. A FIXED
  // dynamic-module 'cat'-kind question (CTT, or IRT with no CatSettings
  // mapping) stays editable in review exactly as before.
  function isAdaptiveReviewQuestion(question: Question): boolean {
    if (question.questionKind !== 'cat') return false;
    return !modules.some((m) => m.questions.some((q) => q.questionId === question.questionId));
  }

  function setCurrentAnswer(answer: SavedAnswer) {
    setAnswers((prev) => ({ ...prev, [answer.questionId]: answer }));
  }

  // Review screen: editing a parent's answer can hide a dependent question that
  // still has a real answer saved from before. Re-evaluate skip logic for the rest
  // of the module and annul (mark "Skipped by system") any answer that's no longer visible.
  async function invalidateHiddenDependents(
    changedAnswer: SavedAnswer,
    changedQuestion: Question
  ): Promise<boolean> {
    const mod = modules.find(
      (m) =>
        m.module.type !== 'dynamic' &&
        m.questions.some((q) => q.questionId === changedQuestion.questionId)
    );
    if (!mod) return true;

    const pendingAnswers: Record<number, SavedAnswer> = {
      ...answers,
      [changedAnswer.questionId]: changedAnswer,
    };
    const toClear: SavedAnswer[] = [];

    for (const q of mod.questions) {
      const existing = pendingAnswers[q.questionId];
      if (!existing || isSkipAnswer(q, existing)) continue;
      if (!isQuestionVisible(q, mod.questions, pendingAnswers)) {
        const sysAnswer = buildSkipAnswer(q, 'skipped by system');
        toClear.push(sysAnswer);
        pendingAnswers[q.questionId] = sysAnswer;
      }
    }

    if (toClear.length === 0) return true;

    for (const sysAnswer of toClear) {
      if (!(await saveAnswer(sysAnswer))) return false;
    }
    setAnswers((prev) => {
      const updated = { ...prev };
      for (const a of toClear) updated[a.questionId] = a;
      return updated;
    });
    return true;
  }

  // Review edit: shown immediately, persisted (plus skip-logic cleanup) once settled.
  function handleReviewAnswerChange(ans: SavedAnswer, question: Question) {
    const baseline = saveBaseline(ans.questionId);
    setCurrentAnswer(ans);
    scheduleSave(ans.questionId, baseline, async () => {
      if (isSameAnswer(baseline, ans)) return true;
      if (!(await saveAnswer(ans))) return false;
      return invalidateHiddenDependents(ans, question);
    });
  }

  function advanceModule() {
    if (moduleIdx < modules.length - 1) {
      setModuleIdx((i) => i + 1);
      setQuestionIdx(0);
      setCatQuestion(null);
    } else {
      setPlayerPhase('review-prompt');
    }
  }

  // Marks activeScale done and hands control back to the merged flow: either
  // another adaptive scale queued at the same slot, or the fixed-question flow
  // resuming from questionIdx (which may immediately advance the module if
  // nothing else remains).
  //
  // `finalHistory` must be passed explicitly by the caller rather than read
  // from the catHistory STATE here — this function runs synchronously right
  // after `setCatHistory((prev) => [...prev, lastItem])` in the same
  // handleNext call, and that functional update hasn't been applied to this
  // render's `catHistory` binding yet (state updates aren't synchronous).
  // Reading catHistory here would silently drop the scale's LAST item from
  // the snapshot below, which is exactly what made "Indietro" into a just
  // -closed scale always land one item short of the true last one.
  async function finishActiveScaleAndResume(
    finalHistory: Array<{ question: Question; answer: SavedAnswer }>
  ) {
    const mod = modules[moduleIdx];
    if (activeScale && mod) {
      getDoneScalesFor(mod.module.id).add(activeScale);
      console.log('[Nav] scale CLOSED', {
        moduleId: mod.module.id,
        scale: activeScale,
        itemsAnswered: finalHistory.length,
        history: finalHistory.map((h) => ({
          questionCode: h.question.questionCode,
          answer: h.answer,
        })),
      });
      // Snapshot the just-finished scale's Q&A history so it stays navigable
      // (and, before review, editable) instead of vanishing now that it's closed.
      const key = scaleHistoryKey(mod.module.id, activeScale);
      setClosedScaleHistory((prev) => ({
        ...prev,
        [key]: finalHistory.map((h) => ({ question: h.question, answer: h.answer })),
      }));
    }
    setActiveScale(null);
    setCatQuestion(null);
    setCatHistory([]);
    setCatScaleComplete(false);
    const entered = mod ? await activateScaleIfPending(mod, questionIdx) : false;
    // retrace: false — this scale just finished naturally; don't immediately
    // re-show its own gap as a "recap" before moving on to what's next.
    if (!entered) await advanceFixedFlow(questionIdx, answers, false);
  }

  // Advances within a closed scale's browsed history (see viewingClosedScale):
  // moves to its next item, then the next scale sharing the same gap, then —
  // if the current scale was just edited — resumes the LIVE adaptive session
  // (the backend already rebuilt it up to that edit) instead of treating the
  // rest as already resolved, and otherwise resumes the fixed flow.
  async function handleNextInClosedScaleView() {
    if (!viewingClosedScale) return;
    const mod = modules[moduleIdx];
    const scale = viewingClosedScale.stackScales[viewingClosedScale.stackPos];
    const key = scaleHistoryKey(viewingClosedScale.moduleId, scale);
    const items = closedScaleHistory[key] ?? [];
    const nextItemIdx = viewingClosedScale.itemIdx + 1;
    console.log('[Nav] handleNextInClosedScaleView', {
      scale,
      itemIdx: viewingClosedScale.itemIdx,
      itemCount: items.length,
      stackPos: viewingClosedScale.stackPos,
      stackScales: viewingClosedScale.stackScales,
    });

    if (nextItemIdx < items.length) {
      setViewingClosedScale({ ...viewingClosedScale, itemIdx: nextItemIdx });
      return;
    }

    // A scale counts as "reopened" purely by no longer being in doneScalesRef
    // (handleClosedScaleAnswerChange removes it on edit) — never a flag on
    // viewingClosedScale itself, which would leak across stackPos transitions
    // via object spread and misattribute to whichever scale is browsed next.
    const isReopened = mod ? !getDoneScalesFor(mod.module.id).has(scale) : false;
    if (isReopened) {
      console.log('[Nav] scale', scale, 'was reopened — resuming LIVE session');
      setViewingClosedScale(null);
      setCatHistory(
        items.map((it) => ({
          question: it.question,
          answer: it.answer ?? {
            questionId: it.question.questionId,
            answer_text: 'Skipped by patient',
          },
        }))
      );
      setCatQuestion(null);
      setCatScaleComplete(false);
      setActiveScale(scale);
      const result = mod ? await fetchNextCatQuestion() : 'error';
      if (result === 'error') {
        // Genuine failure — do not treat the just-reopened scale as done, or
        // the edit made to it would look "lost" the next time this module is
        // entered (it would be skipped as already-resolved instead of
        // resuming to finish the rebuild). Stop on a hard error screen.
        setPlayerPhase('error');
        return;
      }
      if (result === 'stale') {
        // Superseded by a newer call (e.g. a mount-effect race) — that call
        // owns this state now; don't also advance or mark anything here.
        return;
      }
      if (result === 'done') {
        if (mod) getDoneScalesFor(mod.module.id).add(scale);
        setActiveScale(null);
        await advanceFixedFlow(viewingClosedScale.fixedIdx, answers);
      }
      return;
    }

    const nextStackPos = viewingClosedScale.stackPos + 1;
    if (nextStackPos < viewingClosedScale.stackScales.length) {
      const nextScale = viewingClosedScale.stackScales[nextStackPos];
      if (mod) await fetchScaleHistory(mod, nextScale);
      console.log('[Nav] closed-scale browse: crossing forward into', nextScale);
      setViewingClosedScale({ ...viewingClosedScale, stackPos: nextStackPos, itemIdx: 0 });
      return;
    }

    // Whole CLOSED stack exhausted, none edited. Another scale sharing this
    // same gap could still be genuinely pending (e.g. it was left live and
    // mid-session before the patient navigated all the way back to browse
    // earlier scales) — give it a chance to resume before just landing on the
    // boundary's fixed question.
    const fixedIdx = viewingClosedScale.fixedIdx;
    console.log('[Nav] closed-scale stack exhausted — exiting to fixedIdx', fixedIdx);
    setViewingClosedScale(null);
    setQuestionIdx(fixedIdx);
    await (mod ? activateScaleIfPending(mod, fixedIdx) : Promise.resolve(false));
  }

  // Backs up within a closed scale's browsed history: previous item, then the
  // previous scale sharing the same gap (landing on its last item), then out
  // to the fixed question right before the whole gap (or the previous module).
  async function handlePrevInClosedScaleView() {
    if (!viewingClosedScale) return;
    console.log('[Nav] handlePrevInClosedScaleView', {
      scale: viewingClosedScale.stackScales[viewingClosedScale.stackPos],
      itemIdx: viewingClosedScale.itemIdx,
      stackPos: viewingClosedScale.stackPos,
    });
    if (viewingClosedScale.itemIdx > 0) {
      setViewingClosedScale({ ...viewingClosedScale, itemIdx: viewingClosedScale.itemIdx - 1 });
      return;
    }

    if (viewingClosedScale.stackPos > 0) {
      const mod = modules[moduleIdx];
      const prevStackPos = viewingClosedScale.stackPos - 1;
      const prevScale = viewingClosedScale.stackScales[prevStackPos];
      const history = mod ? await fetchScaleHistory(mod, prevScale) : [];
      console.log('[Nav] closed-scale browse: crossing backward into', prevScale);
      setViewingClosedScale({
        ...viewingClosedScale,
        stackPos: prevStackPos,
        itemIdx: Math.max(0, history.length - 1),
      });
      return;
    }

    const fixedIdx = viewingClosedScale.fixedIdx;
    console.log(
      '[Nav] closed-scale stack exhausted (backward) — exiting before fixedIdx',
      fixedIdx
    );
    setViewingClosedScale(null);
    if (fixedIdx > 0) {
      setQuestionIdx(fixedIdx - 1);
      return;
    }
    // Gap sat at the very start of the module — fall back to the previous
    // module with something to land on, same rule handlePrev's fixed branch uses.
    let mi = moduleIdx - 1;
    while (mi >= 0 && modules[mi].module.type === 'dynamic' && modules[mi].questions.length === 0)
      mi--;
    if (mi >= 0) {
      setModuleIdx(mi);
      setQuestionIdx(Math.max(0, modules[mi].questions.length - 1));
    }
  }

  // Saves an edit to a question inside a closed scale's browsed history —
  // reopens the scale (removed from doneScalesRef, which is what
  // handleNextInClosedScaleView checks to know a live resume is needed) and
  // truncates its cached history at this item, since the backend deletes and
  // rebuilds everything from here forward.
  // Edit to a question inside a closed scale's browsed history. The selection shows
  // immediately; the heavy part is deferred (see scheduleSave) so arrowing through the
  // options triggers at most ONE rebuild: save, reopen the scale (removed from
  // doneScalesRef, which is what handleNextInClosedScaleView checks to know a live
  // resume is needed) and truncate its cached history at this item, since the backend
  // deletes and rebuilds everything from here forward.
  function handleClosedScaleAnswerChange(ans: SavedAnswer) {
    if (!viewingClosedScale) return;
    const view = viewingClosedScale;
    const mod = modules[moduleIdx];
    const baseline = saveBaseline(ans.questionId);
    setCurrentAnswer(ans);
    scheduleSave(ans.questionId, baseline, async () => {
      // Settling back on the saved answer (or re-clicking it while just browsing)
      // must not reopen the scale — only an ACTUAL change triggers the rebuild.
      if (isSameAnswer(baseline, ans)) {
        console.log('[Nav] closed-scale answer: unchanged, ignoring', ans);
        return true;
      }
      const scale = view.stackScales[view.stackPos];
      console.log('[Nav] EDITING closed-scale answer — reopening scale', {
        scale,
        itemIdx: view.itemIdx,
        previousAnswer: baseline,
        newAnswer: ans,
      });
      if (!(await saveAnswer(ans))) return false;
      if (mod) getDoneScalesFor(mod.module.id).delete(scale);
      const key = scaleHistoryKey(view.moduleId, scale);
      setClosedScaleHistory((prev) => {
        const items = prev[key] ?? [];
        const truncated = items.slice(0, view.itemIdx + 1);
        if (truncated.length > 0) {
          truncated[truncated.length - 1] = { ...truncated[truncated.length - 1], answer: ans };
        }
        return { ...prev, [key]: truncated };
      });
      return true;
    });
  }


  async function handleNext() {
    if (saving || completing || navBusyRef.current) return;
    navBusyRef.current = true;
    try {
      if (await flushThenDeferNav('next')) return;
      await handleNextImpl();
    } finally {
      navBusyRef.current = false;
    }
  }

  async function handleNextImpl() {
    logNav('handleNext', { currentQuestionCode: currentQuestion?.questionCode });
    if (viewingClosedScale) {
      await handleNextInClosedScaleView();
      return;
    }
    if (isCat) {
      if (!catQuestion) return;
      // A CAT question is skippable just like a fixed one — auto-save a "Skipped
      // by patient" marker (plain answer_text, never an answer_option_id) when the
      // patient advances without answering, so the external CAT session is never
      // sent a fabricated response value: saveResponses only calls setResponse
      // when the saved response actually resolves a real answer_option value.
      const answerToSave: SavedAnswer = currentAnswer ?? {
        questionId: catQuestion.questionId,
        answer_text: 'Skipped by patient',
      };
      if (!currentAnswer) setCurrentAnswer(answerToSave);
      console.log('[Nav] answering CAT question', {
        questionCode: catQuestion.questionCode,
        answer: answerToSave,
        wasSkipped: !currentAnswer,
      });
      // Push current question+answer onto history before advancing. Computed
      // as a plain array (not just via the setCatHistory updater) so it can
      // be passed straight to finishActiveScaleAndResume below without
      // waiting on a re-render — see that function's comment.
      const updatedHistory = [...catHistory, { question: catQuestion, answer: answerToSave }];
      // Only record the item as answered once the answer is really saved — on a
      // failure stay on this question (inline alert), Next retries.
      if (!(await saveAnswer(answerToSave))) return;
      setCatHistory(updatedHistory);
      // Always ask the backend for what's next, even when catScaleComplete was
      // already true from the PREVIOUS next-question response — that flag only
      // means "the item just answered was this scale's last one, PROVIDED it
      // gets answered"; it is intentionally never persisted as done server-side
      // until the answer actually exists (see catController.ts), specifically so
      // a reload before answering that last item re-serves it instead of
      // silently treating it as skipped. This call is what lets the backend
      // observe the answer we just saved and mark the scale genuinely complete.
      const result = await fetchNextCatQuestion();
      if (result === 'error') {
        // Genuine failure fetching the next item of a scale that's NOT done
        // yet — must never be treated as "done" (that would wrongly close
        // out a scale still mid-way through). Stop on a hard error screen;
        // the answer just given is already saved, so a retry resumes cleanly.
        setPlayerPhase('error');
        return;
      }
      if (result === 'stale') {
        // Superseded by a newer call — it owns activeScale/catQuestion now;
        // don't also finish/advance from this (superseded) chain.
        return;
      }
      if (result === 'done') {
        // The answer just saved completed this scale (the normal case once
        // catScaleComplete was true) — or, defensively, the server says done
        // even though more was expected. Either way, hand control to the
        // merged flow: another scale queued here, a fixed question, or the
        // next module.
        await finishActiveScaleAndResume(updatedHistory);
      }
    } else {
      // Build a local snapshot of answers including the current one, so we can
      // correctly evaluate skip logic for subsequent questions in this same pass.
      const pendingAnswers = { ...answers };

      if (currentQuestion && currentAnswer) {
        if (!(await saveAnswer(currentAnswer))) return;
        pendingAnswers[currentQuestion.questionId] = currentAnswer;
      } else if (
        currentQuestion &&
        (currentQuestion.questionKind === 'static' ||
          currentQuestion.questionKind === 'socio-demo' ||
          currentQuestion.questionKind === 'feedback' ||
          // 'cat'-kind here is necessarily a FIXED question (a dynamic module's
          // genuinely-adaptive currentQuestion only exists while isCat is true,
          // which takes the isCat branch above, never this one).
          currentQuestion.questionKind === 'cat') &&
        !currentAnswer
      ) {
        // Auto-save "Skipped by patient" when the patient advances without answering
        const skipAnswer = buildSkipAnswer(currentQuestion, 'skipped by patient');
        setCurrentAnswer(skipAnswer);
        if (!(await saveAnswer(skipAnswer))) return;
        pendingAnswers[currentQuestion.questionId] = skipAnswer;
      }

      // Handle WISP companion (the question immediately after with the same parent+condition)
      const wispCompanion = currentQuestion
        ? getWispCompanion(currentQuestion, staticQuestions)
        : null;
      if (wispCompanion) {
        const cAns = pendingAnswers[wispCompanion.questionId];
        const cHasContent =
          !!cAns?.answer_option_id ||
          (cAns?.answer_text !== undefined && cAns.answer_text.trim().length > 0);
        if (cHasContent) {
          // Companion was answered inline – persist it
          if (!(await saveAnswer(cAns))) return;
          pendingAnswers[wispCompanion.questionId] = cAns;
        } else if (isQuestionVisible(wispCompanion, staticQuestions, pendingAnswers)) {
          // Companion was visible but unanswered – skip by patient
          const skipAns = buildSkipAnswer(wispCompanion, 'skipped by patient');
          setCurrentAnswer(skipAns);
          if (!(await saveAnswer(skipAns))) return;
          pendingAnswers[wispCompanion.questionId] = skipAns;
        } else {
          // Companion not visible (main was skipped) – skip by system
          const sysAns = buildSkipAnswer(wispCompanion, 'skipped by system');
          setAnswers((prev) => ({ ...prev, [wispCompanion.questionId]: sysAns }));
          if (!(await saveAnswer(sysAns))) return;
          pendingAnswers[wispCompanion.questionId] = sysAns;
        }
      }

      // Scan forward to find the next VISIBLE question (skipping over the
      // companion, already handled above) — or, if none remain, enter a
      // pending adaptive scale positioned before the end of the module, or
      // advance to the next module.
      const scanStart = wispCompanion ? questionIdx + 2 : questionIdx + 1;
      await advanceFixedFlow(scanStart, pendingAnswers);
    }
  }

  async function handlePrevCat() {
    // Re-entrancy is guarded by the caller (handlePrev's navBusyRef wrapper,
    // which awaits this directly) — no separate lock needed here.
    if (catHistory.length === 0) return;
    const mod = modules[moduleIdx];
    if (!mod) return;

    // Capture current question so we can restore it on error
    const currentCatQuestion = catQuestion;
    const currentCatScaleComplete = catScaleComplete;
    // Grab the previous entry before any state updates
    const prevEntry = catHistory[catHistory.length - 1];
    console.log('[Nav] handlePrevCat: rewinding to', {
      scale: activeScale,
      rewindingFrom: currentCatQuestion?.questionCode,
      rewindingTo: prevEntry.question.questionCode,
      remainingHistoryAfter: catHistory.length - 1,
    });

    // Immediately restore the UI from local history for responsiveness
    setCatHistory((prev) => prev.slice(0, -1));
    setCatQuestion(prevEntry.question);
    // The backend unconditionally resets is_completed to false when rebuilding
    // the session after a rewind (the removed response was what would have
    // completed it) — mirror that here. Without this, a stale
    // catScaleComplete:true left over from the item we just backed out of would
    // make the NEXT "Next" click treat this scale as already finished and skip
    // straight past it instead of re-entering it (the exact bug this fixes).
    setCatScaleComplete(false);

    // Block further Prev/Next until the backend finishes rebuilding the session.
    // recreateSession involves multiple sequential API calls to the EORTC service
    // and can take several seconds. Without this guard, a second Prev click would
    // fire a concurrent backend call that reads the same DB state and deletes the
    // wrong response.
    setSaving(true);
    try {
      await axios.post(`/euonqol-api/public/link/${link}/modules/${mod.module.id}/prev-question`, {
        assignment_id: assignmentId,
        language_id: languageId,
        // Tell the backend exactly which scale this is — far more reliable
        // than having it guess from "the most recently saved CAT response
        // across the whole item bank", which breaks once scales can be
        // revisited/edited out of chronological order (see catController).
        scale: activeScale,
      });
    } catch (err: any) {
      // Log the exact backend error message for debugging
      console.error('[CAT Prev] Backend error:', err?.response?.data ?? err?.message ?? err);
      // Roll back the local state changes so the user stays on the current question
      setCatHistory((prev) => [...prev, prevEntry]);
      setCatQuestion(currentCatQuestion);
      setCatScaleComplete(currentCatScaleComplete);
      setError(t.errorLoadCat);
    } finally {
      setSaving(false);
    }
  }

  // A CLOSED scale sitting in the gap right before `idx` must stay navigable —
  // enters its (position-ordered) history at the last item of the last scale
  // in that gap, instead of jumping straight past it to whatever fixed
  // question (or live scale) sat before the whole gap. Shared by both places
  // Prev can land right after such a gap: backing out of a fixed question,
  // AND backing out of a LIVE scale that hasn't been answered yet — the two
  // scales can share the exact same gap (e.g. scale A closes, scale B starts
  // immediately after with nothing fixed in between; leaving B with no
  // history yet must still surface A, not skip straight past it).
  async function tryEnterClosedScaleGap(mod: Module, idx: number): Promise<boolean> {
    const gapScales = getDoneScalesInGap(mod, idx, getDoneScalesFor(mod.module.id));
    console.log('[Nav] tryEnterClosedScaleGap (backward)', {
      moduleId: mod.module.id,
      idx,
      gapScales,
    });
    if (gapScales.length === 0) return false;
    const lastScale = gapScales[gapScales.length - 1];
    const history = await fetchScaleHistory(mod, lastScale);
    if (history.length === 0) return false;
    console.log('[Nav] entering closed scale (backward), landing on last item', {
      scale: lastScale,
      itemIdx: history.length - 1,
      questionCode: history[history.length - 1]?.question.questionCode,
    });
    setViewingClosedScale({
      moduleId: mod.module.id,
      fixedIdx: idx,
      stackScales: gapScales,
      stackPos: gapScales.length - 1,
      itemIdx: history.length - 1,
    });
    return true;
  }

  // Forward counterpart of tryEnterClosedScaleGap — used by advanceFixedFlow
  // when walking forward through the fixed-question flow reaches a gap whose
  // scales are already closed (i.e. we're retracing territory a backward
  // excursion already visited): enters at the FIRST item of the FIRST scale
  // in the gap, since we're approaching it from before rather than after.
  async function tryEnterClosedScaleGapForward(mod: Module, idx: number): Promise<boolean> {
    const gapScales = getDoneScalesInGap(mod, idx, getDoneScalesFor(mod.module.id));
    console.log('[Nav] tryEnterClosedScaleGapForward', { moduleId: mod.module.id, idx, gapScales });
    if (gapScales.length === 0) return false;
    const firstScale = gapScales[0];
    const history = await fetchScaleHistory(mod, firstScale);
    if (history.length === 0) return false;
    console.log('[Nav] entering closed scale (forward), landing on first item', {
      scale: firstScale,
      questionCode: history[0]?.question.questionCode,
    });
    setViewingClosedScale({
      moduleId: mod.module.id,
      fixedIdx: idx,
      stackScales: gapScales,
      stackPos: 0,
      itemIdx: 0,
    });
    return true;
  }

  async function handlePrev() {
    if (saving || navBusyRef.current) return;
    navBusyRef.current = true;
    try {
      if (await flushThenDeferNav('prev')) return;
      await handlePrevImpl();
    } finally {
      navBusyRef.current = false;
    }
  }

  async function handlePrevImpl() {
    logNav('handlePrev', { currentQuestionCode: currentQuestion?.questionCode });
    if (viewingClosedScale) {
      await handlePrevInClosedScaleView();
      return;
    }
    if (isCat) {
      if (catHistory.length > 0) {
        // Awaited (not fire-and-forget) so it stays inside handlePrev's
        // navBusyRef lock for its whole duration — recreateSession can take
        // several seconds, and a second Prev/Next click landing mid-rewind
        // would race it otherwise.
        await handlePrevCat();
        return;
      }
      // No CAT history yet in this scale — back out of the adaptive phase.
      setActiveScale(null);
      setCatQuestion(null);
      setCatScaleComplete(false);
      // A closed scale sharing this same gap must surface first (see
      // tryEnterClosedScaleGap); only once there's none does this fall back
      // to the fixed question right before the insertion slot, if there is one.
      const mod = modules[moduleIdx];
      if (mod && (await tryEnterClosedScaleGap(mod, questionIdx))) return;
      if (questionIdx > 0) {
        setQuestionIdx(questionIdx - 1);
        return;
      }
      // The scale sat at the very start of the module — fall through to the
      // cross-module lookback below, same as the fixed-question branch.
    } else {
      const mod = modules[moduleIdx];
      if (mod && (await tryEnterClosedScaleGap(mod, questionIdx))) return;
      if (isFirstQuestion) return;
      // Find the previous VISIBLE NON-COMPANION question in the current module
      for (let i = questionIdx - 1; i >= 0; i--) {
        const q = staticQuestions[i];
        if (isWispCompanion(q, staticQuestions)) continue; // companions are not standalone screens
        if (isQuestionVisible(q, staticQuestions, answers)) {
          setQuestionIdx(i);
          return;
        }
      }
    }
    // No visible question before us in this module – go to the previous module that
    // has something to show (a static module, or a dynamic one with fixed questions
    // — a fully-adaptive dynamic module has nothing to land on, so it's skipped).
    let mi = moduleIdx - 1;
    while (mi >= 0 && modules[mi].module.type === 'dynamic' && modules[mi].questions.length === 0)
      mi--;
    if (mi >= 0) {
      setModuleIdx(mi);
      const prevQuestions = modules[mi].questions;
      // Go to the last visible NON-COMPANION question in that module
      for (let i = prevQuestions.length - 1; i >= 0; i--) {
        const q = prevQuestions[i];
        if (isWispCompanion(q, prevQuestions)) continue;
        if (isQuestionVisible(q, prevQuestions, answers)) {
          setQuestionIdx(i);
          return;
        }
      }
      setQuestionIdx(prevQuestions.length - 1); // fallback
    }
  }

  async function handleSubmit() {
    // Every review edit must be persisted before completing — a failed one blocks
    // submit (inline alert) and is retried on the next attempt.
    if (!(await flushPendingSave())) return;
    setCompleting(true);
    try {
      await axios.post(`/euonqol-api/public/link/${link}/complete`, {
        assignment_id: assignmentId,
      });
      onComplete();
    } catch (err: any) {
      setError(err.response?.data?.message ?? t.errorComplete);
      setPlayerPhase('error');
    } finally {
      setCompleting(false);
    }
  }

  // Leaving a review question persists its deferred edit right away.
  function goToReviewQuestion(q: Question) {
    void flushPendingSave();
    setReviewQuestion(q);
  }

  function enterReview() {
    // Start review on the first question that's actually visible given current
    // answers — a dynamic module's fixed questions (if any) are eligible here
    // too; a fully-adaptive module contributes an empty questions array.
    for (const mod of modules) {
      for (const q of mod.questions) {
        if (isQuestionVisible(q, mod.questions, answers)) {
          setReviewQuestion(q);
          setPlayerPhase('review');
          return;
        }
      }
    }
    setReviewQuestion(null);
    setPlayerPhase('review');
  }

  //  Loading
  if (playerPhase === 'loading') {
    return (
      <main className="flex items-center justify-center min-h-screen bg-[#F5F5F5]">
        <LoadingStatus label={t.loading} size="lg" />
      </main>
    );
  }

  if (playerPhase === 'error') {
    return (
      <main className="flex items-center justify-center min-h-screen bg-[#F5F5F5]">
        <p role="alert" className="text-red-700 text-center px-6">
          {error}
        </p>
      </main>
    );
  }

  //  Review prompt
  if (playerPhase === 'review-prompt') {
    return (
      <main className="min-h-screen bg-[#F5F5F5] flex flex-col">
        <div className="flex justify-end p-4">
          <img
            src={EUonQoLLogo}
            alt="EUonQoL"
            width={233}
            height={140}
            className="h-10 w-auto object-contain"
          />
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-6 gap-8">
          <div className="text-center">
            <h1
              ref={setFocusTarget}
              tabIndex={-1}
              className="text-3xl font-bold text-gray-900 mb-4 outline-none"
            >
              {t.reviewPromptTitle}
            </h1>
            <p className="text-gray-700 text-lg max-w-md">{t.reviewPromptDescription}</p>
          </div>
          <div className="flex flex-wrap justify-center gap-6">
            <button
              type="button"
              onClick={enterReview}
              className={`px-8 py-3 rounded-full bg-primary text-white font-semibold hover:opacity-90 transition-opacity motion-reduce:transition-none ${focusRing}`}
            >
              {t.yesReview}
            </button>
            <button
              type="button"
              disabled={completing}
              aria-busy={completing || undefined}
              onClick={handleSubmit}
              className={`px-8 py-3 rounded-full bg-primary text-white font-semibold hover:opacity-90 transition-opacity motion-reduce:transition-none disabled:opacity-40 ${focusRing}`}
            >
              {completing ? t.submitting : t.noSubmit}
            </button>
          </div>
        </div>
      </main>
    );
  }

  //  Review screen
  if (playerPhase === 'review') {
    // Flattened, in-order list of every reviewable question across all modules –
    // used for the mobile prev/next arrows (which step linearly across module
    // boundaries instead of jumping via the desktop sidebar). Each module's
    // fixed and adaptive questions appear in the same order the patient
    // actually answered them (see getModuleReviewOrder) — adaptive ones are
    // read-only (see isAdaptiveReviewQuestion). WISP companions are excluded
    // here – they're not standalone navigation targets, they render stacked
    // underneath their main question (see renderQuestionBody).
    const flatReviewQuestions = modules.flatMap((m) =>
      getModuleReviewOrder(m).map((it) => it.question)
    );
    const flatReviewIdx = flatReviewQuestions.findIndex(
      (q) => q.questionId === reviewQuestion?.questionId
    );

    // Shared module/question accordion – used as the permanent desktop sidebar
    // and inside the mobile slide-in drawer. `closeOnSelect` closes the drawer
    // after picking a question (irrelevant on desktop, where it's always open).
    function renderSidebarContent(closeOnSelect: boolean) {
      // Shared row renderer for both fixed (editable) and adaptive (read-only)
      // reviewable questions. Adaptive rows carry no "CAT" label — they're
      // distinguished purely by a muted gray styling, never the green
      // answered/selected colors used for editable ones.
      function renderRow(q: Question, isAdaptive: boolean) {
        const isAnswered = !!answers[q.questionId];
        const isSelected = reviewQuestion?.questionId === q.questionId;
        return (
          <li key={q.questionId}>
            <button
              type="button"
              aria-current={isSelected ? 'true' : undefined}
              onClick={() => {
                goToReviewQuestion(q);
                if (closeOnSelect) setReviewMobileSidebarOpen(false);
              }}
              className={`w-full text-left px-3 py-2 rounded-lg text-xs flex items-center gap-1.5 transition-colors motion-reduce:transition-none ${focusRing} ${
                isAdaptive
                  ? isSelected
                    ? 'bg-gray-200 text-gray-700 font-medium'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  : isSelected
                    ? 'bg-[#c8e6c9] text-gray-800 font-medium'
                    : isAnswered
                      ? 'bg-[#e8f5e9] text-gray-700 hover:bg-[#c8e6c9]'
                      : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <span className="line-clamp-1 flex-1">
                {q.questionText.slice(0, 35)}
                {q.questionText.length > 35 ? '…' : ''}
              </span>
              {/* Answered/read-only state is conveyed by color above — spell it out
                  for screen readers too (WCAG 1.4.1). */}
              <span className="sr-only">
                {' – '}
                {isAdaptive ? t.readOnly : isAnswered ? t.answered : t.notAnswered}
              </span>
              <ChevronRight aria-hidden="true" className="w-3 h-3 shrink-0 text-gray-600" />
            </button>
          </li>
        );
      }

      return (
        <>
          {modules.map((mod) => {
            // Fixed + adaptive items in the order the patient actually
            // answered them (see getModuleReviewOrder) — WISP companions and
            // system-hidden fixed questions already excluded there.
            const orderedItems = getModuleReviewOrder(mod);
            if (orderedItems.length === 0) return null;

            const total = orderedItems.length;
            const answered = orderedItems.filter(
              (it) => it.isAdaptive || !!answers[it.question.questionId]
            ).length;
            const isOpen = reviewExpanded[mod.module.id] ?? false;
            const listId = `review-module-${mod.module.id}${closeOnSelect ? '-drawer' : ''}`;

            return (
              <div key={mod.module.id} className="mb-2">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={listId}
                  onClick={() =>
                    setReviewExpanded((prev) => ({ ...prev, [mod.module.id]: !isOpen }))
                  }
                  className={`w-full flex items-center justify-end px-3 py-2 rounded-lg hover:bg-gray-50 text-sm text-gray-700 border border-gray-300 ${focusRing}`}
                >
                  {/* Visually the header only shows the answered count; the module
                      name gives the toggle a meaningful accessible name. */}
                  <span className="sr-only">{mod.module.name}: </span>
                  <span className="flex items-center gap-1 text-xs text-gray-600 shrink-0">
                    {answered}/{total}
                    <ChevronDown
                      aria-hidden="true"
                      className={`w-3 h-3 transition-transform motion-reduce:transition-none ${isOpen ? 'rotate-180' : ''}`}
                    />
                  </span>
                </button>
                {isOpen && (
                  <ul id={listId} className="mt-1 flex flex-col gap-0.5 pl-1">
                    {orderedItems.map((it) => renderRow(it.question, it.isAdaptive))}
                  </ul>
                )}
              </div>
            );
          })}
        </>
      );
    }

    function renderQuestionBody(scrollable: boolean) {
      if (!reviewQuestion) return null;

      // A genuinely-adaptive question is visible here but never editable —
      // the CAT session behind it is either closed or would need to replay
      // through the external engine to accept an edit, which review isn't
      // meant to trigger. WISP companions don't apply to it either (that
      // pairing only exists between FIXED questions).
      const readOnly = isAdaptiveReviewQuestion(reviewQuestion);

      // WISP companion: stacked underneath the main question, same as the answering
      // phase – shown once the main question has a real answer.
      const reviewModule = modules.find((m) =>
        m.questions.some((q) => q.questionId === reviewQuestion.questionId)
      );
      const reviewCompanion =
        reviewModule && !readOnly ? getWispCompanion(reviewQuestion, reviewModule.questions) : null;
      const reviewAnswer = answers[reviewQuestion.questionId];
      const reviewHasAnswerContent =
        !!reviewAnswer?.answer_option_id ||
        !!reviewAnswer?.socio_demo_answer_id ||
        !!reviewAnswer?.feedback_answer_id ||
        (reviewAnswer?.answer_text !== undefined && reviewAnswer.answer_text.trim().length > 0);
      const reviewCompanionTriggered = reviewCompanion != null && reviewHasAnswerContent;
      const reviewTextId = `review-question-text-${reviewQuestion.questionId}`;

      return (
        <div
          className={`w-full max-w-2xl flex flex-col ${scrollable ? '' : 'min-h-0 overflow-y-auto'}`}
        >
          {reviewQuestion.questionHead && (
            <h2 className="text-2xl font-bold text-gray-900 mb-3 shrink-0">
              <RichText html={reviewQuestion.questionHead} />
            </h2>
          )}
          <p id={reviewTextId} className="text-gray-700 text-lg mb-6 leading-relaxed shrink-0">
            <RichText html={reviewQuestion.questionText} />
          </p>
          {readOnly && <p className="sr-only">{t.readOnly}</p>}
          {(reviewQuestion.answerOptions.length > 0 || reviewQuestion.questionType === 'text') && (
            <AnswerOptions
              question={reviewQuestion}
              value={answers[reviewQuestion.questionId]}
              onChange={
                readOnly
                  ? () => {}
                  : (ans) => handleReviewAnswerChange(ans, reviewQuestion)
              }
              // Not disabled while saving: disabling the focused option drops
              // keyboard focus to <body> after every change (WCAG 2.4.3).
              disabled={readOnly}
              t={t}
              labelledBy={reviewTextId}
            />
          )}

          {/* WISP companion: shown inline once the main question is answered */}
          {reviewCompanionTriggered && reviewCompanion && (
            <div className="mt-8 pt-6 border-t border-gray-200 shrink-0">
              {reviewCompanion.questionHead && (
                <h3 className="text-xl font-semibold text-gray-800 mb-3">
                  <RichText html={reviewCompanion.questionHead} />
                </h3>
              )}
              {reviewCompanion.questionPramble && (
                <div className="mb-4 px-4 py-3 rounded-lg bg-primary/5">
                  <p className="text-gray-800 text-base leading-relaxed font-medium">
                    <RichText html={reviewCompanion.questionPramble} />
                  </p>
                </div>
              )}
              {reviewCompanion.questionText && (
                <p
                  id={`review-question-text-${reviewCompanion.questionId}`}
                  className="text-gray-700 text-base mb-6 leading-relaxed"
                >
                  <RichText html={reviewCompanion.questionText} />
                </p>
              )}
              <AnswerOptions
                question={reviewCompanion}
                value={answers[reviewCompanion.questionId]}
                onChange={(ans) => handleReviewAnswerChange(ans, reviewCompanion)}
                disabled={false}
                t={t}
                labelledBy={`review-question-text-${reviewCompanion.questionId}`}
              />
            </div>
          )}
        </div>
      );
    }

    const submitButtonClass = `px-5 py-2 rounded-full bg-secondary text-black font-semibold hover:opacity-90 transition-opacity motion-reduce:transition-none disabled:opacity-40 ${focusRing}`;

    return (
      <main className="h-dvh bg-[#F5F5F5] flex flex-col overflow-hidden">
        <h1 className="sr-only">{t.reviewSidebarTitle}</h1>
        <div className="flex justify-end p-4 shrink-0">
          <img
            src={EUonQoLLogo}
            alt="EUonQoL"
            width={233}
            height={140}
            className="h-10 w-auto object-contain"
          />
        </div>

        {/* Mobile layout: toggleable sidebar drawer, centered arrow nav, scrollable body, sticky submit */}
        {!isReviewDesktop && (
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden px-4">
            <div className="flex items-center justify-between pb-3 shrink-0">
              {/* Slide-in sidebar drawer — Radix dialog: focus trap, Escape, focus return. */}
              <Sheet open={reviewMobileSidebarOpen} onOpenChange={setReviewMobileSidebarOpen}>
                <SheetTrigger asChild>
                  <button
                    type="button"
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 ${focusRing}`}
                  >
                    <Menu aria-hidden="true" className="w-4 h-4" />
                    {t.reviewSidebarTitle}
                  </button>
                </SheetTrigger>
                <SheetContent
                  side="left"
                  showCloseButton={false}
                  aria-describedby={undefined}
                  className="w-72 max-w-[85%] bg-white overflow-y-auto p-4 gap-0"
                >
                  <div className="flex items-center justify-between mb-4">
                    <SheetTitle className="font-bold text-primary text-lg">
                      {t.reviewSidebarTitle}
                    </SheetTitle>
                    <button
                      type="button"
                      onClick={() => setReviewMobileSidebarOpen(false)}
                      aria-label={t.close}
                      className={`p-1 rounded-lg hover:bg-gray-100 ${focusRing}`}
                    >
                      <X aria-hidden="true" className="w-5 h-5 text-gray-600" />
                    </button>
                  </div>
                  {renderSidebarContent(true)}
                </SheetContent>
              </Sheet>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={flatReviewIdx <= 0}
                  onClick={() => goToReviewQuestion(flatReviewQuestions[flatReviewIdx - 1])}
                  aria-label={t.prev}
                  title={t.prev}
                  className={`shrink-0 w-9 h-9 flex items-center justify-center rounded-full bg-primary text-white disabled:opacity-30 ${focusRing}`}
                >
                  <ChevronLeft aria-hidden="true" className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  disabled={flatReviewIdx === -1 || flatReviewIdx >= flatReviewQuestions.length - 1}
                  onClick={() => goToReviewQuestion(flatReviewQuestions[flatReviewIdx + 1])}
                  aria-label={t.next}
                  title={t.next}
                  className={`shrink-0 w-9 h-9 flex items-center justify-center rounded-full bg-primary text-white disabled:opacity-30 ${focusRing}`}
                >
                  <ChevronRight aria-hidden="true" className="w-4 h-4" />
                </button>
              </div>
            </div>
            {/* The arrows keep focus, so announce which question is now shown (WCAG 4.1.3). */}
            <p aria-live="polite" className="sr-only">
              {flatReviewIdx >= 0 && `${flatReviewIdx + 1} / ${flatReviewQuestions.length}`}
            </p>

            <div className="flex-1 min-h-0 overflow-y-auto pb-4">{renderQuestionBody(true)}</div>

            {/* Centered so it never sits under the accessibility widget (bottom corner). */}
            <div className="pt-3 pb-4 flex flex-col items-center gap-2 shrink-0">
              {saveError && (
                <p role="alert" className="text-sm text-red-700 text-center">
                  {saveError}
                </p>
              )}
              <button
                type="button"
                disabled={completing}
                aria-busy={completing || undefined}
                onClick={handleSubmit}
                className={submitButtonClass}
              >
                {completing ? t.submitting : t.submit}
              </button>
            </div>
          </div>
        )}

        {/* Desktop layout: fixed sidebar + detail panel (scrolls only if content overflows, e.g. zoom) */}
        {isReviewDesktop && (
          <div className="flex flex-1 min-h-0 overflow-hidden">
            {/* Sidebar */}
            <nav
              aria-labelledby="review-sidebar-title"
              className="w-64 shrink-0 min-h-0 bg-white border-r border-gray-200 overflow-y-auto p-4"
            >
              <h2 id="review-sidebar-title" className="font-bold text-primary text-lg mb-4">
                {t.reviewSidebarTitle}
              </h2>
              {renderSidebarContent(false)}
            </nav>

            {/* Question detail */}
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden px-10 py-6">
              {renderQuestionBody(false)}
              {/* Centered so it never sits under the accessibility widget (bottom corner). */}
              <div className="mt-auto pt-6 flex flex-col items-center gap-2 shrink-0">
                {saveError && (
                  <p role="alert" className="text-sm text-red-700 text-center">
                    {saveError}
                  </p>
                )}
                <button
                  type="button"
                  disabled={completing}
                  aria-busy={completing || undefined}
                  onClick={handleSubmit}
                  className={submitButtonClass}
                >
                  {completing ? t.submitting : t.submit}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    );
  }

  //  Answering
  // Next adaptive item still loading: show a status instead of a blank page (WCAG 4.1.3).
  if (!currentQuestion) {
    return (
      <main className="flex items-center justify-center min-h-screen bg-[#F5F5F5]">
        <LoadingStatus label={t.loading} size="lg" />
      </main>
    );
  }

  const questionTextId = `question-text-${currentQuestion.questionId}`;
  const preambleId = `question-preamble-${currentQuestion.questionId}`;
  // The question text names the answer group; a text-less question falls back to its preamble.
  const answerLabelId = currentQuestion.questionText ? questionTextId : preambleId;
  // Focus lands on whatever is read first: the preamble when present, else the question
  // text, else (neither) the question area itself.
  const focusTarget = currentQuestion.questionPramble
    ? 'preamble'
    : currentQuestion.questionText
      ? 'text'
      : 'area';
  const companionTextId = companion ? `question-text-${companion.questionId}` : '';

  const navButtonClass = `flex items-center justify-center px-6 py-2 rounded-full bg-primary text-white font-semibold disabled:opacity-30 hover:opacity-90 transition-opacity motion-reduce:transition-none ${focusRing}`;

  return (
    <main className="min-h-screen bg-[#F5F5F5] flex flex-col">
      {/* Logo */}
      <div className="flex justify-end p-4">
        <img
            src={EUonQoLLogo}
            alt="EUonQoL"
            width={233}
            height={140}
            className="h-10 w-auto object-contain"
          />
      </div>

      {/* Question area */}
      <div className="flex-1 flex flex-col justify-center items-center px-6 py-8">
        <div
          ref={focusTarget === 'area' ? setFocusTarget : undefined}
          tabIndex={focusTarget === 'area' ? -1 : undefined}
          className="w-full max-w-2xl outline-none"
        >
          {currentQuestion.questionPramble && (
            <div
              id={preambleId}
              ref={focusTarget === 'preamble' ? setFocusTarget : undefined}
              tabIndex={focusTarget === 'preamble' ? -1 : undefined}
              className="mb-4 px-4 py-3 rounded-lg bg-primary/5 outline-none"
            >
              <p className="text-gray-800 text-base leading-relaxed font-medium">
                <RichText html={currentQuestion.questionPramble} />
              </p>
            </div>
          )}
          {currentQuestion.questionText && (
            <h1
              id={questionTextId}
              ref={focusTarget === 'text' ? setFocusTarget : undefined}
              tabIndex={focusTarget === 'text' ? -1 : undefined}
              className="text-gray-700 text-lg font-normal mb-8 leading-relaxed outline-none"
            >
              <RichText html={currentQuestion.questionText} />
            </h1>
          )}
          {!isDisclaimer && (
            <AnswerOptions
              question={currentQuestion}
              value={currentAnswer}
              onChange={viewingClosedScale ? handleClosedScaleAnswerChange : setCurrentAnswer}
              // A closed scale saves on every change: keep its options enabled so
              // the focused one isn't disabled mid-interaction (WCAG 2.4.3).
              disabled={saving && !viewingClosedScale}
              t={t}
              labelledBy={answerLabelId}
            />
          )}

          {/* WISP companion: shown inline once the main question is answered */}
          {companionTriggered && companion && (
            <div className="mt-8 pt-6 border-t border-gray-200">
              {companion.questionHead && (
                <h2 className="text-xl font-semibold text-gray-800 mb-3">
                  <RichText html={companion.questionHead} />
                </h2>
              )}
              {companion.questionPramble && (
                <div className="mb-4 px-4 py-3 rounded-lg bg-primary/5">
                  <p className="text-gray-800 text-base leading-relaxed font-medium">
                    <RichText html={companion.questionPramble} />
                  </p>
                </div>
              )}
              {companion.questionText && (
                <p id={companionTextId} className="text-gray-700 text-base mb-6 leading-relaxed">
                  <RichText html={companion.questionText} />
                </p>
              )}
              <AnswerOptions
                question={companion}
                value={answers[companion.questionId]}
                onChange={(ans) => setAnswers((prev) => ({ ...prev, [ans.questionId]: ans }))}
                disabled={saving}
                t={t}
                labelledBy={companionTextId}
              />
            </div>
          )}
        </div>
      </div>

      {/* Nav + progress bar */}
      <div className="w-full max-w-2xl mx-auto px-6 pb-10 flex flex-col gap-4">
        {saveError && (
          <p role="alert" className="text-sm text-red-700 text-center">
            {saveError}
          </p>
        )}
        <div className="flex justify-center gap-6">
          {(!isCat || catHistory.length > 0 || questionIdx > 0 || moduleIdx > 0) && (
            <button
              type="button"
              onClick={handlePrev}
              disabled={
                (isCat
                  ? catHistory.length === 0 && questionIdx === 0 && moduleIdx === 0
                  : isFirstQuestion) || saving
              }
              aria-label={t.prev}
              title={t.prev}
              className={navButtonClass}
            >
              <ChevronLeft aria-hidden="true" className="w-5 h-5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => void handleNext()}
            // handleNext ignores clicks while saving; the button stays focusable so a
            // failed save doesn't leave focus on <body> (WCAG 2.4.3).
            aria-disabled={saving || undefined}
            aria-label={saving ? t.loading : t.next}
            aria-busy={saving || undefined}
            title={t.next}
            className={`${navButtonClass} gap-1 ${saving ? 'opacity-30 cursor-not-allowed' : ''}`}
          >
            {saving ? (
              <div
                aria-hidden="true"
                className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"
              />
            ) : (
              <ChevronRight aria-hidden="true" className="w-5 h-5" />
            )}
          </button>
        </div>

        {/* Progress bar */}
        <div className="flex flex-col items-center gap-1">
          <span aria-hidden="true" className="text-xs text-gray-600">
            {progressPct}%
          </span>
          <div
            role="progressbar"
            aria-label={t.progressLabel}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progressPct}
            aria-valuetext={`${progressPct}%`}
            className="w-full bg-gray-200 rounded-full h-2 relative"
          >
            <div
              className="bg-[#8dc63f] h-2 rounded-full transition-all duration-300 motion-reduce:transition-none"
              style={{ width: `${progressPct}%` }}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-[#8dc63f] rounded-full border-2 border-white shadow"
              style={{ left: `calc(${progressPct}% - 8px)` }}
            />
          </div>
        </div>
      </div>
    </main>
  );
}

// AnswerOptions renderer

interface AnswerOptionsProps {
  question: Question;
  value: SavedAnswer | undefined;
  onChange: (a: SavedAnswer) => void;
  disabled: boolean;
  t: PublicUIStrings;
  /** id of the element holding the question text — names the inputs/groups below. */
  labelledBy: string;
}

// Labels that are system-internal and must never be shown to the patient
const HIDDEN_OPTION_LABELS = ['skipped by patient', 'skipped by system'];

// Hard cap for open/text question answers (no server-side concept of this today).
const OPEN_TEXT_MAX_LENGTH = 300;

/** Returns true when a saved answer is an internal "Skipped by patient/system" marker rather than a real answer. */
function isSkipAnswer(question: Question, ans: SavedAnswer | undefined): boolean {
  if (!ans) return false;
  if ((ans.answer_text ?? '').toLowerCase().startsWith('skipped by')) return true;
  if (ans.answer_option_id) {
    const option = question.answerOptions.find((o) => o.id === ans.answer_option_id);
    return (option?.label ?? '').toLowerCase().includes('skipped by');
  }
  return false;
}

/** Whether two answers carry the same value (used to skip no-op saves). */
function isSameAnswer(a: SavedAnswer | undefined, b: SavedAnswer | undefined): boolean {
  if (!a || !b) return false;
  return (
    (a.answer_option_id ?? null) === (b.answer_option_id ?? null) &&
    (a.socio_demo_answer_id ?? null) === (b.socio_demo_answer_id ?? null) &&
    (a.feedback_answer_id ?? null) === (b.feedback_answer_id ?? null) &&
    (a.answer_text ?? null) === (b.answer_text ?? null)
  );
}

/** Text to show in a free-input field: blank for internal skip markers, never shown to the patient. */
function visibleAnswerText(question: Question, value: SavedAnswer | undefined): string {
  if (isSkipAnswer(question, value)) return '';
  return value?.answer_text ?? '';
}

function AnswerOptions({
  question,
  value,
  onChange,
  disabled,
  t,
  labelledBy,
}: AnswerOptionsProps) {
  const { questionId, questionKind, questionType } = question;
  // Strip internal skip options before rendering
  const answerOptions = question.answerOptions.filter(
    (o) =>
      !HIDDEN_OPTION_LABELS.some((s) => (o.label ?? o.answer_text ?? '').toLowerCase().includes(s))
  );

  // Text-only question (no options + questionType='text')
  if (questionType === 'text' && answerOptions.length === 0) {
    const text = visibleAnswerText(question, value);
    const counterId = `answer-counter-${questionId}`;
    return (
      <div>
        <textarea
          aria-labelledby={labelledBy}
          aria-describedby={counterId}
          value={text}
          onChange={(e) => onChange({ questionId, answer_text: e.target.value })}
          rows={4}
          maxLength={OPEN_TEXT_MAX_LENGTH}
          placeholder={t.enterAnswer}
          className="w-full border border-gray-500 rounded-lg px-4 py-3 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-primary resize-none h-64 md:h-auto"
        />
        <div id={counterId} className="text-xs text-gray-600 mt-1 text-right">
          {text.length}/{OPEN_TEXT_MAX_LENGTH}
        </div>
      </div>
    );
  }

  if (questionKind === 'feedback') {
    const normalizeType = (t: string | undefined) => (t ?? '').toLowerCase();
    // 'Multiple Choice' | 'Multiple Choice+Text' → several options selectable at once,
    // saved as JSON in answer_text (see player-helpers.ts). The '+Text' option also
    // carries an attached free-text field ("Other, please specify"-style), shown only
    // while it is ticked; its text travels alongside the ids.
    const multiChoiceOpts = answerOptions.filter(isMultiChoiceOption);
    if (multiChoiceOpts.length > 0) {
      const comboOpt = multiChoiceOpts.find(
        (o) => normalizeType(o.answer_type) === 'multiple choice+text'
      );
      const selectedIds = parseMultiChoiceSelection(value?.answer_text);
      const otherText = parseMultiChoiceText(value?.answer_text);
      const comboSelected = comboOpt != null && selectedIds.includes(comboOpt.id);

      const save = (ids: number[], text: string) =>
        onChange({
          questionId,
          answer_text: JSON.stringify(comboOpt ? { ids, text } : ids),
        });

      return (
        <div className="flex flex-col gap-4">
          <CheckboxList
            options={multiChoiceOpts.map((o) => ({ id: o.id, label: o.answer_text ?? '' }))}
            selected={selectedIds}
            onToggle={(id) => {
              const next = selectedIds.includes(id)
                ? selectedIds.filter((sid) => sid !== id)
                : [...selectedIds, id];
              // Unticking the "+Text" option drops its free text too
              save(next, comboOpt && !next.includes(comboOpt.id) ? '' : otherText);
            }}
            disabled={disabled}
            labelledBy={labelledBy}
          />
          {comboSelected && (
            <input
              type="text"
              aria-label={t.enterAnswer}
              placeholder={t.enterAnswer}
              value={otherText}
              maxLength={OPEN_TEXT_MAX_LENGTH}
              disabled={disabled}
              onChange={(e) => save(selectedIds, e.target.value)}
              className="w-full max-w-sm border border-gray-500 rounded-lg px-4 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-primary text-sm"
            />
          )}
        </div>
      );
    }

    const radioOpts = answerOptions.filter(
      (o) =>
        !o.answer_type ||
        normalizeType(o.answer_type) === 'radio button' ||
        normalizeType(o.answer_type) === 'checkbox'
    );
    const freeInputOpt = answerOptions.find((o) =>
      ['text', 'number', 'date'].includes(normalizeType(o.answer_type))
    );

    function freeInputTypeFb(answerType: string | undefined) {
      const nt = normalizeType(answerType);
      if (nt === 'date') return 'date';
      if (nt === 'number') return 'number';
      return 'text';
    }

    if (radioOpts.length === 0 && freeInputOpt) {
      const inputType = freeInputTypeFb(freeInputOpt.answer_type);
      if (inputType === 'number') {
        return (
          <NumberAnswerInput
            key={questionId}
            labelledBy={labelledBy}
            min={freeInputOpt.min_value}
            max={freeInputOpt.max_value}
            value={visibleAnswerText(question, value)}
            onChange={(text) => onChange({ questionId, answer_text: text })}
            disabled={disabled}
          />
        );
      }
      return (
        <input
          type={inputType}
          aria-labelledby={labelledBy}
          value={visibleAnswerText(question, value)}
          onChange={(e) => onChange({ questionId, answer_text: e.target.value })}
          className="w-full max-w-sm border border-gray-500 rounded-lg px-4 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-primary"
        />
      );
    }

    return (
      <div className="flex flex-col gap-4">
        <RadioList
          options={radioOpts.map((o) => ({ id: o.id, label: o.answer_text ?? '' }))}
          selected={value?.feedback_answer_id ?? null}
          onSelect={(id) => onChange({ questionId, feedback_answer_id: id })}
          disabled={disabled}
          labelledBy={labelledBy}
        />
        {freeInputOpt &&
          (() => {
            const inputType = freeInputTypeFb(freeInputOpt.answer_type);
            if (inputType === 'number') {
              return (
                <NumberAnswerInput
                  key={questionId}
                  labelledBy={labelledBy}
                  placeholder={t.enterAnswer}
                  min={freeInputOpt.min_value}
                  max={freeInputOpt.max_value}
                  value={visibleAnswerText(question, value)}
                  onChange={(text) =>
                    onChange({
                      questionId,
                      feedback_answer_id: value?.feedback_answer_id,
                      answer_text: text,
                    })
                  }
                  disabled={disabled}
                />
              );
            }
            return (
              <input
                type={inputType}
                aria-label={t.enterAnswer}
                placeholder={t.enterAnswer}
                value={visibleAnswerText(question, value)}
                onChange={(e) =>
                  onChange({
                    questionId,
                    feedback_answer_id: value?.feedback_answer_id,
                    answer_text: e.target.value,
                  })
                }
                className="w-full max-w-sm border border-gray-500 rounded-lg px-4 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-primary text-sm"
              />
            );
          })()}
      </div>
    );
  }

  if (questionKind === 'socio-demo') {
    // Normalize answer_type to lowercase for comparison — DB stores
    // 'Integer', 'Radio Button', 'Text', 'Radio Button+Text'
    const normalizeType = (t: string | undefined) => (t ?? '').toLowerCase();

    // 'Radio Button' | 'Radio Button+Text' → selectable option (radio, single-select)
    const radioOpts = answerOptions.filter(
      (o) =>
        !o.answer_type ||
        normalizeType(o.answer_type) === 'radio button' ||
        normalizeType(o.answer_type) === 'radio button+text'
    );
    // The selectable option that also carries an attached free-text field
    // ("Other, please specify"-style)
    const comboOpt = answerOptions.find(
      (o) => normalizeType(o.answer_type) === 'radio button+text'
    );
    // 'Text' | 'Integer' | 'Date' → free-text / numeric / year input (pure free-input question)
    const freeInputOpt = answerOptions.find((o) =>
      ['text', 'integer', 'date'].includes(normalizeType(o.answer_type))
    );

    function freeInputType(answerType: string | undefined) {
      return normalizeType(answerType) === 'integer' ? 'number' : 'text';
    }

    // 'Multiple Choice' → several options selectable at once. Reserved for socio-demo
    // questions that never feed into scoring — responses only have one row per question
    // (assignment_id, question_id, language_id unique), so the selected set is saved as a
    // JSON array of ids in answer_text rather than the single socio_demo_answer_id FK.
    const multiChoiceOpts = answerOptions.filter(
      (o) => normalizeType(o.answer_type) === 'multiple choice'
    );
    if (multiChoiceOpts.length > 0) {
      const selectedIds = parseMultiChoiceSelection(value?.answer_text);

      return (
        <CheckboxList
          options={multiChoiceOpts.map((o) => ({ id: o.id, label: o.answer_text ?? '' }))}
          selected={selectedIds}
          onToggle={(id) => {
            const next = selectedIds.includes(id)
              ? selectedIds.filter((sid) => sid !== id)
              : [...selectedIds, id];
            onChange({ questionId, answer_text: JSON.stringify(next) });
          }}
          disabled={disabled}
          labelledBy={labelledBy}
        />
      );
    }

    // Pure free-input question (no selectable options)
    if (radioOpts.length === 0 && freeInputOpt) {
      // 'Date' on socio-demo is a year only (e.g. "Year of birth"), saved as 'YYYY'
      if (normalizeType(freeInputOpt.answer_type) === 'date') {
        return (
          <YearAnswerSelect
            labelledBy={labelledBy}
            min={freeInputOpt.min_value}
            max={freeInputOpt.max_value}
            placeholder={t.selectYear}
            value={visibleAnswerText(question, value)}
            onChange={(text) => onChange({ questionId, answer_text: text })}
            disabled={disabled}
          />
        );
      }
      const inputType = freeInputType(freeInputOpt.answer_type);
      if (inputType === 'number') {
        return (
          <NumberAnswerInput
            key={questionId}
            labelledBy={labelledBy}
            integerOnly
            min={freeInputOpt.min_value}
            max={freeInputOpt.max_value}
            value={visibleAnswerText(question, value)}
            onChange={(text) => onChange({ questionId, answer_text: text })}
            disabled={disabled}
          />
        );
      }
      return (
        <input
          type={inputType}
          aria-labelledby={labelledBy}
          value={visibleAnswerText(question, value)}
          onChange={(e) => onChange({ questionId, answer_text: e.target.value })}
          className="w-full max-w-sm border border-gray-500 rounded-lg px-4 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-primary"
        />
      );
    }

    // Selectable options (+ inline free-input when the combo option is selected)
    const comboSelected = comboOpt != null && value?.socio_demo_answer_id === comboOpt.id;
    return (
      <div className="flex flex-col gap-4">
        <RadioList
          options={radioOpts.map((o) => ({ id: o.id, label: o.answer_text ?? '' }))}
          selected={value?.socio_demo_answer_id ?? null}
          onSelect={(id) => onChange({ questionId, socio_demo_answer_id: id })}
          disabled={disabled}
          labelledBy={labelledBy}
        />
        {comboSelected && (
          <input
            type="text"
            aria-label={t.enterAnswer}
            placeholder={t.enterAnswer}
            value={visibleAnswerText(question, value)}
            onChange={(e) =>
              onChange({
                questionId,
                socio_demo_answer_id: value?.socio_demo_answer_id,
                answer_text: e.target.value,
              })
            }
            className="w-full max-w-sm border border-gray-500 rounded-lg px-4 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-primary text-sm"
          />
        )}
      </div>
    );
  }

  // static / cat / quality_7 — radio list. quality_7 shows the full 1-7 scale as plain
  // options (1 and 7 carry their real textual labels, e.g. "Pessima"/"Ottima"; 2-6 show
  // their numeral) plus any sentinel options (NA/PNTA), matching pre-slider behavior.
  return (
    <RadioList
      options={answerOptions.map((o) => ({ id: o.id, label: o.label ?? '' }))}
      selected={value?.answer_option_id ?? null}
      onSelect={(id) => onChange({ questionId, answer_option_id: id })}
      disabled={disabled}
      labelledBy={labelledBy}
    />
  );
}

export function RadioList({
  options,
  selected,
  onSelect,
  disabled,
  labelledBy,
}: {
  options: { id: number; label: string }[];
  selected: number | null;
  onSelect: (id: number) => void;
  disabled: boolean;
  /** id of the question text naming this group (WCAG 1.3.1 / 4.1.2). */
  labelledBy?: string;
}) {
  // Native radio inputs (visually hidden, custom indicator drawn next to them) give
  // screen readers role + checked state + group name, and arrow-key navigation, for free.
  const name = useId();
  // Long lists (e.g. socio-demo occupation/country pickers) are laid out in columns
  // instead of one tall vertical list, so they stay visible without needing to scroll.
  const useGrid = options.length > 8;
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      aria-disabled={disabled || undefined}
      className={
        useGrid ? 'grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1.5' : 'flex flex-col gap-3'
      }
    >
      {options.map((opt) => (
        <label
          key={opt.id}
          className={`flex items-center group text-left w-full cursor-pointer has-disabled:cursor-default ${useGrid ? 'gap-2' : 'gap-3'}`}
        >
          <input
            type="radio"
            name={name}
            value={opt.id}
            checked={selected === opt.id}
            disabled={disabled}
            onChange={() => onSelect(opt.id)}
            className="peer sr-only"
          />
          <span
            aria-hidden="true"
            className={`rounded-full border-2 flex items-center justify-center shrink-0 transition-colors motion-reduce:transition-none forced-color-adjust-none peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-focus-visible:ring-offset-2 ${
              useGrid ? 'w-4 h-4' : 'w-5 h-5'
            } ${selected === opt.id ? 'border-primary' : 'border-gray-500 group-hover:border-primary'}`}
          >
            {selected === opt.id && (
              <span className={`rounded-full bg-primary ${useGrid ? 'w-2 h-2' : 'w-2.5 h-2.5'}`} />
            )}
          </span>
          <span className={`text-gray-700 select-none ${useGrid ? 'text-sm' : 'text-base'}`}>
            {opt.label}
          </span>
        </label>
      ))}
    </div>
  );
}

function CheckboxList({
  options,
  selected,
  onToggle,
  disabled,
  labelledBy,
}: {
  options: { id: number; label: string }[];
  selected: number[];
  onToggle: (id: number) => void;
  disabled: boolean;
  labelledBy?: string;
}) {
  // Same layout rules as RadioList — long lists switch to a column grid.
  const useGrid = options.length > 8;
  return (
    <div
      role="group"
      aria-labelledby={labelledBy}
      className={
        useGrid ? 'grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1.5' : 'flex flex-col gap-3'
      }
    >
      {options.map((opt) => {
        const isSelected = selected.includes(opt.id);
        return (
          <label
            key={opt.id}
            className={`flex items-center group text-left w-full cursor-pointer has-disabled:cursor-default ${useGrid ? 'gap-2' : 'gap-3'}`}
          >
            <input
              type="checkbox"
              value={opt.id}
              checked={isSelected}
              disabled={disabled}
              onChange={() => onToggle(opt.id)}
              className="peer sr-only"
            />
            <span
              aria-hidden="true"
              className={`rounded-sm border-2 flex items-center justify-center shrink-0 transition-colors motion-reduce:transition-none forced-color-adjust-none peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-focus-visible:ring-offset-2 ${
                useGrid ? 'w-4 h-4' : 'w-5 h-5'
              } ${isSelected ? 'border-primary bg-primary' : 'border-gray-500 group-hover:border-primary'}`}
            >
              {isSelected && (
                <svg
                  viewBox="0 0 12 12"
                  fill="none"
                  className={useGrid ? 'w-2.5 h-2.5' : 'w-3 h-3'}
                >
                  <path
                    d="M2 6l2.5 2.5L10 3"
                    stroke="white"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </span>
            <span className={`text-gray-700 select-none ${useGrid ? 'text-sm' : 'text-base'}`}>
              {opt.label}
            </span>
          </label>
        );
      })}
    </div>
  );
}

// Main page

export { QuestionnairePlayer };
