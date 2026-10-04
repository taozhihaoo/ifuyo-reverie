/**
 * Speech sentence segmenter (M8 §15/16). Splits canonical reader text into
 * sentence-level segments and reports their offsets in the ORIGINAL string,
 * so segments map straight onto ReaderAnchor offsets for highlighting and
 * "read from here".
 *
 * Rules:
 *  - sentence-end punctuation: 。！？!?；;… and ".;:?" style English stops,
 *    with closing quotes/brackets attached to the sentence;
 *  - '.' ends a sentence only when it is not an abbreviation / URL /
 *    decimal / single-letter initial continuation (§15 English abbreviations);
 *  - newlines are whitespace, NOT sentence ends (§16: visual line breaks are
 *    not semantic sentence boundaries — PDF/code especially);
 *  - overlong runs (no punctuation) split at the last , ，、：： inside the
 *    window, then hard-cut at maxLen as a final fallback;
 *  - whitespace-only spans never become segments.
 */

const ABBREVIATIONS = new Set([
  'e.g', 'i.e', 'etc', 'vs', 'dr', 'mr', 'mrs', 'ms', 'prof', 'sr', 'jr',
  'st', 'no', 'fig', 'eq', 'approx', 'inc', 'ltd', 'co', 'corp', 'dept',
  'univ', 'assn', 'bros', 'cf', 'ca', 'ed', 'eds', 'vol',
]);

const isAsciiLetter = (ch) => (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z');
const isDigit = (ch) => ch >= '0' && ch <= '9';

/** Does the '.' at index i really end a sentence? */
function periodEndsSentence(text, i) {
  const prev = i > 0 ? text[i - 1] : '';
  // decimal numbers: 3.14
  if (isDigit(prev) && isDigit(text[i + 1] ?? '')) return false;
  // word before the dot: letters/digits/dots — abbreviations, initials, domains
  let w = i;
  while (w > 0 && (isAsciiLetter(text[w - 1]) || isDigit(text[w - 1]) || text[w - 1] === '.')) w--;
  const word = text.slice(w, i).toLowerCase();
  // single-letter initial: "J. Smith"
  if (word.length === 1 && isAsciiLetter(prev)) return false;
  // abbreviation or URL/domain tail: "e.g", "etc", "example.com"
  if (word.length <= 5 && ABBREVIATIONS.has(word)) return false;
  if (/^[a-z]+(\.[a-z]+)+$/.test(word)) return false;
  // what follows: a lowercase letter right after the dot (and no sentence
  // start punctuation) reads as mid-token continuation
  let j = i + 1;
  while (j < text.length && text[j] === ' ') j++;
  const next = text[j];
  if (next !== undefined && isAsciiLetter(next) && next === next.toLowerCase()) {
    return false;
  }
  return true;
}

/** Sentence-end predicate for a candidate terminator at index i. */
function isTerminator(text, i) {
  const ch = text[i];
  if (ch === '。' || ch === '！' || ch === '？' || ch === '！' || ch === '？'
    || ch === '；' || ch === ';' || ch === '…') return true;
  if (ch === '!') return text[i + 1] !== '!'; // collapse !! / !?
  if (ch === '?') return text[i + 1] !== '?';
  if (ch === '.') return periodEndsSentence(text, i);
  return false;
}

/** Closing quotes/brackets that belong to the sentence after the terminator. */
const CLOSERS = '”』」）)］]】"\'';

/**
 * Split `text` into sentence spans [{start, end}) over the original string.
 * Whitespace-only spans are skipped; boundaries are trimmed.
 */
export function segmentSentences(text, { maxLen = 180 } = {}) {
  const spans = [];
  const n = text.length;
  let start = 0;
  const pushTrimmed = (s, e) => {
    while (s < e && /\s/.test(text[s])) s++;
    while (e > s && /\s/.test(text[e - 1])) e--;
    if (e > s) spans.push({ start: s, end: e });
  };
  while (start < n) {
    let end = -1;
    let i = start;
    const hardLimit = start + maxLen;
    for (; i < n; i++) {
      if (i >= hardLimit) break;
      if (isTerminator(text, i)) {
        let e = i + 1;
        if (text[i] === '…') { while (e < n && text[e] === '…') e++; }
        while (e < n && CLOSERS.includes(text[e])) e++;
        end = e;
        break;
      }
    }
    if (end === -1 || end - start > maxLen) {
      // no terminator in window (or runaway quote): soft-split then hard-cut
      if (i - start >= maxLen) {
        let cut = -1;
        for (let k = hardLimit - 1; k > start + Math.floor(maxLen / 2); k--) {
          const ch = text[k];
          if (ch === '，' || ch === ',' || ch === '、' || ch === '：' || ch === ':') { cut = k + 1; break; }
          if (ch === ' ') { cut = k + 1; if (cut <= start + maxLen) break; }
        }
        end = cut > start ? cut : hardLimit;
      } else {
        end = n; // short tail without terminator
      }
    }
    pushTrimmed(start, Math.min(end, n));
    start = Math.min(end, n);
  }
  return spans;
}
