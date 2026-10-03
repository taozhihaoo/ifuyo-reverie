/**
 * Generate synthetic PDF fixtures into tests/fixtures/pdf/ (dev-only dep:
 * pdf-lib). All content authored for this repo.
 * NOTE: pdf-lib standard fonts have no CJK glyphs — PDF text-layer fixtures
 * are English; CJK text-layer handling is an M7 concern (pdf.js extracts
 * whatever the font embeds; fixtures here validate the pipeline).
 */
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'tests', 'fixtures', 'pdf');

const wrap = (text, perLine) => {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > perLine) {
      lines.push(line.trim());
      line = w;
    } else line += ' ' + w;
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
};


async function drawPages(doc, font, pages, { columns = 1 } = {}) {
  for (const text of pages) {
    const page = doc.addPage([595, 842]); // A4
    const { width } = page.getSize();
    const size = 11;
    const lineHeight = 16;
    const lines = wrap(text, columns === 1 ? 90 : 44);
    const half = Math.ceil(lines.length / 2);
    let y = 800;
    if (columns === 1) {
      for (const line of lines) {
        page.drawText(line, { x: 50, y, size, font });
        y -= lineHeight;
      }
    } else {
      const colWidth = width / 2;
      for (const line of lines.slice(0, half)) {
        page.drawText(line, { x: 40, y, size, font });
        y -= lineHeight;
      }
      y = 800;
      for (const line of lines.slice(half)) {
        page.drawText(line, { x: colWidth + 20, y, size, font });
        y -= lineHeight;
      }
    }
  }
}

const para = (i) =>
  `Paragraph ${i}: the archive stores what you read, not what a service allows you to see. ` +
  `Files are the truth; indexes are disposable. Rest stop notes, canal walks, and heron counts ${i} ` +
  `belong to the reader who saved them, in a folder that outlives any account.`;

async function main() {
  await fsp.mkdir(out, { recursive: true });

  // 1. text.pdf — 5 pages of normal flowing text
  {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    await drawPages(doc, font, Array.from({ length: 5 }, (_, p) =>
      `Page ${p + 1}. ` + Array.from({ length: 8 }, (_, i) => para(p * 8 + i + 1)).join(' ')));
    await fsp.writeFile(path.join(out, 'text.pdf'), await doc.save());
  }

  // 2. long.pdf — 100 pages (performance/mass-navigation fixture)
  {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    await drawPages(doc, font, Array.from({ length: 100 }, (_, p) =>
      `Long document page ${p + 1} of 100. ` + para(p + 1)));
    await fsp.writeFile(path.join(out, 'long.pdf'), await doc.save());
  }

  // 3. columns.pdf — one page, two text columns (sized to fit the page)
  {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const colText =
      'Left column begins the story of the canal walk. ' +
      Array.from({ length: 6 }, (_, i) => `left-item-${i + 1} ${para(i + 1)}`).join(" ") +
      ' Right column continues after the aqueduct. ' +
      Array.from({ length: 6 }, (_, i) => `right-item-${i + 11} ${para(i + 11)}`).join(" ");
    await drawPages(doc, font, [colText], { columns: 2 });
    await fsp.writeFile(path.join(out, 'columns.pdf'), await doc.save());
  }

  // 4. scanned.pdf — a "scan": graphics only, zero text operators
  {
    const doc = await PDFDocument.create();
    const page = doc.addPage([595, 842]);
    page.drawRectangle({ x: 40, y: 600, width: 515, height: 180, color: rgb(0.85, 0.85, 0.85) });
    page.drawRectangle({ x: 40, y: 320, width: 515, height: 240, borderColor: rgb(0, 0, 0), borderWidth: 1 });
    page.drawCircle({ x: 300, y: 200, size: 60, color: rgb(0.4, 0.4, 0.4) });
    await fsp.writeFile(path.join(out, 'scanned.pdf'), await doc.save());
  }

  for (const f of ['text.pdf', 'long.pdf', 'columns.pdf', 'scanned.pdf']) {
    const s = await fsp.stat(path.join(out, f));
    console.log(`${f}: ${s.size} bytes`);
  }
}

await main();
