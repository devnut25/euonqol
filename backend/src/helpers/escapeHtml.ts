/**
 * Escapes the characters that would break or inject markup when a user-provided value
 * (survey name, user name…) is interpolated into an HTML email body.
 */
export const escapeHtml = (str: string): string =>
  str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
