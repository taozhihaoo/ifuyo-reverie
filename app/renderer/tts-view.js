/**
 * TTS reader integration (M8 §69) — the shell-side wiring between the
 * Unified Reader Shell and the TTS domain (controller/provider/segments).
 * app.js only calls open()/close()/readSelection()/stopForNavigation();
 * everything else (controls, follow-highlight, voices, hints) lives here.
 *
 * Location rules (M8 §8/§31): segments are canonical offsets, so the current
 * segment paints through the SAME ReaderAnchor + CSS Highlight pipeline used
 * by annotations/search — no second location system. Follow-scrolling happens
 * only while playing in document mode; selection mode never scrolls and never
 * touches progress.
 */
import { WebSpeechProvider } from './tts-provider.js';
import { buildReadingSegments } from '../../src/tts/reading-segments.js';

const els = {
  controls: null, play: null, prev: null, next: null, stop: null,
  rate: null, voice: null, status: null, popupRead: null,
};
let content = null;
let provider = null;
let controller = null;
let canonical = '';
let segments = [];
let sectionLabels = [];
let documentId = null;
let docType = null;
let selectionMode = false;

const SETTINGS_KEY_VOICE = 'reverie.tts.voice';
const SETTINGS_KEY_RATE = 'reverie.tts.rate';

function $(id) { return document.getElementById(id); }

// ------------------------------------------------------------- sections
/** Format → sections over canonical text (M8 §18: Reader decides what to read). */
function sectionsFor(loaded) {
  const spansOf = (texts) => {
    const out = [];
    let pos = 0;
    for (let i = 0; i < texts.length; i++) {
      const len = (texts[i] ?? '').length;
      out.push({ index: i, start: pos, end: pos + len });
      pos += len;
    }
    return out;
  };
  if (loaded.type === 'book') {
    return spansOf(loaded.chapters.map((c) => c.text)).map((s) => ({
      label: loaded.chapters[s.index].title || window.I18N.t('toc.chapter', { n: s.index + 1 }),
      start: s.start, end: s.end,
    }));
  }
  if (loaded.type === 'pdf') {
    return (loaded.page_spans ?? []).map((s) => ({
      label: window.I18N.t('toc.page', { n: s.index + 1 }),
      start: s.start, end: s.end,
    }));
  }
  // article: blocks (canonical === blocks.text.join(''), enforced by tests)
  const spans = spansOf((loaded.blocks ?? []).map((b) => b.text));
  return spans.map((s) => {
    const b = loaded.blocks[s.index];
    return {
      label: b.type === 'heading' ? (b.text || window.I18N.t('toc.untitled')).slice(0, 24) : window.I18N.t('toc.para', { n: s.index + 1 }),
      start: s.start, end: s.end,
      kind: b.type === 'code' ? 'code' : undefined,
    };
  });
}

// ------------------------------------------------------------- view sync
function paintSegment(segment) {
  if (!('highlights' in CSS)) return;
  CSS.highlights.delete('reverie-tts');
  if (!segment) return;
  const range = ReaderAnchor.rangeForOffsets(content, segment.start, segment.end);
  if (range) CSS.highlights.set('reverie-tts', new Highlight(range));
}

function followSegment(segment) {
  if (!segment) return;
  const ensure = (docType === 'pdf' && globalThis.ReveriePdf)
    ? globalThis.ReveriePdf.revealOffset(segment.start)
    : Promise.resolve();
  Promise.resolve(ensure).then(() => {
    paintSegment(segment);
    if (!selectionMode && controller.getState() === 'speaking') {
      const range = ReaderAnchor.rangeForOffsets(content, segment.start, segment.end);
      range?.startContainer.parentElement?.scrollIntoView({ behavior: 'auto', block: 'center' });
    }
  });
}

function setStatus(text) { if (els.status) els.status.textContent = text; }

function updatePlayButton() {
  if (!els.play) return;
  const st = controller?.getState() ?? 'idle';
  els.play.textContent = st === 'speaking' ? '⏸' : '▶';
  els.play.title = st === 'speaking' ? window.I18N.t('tts.pause') : (st === 'paused' ? window.I18N.t('tts.resume') : window.I18N.t('tts.play'));
}

// ------------------------------------------------------------- controller
function ensureController() {
  if (controller || !globalThis.Tts) return controller;
  provider = new WebSpeechProvider();
  provider.onVoicesChanged?.(() => populateVoices()); // Chromium loads voices async
  controller = globalThis.Tts.createTtsController({
    provider,
    getSegmentText: (seg) => canonical.slice(seg.start, seg.end),
    onSegment: (segment) => {
      if (segment) followSegment(segment);
      else if (!selectionMode) paintSegment(null);
    },
    onState: (state) => {
      updatePlayButton();
      if (state === 'idle' && !selectionMode) setStatus('');
      if (state === 'speaking') {
        const i = controller.getCursor();
        setStatus(selectionMode ? window.I18N.t('tts.statusSelection') : window.I18N.t('tts.statusSentence', { i: i + 1, n: segments.length }));
      } else if (state === 'paused') {
        setStatus(window.I18N.t('tts.paused'));
      }
    },
    onNotice: (kind) => {
      if (kind === 'no-voice-match') setStatus('未找到匹配语言的语音，将使用默认语音');
      else if (kind === 'no-voices') setStatus('未找到可用语音');
      else if (kind === 'provider-error') setStatus('朗读服务发生错误');
      else if (kind === 'completed') setStatus(selectionMode ? '' : '已读完');
    },
  });
  return controller;
}

function populateVoices() {
  if (!controller || !els.voice) return;
  const voices = controller.refreshVoices();
  const current = localStorage.getItem(SETTINGS_KEY_VOICE) ?? '';
  els.voice.textContent = '';
  const auto = document.createElement('option');
  auto.value = '';
  auto.textContent = window.I18N.t('tts.voiceAuto');
  els.voice.appendChild(auto);
  for (const v of voices) {
    const opt = document.createElement('option');
    opt.value = v.voiceId;
    opt.textContent = `${v.displayName} (${v.lang})`;
    els.voice.appendChild(opt);
  }
  els.voice.value = current;
  if (els.voice.value !== current) els.voice.value = '';
  controller.setVoice(els.voice.value || null);
}

// ------------------------------------------------------------- offsets
/** First canonical offset near the viewport reading anchor (M8 §26). */
function currentReadingOffset() {
  const index = ReaderAnchor.textIndex(content);
  const anchorY = window.scrollY + window.innerHeight * 0.3;
  for (const e of index.entries) {
    const el = e.node.parentElement;
    if (!el || !el.getBoundingClientRect) continue;
    const rect = el.getBoundingClientRect();
    const top = rect.top + window.scrollY;
    if (top + Math.min(rect.height, window.innerHeight) >= anchorY) return e.start;
  }
  return 0;
}

function segmentIndexForOffset(offset) {
  const exact = segments.findIndex((s) => offset >= s.start && offset < s.end);
  if (exact !== -1) return exact;
  return segments.findIndex((s) => s.end > offset);
}

// ------------------------------------------------------------- public API
export function open(loaded, readerContentEl) {
  content = readerContentEl;
  documentId = loaded.meta?.document_id ?? null;
  docType = loaded.type;
  canonical = loaded.canonicalText ?? '';
  segments = [];
  sectionLabels = [];
  selectionMode = false;
  els.controls = $('tts-controls');
  els.play = $('tts-play');
  els.prev = $('tts-prev');
  els.next = $('tts-next');
  els.stop = $('tts-stop');
  els.rate = $('tts-rate');
  els.voice = $('tts-voice');
  els.status = $('tts-status');

  const available = globalThis.Tts && providerAvailable() && canonical.trim().length > 0;
  els.controls.hidden = !available;
  if (!available) {
    if (canonical.trim().length === 0 && els.status) setStatus(window.I18N.t('tts.noReadableText'));
    close();
    return false;
  }
  const ctl = ensureController();
  const { segments: segs } = buildReadingSegments(sectionsFor(loaded), canonical);
  segments = segs;
  sectionLabels = segs.map((s) => s.sectionLabel ?? '');
  ctl.load(segments, { mode: 'document' });

  // restore + wire settings
  const savedRate = Number(localStorage.getItem(SETTINGS_KEY_RATE));
  if (savedRate >= 0.75 && savedRate <= 2) { els.rate.value = String(savedRate); }
  ctl.setRate(Number(els.rate.value) || 1);
  populateVoices();
  // voices may still be loading on first open — retry shortly
  if (els.voice.options.length <= 1) setTimeout(() => populateVoices(), 1200);

  updatePlayButton();
  setStatus('');
  return true;
}

function providerAvailable() {
  try { return new WebSpeechProvider().available(); } catch { return false; }
}

/** Leave the reader / switch documents: stop everything, clear visuals. */
export function close() {
  controller?.stop();
  if ('highlights' in CSS) CSS.highlights.delete('reverie-tts');
  provider?.dispose?.();
  if (els.controls) els.controls.hidden = true;
  setStatus('');
  selectionMode = false;
}

/** §29: any manual navigation interrupts the queue; the new location is the
 * next "read from here" start. */
export function stopForNavigation() {
  if (controller && controller.getState() !== 'idle') {
    controller.stop();
    setStatus('');
  }
  if ('highlights' in CSS) CSS.highlights.delete('reverie-tts');
}

/** §25: read the current selection as a one-shot queue (never scrolls,
 * never writes progress — enforced by selectionMode + no follow). */
export function readSelection(quote, absoluteStart) {
  if (!controller || !quote?.trim()) return;
  selectionMode = true;
  const { segments: selSegments } = buildReadingSegments(
    [{ label: window.I18N.t('tts.selectionSection'), start: 0, end: quote.length }],
    quote,
  );
  const absolute = selSegments.map((s) => ({
    ...s, start: s.start + absoluteStart, end: s.end + absoluteStart,
  }));
  segments = absolute;
  controller.load(absolute, { mode: 'selection' });
  controller.play(0);
}

// ------------------------------------------------------------- controls
function wireControls() {
  els.play = $('tts-play');
  els.play.addEventListener('click', () => {
    const ctl = ensureController();
    const st = ctl.getState();
    if (st === 'speaking') { ctl.pause(); return; }
    if (st === 'paused') { ctl.resume(); return; }
    // start from the current reading position (M8 §26 fallback chain:
    // exact offset → next segment → document start)
    selectionMode = false;
    const offset = currentReadingOffset();
    const at = segmentIndexForOffset(offset);
    ctl.load(segments, { mode: 'document' });
    ctl.play(at === -1 ? 0 : at);
  });
  $('tts-prev').addEventListener('click', () => {
    selectionMode = false;
    ensureController();
    const wasIdle = controller.getState() === 'idle';
    controller.previous();
    if (wasIdle) followSegment(segments[controller.getCursor()]);
  });
  $('tts-next').addEventListener('click', () => {
    selectionMode = false;
    ensureController();
    const wasIdle = controller.getState() === 'idle';
    controller.next();
    if (wasIdle) followSegment(segments[controller.getCursor()]);
  });
  $('tts-stop').addEventListener('click', () => {
    controller?.stop();
    paintSegment(null);
    setStatus('');
  });
  $('tts-rate').addEventListener('change', () => {
    const r = Number($('tts-rate').value) || 1;
    controller?.setRate(r);
    localStorage.setItem(SETTINGS_KEY_RATE, String(r));
  });
  $('tts-voice').addEventListener('change', () => {
    controller?.setVoice($('tts-voice').value || null);
    localStorage.setItem(SETTINGS_KEY_VOICE, $('tts-voice').value);
  });
  // selection reading (popup button wired in app.js mouseup flow)
  $('popup-read').addEventListener('click', () => {
    const parts = window.__reverieSelectionParts;
    window.__reverieSelectionParts = null;
    document.getElementById('selection-popup').hidden = true;
    window.getSelection().removeAllRanges();
    if (parts?.quote) readSelection(parts.quote, parts.position.start);
  });
}

export function isWired() { return Boolean(els.play); }

// boot: expose for app.js (classic script runs before modules)
globalThis.ReverieTtsView = { open, close, readSelection, stopForNavigation };
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { wireControls(); $('tts-controls').hidden = true; });
} else {
  wireControls();
  $('tts-controls').hidden = true;
}
