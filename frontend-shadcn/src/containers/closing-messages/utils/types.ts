export interface ClosingMessageRow {
  id: number;
  survey_id: number;
  language_id: number;
  language: string | null;
  original_lang: string | null;
  content: string;
  link_used_message: string | null;
  survey_closed_message: string | null;
  is_current: boolean;
  is_fallback: boolean;
  created_at: string;
  authorizations?: { view?: boolean; update?: boolean; delete?: boolean };
}

/** Messages besides `content`, shown by the public page outside the completed screen (all required). */
export const EXTRA_MESSAGE_FIELDS = [
  'link_used_message',
  'survey_closed_message',
] as const;

export type ExtraMessageField = (typeof EXTRA_MESSAGE_FIELDS)[number];
