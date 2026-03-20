import DOMPurify from 'dompurify';

/** Strip all HTML/JS from untrusted string content before rendering. */
export function sanitize(value: string): string {
  return DOMPurify.sanitize(value, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
}
