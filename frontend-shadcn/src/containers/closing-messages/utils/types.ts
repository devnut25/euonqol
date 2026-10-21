export interface ClosingMessageRow {
  id: number;
  survey_id: number;
  language_id: number;
  language: string | null;
  original_lang: string | null;
  content: string;
  link_used_message: string | null;
  survey_closed_message: string | null;
  resume_message: string | null;
  version: number;
  is_current: boolean;
  is_fallback: boolean;
  created_at: string;
  authorizations?: { view?: boolean; update?: boolean; delete?: boolean };
}

/** Optional messages: when empty the public page shows its built-in default text. */
export const OPTIONAL_MESSAGE_FIELDS = [
  'link_used_message',
  'survey_closed_message',
  'resume_message',
] as const;

export type OptionalMessageField = (typeof OPTIONAL_MESSAGE_FIELDS)[number];
