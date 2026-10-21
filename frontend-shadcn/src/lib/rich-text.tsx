import DOMPurify from 'dompurify';

/**
 * Sanitize HTML coming from admin-authored content (e.g. Excel-imported question text)
 * before it is injected via dangerouslySetInnerHTML.
 */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html);
}

/**
 * Plain-text fallback for previews/truncation (e.g. sidebar snippets) where HTML tags
 * must not appear literally and must not be cut mid-tag.
 */
export function stripHtml(html: string): string {
  return DOMPurify.sanitize(html, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
}

/** Renders admin-authored HTML (e.g. question_text) sanitized via DOMPurify. */
export function RichText({ html, className }: { html: string; className?: string }) {
  return <span className={className} dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }} />;
}
