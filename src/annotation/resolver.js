/**
 * Text-level anchor resolution.
 *
 * An anchor is { quote, prefix?, suffix?, position? } (docs/FORMAT.md §5).
 * Resolution strategy, in order:
 *   1. position cache — verify quote still matches at the recorded offsets;
 *   2. exact quote search — disambiguate multiple hits with prefix/suffix;
 *   3. whitespace-normalized search — quote matched after collapsing spaces,
 *      mapped back to original offsets;
 *   4. otherwise the anchor is orphaned. Never an error, never deleted.
 */

const CONTEXT_WINDOW = 32;

/** Collapse whitespace runs to single spaces (string-level normalize). */
export function normalizeWhitespace(s) {
  return s.replace(/\s+/g, ' ');
}

/**
 * Normalize `text` and return { normalized, map } where map[i] is the
 * original index of normalized char i (trailing positions map past the end).
 */
function normalizeWithMap(text) {
  const normalized = [];
  const map = [];
  let i = 0;
  while (i < text.length) {
    if (/\s/.test(text[i])) {
      // collapse a whitespace run to one space
      const start = i;
      while (i < text.length && /\s/.test(text[i])) i++;
      normalized.push(' ');
      map.push(start);
    } else {
      normalized.push(text[i]);
      map.push(i);
      i++;
    }
  }
  // sentinel so end-of-match can map to text.length
  map.push(text.length);
  return { normalized: normalized.join(''), map };
}

/** How many trailing chars of `a` agree with trailing chars of `b`. */
function trailingAgreement(a, b) {
  let n = 0;
  const max = Math.min(a.length, b.length);
  while (n < max && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
  return n;
}

/** How many leading chars of `a` agree with leading chars of `b`. */
function leadingAgreement(a, b) {
  let n = 0;
  const max = Math.min(a.length, b.length);
  while (n < max && a[n] === b[n]) n++;
  return n;
}

/** All start indices where `needle` occurs in `haystack`. */
export function findOccurrences(haystack, needle) {
  const out = [];
  if (!needle) return out;
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    out.push(idx);
    idx = haystack.indexOf(needle, idx + 1);
  }
  return out;
}

function scoreOccurrence(text, start, end, anchor) {
  const prefix = anchor.prefix ?? '';
  const suffix = anchor.suffix ?? '';
  const actualPrefix = text.slice(Math.max(0, start - prefix.length), start);
  const actualSuffix = text.slice(end, end + suffix.length);
  return trailingAgreement(actualPrefix, prefix) + leadingAgreement(actualSuffix, suffix);
}

/**
 * Resolve an anchor against document text.
 * Returns { status:'resolved', start, end, quality } or { status:'orphaned' }.
 */
export function resolveTextAnchor(anchor, text) {
  if (!anchor || typeof anchor.quote !== 'string' || anchor.quote.length === 0) {
    throw new Error('anchor.quote must be a non-empty string');
  }

  // 1. position cache
  if (anchor.position && Number.isInteger(anchor.position.start) && Number.isInteger(anchor.position.end)) {
    const { start, end } = anchor.position;
    if (start >= 0 && end <= text.length && start < end && text.slice(start, end) === anchor.quote) {
      return { status: 'resolved', start, end, quality: 'exact-position' };
    }
  }

  // 2. exact search
  const exact = findOccurrences(text, anchor.quote);
  if (exact.length === 1) {
    return { status: 'resolved', start: exact[0], end: exact[0] + anchor.quote.length, quality: 'exact-quote' };
  }
  if (exact.length > 1) {
    let best = -1;
    let bestScore = -1;
    for (const start of exact) {
      const score = scoreOccurrence(text, start, start + anchor.quote.length, anchor);
      if (score > bestScore) {
        bestScore = score;
        best = start;
      }
    }
    // M2 §16: never silently pick "a B" — without agreeing context the match
    // is ambiguous and must NOT be treated as resolved.
    if (bestScore <= 0) {
      return { status: 'ambiguous', reason: 'quote occurs multiple times and no context agrees' };
    }
    return { status: 'resolved', start: best, end: best + anchor.quote.length, quality: 'exact-quote-disambiguated' };
  }

  // 3a. whitespace-collapsed search: handles documents that LOST whitespace
  // (quote has spaces, doc text was squashed) via normalized comparison.
  const collapsed = resolveCollapsed(anchor, text);
  if (collapsed) {
    if (collapsed.ambiguous) {
      return { status: 'ambiguous', reason: 'collapsed match occurs multiple times and no context agrees' };
    }
    return { status: 'resolved', ...collapsed, quality: 'normalized-quote' };
  }

  // 3b. whitespace-flexible search: handles documents that GAINED whitespace
  // inside the quote (each quote char optionally separated by whitespace).
  const flexible = buildFlexibleWhitespaceRegex(anchor.quote);
  if (flexible) {
    const hits = [];
    for (const m of text.matchAll(flexible)) {
      hits.push({ start: m.index, end: m.index + m[0].length });
      if (hits.length >= 100) break; // cap pathological docs
    }
    if (hits.length === 1) {
      return { status: 'resolved', start: hits[0].start, end: hits[0].end, quality: 'flexible-whitespace' };
    }
    if (hits.length > 1) {
      let best = null;
      let bestScore = -1;
      for (const hit of hits) {
        const score = scoreOccurrence(text, hit.start, hit.end, anchor);
        if (score > bestScore) {
          bestScore = score;
          best = hit;
        }
      }
      if (bestScore <= 0) {
        return { status: 'ambiguous', reason: 'flexible match occurs multiple times and no context agrees' };
      }
      return { status: 'resolved', start: best.start, end: best.end, quality: 'flexible-whitespace' };
    }
  }

  // 4. give up — keep, mark orphaned
  return { status: 'orphaned' };
}

/** Collapsed-whitespace search with original-offset mapping. */
function resolveCollapsed(anchor, text) {
  const doc = normalizeWithMap(text);
  const quote = normalizeWithMap(anchor.quote);
  const normPrefix = anchor.prefix ? normalizeWhitespace(anchor.prefix) : '';
  const normSuffix = anchor.suffix ? normalizeWhitespace(anchor.suffix) : '';
  const hits = findOccurrences(doc.normalized, quote.normalized);
  if (hits.length === 0) return null;
  let best = -1;
  let bestScore = -1;
  for (const nStart of hits) {
    const nEnd = nStart + quote.normalized.length;
    const aPrefix = doc.normalized.slice(Math.max(0, nStart - normPrefix.length), nStart);
    const aSuffix = doc.normalized.slice(nEnd, nEnd + normSuffix.length);
    const score = trailingAgreement(aPrefix, normPrefix) + leadingAgreement(aSuffix, normSuffix);
    if (score > bestScore) {
      bestScore = score;
      best = nStart;
    }
  }
  if (hits.length > 1 && bestScore <= 0) {
    return { ambiguous: true };
  }
  return { start: doc.map[best], end: doc.map[best + quote.normalized.length] };
}

/** Regex matching the quote with optional whitespace between any two chars. */
function buildFlexibleWhitespaceRegex(quote) {
  const parts = [];
  for (const ch of quote) {
    if (/\s/.test(ch)) parts.push('\\s+');
    else parts.push(ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  }
  if (parts.length === 0) return null;
  try {
    return new RegExp(parts.join('\\s*'), 'g');
  } catch {
    return null;
  }
}
