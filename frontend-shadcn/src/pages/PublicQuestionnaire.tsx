import { DevnutButton } from '@/components/DevnutButton';
import { usePublishA11yLabels } from '@/hooks/usePublicA11yLabels';
import { LanguageDropdown } from '@/components/public/LanguageDropdown';
import { PdfAttachment } from '@/components/public/PdfAttachment';
import { PublicLayout } from '@/layouts/PublicLayout';
import { focusRing } from '@/lib/a11y';
import { sanitizeHtml } from '@/lib/rich-text';
import axios from 'axios';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getLanguageTag, type PublicUIStrings } from './public/labels';
import { detectBrowserLanguage } from './public/player-helpers';
import { QuestionnairePlayer, RadioList } from './public/QuestionnairePlayer';
import { PublicTextsGate } from './public/PublicTextsGate';
import { usePublicLabels } from './public/usePublicLabels';
import type {
  ClosingMessageContent,
  EligibilityQuestion,
  Language,
  PresentationContent,
  PrivacyPolicyContent,
  QuestionnaireAccess,
  SavedAnswer,
  StudyInfoSheetContent,
} from './public/types';

type Phase =
  | 'loading'
  | 'error'
  | 'language'
  | 'presentation'
  | 'eligibility'
  | 'study-info'
  | 'disqualified'
  | 'privacy-policy'
  | 'welcome'
  | 'resume'
  | 'questionnaire'
  | 'completed'
  // Private link reopened after the questionnaire was already completed
  | 'already-used'
  // Survey not available anymore (403 SURVEY_*): not started, ended, completed, disabled
  | 'closed';

// Phases whose text comes from the survey's closing messages (per language, with the
// survey's fallback language when the patient's one is missing).
const CLOSING_MESSAGE_PHASES: Phase[] = ['completed', 'already-used', 'closed'];

/** Rich-text closing message block, same styling as the end-of-questionnaire one. */
function ClosingMessageHtml({ html }: { html: string }) {
  return (
    <div
      className="prose-content text-sm text-gray-700 leading-relaxed"
      dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }}
    />
  );
}

/** Inline loading spinner announced to screen readers (WCAG 4.1.3). */
function LoadingSpinner({ label }: { label: string }) {
  return (
    <div role="status" className="flex items-center justify-center py-4">
      <div
        aria-hidden="true"
        className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"
      />
      <span className="sr-only">{label}</span>
    </div>
  );
}

// Pill nav buttons — same markup/classes as QuestionnairePlayer's answering-phase nav,
// used to keep presentation/eligibility/privacy-policy/study-info visually identical to it.
//
// `nextHint` (WCAG 3.3.2): instead of a plain `disabled` button — which keyboard/screen
// reader users can't even reach, let alone learn why it's inactive — Next stays focusable
// with aria-disabled, describes its reason, and announces it visibly (role="alert") when
// activated anyway.
function NavButtons({
  onPrev,
  onNext,
  prevDisabled,
  nextDisabled,
  showPrev = true,
  showNext = true,
  prevLabel,
  nextLabel,
  nextBusy,
  loadingLabel,
  nextHint,
}: {
  onPrev?: () => void;
  onNext?: () => void;
  prevDisabled?: boolean;
  nextDisabled?: boolean;
  showPrev?: boolean;
  showNext?: boolean;
  prevLabel: string;
  nextLabel?: string;
  /** Operazione in corso: spinner al posto della freccia, screen reader legge loadingLabel. */
  nextBusy?: boolean;
  loadingLabel?: string;
  /** Spiega a screen reader perché "avanti" è spento: il bottone resta focalizzabile (aria-disabled). */
  nextHint?: string;
}) {
  const hintId = useId();
  const softDisabled = !!nextDisabled && !!nextHint;
  const [showHint, setShowHint] = useState(false);
  const pillClass = `flex items-center justify-center px-6 py-2 rounded-full bg-primary text-white font-semibold transition-opacity motion-reduce:transition-none ${focusRing}`;
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex justify-center gap-6">
        {showPrev && (
          <button
            type="button"
            onClick={onPrev}
            disabled={prevDisabled}
            aria-label={prevLabel}
            title={prevLabel}
            className={`${pillClass} disabled:opacity-30 hover:opacity-90`}
          >
            <ChevronLeft aria-hidden="true" className="w-5 h-5" />
          </button>
        )}
        {showNext && (
          <button
            type="button"
            onClick={() => {
              if (softDisabled) {
                setShowHint(true);
                return;
              }
              setShowHint(false);
              if (!nextDisabled) onNext?.();
            }}
            disabled={nextDisabled && !softDisabled}
            aria-disabled={softDisabled || undefined}
            aria-describedby={softDisabled ? hintId : undefined}
            aria-label={nextBusy ? loadingLabel : nextLabel}
            aria-busy={nextBusy || undefined}
            title={nextLabel}
            className={`${pillClass} gap-1 disabled:opacity-30 ${
              softDisabled ? 'opacity-30 cursor-not-allowed' : 'hover:opacity-90'
            }`}
          >
            {nextBusy ? (
              <div
                aria-hidden="true"
                className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"
              />
            ) : (
              <ChevronRight aria-hidden="true" className="w-5 h-5" />
            )}
          </button>
        )}
      </div>
      {softDisabled && (
        <span id={hintId} className="sr-only">
          {nextHint}
        </span>
      )}
      {/* Always mounted so the alert is announced when its text appears. */}
      <p
        role="alert"
        className={softDisabled && showHint ? 'text-sm text-red-700 text-center' : 'sr-only'}
      >
        {softDisabled && showHint ? nextHint : ''}
      </p>
    </div>
  );
}

export default function PublicQuestionnaire() {
  const { link } = useParams<{ link: string }>();

  const [phase, setPhase] = useState<Phase>('loading');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Error detected before any language is chosen: resolved at render time, so its text
  // comes from the (admin-editable) labels of the browser language.
  const [errorLabel, setErrorLabel] = useState<'errorLinkInvalid' | 'errorGeneric' | null>(null);
  const [accessData, setAccessData] = useState<QuestionnaireAccess | null>(null);
  const [languages, setLanguages] = useState<Language[]>([]);
  const [selectedLanguage, setSelectedLanguage] = useState<Language | null>(null);
  const [starting, setStarting] = useState(false);
  // Next pressed on the language screen with no language selected (see its button).
  const [languageReasonShown, setLanguageReasonShown] = useState(false);
  const [assignmentId, setAssignmentId] = useState<number | null>(null);
  const [existingAnswers, setExistingAnswers] = useState<Record<number, SavedAnswer> | null>(null);

  // Pre-flow funnel state
  const [presentationContent, setPresentationContent] = useState<PresentationContent | null>(null);
  const [loadingPresentation, setLoadingPresentation] = useState(false);
  const [eligibilityQuestions, setEligibilityQuestions] = useState<EligibilityQuestion[]>([]);
  const [eligibilityIdx, setEligibilityIdx] = useState(0);
  // What was clicked per question index, so going back shows the previous answer highlighted.
  const [eligibilityAnswers, setEligibilityAnswers] = useState<Record<number, 'yes' | 'no'>>({});
  const [disqualificationMsg, setDisqualificationMsg] = useState<string | null>(null);
  // Tracks where an in-session disqualification came from, so the disqualified screen
  // can offer a back button to let the patient revise the answer. null = no way back
  // (e.g. a disqualification restored from a persisted session on page load).
  const [disqualifiedFrom, setDisqualifiedFrom] = useState<'eligibility' | 'study-info' | null>(
    null
  );
  // Which disqualification was written to the backend this session. It stays on the
  // assignment until cleared, so passing the same step after going back must reset it —
  // otherwise a reload reopens the link as disqualified.
  const [persistedDisqualification, setPersistedDisqualification] = useState<
    'eligibility' | 'study-info' | null
  >(null);
  // A disqualification restored on page load whose Submit never reached the backend.
  const [restoredScreeningKind, setRestoredScreeningKind] = useState<
    'eligibility' | 'study-info' | null
  >(null);
  const [submittingScreening, setSubmittingScreening] = useState(false);
  const [screeningSubmitFailed, setScreeningSubmitFailed] = useState(false);
  const [studyInfoSheet, setStudyInfoSheet] = useState<StudyInfoSheetContent | null>(null);
  const [loadingStudyInfoSheet, setLoadingStudyInfoSheet] = useState(false);
  // Answers to the mandatory informed-consent questions on the study-info screen,
  // keyed by question index. Missing = unanswered, true = "I consent",
  // false = "I do not consent".
  const [studyInfoConsents, setStudyInfoConsents] = useState<Record<number, boolean>>({});

  // Privacy policy state
  const [privacyPolicy, setPrivacyPolicy] = useState<PrivacyPolicyContent | null>(null);
  const [loadingPrivacyPolicy, setLoadingPrivacyPolicy] = useState(false);

  // Closing message state (shown on the completed screen)
  const [closingMessage, setClosingMessage] = useState<ClosingMessageContent | null>(null);
  const [loadingClosingMessage, setLoadingClosingMessage] = useState(false);

  useEffect(() => {
    if (!link) return;
    // allSettled: the languages are still needed when access is refused (survey closed),
    // to show the closed-survey message in the patient's language.
    Promise.allSettled([
      axios.get<QuestionnaireAccess>(`/euonqol-api/public/link/${link}`),
      axios.get<Language[]>(`/euonqol-api/public/link/${link}/languages`),
    ]).then(([accessRes, langsRes]) => {
      const langs = langsRes.status === 'fulfilled' ? (langsRes.value.data ?? []) : [];
      setLanguages(langs);

      if (accessRes.status === 'rejected') {
        const err = accessRes.reason;
        const errCode = err?.response?.data?.error_code as string | undefined;
        const browserLang = detectBrowserLanguage(langs);
        setSelectedLanguage(browserLang);
        if (err?.response?.status === 403 && errCode?.startsWith('SURVEY_')) {
          // Text comes from the survey's "survey closed" message for the browser language
          setPhase('closed');
          return;
        }
        setErrorLabel(err?.response?.status === 404 ? 'errorLinkInvalid' : 'errorGeneric');
        setPhase('error');
        return;
      }

      {
        const access = accessRes.value.data;
        setAccessData(access);
        // For non-unidentified links: check persisted eligibility failure first. A submitted
        // one is also 'completed', but must keep showing its disqualification message rather
        // than the already-used screen.
        const isTracked =
          access.access_mode !== 'unidentified' && access.access_mode !== 'anonymous';
        if (isTracked && access.eligibility_status === 'disqualified') {
          const sessionLang =
            access.session_language_id != null
              ? (langs.find((l) => l.id === access.session_language_id) ??
                detectBrowserLanguage(langs))
              : detectBrowserLanguage(langs);
          setSelectedLanguage(sessionLang);
          setDisqualificationMsg(access.eligibility_disqualification_msg ?? null);
          // Reloaded before Submit: no way back, but Submit must still close the assignment.
          if (access.completion_status !== 'completed') setRestoredScreeningKind('eligibility');
          setPhase('disqualified');
          return;
        }
        if (isTracked && access.study_info_status === 'declined') {
          const sessionLang =
            access.session_language_id != null
              ? (langs.find((l) => l.id === access.session_language_id) ??
                detectBrowserLanguage(langs))
              : detectBrowserLanguage(langs);
          setSelectedLanguage(sessionLang);
          setDisqualificationMsg(access.study_info_rejection_msg ?? null);
          if (access.completion_status !== 'completed') setRestoredScreeningKind('study-info');
          setPhase('disqualified');
          return;
        }
        if (access.completion_status === 'completed') {
          const sessionLang =
            access.session_language_id != null
              ? (langs.find((l) => l.id === access.session_language_id) ??
                detectBrowserLanguage(langs))
              : detectBrowserLanguage(langs);
          setSelectedLanguage(sessionLang);
          setPhase('already-used');
          return;
        }
        // Resume: private link with a session already in progress. Keyed off completion_status
        // (set to 'in_progress' by /start), not existing_responses — the questionnaire's first
        // screen is a "disclaimer" question that is never persisted as a response, so a patient
        // who reloads before answering any real question would otherwise have 0 responses and
        // wrongly be sent through the whole pre-flow funnel again (eligibility/study-info),
        // risking a permanent disqualification on a re-answer instead of resuming in place.
        if (isTracked && access.can_resume && access.completion_status === 'in_progress') {
          const sessionLang =
            access.session_language_id != null
              ? (langs.find((l) => l.id === access.session_language_id) ??
                detectBrowserLanguage(langs))
              : detectBrowserLanguage(langs);
          setSelectedLanguage(sessionLang);
          setPhase('resume');
          return;
        }
        const detectedLang = detectBrowserLanguage(langs);
        setSelectedLanguage(detectedLang);
        // Language is picked upfront, before any presentation/eligibility content is shown.
        if (access.has_presentation || access.has_eligibility) {
          setPhase('language');
        } else if (access.has_privacy_policy) {
          setPhase('privacy-policy');
        } else if (access.has_study_info_sheet) {
          setPhase('study-info');
        } else {
          setPhase('welcome');
        }
      }
    });
  }, [link]);

  // English until a language is chosen. No built-in texts: the page renders only once
  // they are loaded (see the PublicTextsGate below), so the handlers defined before the
  // gate can only run with `t` set.
  const texts = usePublicLabels(selectedLanguage?.id);
  const t = texts.labels as PublicUIStrings;
  // The accessibility menu (mounted in App.tsx) follows the patient's language too.
  usePublishA11yLabels(texts.labels);

  // Lingua del documento = lingua scelta dal paziente (3.1.1): gli screen reader la usano per la pronuncia.
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.lang;
    root.lang = getLanguageTag(selectedLanguage?.language);
    return () => {
      root.lang = previous;
    };
  }, [selectedLanguage?.language]);

  // Al cambio schermata (o domanda di eligibility) il focus passa al nuovo contenuto,
  // così tastiera e screen reader non restano su <body> (WCAG 2.4.3, 4.1.3).
  const screenRef = useRef<HTMLDivElement>(null);
  const prevScreenRef = useRef<string | null>(null);
  useEffect(() => {
    const key = `${phase}:${eligibilityIdx}`;
    const prev = prevScreenRef.current;
    prevScreenRef.current = key;
    if (prev === null || prev.startsWith('loading:') || prev === key) return;
    screenRef.current?.focus();
  }, [phase, eligibilityIdx]);

  // Fetch privacy policy when language changes
  useEffect(() => {
    if (!link || !accessData?.has_privacy_policy || !selectedLanguage) {
      setPrivacyPolicy(null);
      return;
    }
    setLoadingPrivacyPolicy(true);
    axios
      .get(`/euonqol-api/public/link/${link}/privacy-policy?language_id=${selectedLanguage.id}`)
      .then((res) => {
        if (res.data.has_policy) {
          setPrivacyPolicy(res.data.policy);
        } else {
          setPrivacyPolicy(null);
        }
      })
      .catch(() => setPrivacyPolicy(null))
      .finally(() => setLoadingPrivacyPolicy(false));
  }, [link, selectedLanguage?.id, accessData?.has_privacy_policy]);

  // Fetch presentation content when language changes (presentation phase)
  useEffect(() => {
    if (!link || !selectedLanguage || !accessData?.has_presentation) {
      setPresentationContent(null);
      return;
    }
    setLoadingPresentation(true);
    axios
      .get(`/euonqol-api/public/link/${link}/presentation?language_id=${selectedLanguage.id}`)
      .then((res) => {
        if (res.data.has_presentation) {
          setPresentationContent(res.data.presentation);
        } else {
          setPresentationContent(null);
        }
      })
      .catch(() => setPresentationContent(null))
      .finally(() => setLoadingPresentation(false));
  }, [link, selectedLanguage?.id, accessData?.has_presentation]);

  // Fetch closing messages when language changes, in every phase that shows one of them.
  // On 'closed' accessData is null (access refused): ask anyway, the endpoint answers
  // has_closing_message=false when the survey has none.
  const needsClosingMessage =
    CLOSING_MESSAGE_PHASES.includes(phase) &&
    (phase === 'closed' || !!accessData?.has_closing_message);
  useEffect(() => {
    if (!link || !selectedLanguage || !needsClosingMessage) {
      setClosingMessage(null);
      return;
    }
    setLoadingClosingMessage(true);
    axios
      .get(`/euonqol-api/public/link/${link}/closing-message?language_id=${selectedLanguage.id}`)
      .then((res) => {
        if (res.data.has_closing_message) {
          setClosingMessage(res.data.closing_message);
        } else {
          setClosingMessage(null);
        }
      })
      .catch(() => setClosingMessage(null))
      .finally(() => setLoadingClosingMessage(false));
  }, [link, selectedLanguage?.id, needsClosingMessage]);

  // Fetch study info sheet content when language changes (study-info phase)
  useEffect(() => {
    if (!link || !selectedLanguage || !accessData?.has_study_info_sheet) {
      setStudyInfoSheet(null);
      return;
    }
    setLoadingStudyInfoSheet(true);
    axios
      .get(`/euonqol-api/public/link/${link}/study-info-sheet?language_id=${selectedLanguage.id}`)
      .then((res) => {
        if (res.data.has_study_info_sheet) {
          setStudyInfoSheet(res.data.study_info_sheet);
        } else {
          setStudyInfoSheet(null);
        }
      })
      .catch(() => setStudyInfoSheet(null))
      .finally(() => setLoadingStudyInfoSheet(false));
  }, [link, selectedLanguage?.id, accessData?.has_study_info_sheet]);

  async function handleLanguageContinue() {
    if (!selectedLanguage) return;
    if (accessData?.has_presentation) {
      setPhase('presentation');
    } else {
      await handlePresentationContinue();
    }
  }

  // Funnel order past presentation/eligibility: privacy-policy → study-info → welcome.
  // Each optional step is skipped if the link doesn't have it.
  function advanceToWelcome() {
    if (accessData?.has_privacy_policy) {
      setPhase('privacy-policy');
    } else if (accessData?.has_study_info_sheet) {
      setPhase('study-info');
    } else {
      setPhase('welcome');
    }
  }

  async function handlePresentationContinue() {
    if (!link || !selectedLanguage) return;
    if (accessData?.has_eligibility) {
      // Fetch eligibility questions for the selected language
      try {
        const res = await axios.get(
          `/euonqol-api/public/link/${link}/eligibility-questions?language_id=${selectedLanguage.id}`
        );
        const questions: EligibilityQuestion[] = res.data ?? [];
        if (questions.length > 0) {
          setEligibilityQuestions(questions);
          setEligibilityIdx(0);
          setPhase('eligibility');
        } else {
          // No questions for this language — skip ahead
          advanceToWelcome();
        }
      } catch {
        advanceToWelcome();
      }
    } else {
      advanceToWelcome();
    }
  }

  // Back from privacy-policy/study-info/welcome to whatever precedes the funnel's
  // optional steps: the last eligibility question, presentation, or language.
  function backToPreWelcomeChain() {
    if (accessData?.has_eligibility && eligibilityQuestions.length > 0) {
      setEligibilityIdx(eligibilityQuestions.length - 1);
      setPhase('eligibility');
    } else if (accessData?.has_presentation) {
      setPhase('presentation');
    } else if (accessData?.has_presentation || accessData?.has_eligibility) {
      setPhase('language');
    }
  }

  // Real back-navigation across the pre-flow funnel. Each phase knows what precedes it.
  // Funnel order: language → presentation → eligibility → privacy-policy → study-info → welcome.
  function goBack() {
    if (phase === 'presentation') {
      setPhase('language');
      return;
    }
    if (phase === 'eligibility') {
      if (eligibilityIdx > 0) {
        setEligibilityIdx((i) => i - 1);
      } else if (accessData?.has_presentation) {
        setPhase('presentation');
      } else {
        setPhase('language');
      }
      return;
    }
    if (phase === 'privacy-policy') {
      backToPreWelcomeChain();
      return;
    }
    if (phase === 'study-info') {
      if (accessData?.has_privacy_policy) {
        setPhase('privacy-policy');
      } else {
        backToPreWelcomeChain();
      }
      return;
    }
    if (phase === 'welcome') {
      if (accessData?.has_study_info_sheet) {
        setPhase('study-info');
      } else if (accessData?.has_privacy_policy) {
        setPhase('privacy-policy');
      } else {
        backToPreWelcomeChain();
      }
      return;
    }
    if (phase === 'disqualified' && disqualifiedFrom) {
      // Answers stay as they were — the patient sees exactly what they clicked and can revise it.
      setPhase(disqualifiedFrom);
      setDisqualifiedFrom(null);
      setScreeningSubmitFailed(false);
      return;
    }
  }

  const canGoBack =
    phase === 'presentation' ||
    phase === 'eligibility' ||
    (phase === 'privacy-policy' &&
      !!(accessData?.has_presentation || accessData?.has_eligibility)) ||
    (phase === 'study-info' &&
      !!(
        accessData?.has_privacy_policy ||
        accessData?.has_presentation ||
        accessData?.has_eligibility
      )) ||
    (phase === 'welcome' &&
      !!(
        accessData?.has_study_info_sheet ||
        accessData?.has_privacy_policy ||
        accessData?.has_presentation ||
        accessData?.has_eligibility
      )) ||
    (phase === 'disqualified' && !!disqualifiedFrom);

  // Advance past the current eligibility question — either to the next one or,
  // if it was the last, out of the eligibility funnel entirely.
  function advanceEligibility() {
    if (persistedDisqualification === 'eligibility') {
      resetPersistedDisqualification('eligibility');
    }
    if (eligibilityIdx < eligibilityQuestions.length - 1) {
      setEligibilityIdx((i) => i + 1);
    } else {
      advanceToWelcome();
    }
  }

  // Clears a disqualification persisted earlier in this session (best-effort, like the
  // POSTs that wrote it). Tracked links only: the others never persisted one.
  function resetPersistedDisqualification(kind: 'eligibility' | 'study-info') {
    setPersistedDisqualification(null);
    const isTracked =
      accessData?.access_mode !== 'unidentified' && accessData?.access_mode !== 'anonymous';
    if (!isTracked || !link) return;
    const endpoint = kind === 'eligibility' ? 'eligibility-reset' : 'study-info-reset';
    axios.post(`/euonqol-api/public/link/${link}/${endpoint}`).catch(() => {
      // Best-effort: ignore errors — the UI state is already correct
    });
  }

  // Submit on the disqualified screen: the outcome becomes final and, on tracked links, the
  // assignment is closed as completed — it can no longer be resumed or restarted.
  async function submitScreeningOutcome() {
    const kind = disqualifiedFrom ?? restoredScreeningKind;
    if (!kind) return;
    const isTracked =
      accessData?.access_mode !== 'unidentified' && accessData?.access_mode !== 'anonymous';
    if (isTracked && link) {
      setSubmittingScreening(true);
      setScreeningSubmitFailed(false);
      try {
        await axios.post(`/euonqol-api/public/link/${link}/screening-submit`, {
          kind,
          message: disqualificationMsg ?? '',
        });
      } catch {
        // Keep the buttons so the patient can retry: without this call the link stays open.
        setScreeningSubmitFailed(true);
        return;
      } finally {
        setSubmittingScreening(false);
      }
    }
    // Move focus off the button before it unmounts (WCAG 2.4.3).
    screenRef.current?.focus();
    setPersistedDisqualification(null);
    setDisqualifiedFrom(null);
    setRestoredScreeningKind(null);
  }

  // Only records the selection — evaluation happens explicitly on "Avanti" (see
  // confirmEligibilityAnswer), not on radio selection.
  function selectEligibilityAnswer(answer: 'yes' | 'no') {
    setEligibilityAnswers((prev) => ({ ...prev, [eligibilityIdx]: answer }));
  }

  function confirmEligibilityAnswer() {
    const question = eligibilityQuestions[eligibilityIdx];
    const answer = eligibilityAnswers[eligibilityIdx];
    if (!question || !answer) return;
    if (answer !== question.expected_answer) {
      // Wrong answer — disqualified
      const msg = question.disqualification_message ?? '';
      setDisqualificationMsg(msg);
      setDisqualifiedFrom('eligibility');
      setPersistedDisqualification('eligibility');
      setPhase('disqualified');
      // Persist disqualification for identified/traceable links
      const isTracked =
        accessData?.access_mode !== 'unidentified' && accessData?.access_mode !== 'anonymous';
      if (isTracked && link) {
        axios
          .post(`/euonqol-api/public/link/${link}/eligibility-disqualify`, {
            disqualification_message: msg,
          })
          .catch(() => {
            // Best-effort: ignore errors — the UI state is already correct
          });
      }
      return;
    }
    advanceEligibility();
  }

  function handleResume() {
    if (!selectedLanguage || !accessData?.assignment_id) return;
    const preloaded: Record<number, SavedAnswer> = {};
    for (const r of accessData.existing_responses ?? []) {
      preloaded[r.question_id] = {
        questionId: r.question_id,
        answer_option_id: r.answer_option_id ?? undefined,
        answer_text: r.answer_text ?? undefined,
        socio_demo_answer_id: r.socio_demo_answer_id ?? undefined,
        feedback_answer_id: r.feedback_answer_id ?? undefined,
      };
    }
    setExistingAnswers(Object.keys(preloaded).length > 0 ? preloaded : null);
    setAssignmentId(accessData.assignment_id);
    setPhase('questionnaire');
  }

  async function actuallyStart() {
    if (!selectedLanguage || !link) return;
    setStarting(true);
    try {
      const res = await axios.post(`/euonqol-api/public/link/${link}/start`, {
        language_id: selectedLanguage.id,
        ...(privacyPolicy ? { privacy_policy_id: privacyPolicy.id } : {}),
      });
      setAssignmentId(res.data.assignment_id);
      setPhase('questionnaire');
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message ?? t.errorGeneric);
      setPhase('error');
    } finally {
      setStarting(false);
    }
  }

  // Without an Info & Consent sheet the questionnaire starts right after the privacy policy.
  async function handlePrivacyPolicyContinue() {
    if (accessData?.has_study_info_sheet) {
      setPhase('study-info');
    } else {
      await actuallyStart();
    }
  }

  async function handleStart() {
    if (!selectedLanguage || !link) return;
    await actuallyStart();
  }

  async function handleStudyInfoDecision(accepted: boolean) {
    if (accepted) {
      if (persistedDisqualification === 'study-info') {
        resetPersistedDisqualification('study-info');
      }
      // Every consent given (or none configured) — go straight into the questionnaire, no welcome screen.
      await actuallyStart();
      return;
    }
    const msg = studyInfoSheet?.rejection_message ?? '';
    setDisqualificationMsg(msg);
    setDisqualifiedFrom('study-info');
    setPersistedDisqualification('study-info');
    setPhase('disqualified');
    // Persist rejection for identified/traceable links
    const isTracked =
      accessData?.access_mode !== 'unidentified' && accessData?.access_mode !== 'anonymous';
    if (isTracked && link) {
      axios
        .post(`/euonqol-api/public/link/${link}/study-info-reject`, { rejection_message: msg })
        .catch(() => {
          // Best-effort: ignore errors — the UI state is already correct
        });
    }
  }

  // Consent questions configured on the sheet. They are optional: with none the patient
  // only reads the General text and "Avanti" starts the questionnaire.
  const studyInfoConsentQuestions: string[] =
    studyInfoSheet?.consent_questions?.map((q) => q.question_text) ?? [];
  const allStudyInfoConsentsAnswered = studyInfoConsentQuestions.every(
    (_, index) => studyInfoConsents[index] !== undefined
  );

  // Only records the selection — evaluation (advance or disqualify) happens explicitly
  // when the patient clicks "Avanti", not on radio selection.
  function handleStudyInfoConsentAnswer(index: number, consented: boolean) {
    setStudyInfoConsents((prev) => ({ ...prev, [index]: consented }));
  }

  // Answering "I do not consent" to any question disqualifies. Every question must be
  // consented to advance into the questionnaire.
  function confirmStudyInfoConsent() {
    if (!allStudyInfoConsentsAnswered) return;
    const accepted = studyInfoConsentQuestions.every((_, index) => studyInfoConsents[index]);
    handleStudyInfoDecision(accepted);
  }

  if (texts.status !== 'ready') {
    return <PublicTextsGate status={texts.status} onRetry={texts.retry} />;
  }

  // Loading
  if (phase === 'loading') {
    return (
      <div role="status" className="flex items-center justify-center min-h-dvh bg-white">
        <div
          aria-hidden="true"
          className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"
        />
        <span className="sr-only">{t.loading}</span>
      </div>
    );
  }

  // Error
  if (phase === 'error') {
    return (
      <PublicLayout>
        <div ref={screenRef} tabIndex={-1} aria-live="polite" className="text-center max-w-sm px-6 outline-none">
          <h1 className="text-2xl font-semibold text-gray-800 mb-2">{t.oops}</h1>
          <p role="alert" className="text-gray-700">
            {errorMsg ?? (errorLabel ? t[errorLabel] : null)}
          </p>
        </div>
      </PublicLayout>
    );
  }

  // Survey closed: closing message of the patient's language
  if (phase === 'closed') {
    return (
      <PublicLayout>
        <div ref={screenRef} tabIndex={-1} aria-live="polite" className="text-center max-w-sm px-6 outline-none">
          {loadingClosingMessage ? (
            <LoadingSpinner label={t.loading} />
          ) : closingMessage?.survey_closed_message ? (
            <ClosingMessageHtml html={closingMessage.survey_closed_message} />
          ) : (
            <p role="alert" className="text-gray-700">{t.errorGeneric}</p>
          )}
        </div>
      </PublicLayout>
    );
  }

  // Link already used to complete the survey
  if (phase === 'already-used') {
    return (
      <PublicLayout>
        <div ref={screenRef} tabIndex={-1} aria-live="polite" className="text-center max-w-sm px-6 outline-none">
          {loadingClosingMessage ? (
            <LoadingSpinner label={t.loading} />
          ) : closingMessage?.link_used_message ? (
            <ClosingMessageHtml html={closingMessage.link_used_message} />
          ) : (
            <p role="alert" className="text-gray-700">{t.errorGeneric}</p>
          )}
        </div>
      </PublicLayout>
    );
  }

  // Completed
  if (phase === 'completed') {
    return (
      <PublicLayout>
        <div ref={screenRef} tabIndex={-1} aria-live="polite" className="text-center max-w-sm px-6 outline-none">
          {loadingClosingMessage ? (
            <LoadingSpinner label={t.loading} />
          ) : closingMessage ? (
            <ClosingMessageHtml html={closingMessage.content} />
          ) : null}
        </div>
      </PublicLayout>
    );
  }

  if (phase === 'resume') {
    const answeredCount = accessData?.existing_responses?.length ?? 0;
    return (
      <PublicLayout>
        {/* Settings › Languages text; the count is computed here, never typed by the admin */}
        <div ref={screenRef} tabIndex={-1} aria-live="polite" className="text-center max-w-sm px-6 outline-none">
          <p className="text-gray-700 text-lg">{`${t.responsesAlreadySaved}: ${answeredCount}`}</p>
        </div>
        <div className="w-full max-w-sm flex flex-col gap-6">
          <div className="flex justify-center gap-6">
            {/* Decorative placeholder (keeps the two-button layout) — nothing to go back to. */}
            <DevnutButton
              disabled
              aria-hidden="true"
              tabIndex={-1}
              size="lg"
              variant="secondary"
              className="bg-gray-300 text-white px-6! py-2"
            >
              <ChevronLeft className="w-5! h-5!" />
            </DevnutButton>

            <DevnutButton
              onClick={handleResume}
              size="lg"
              title={t.next}
              aria-label={t.next}
              className={`px-6! py-2 ${focusRing}`}
            >
              <ChevronRight aria-hidden="true" className="w-5! h-5!" />
            </DevnutButton>
          </div>
        </div>
      </PublicLayout>
    );
  }

  // Questionnaire player
  if (phase === 'questionnaire') {
    return (
      <QuestionnairePlayer
        link={link!}
        assignmentId={assignmentId!}
        questionnaireId={accessData!.questionnaire.id}
        languageId={selectedLanguage!.id}
        t={t}
        initialAnswers={existingAnswers ?? undefined}
        onComplete={() => setPhase('completed')}
      />
    );
  }

  // Language screen — picked upfront, before any presentation/eligibility content shows
  if (phase === 'language') {
    return (
      <PublicLayout>
        <div className="w-full max-w-sm text-end">
          <h1 className="text-4xl font-bold text-primary">{t.welcome}</h1>
          <p id="choose-language-label" className="text-primary font-semibold">
            {t.chooseLanguage}
          </p>
        </div>
        <div className="w-full max-w-sm flex flex-col gap-6">
          <LanguageDropdown
            languages={languages}
            selected={selectedLanguage}
            onChange={setSelectedLanguage}
            placeholder={t.languagePlaceholder}
          />
          <div className="flex justify-center gap-6">
            {/* Decorative placeholder (keeps the two-button layout) — first screen, no way back. */}
            <DevnutButton
              disabled
              aria-hidden="true"
              tabIndex={-1}
              size="lg"
              variant="secondary"
              className="bg-gray-300 text-white px-6! py-2"
            >
              <ChevronLeft className="w-5! h-5!" />
            </DevnutButton>

            {/* Focusable even without a language (aria-disabled), so its reason can be announced. */}
            <DevnutButton
              aria-disabled={!selectedLanguage || undefined}
              aria-describedby={!selectedLanguage ? 'choose-language-label' : undefined}
              onClick={() => {
                if (!selectedLanguage) {
                  setLanguageReasonShown(true);
                  return;
                }
                void handleLanguageContinue();
              }}
              size="lg"
              aria-label={t.next}
              title={t.next}
              className={`px-6! py-2 ${focusRing} ${!selectedLanguage ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <ChevronRight aria-hidden="true" className="w-5! h-5!" />
            </DevnutButton>
          </div>
          <p
            role="alert"
            className={
              languageReasonShown && !selectedLanguage ? 'text-sm text-red-700 text-center' : 'sr-only'
            }
          >
            {languageReasonShown && !selectedLanguage ? t.chooseLanguage : ''}
          </p>
        </div>
      </PublicLayout>
    );
  }

  // Presentation screen — language is already chosen, only the content shows here
  if (phase === 'presentation') {
    return (
      <PublicLayout>
        <div ref={screenRef} tabIndex={-1} className="w-full max-w-sm flex flex-col gap-6 outline-none">
          {loadingPresentation ? (
            <LoadingSpinner label={t.loading} />
          ) : presentationContent ? (
            <div className="flex flex-col gap-4">
              {presentationContent.title && (
                <h1 className="text-xl font-semibold text-gray-800">{presentationContent.title}</h1>
              )}
              <div
                className="prose-content text-sm text-gray-700 leading-relaxed"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(presentationContent.content) }}
              />
              {presentationContent.pdf_url && (
                <PdfAttachment
                  url={presentationContent.pdf_url}
                  filename={presentationContent.pdf_filename}
                  label={t.viewAttachment}
                />
              )}
            </div>
          ) : null}
          <NavButtons
            onPrev={goBack}
            onNext={handlePresentationContinue}
            nextDisabled={loadingPresentation}
            prevLabel={t.prev}
            nextLabel={t.next}
          />
        </div>
      </PublicLayout>
    );
  }

  // Study info sheet screen — study purpose text, ending with accept/decline
  if (phase === 'study-info') {
    return (
      <PublicLayout>
        <div ref={screenRef} tabIndex={-1} className="w-full max-w-sm flex flex-col gap-6 outline-none">
          {loadingStudyInfoSheet ? (
            <LoadingSpinner label={t.loading} />
          ) : studyInfoSheet ? (
            <div className="flex flex-col gap-4">
              {studyInfoSheet.title && (
                <h1 className="text-xl font-semibold text-gray-800">{studyInfoSheet.title}</h1>
              )}
              <div
                className="prose-content text-sm text-gray-700 leading-relaxed"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(studyInfoSheet.content) }}
              />
              {studyInfoSheet.pdf_url && (
                <PdfAttachment
                  url={studyInfoSheet.pdf_url}
                  filename={studyInfoSheet.pdf_filename}
                  label={t.viewAttachment}
                />
              )}
            </div>
          ) : null}

          {studyInfoConsentQuestions.map((questionText, index) => (
            <div key={index} className="flex flex-col gap-3">
              <p id={`consent-question-${index}`} className="text-base">
                {questionText}
              </p>
              <RadioList
                labelledBy={`consent-question-${index}`}
                options={[
                  { id: 1, label: t.iConsent },
                  { id: 2, label: t.iDoNotConsent },
                ]}
                selected={
                  studyInfoConsents[index] === true
                    ? 1
                    : studyInfoConsents[index] === false
                      ? 2
                      : null
                }
                onSelect={(id) => handleStudyInfoConsentAnswer(index, id === 1)}
                disabled={false}
              />
            </div>
          ))}

          <NavButtons
            onPrev={goBack}
            showPrev={canGoBack}
            onNext={confirmStudyInfoConsent}
            nextDisabled={loadingStudyInfoSheet || starting || !allStudyInfoConsentsAnswered}
            nextHint={!allStudyInfoConsentsAnswered ? t.answerAllToContinue : undefined}
            prevLabel={t.prev}
            nextLabel={t.next}
          />
        </div>
      </PublicLayout>
    );
  }

  // Eligibility screen
  if (phase === 'eligibility') {
    const question = eligibilityQuestions[eligibilityIdx];
    const currentAnswer = eligibilityAnswers[eligibilityIdx];
    return (
      <PublicLayout>
        <div ref={screenRef} tabIndex={-1} className="w-full max-w-sm flex flex-col gap-6 outline-none">
          <div className="text-sm text-gray-600 text-center">
            {eligibilityIdx + 1} / {eligibilityQuestions.length}
          </div>
          {question && (
            <p
              id="eligibility-question"
              className="text-base font-medium text-gray-800 text-center"
            >
              {question.question_text}
            </p>
          )}
          <RadioList
            labelledBy={question ? 'eligibility-question' : undefined}
            options={[
              { id: 1, label: t.yes },
              { id: 2, label: t.no },
            ]}
            selected={currentAnswer === 'yes' ? 1 : currentAnswer === 'no' ? 2 : null}
            onSelect={(id) => selectEligibilityAnswer(id === 1 ? 'yes' : 'no')}
            disabled={false}
          />
          <NavButtons
            onPrev={goBack}
            onNext={confirmEligibilityAnswer}
            nextDisabled={!currentAnswer}
            nextHint={t.selectAnswerToContinue}
            prevLabel={t.prev}
            nextLabel={t.next}
          />
        </div>
      </PublicLayout>
    );
  }

  // Disqualified screen
  if (phase === 'disqualified') {
    return (
      <PublicLayout>
        <div ref={screenRef} tabIndex={-1} className="max-w-sm px-6 flex flex-col gap-6 outline-none">
          <p className="text-gray-700 text-base leading-relaxed text-center">
            {disqualificationMsg}
          </p>
          {/* In-session disqualification: back to revise the answer, or Submit to close the
              questionnaire for good (leaves only the message). Submit marks the assignment
              completed on tracked links. Restored on reload before Submit: Submit only. */}
          {(disqualifiedFrom || restoredScreeningKind) && screeningSubmitFailed && (
            <p role="alert" className="text-sm text-red-600 text-center">
              {t.errorGeneric}
            </p>
          )}
          {(disqualifiedFrom || restoredScreeningKind) && (
            <div className="flex justify-center items-center gap-6">
              {disqualifiedFrom && (
                <button
                  type="button"
                  onClick={goBack}
                  disabled={submittingScreening}
                  aria-label={t.prev}
                  title={t.prev}
                  className={`flex items-center justify-center px-6 py-2 rounded-full bg-primary text-white font-semibold hover:opacity-90 transition-opacity motion-reduce:transition-none ${focusRing}`}
                >
                  <ChevronLeft aria-hidden="true" className="w-5 h-5" />
                </button>
              )}
              <button
                type="button"
                onClick={submitScreeningOutcome}
                disabled={submittingScreening}
                aria-busy={submittingScreening}
                className={`px-5 py-2 rounded-full bg-secondary text-black font-semibold hover:opacity-90 transition-opacity motion-reduce:transition-none disabled:opacity-60 ${focusRing}`}
              >
                {t.submit}
              </button>
            </div>
          )}
        </div>
      </PublicLayout>
    );
  }

  // Privacy policy screen — same shape as presentation: back, content, optional PDF, continue
  if (phase === 'privacy-policy') {
    return (
      <PublicLayout>
        <div ref={screenRef} tabIndex={-1} className="w-full max-w-sm flex flex-col gap-6 outline-none">
          {loadingPrivacyPolicy ? (
            <LoadingSpinner label={t.loading} />
          ) : privacyPolicy ? (
            <div className="flex flex-col gap-4">
              {privacyPolicy.title && (
                <h1 className="text-xl font-semibold text-gray-800">{privacyPolicy.title}</h1>
              )}
              <div
                className="prose-content text-sm text-gray-700 leading-relaxed"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(privacyPolicy.content) }}
              />
              {privacyPolicy.pdf_url && (
                <PdfAttachment
                  url={privacyPolicy.pdf_url}
                  filename={privacyPolicy.pdf_filename}
                  label={t.viewAttachment}
                />
              )}
            </div>
          ) : null}
          <NavButtons
            onPrev={goBack}
            onNext={handlePrivacyPolicyContinue}
            nextDisabled={loadingPrivacyPolicy || starting}
            prevLabel={t.prev}
            nextLabel={t.next}
            nextBusy={starting}
            loadingLabel={t.loading}
          />
        </div>
      </PublicLayout>
    );
  }

  // Welcome screen
  // Language is picked once, upfront: on the presentation/eligibility screen when one
  // exists, otherwise here (the first screen the patient sees). Never ask twice.
  const languageChosenEarlier = !!(accessData?.has_presentation || accessData?.has_eligibility);
  return (
    <PublicLayout>
      {canGoBack && (
        <div className="w-full max-w-sm">
          <DevnutButton
            onClick={goBack}
            size="icon"
            variant="ghost"
            aria-label={t.prev}
            title={t.prev}
            className={`text-gray-600 hover:text-gray-800 -ml-2 ${focusRing}`}
          >
            <ChevronLeft aria-hidden="true" className="w-5! h-5!" />
          </DevnutButton>
        </div>
      )}
      {!languageChosenEarlier && languages.length > 1 && (
        <div className="w-full max-w-sm text-end">
          <p className="text-primary font-semibold">{t.chooseLanguage}</p>
        </div>
      )}
      <div ref={screenRef} tabIndex={-1} className="w-full max-w-sm flex flex-col gap-6 outline-none">
        {!languageChosenEarlier && languages.length > 1 && (
          <LanguageDropdown
            languages={languages}
            selected={selectedLanguage}
            onChange={setSelectedLanguage}
            placeholder={t.languagePlaceholder}
          />
        )}
        <DevnutButton
          disabled={!selectedLanguage || starting}
          onClick={handleStart}
          size="lg"
          className={`w-full py-3! text-lg ${focusRing}`}
          aria-label={starting ? t.loading : t.next}
          aria-busy={starting || undefined}
          title={t.next}
        >
          {starting ? (
            <div
              aria-hidden="true"
              className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"
            />
          ) : (
            <ChevronRight aria-hidden="true" className="w-5! h-5!" />
          )}
        </DevnutButton>
      </div>
    </PublicLayout>
  );
}
