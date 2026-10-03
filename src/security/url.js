/**
 * URL scheme allowlist (Security Baseline, M0).
 * Reader-rendered content may only navigate to http(s) / mailto; everything
 * else (javascript:, data:, file:, chrome:, vbscript:, ...) is rejected.
 * External http(s) links open in the system browser (M1+), never in-reader.
 */

const ALLOWED = /^(https?:|mailto:)/i;

/** True if the URL is safe to hand to a link handler / open externally. */
export function isAllowedExternalUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || rawUrl.trim() === '') return false;
  // Reject control characters and whitespace tricks outright
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(rawUrl)) return false;
  // A URL without a scheme (relative link) is not an external URL
  if (!/^[a-z][a-z0-9+.-]*:/i.test(rawUrl)) return false;
  return ALLOWED.test(rawUrl.trim());
}

/** Scheme of a URL string, lowercased; '' when absent/unparsable. */
export function urlScheme(rawUrl) {
  const m = /^[a-z][a-z0-9+.-]*(?=:)/i.exec(String(rawUrl ?? '').trim());
  return m ? m[0].toLowerCase() : '';
}
