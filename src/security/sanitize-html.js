/**
 * HTML sanitization for saved articles (Security Baseline, M0 §27).
 *
 * Policy: the Reader is NOT a browser. Rendered article HTML has scripts,
 * event handlers and dangerous URL schemes removed BEFORE it reaches a
 * DOM. DOMPurify defaults already cover the dangerous classes; we add
 * explicit FORBID_* as defense in depth and document the remainder.
 */
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

const require = createRequire(import.meta.url);

let domPurifyFactory = null;
async function getFactory() {
  if (!domPurifyFactory) {
    // DOMPurify needs a window; Node gets jsdom's (the desktop app will pass
    // its own window — the interface is identical).
    const { default: DOMPurify } = await import(pathToFileURL(require.resolve('dompurify')).href);
    domPurifyFactory = DOMPurify;
  }
  return domPurifyFactory;
}

export const FORBID_TAGS = ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input',
  'button', 'select', 'textarea', 'link', 'meta', 'base', 'frame', 'frameset',
  'applet', 'audio', 'video', 'source', 'track', 'svg', 'math'];

export const FORBID_ATTR = ['style'];

/**
 * Sanitize article HTML. Returns clean HTML string.
 * Kept: text, p/h1-h6, lists, tables, blockquote, pre/code, a[href http(s)/mailto],
 * img[src http(s)/data:image], semantic inline tags. Everything else dropped.
 */
export async function sanitizeArticleHtml(html) {
  const DOMPurify = await getFactory();
  const window = new JSDOM('').window;
  const purify = DOMPurify(window);
  return purify.sanitize(html, {
    FORBID_TAGS,
    FORBID_ATTR: [...FORBID_ATTR, 'srcset'],
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|data:image\/(?:png|gif|jpeg|webp);|#[a-z0-9_-]+|$)/i,
  });
}
