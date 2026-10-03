/**
 * EPUB Spike browser self-test (M0 §14).
 * Drives the full highlight round-trip inside a real browser:
 *   Open -> TOC -> Select -> Highlight (CFI anchor) -> Persist ->
 *   Reload -> Reopen -> Restore -> Verify.
 * Progress is written to #log; final verdict to document.title +
 * window.__reverieResult (for automation to read).
 */
import { View } from "/node_modules/foliate-js/view.js";

const customElements = window.customElements;
if (!customElements.get('foliate-view')) customElements.define('foliate-view', View);

const BOOK_URL = '/tests/fixtures/epub/multi-chapter.epub';
const STORE_KEY = 'reverie-epub-spike-v1';
// a distinctive string from chapter 1 of multi-chapter.epub
const TARGET = '阅读是一种把时间变成自己的方式';

const logEl = document.getElementById('log');
const log = (msg) => { logEl.textContent += msg + '\n'; };

const finish = (ok, details) => {
  window.__reverieResult = { ok, details };
  document.title = ok ? 'SELFTEST:PASS' : 'SELFTEST:FAIL';
  log(`RESULT: ${ok ? 'PASS' : 'FAIL'} ${JSON.stringify(details)}`);
};

const waitFor = async (fn, { timeout = 15000, interval = 100, label = '' } = {}) => {
  const start = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - start > timeout) throw new Error(`timeout waiting for ${label}`);
    await new Promise((r) => setTimeout(r, interval));
  }
};

function getContentDoc(view) {
  // The View holds a closed shadow root; its renderer (paginator) is a public
  // field and getContents() exposes the displayed section documents.
  return view.renderer?.getContents?.()[0]?.doc ?? null;
}

function findTextRange(doc, text) {
  const walker = doc.createTreeWalker(doc.body ?? doc.documentElement, 4 /* SHOW_TEXT */);
  let node = walker.nextNode();
  while (node) {
    const idx = node.nodeValue.indexOf(text);
    if (idx !== -1) {
      const range = doc.createRange();
      range.setStart(node, idx);
      range.setEnd(node, idx + text.length);
      return range;
    }
    node = walker.nextNode();
  }
  return null;
}

async function openBook() {
  const view = document.getElementById('reader');
  await view.open(BOOK_URL); // view.open accepts a URL (makeBook inside)
  const book = view.book; // open() does not return the book
  // paginator does not auto-render; navigate to the first page explicitly.
  // Instrument each attempt so a stall is visible in the log.
  const rendered = () => {
    const c = view.renderer?.getContents?.() ?? [];
    return c.length > 0 && ((c[0].doc?.body?.querySelectorAll('p')?.length) ?? 0) > 0;
  };
  for (let attempt = 0; attempt < 8 && !rendered(); attempt++) {
    const t0 = Date.now();
    let relocated = false;
    const onRelocate = () => { relocated = true; };
    view.addEventListener('relocate', onRelocate, { once: true });
    try {
      await view.goToFraction(0);
      log(`attempt ${attempt}: goToFraction resolved in ${Date.now() - t0}ms, relocated=${relocated}, contents=${view.renderer?.getContents?.().length}`);
    } catch (err) {
      log(`attempt ${attempt}: goToFraction threw after ${Date.now() - t0}ms: ${err.message}`);
    }
    await waitFor(rendered, { timeout: 15000, label: `render attempt ${attempt}` }).catch(() => {
      log(`attempt ${attempt}: still not rendered after 15s (contents=${view.renderer?.getContents?.().length})`);
    });
    view.removeEventListener('relocate', onRelocate);
  }
  if (!rendered()) throw new Error('first page render failed after 8 attempts');
  return { view, book };
}

const phase = new URLSearchParams(location.search).get('phase') ?? 'create';

try {
  const { view, book } = await openBook();

  if (phase === 'create') {
    // 1. TOC
    const toc = await book.toc;
    log(`toc: ${toc.length} items -> ${toc.map((t) => t.label).join(' | ')}`);

    // 2. select text in the rendered chapter
    const doc = getContentDoc(view);
    const range = findTextRange(doc, TARGET);
    if (!range) throw new Error('target text not found in rendered chapter');
    const quote = range.toString();
    log(`selection: "${quote}" (${quote.length} chars)`);

    // 3. anchor = book-level CFI via the view (+ quote context, FORMAT.md §5)
    const index = view.renderer.getContents()[0].index;
    const cfi = String(view.getCFI(index, range));
    log(`cfi: ${cfi}`);

    // 4. highlight via the view (overlayer draws it)
    let drewHighlight = false;
    view.addEventListener('draw-annotation', () => { drewHighlight = true; }, { once: true });
    view.addAnnotation({ value: cfi });
    await waitFor(() => drewHighlight, { label: 'draw-annotation' });
    log('highlight drawn via overlayer');

    // 5. persist and reload
    localStorage.setItem(STORE_KEY, JSON.stringify({ cfi, quote, tocCount: toc.length }));
    log('persisted to localStorage; reloading...');
    setTimeout(() => location.replace('?phase=restore'), 300);
  } else {
    // restore phase
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null');
    if (!saved) throw new Error('no saved annotation (localStorage lost across reload?)');
    log(`loaded saved anchor: ${saved.cfi}`);

    // reopen the SAME book (simulates app restart; the file is unchanged)
    let drewHighlight = false;
    view.addEventListener('draw-annotation', () => { drewHighlight = true; }, { once: true });
    view.addAnnotation({ value: saved.cfi });
    await waitFor(() => drewHighlight, { label: 'restored draw-annotation' });

    // verify: navigate to the restored anchor, rebuild a book-level CFI from
    // the live DOM at the quote's position, and compare with the saved anchor
    await view.goTo(saved.cfi);
    await waitFor(() => {
      const doc = getContentDoc(view);
      return doc && findTextRange(doc, saved.quote);
    }, { timeout: 20000, label: 'quote visible after restore' });
    const doc = getContentDoc(view);
    const range = findTextRange(doc, saved.quote);
    if (!range) throw new Error('quote not found after restore');
    const idx = view.renderer.getContents()[0].index;
    const cfiNow = String(view.getCFI(idx, range));
    const sameAnchor = cfiNow === saved.cfi;

    log(`restore verify: same anchor=${sameAnchor}, quote="${range.toString()}"`);
    finish(sameAnchor, {
      phase: 'restore',
      cfiMatch: sameAnchor,
      cfiOriginal: saved.cfi,
      cfiRestored: cfiNow,
      tocCount: saved.tocCount,
    });
  }
} catch (err) {
  finish(false, { phase, error: String(err?.stack ?? err) });
}
