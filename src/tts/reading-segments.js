/**
 * Reading text model (M8 §6/§17): turns format-specific section spans over
 * the canonical reader text into flat ReadingSegments.
 *
 *   sections: [{ label?, start, end, kind? }]   — block-level units per format
 *   segments: [{ index, sectionIndex, start, end, kind? }] — sentence spans
 *
 * All offsets are over the canonical reader text (the same string the rendered
 * DOM exposes), so every segment maps directly onto ReaderAnchor offsets for
 * highlight / "read from here" / jump. Formats only differ in the sections
 * they contribute (article: blocks with kind; book: chapters; pdf: pages) —
 * the segment builder is shared (M8 §59: one TTS, not one per format).
 */
import { segmentSentences } from './text-segmenter.js';

export function spansFromTexts(texts) {
  const spans = [];
  let pos = 0;
  for (let i = 0; i < texts.length; i++) {
    const len = (texts[i] ?? '').length;
    spans.push({ index: i, start: pos, end: pos + len });
    pos += len;
  }
  return spans;
}

/**
 * @param {Array<{label?:string, start:number, end:number, kind?:string}>} sections
 * @param {string} canonicalText
 * @param {{ maxSegLen?: number, skipKinds?: string[] }} opts
 *   skipKinds: section kinds excluded from reading (default ['code'] — M8 §47:
 *   source code / HTML / CSS must not be read as natural language).
 * @returns {{ sections, segments, totalLength }}
 */
export function buildReadingSegments(sections, canonicalText, { maxSegLen = 180, skipKinds = ['code'] } = {}) {
  const segments = [];
  const keptSections = [];
  for (const section of sections) {
    const s = Math.max(0, Math.min(section.start, canonicalText.length));
    const e = Math.max(s, Math.min(section.end, canonicalText.length));
    if (e <= s) continue;
    const sectionIndex = keptSections.length;
    keptSections.push({ ...section, start: s, end: e, segmentIndex: segments.length });
    if (skipKinds.includes(section.kind)) continue; // present for navigation, not for speech
    for (const span of segmentSentences(canonicalText.slice(s, e), { maxSegLen })) {
      segments.push({
        index: segments.length,
        sectionIndex,
        start: s + span.start,
        end: s + span.end,
        kind: section.kind ?? 'text',
      });
    }
  }
  return { sections: keptSections, segments, totalLength: canonicalText.length };
}
