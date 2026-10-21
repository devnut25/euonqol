export interface Language {
  id: number;
  language: string;
  original_lang: string;
}

export interface Translation {
  id: number;
  language_id: number;
  language: string | null;
  original_lang: string | null;
  question_text: string;
  disqualification_message: string | null;
  is_fallback: boolean;
}

export interface Question {
  id: number;
  survey_id: number;
  expected_answer: 'yes' | 'no';
  order_position: number;
  version: number;
  is_active: boolean;
  is_current: boolean;
  translations: Translation[];
  authorizations?: { view?: boolean; update?: boolean; delete?: boolean };
}

export interface LanguageGroup {
  language_id: number;
  language_name: string;
  original_lang: string;
  is_fallback: boolean;
  items: Array<{
    question_id: number;
    expected_answer: 'yes' | 'no';
    order_position: number;
    question_text: string;
    disqualification_message: string | null;
  }>;
}
