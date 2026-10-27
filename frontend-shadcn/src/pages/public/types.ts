// Public access types
export interface ExistingResponse {
  question_id: number;
  answer_option_id: number | null;
  answer_text: string | null;
  socio_demo_answer_id: number | null;
  feedback_answer_id: number | null;
}

export interface QuestionnaireAccess {
  access_mode: string;
  assignment_id?: number;
  survey: { id: number; name: string };
  questionnaire: { id: number; title: string; description: string; type: string };
  completion_status: string;
  can_resume: boolean;
  session_language_id?: number | null;
  existing_responses: ExistingResponse[];
  has_privacy_policy?: boolean;
  has_presentation?: boolean;
  has_eligibility?: boolean;
  has_study_info_sheet?: boolean;
  has_closing_message?: boolean;
  /** Populated for identified/traceable links only. null = eligibility not attempted. */
  eligibility_status?: 'disqualified' | 'passed' | null;
  eligibility_disqualification_msg?: string | null;
  /** Populated for identified/traceable links only. null = not declined. */
  study_info_status?: 'declined' | null;
  study_info_rejection_msg?: string | null;
}

export interface StudyInfoConsentQuestion {
  id: number;
  question_text: string;
  order_position: number;
}

export interface StudyInfoSheetContent {
  title: string | null;
  content: string;
  rejection_message: string | null;
  consent_questions: StudyInfoConsentQuestion[];
  pdf_url: string | null;
  pdf_filename: string | null;
}

export interface PresentationContent {
  title: string | null;
  content: string;
  pdf_url: string | null;
  pdf_filename: string | null;
}

export interface ClosingMessageContent {
  content: string;
  /** Custom variants — null means "use the built-in default text" (labels.ts). */
  link_used_message: string | null;
  survey_closed_message: string | null;
  language_id: number;
  is_fallback: boolean;
}

export interface PrivacyPolicyContent {
  id: number;
  title: string;
  content: string;
  pdf_url: string | null;
  pdf_filename: string | null;
}

export interface EligibilityQuestion {
  id: number;
  expected_answer: 'yes' | 'no';
  order_position: number;
  question_text: string;
  disqualification_message: string | null;
}

// Mirrors what getAvailableLanguages actually returns: eu_countries has no ISO code
// column, so there is no `code` here — map navigator's ISO code onto `language` via
// ISO_639_1_TO_LANGUAGE_NAME instead.
export interface Language {
  id: number;
  name?: string;
  language: string;
  original_lang: string;
}

// Questionnaire player types

export interface AnswerOption {
  id: number;
  value?: number;
  label?: string;
  answer_text?: string;
  answer_type?: string;
  display_order: number;
  /** Bounds of a numeric free-input answer (socio-demo 'Integer' / feedback 'Number'); null = unbounded side. */
  min_value?: number | null;
  max_value?: number | null;
  /** null/undefined = genuine scale position; non-null = sentinel (SKIP_SYS/SKIP_PAT/NA/PNTA). */
  option_code?: string | null;
}

export interface Question {
  position: number;
  questionId: number;
  questionCode: string;
  questionKind: 'static' | 'cat' | 'socio-demo' | 'feedback';
  questionType: string | null;
  questionHead: string;
  questionPramble: string;
  questionText: string;
  parentQid: string | null;
  operator: string | null;
  conditionValue: string | null;
  answerProfile: { code: string; description: string } | null;
  answerOptions: AnswerOption[];
}

/** A genuinely-adaptive scale a dynamic module drives, with the position (in the
 * same space as Question.position) of its first item — used to interleave the
 * adaptive CAT phase with fixed questions in the original Excel row order. */
export interface AdaptiveScaleEntry {
  scale: string;
  entryPosition: number;
  /** Minimum items this scale's CAT engine setting requires before stopping —
   * used by the progress bar to count this scale's contribution to "total
   * items" (and, while in progress, how many of them are "done") without
   * knowing in advance exactly how many items the engine will end up asking. */
  minItems: number;
}

export interface Module {
  position: number;
  module: {
    id: number;
    name: string;
    type: 'static' | 'dynamic';
    cat_setting?: { setting_key: string } | null;
  };
  questions: Question[];
  isDynamic?: boolean;
  adaptiveScales?: AdaptiveScaleEntry[];
}

export interface SavedAnswer {
  questionId: number;
  answer_option_id?: number;
  answer_text?: string;
  socio_demo_answer_id?: number;
  feedback_answer_id?: number;
}
