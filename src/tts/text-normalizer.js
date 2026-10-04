/**
 * Speech text normalizer (M8 §45/46). Produces the EPHEMERAL string handed to
 * the TTS provider — a derived representation that is never written back to
 * any source file. Minimal, semantics-preserving rules:
 *   - strip control / zero-width / soft-hyphen characters;
 *   - collapse whitespace runs to a single space;
 *   - trim.
 * URLs, emails, numbers and code are intentionally NOT rewritten: the segment
 * offsets refer to the raw canonical text, and heavy rewriting would break
 * the text↔speech correspondence for no clear reading gain.
 */
export function normalizeForSpeech(text) {
  return text
    .replace(/[\u00AD\u200B-\u200D\uFEFF]/g, '')
    // keep \n as space source; collapse all whitespace runs
    .replace(/[\t\v\f\r ]+/g, ' ')
    .replace(/\n+/g, ' ')
    // drop remaining C0 control characters
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim();
}
