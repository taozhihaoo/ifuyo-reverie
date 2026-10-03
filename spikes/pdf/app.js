/**
 * PDF Spike browser self-test: proves PDF.js can (1) load a document from a
 * URL, (2) render a page onto a canvas, (3) expose a text layer for the same
 * page. Verdict -> document.title + window.__reverieResult.
 */
import * as pdfjs from '/node_modules/pdfjs-dist/build/pdf.min.mjs';

pdfjs.GlobalWorkerOptions.workerSrc = '/node_modules/pdfjs-dist/build/pdf.worker.min.mjs';

const logEl = document.getElementById('log');
const log = (m) => { logEl.textContent += m + '\n'; };
const finish = (ok, details) => {
  window.__reverieResult = { ok, details };
  document.title = ok ? 'SELFTEST:PASS' : 'SELFTEST:FAIL';
  log(`RESULT: ${ok ? 'PASS' : 'FAIL'} ${JSON.stringify(details)}`);
};

try {
  const doc = await pdfjs.getDocument({
    url: '/tests/fixtures/pdf/text.pdf',
    standardFontDataUrl: '/node_modules/pdfjs-dist/standard_fonts/',
    cMapUrl: '/node_modules/pdfjs-dist/cmaps/',
  }).promise;
  log(`pages: ${doc.numPages}`);
  if (doc.numPages !== 5) throw new Error(`expected 5 pages, got ${doc.numPages}`);

  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale: 1 });
  const canvas = document.getElementById('cv');
  const ctx = canvas.getContext('2d');
  const t0 = performance.now();
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  const renderMs = Math.round(performance.now() - t0);

  // non-trivial pixels drawn?
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let nonWhite = 0;
  for (let i = 0; i < data.length; i += 400) {
    if (data[i] < 250 || data[i + 1] < 250 || data[i + 2] < 250) nonWhite++;
  }
  log(`rendered in ${renderMs}ms, non-white sample points: ${nonWhite}`);
  if (nonWhite < 100) throw new Error('canvas looks blank');

  const tc = await page.getTextContent();
  const text = tc.items.map((i) => i.str).join(' ');
  log(`text items: ${tc.items.length}, sample: ${text.slice(0, 60)}...`);
  const ok = tc.items.length > 10 && text.includes('Paragraph 1:');
  if (!ok) throw new Error('text layer mismatch');
  finish(true, { pages: doc.numPages, renderMs, textItems: tc.items.length });
} catch (err) {
  finish(false, { error: String(err?.stack ?? err) });
}
