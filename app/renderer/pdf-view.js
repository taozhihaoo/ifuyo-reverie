/**
 * PDF page renderer (M7) — the renderer-side PDF Adapter view. This is the
 * ONLY renderer file allowed to touch the pdf.js API (M7 §7-8); app.js sees
 * plain DOM and the small init/dispose/navigate surface at the bottom.
 *
 * Rendering model (M7 §10-13):
 *   - each page is a fixed-aspect section (layout is stable before render)
 *   - canvases render lazily for visible ±1 pages with an LRU cap, and every
 *     render task is cancellable — the render cache is disposable runtime
 *     state, never user data (M7 §13)
 *   - pdf.js TextLayer builds the per-page text layer: span.textContent =
 *     item.str, EOL = <br> — so the reader-content DOM textContent equals the
 *     main-process canonical text byte-for-byte (M7 §13, integration test
 *     locked). Text layers are built lazily but KEPT: they are the DOM form
 *     of the canonical text that anchors/search/highlights resolve against,
 *     not a bitmap cache.
 *   - all geometry goes through pdf.js viewport (rotation included) — no
 *     hand-written x*zoom anywhere (M7 §49)
 */
import * as pdfjsLib from '../vendor/pdfjs/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;

// pdf.js binary runtime assets (cmaps / standard fonts / wasm) are fetched
// through IPC: the sandboxed renderer cannot fetch file:// URLs and CSP keeps
// connect-src 'none'. pdf.js calls this factory main-thread when
// useWorkerFetch is false — structured plain data only crosses the bridge.
class IpcBinaryDataFactory {
  constructor({ cMapUrl = null, standardFontDataUrl = null, wasmUrl = null } = {}) {
    this.cMapUrl = cMapUrl;
    this.standardFontDataUrl = standardFontDataUrl;
    this.wasmUrl = wasmUrl;
  }
  async fetch({ kind, filename }) {
    const base = kind === 'cMapUrl' ? this.cMapUrl
      : kind === 'standardFontDataUrl' ? this.standardFontDataUrl
      : kind === 'wasmUrl' ? this.wasmUrl : null;
    if (!base) throw new Error(`Ensure that the \`${kind}\` API parameter is provided.`);
    const data = await window.reverie.pdfVendorData(base + filename);
    const wantsText = kind === 'cMapUrl' && !filename.endsWith('.bcmap');
    return wantsText ? new TextDecoder().decode(data) : new Uint8Array(data);
  }
}

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3.0;
const ZOOM_STEP = 1.2;
const CANVAS_PIXEL_CAP = 2 ** 24;   // ~16.7 MP per page render (M7 §14.3)
const CANVAS_LRU_MAX = 6;           // rendered pages kept as bitmaps

const state = {
  documentId: null,
  doc: null,
  pages: [],            // {index,width,height,rotation,has_text}
  pageSpans: null,      // [{index,start,end}] over canonical text
  pageLabels: null,
  sections: new Map(),  // pageIndex -> section element
  canvases: new Map(),  // pageIndex -> {canvas, renderTask, lastUsed}
  textLayers: new Map(),// pageIndex -> Promise (kept once built)
  observer: null,
  scrollListener: null,
  onProgress: null,
  zoom: 1,
  destroyed: true,
};

const els = {
  content: null,
  cur: null,
  total: null,
  label: null,
};

// ---------------------------------------------------------------- utilities
function rotatedDims(page) {
  const swap = page.rotation % 180 !== 0;
  return { rw: swap ? page.height : page.width, rh: swap ? page.width : page.height };
}

function contentWidth() {
  return Math.max(320, els.content.clientWidth - 2);
}

function sectionWidth() {
  return Math.round(contentWidth() * state.zoom);
}

function pageLabel(index) {
  const l = state.pageLabels?.[index];
  return typeof l === 'string' && l !== '' ? l : String(index + 1);
}

/** Build (once) and return the section element for a page. */
function buildSection(page) {
  const section = document.createElement('section');
  section.className = 'pdf-page';
  section.dataset.pageIndex = String(page.index);
  const { rw, rh } = rotatedDims(page);
  section.style.aspectRatio = `${rw} / ${rh}`;
  section.dataset.pageLabel = pageLabel(page.index);
  if (!page.has_text) section.classList.add('pdf-page-no-text');

  const canvasHost = document.createElement('div');
  canvasHost.className = 'pdf-canvas-host';
  section.appendChild(canvasHost);

  const textLayer = document.createElement('div');
  textLayer.className = 'pdf-text-layer';
  section.appendChild(textLayer);

  // render-failure placeholder carries NO text nodes — the section's
  // textContent must stay byte-equal to canonical text (M7 §13)
  const err = document.createElement('div');
  err.className = 'pdf-page-error';
  err.dataset.msg = window.I18N.t('pdf.pageError');
  section.appendChild(err);

  els.content.appendChild(section);
  state.sections.set(page.index, section);
  return section;
}

function applyZoomToSection(section, page) {
  const { rw } = rotatedDims(page);
  const cssWidth = sectionWidth();
  section.style.width = `${cssWidth}px`;
  section.style.setProperty('--total-scale-factor', String(cssWidth / rw));
}

function relayoutAll() {
  for (const [index, section] of state.sections) {
    const page = state.pages[index];
    if (page) applyZoomToSection(section, page);
  }
  for (const entry of state.canvases.values()) {
    entry.lastUsed = performance.now();
  }
  evictDistantCanvases();
  schedulePrefetch();
}

// ---------------------------------------------------------------- rendering
async function renderCanvas(index, section) {
  const page = state.pages[index];
  if (!page) return;
  const existing = state.canvases.get(index);
  if (existing) { existing.lastUsed = performance.now(); return; }

  const doc = state.doc;
  let pdfPage;
  try {
    pdfPage = await doc.getPage(index + 1);
  } catch {
    section.classList.add('pdf-page-error-visible'); // page-level failure (M7 §52)
    return;
  }
  if (state.destroyed || state.documentId === null) return;

  const { rw, rh } = rotatedDims(page);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cssWidth = sectionWidth();
  let scale = (cssWidth * dpr) / rw;
  // render-scale clamp: a huge page never gets a huge bitmap (M7 §14.3)
  if (rw * rh * scale * scale > CANVAS_PIXEL_CAP) {
    scale = Math.sqrt(CANVAS_PIXEL_CAP / (rw * rh));
  }
  const viewport = pdfPage.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  canvas.className = 'pdf-canvas';
  const host = section.querySelector('.pdf-canvas-host');
  const prevCanvas = host.querySelector('canvas.pdf-canvas');
  if (prevCanvas) prevCanvas.remove();
  host.appendChild(canvas);

  const renderTask = pdfPage.render({
    canvasContext: canvas.getContext('2d'),
    viewport,
  });
  const entry = { canvas, renderTask, lastUsed: performance.now() };
  state.canvases.set(index, entry);
  try {
    await renderTask.promise;
  } catch (err) {
    state.canvases.delete(index);
    if (err?.name === 'RenderingCancelledException') return;
    canvas.remove();
    section.classList.add('pdf-page-error-visible');
    return;
  }
  if (state.destroyed) return;
  evictDistantCanvases();
}

/** Keep at most CANVAS_LRU_MAX rendered bitmaps; cancel+drop the oldest. */
function evictDistantCanvases() {
  if (state.canvases.size <= CANVAS_LRU_MAX) return;
  const ordered = [...state.canvases.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed);
  while (ordered.length > CANVAS_LRU_MAX) {
    const [index, entry] = ordered.shift();
    try { entry.renderTask?.cancel(); } catch { /* not started */ }
    entry.canvas.remove();
    state.canvases.delete(index);
  }
}

// ---------------------------------------------------------------- text layer
/**
 * Build the page's text layer (once; kept). After it exists the section's
 * DOM text is part of reader-content, so ReaderAnchor offsets resolve.
 */
async function ensureTextLayer(index) {
  if (state.textLayers.has(index)) return state.textLayers.get(index);
  const promise = (async () => {
    const section = state.sections.get(index) ?? buildSection(state.pages[index]);
    const container = section.querySelector('.pdf-text-layer');
    const pdfPage = await state.doc.getPage(index + 1);
    const content = await pdfPage.getTextContent();
    if (state.destroyed) return;
    // scale-1 viewport: TextLayer positions spans in % of the raw page box;
    // actual display size comes from --total-scale-factor (managed on zoom)
    const viewport = pdfPage.getViewport({ scale: 1 });
    const layer = new pdfjsLib.TextLayer({
      textContentSource: content,
      container,
      viewport,
    });
    await layer.render();
    if (state.destroyed) return;
    applyZoomToSection(section, state.pages[index]);
    // highlights may anchor on this page: re-apply now that text exists
    window.__reverieReapplyHighlights?.();
  })();
  state.textLayers.set(index, promise);
  promise.catch(() => { state.textLayers.delete(index); });
  return promise;
}

// ---------------------------------------------------------------- visibility
function visiblePages() {
  const anchorY = window.scrollY + window.innerHeight * 0.4;
  const visible = [];
  for (const [index, section] of state.sections) {
    const rect = section.getBoundingClientRect();
    const top = rect.top + window.scrollY;
    if (top <= anchorY && top + rect.height > window.scrollY - window.innerHeight) {
      visible.push({ index, top, height: rect.height });
    }
  }
  return visible;
}

function progressFromDom() {
  const pages = visiblePages();
  if (pages.length === 0) return { page_index: 0, scroll_ratio: 0 };
  const anchorY = window.scrollY + window.innerHeight * 0.4;
  let current = pages[0];
  for (const p of pages) if (p.top <= anchorY) current = p;
  const ratio = current.height > 0
    ? Math.min(1, Math.max(0, (anchorY - current.top) / current.height))
    : 0;
  return { page_index: current.index, scroll_ratio: Number(ratio.toFixed(4)) };
}

function updateIndicator() {
  const { page_index } = progressFromDom();
  if (els.cur) els.cur.textContent = String(page_index + 1);
  if (els.label) els.label.textContent = pageLabel(page_index) !== String(page_index + 1)
    ? `（标签 ${pageLabel(page_index)}）` : '';
}

function schedulePrefetch() {
  const { page_index } = progressFromDom();
  const candidates = [page_index - 1, page_index, page_index + 1]
    .filter((i) => i >= 0 && i < state.pages.length && state.pages[i].has_text !== undefined);
  for (const i of candidates) {
    const section = state.sections.get(i);
    if (section) renderCanvas(i, section);
  }
}

let indicatorTimer = null;
function onScroll() {
  if (indicatorTimer) return;
  indicatorTimer = setTimeout(() => {
    indicatorTimer = null;
    if (state.destroyed) return;
    updateIndicator();
    schedulePrefetch();
    state.onProgress?.(progressFromDom());
  }, 300);
}

// ---------------------------------------------------------------- public API
async function init(loaded, contentEl, { onProgress } = {}) {
  dispose();
  state.destroyed = false;
  state.documentId = loaded.meta?.document_id ?? loaded.documentId ?? null;
  state.pages = loaded.pages;
  state.pageSpans = loaded.page_spans ?? null;
  state.pageLabels = loaded.page_labels ?? null;
  state.zoom = 1;
  els.content = contentEl;
  els.cur = document.getElementById('pdf-cur');
  els.total = document.getElementById('pdf-total');
  els.label = document.getElementById('pdf-label');
  state.onProgress = onProgress ?? null;
  if (els.total) els.total.textContent = String(loaded.pages.length);

  const data = await window.reverie.pdfGetData(state.documentId);
  const doc = await pdfjsLib.getDocument({
    data,
    // third-party content must not execute (M7 §14.4)
    isEvalSupported: false,
    // runtime assets come over IPC (factory above), not network fetch
    cMapUrl: 'cmaps/',
    cMapPacked: true,
    standardFontDataUrl: 'standard_fonts/',
    wasmUrl: 'wasm/',
    BinaryDataFactory: IpcBinaryDataFactory,
    useWorkerFetch: false,
    // bounded decode work (M7 §14.3)
    maxImageSize: CANVAS_PIXEL_CAP,
  }).promise;
  if (state.destroyed) { try { await doc.destroy(); } catch { /* */ } return; }
  state.doc = doc;

  for (const page of loaded.pages) {
    const section = buildSection(page);
    applyZoomToSection(section, page);
  }

  state.observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const index = Number(entry.target.dataset.pageIndex);
      renderCanvas(index, entry.target);
      ensureTextLayer(index);
    }
  }, { rootMargin: '50% 0px' });
  for (const section of state.sections.values()) state.observer.observe(section);

  state.scrollListener = onScroll;
  window.addEventListener('scroll', onScroll, { passive: true });

  // restore last reading position (M7 §41): page → fallback first page
  const loc = loaded.last_location;
  if (loc && typeof loc.page_index === 'number' && loc.page_index > 0) {
    requestAnimationFrame(() => scrollToPage(loc.page_index, loc.scroll_ratio));
  }
  updateIndicator();
}

function dispose() {
  state.destroyed = true;
  for (const [, entry] of state.canvases) {
    try { entry.renderTask?.cancel(); } catch { /* */ }
    entry.canvas.remove();
  }
  state.canvases.clear();
  state.sections.clear();
  state.textLayers.clear();
  state.pages = [];
  state.pageLabels = null;
  state.doc = null;
  state.documentId = null;
  if (state.observer) { state.observer.disconnect(); state.observer = null; }
  if (state.scrollListener) {
    window.removeEventListener('scroll', state.scrollListener);
    state.scrollListener = null;
  }
}

function scrollToPage(pageIndex, ratio = 0) {
  const section = state.sections.get(pageIndex);
  if (!section) return;
  const rect = section.getBoundingClientRect();
  const top = rect.top + window.scrollY;
  const target = Math.max(0, Math.round(top + rect.height * ratio - window.innerHeight * 0.3));
  window.scrollTo({ top: target, behavior: 'auto' });
  renderCanvas(pageIndex, section);
  ensureTextLayer(pageIndex);
}

function nextPage() { scrollToPage(progressFromDom().page_index + 1); }
function prevPage() { scrollToPage(progressFromDom().page_index - 1); }

function zoomBy(factor) {
  const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, state.zoom * factor));
  if (next === state.zoom) return;
  state.zoom = next;
  const label = document.getElementById('pdf-zoom-label');
  if (label) label.textContent = `${Math.round(state.zoom * 100)}%`;
  relayoutAll();
}

/** Reveal the page holding a canonical offset (search jump / annotation nav). */
async function revealOffset(offset) {
  const spans = state.pageSpans;
  let index = 0;
  if (Array.isArray(spans) && spans.length > 0) {
    const span = spans.find((s) => offset >= s.start && offset < s.end);
    index = span ? span.index : spans[spans.length - 1].index;
  }
  scrollToPage(index);
  await ensureTextLayer(index);
  return index;
}

export {
  init, dispose, nextPage, prevPage, zoomBy, scrollToPage,
  revealOffset, progressFromDom, pageLabel,
};

// expose for the classic app.js script (which runs before modules load)
globalThis.ReveriePdf = {
  init, dispose, nextPage, prevPage, zoomBy, scrollToPage,
  revealOffset, progressFromDom, pageLabel,
};
// app.js sets this promise before any openArticle can run
window.__reveriePdfResolve?.();
