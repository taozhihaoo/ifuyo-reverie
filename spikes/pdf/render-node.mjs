/**
 * PDF render spike (Node side): PDF.js + @napi-rs/canvas (both vetted).
 * Proves the render pipeline produces a non-blank raster for a text PDF.
 * Visual fidelity inside the app's browser context is an M7 concern;
 * this is the FACT-grade evidence that the engine can render at all.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { createCanvas } from '@napi-rs/canvas';
import { openPdf, pageText, normalizeForSearch } from './lib.mjs';

const require = createRequire(import.meta.url);
const fixture = (name) => path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'tests', 'fixtures', 'pdf', name);

const doc = await openPdf(fixture('text.pdf'));
const page = await doc.getPage(1);
const viewport = page.getViewport({ scale: 1 });
const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
const ctx = canvas.getContext('2d');

const t0 = Date.now();
await page.render({ canvas, canvasContext: ctx, viewport }).promise;
const renderMs = Date.now() - t0;

// sample pixels: a text page must have dark glyph pixels on light bg
const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
let dark = 0;
for (let i = 0; i < data.length; i += 400) {
  if (data[i] < 128 && data[i + 1] < 128 && data[i + 2] < 128) dark++;
}
const png = await canvas.encode('png');
writeFileSync(path.join(path.dirname(fixture('text.pdf')), 'render-out.png'), png);

const { normalized } = await pageText(doc, 1);
const ok = dark > 100 && normalized.includes(normalizeForSearch('Paragraph 1:'));
console.log(`render page 1: ${width}x${height}, ${renderMs}ms, dark sample points: ${dark}, text layer: ok`);
console.log(`png written: ${path.basename('render-out.png')} (${png.length} bytes)`);
console.log(ok ? 'RENDER SPIKE: PASS' : 'RENDER SPIKE: FAIL');
process.exit(ok ? 0 : 1);
