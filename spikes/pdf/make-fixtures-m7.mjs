/**
 * M7 PDF fixtures (dev-only deps: pdf-lib + @pdf-lib/fontkit). All content
 * authored for this repo. Complements the M0 fixtures (text/long/columns/
 * scanned) with the shapes M7 must handle: CJK text layer, outline (nested),
 * mixed page sizes, page rotation, and an encrypted document (detection
 * fixture — pdf.js must report a password requirement, never bypass it).
 *
 * encrypted.pdf is a hand-built minimal PDF whose TRAILER carries a /Encrypt
 * dict with opaque /O /U values: pdf.js detects the standard security
 * handler and throws PasswordException before any decryption is attempted,
 * which is exactly the M7 contract (detect + typed error; no bypass).
 */
import { promises as fsp, readFileSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts, PDFName, PDFNumber, PDFHexString, PDFNull, degrees } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'tests', 'fixtures', 'pdf');

const CJK_SENTENCE = (n) =>
  `第 ${n} 段：阅读是一种把时间折叠起来的方式。Reverie keeps what you read, ` +
  `not what a service allows. 山门会留在页边，溪谷会留在记忆里。`;

async function cjkFixture() {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  // simhei.ttf: TrueType with full GB glyph coverage (present on Windows)
  const font = await doc.embedFont(readFileSync('C:/Windows/Fonts/simhei.ttf'), { subset: true });
  for (let p = 0; p < 2; p++) {
    const page = doc.addPage([595, 842]);
    let y = 790;
    for (let i = 0; i < 8; i++) {
      const text = `Page ${p + 1}. ` + CJK_SENTENCE(p * 8 + i + 1);
      // draw in chunks; Deng has full-width glyphs, 11pt fits ~40 CJK chars/line
      for (const line of chunk(text, 42)) {
        page.drawText(line, { x: 50, y, size: 11, font });
        y -= 18;
      }
    }
  }
  await fsp.writeFile(path.join(out, 'cjk.pdf'), await doc.save());
}

const chunk = (s, n) => {
  const lines = [];
  for (let i = 0; i < s.length; i += n) lines.push(s.slice(i, i + n));
  return lines;
};

async function outlineFixture() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = [];
  for (let i = 0; i < 4; i++) {
    const page = doc.addPage([595, 842]);
    page.drawText(`Outline target page ${i + 1} of 4`, { x: 60, y: 780, size: 14, font });
    pages.push(page);
  }
  const ctx = doc.context;
  const outlinesRef = ctx.nextRef();
  const part1Ref = ctx.nextRef();
  const part2Ref = ctx.nextRef();
  const c1Ref = ctx.nextRef();
  const c2Ref = ctx.nextRef();

  const dest = (pageRef) => ctx.obj([pageRef, PDFName.of('XYZ'), PDFNumber.of(0), PDFNumber.of(842), PDFNull]);
  const assign = (ref, props) => ctx.assign(ref, ctx.obj(props));

  assign(part1Ref, {
    Title: PDFHexString.fromText('第一部分 阅读的方式'), Parent: outlinesRef,
    Dest: dest(pages[0].ref), First: c1Ref, Last: c2Ref, Next: part2Ref, Count: PDFNumber.of(2),
  });
  assign(c1Ref, {
    Title: PDFHexString.fromText('第一章 溪谷'), Parent: part1Ref,
    Dest: dest(pages[1].ref), Next: c2Ref, Count: PDFNumber.of(0),
  });
  assign(c2Ref, {
    Title: PDFHexString.fromText('第二章 夜灯'), Parent: part1Ref,
    Dest: dest(pages[2].ref), Count: PDFNumber.of(0),
  });
  assign(part2Ref, {
    Title: PDFHexString.fromText('第二部分 归途'), Parent: outlinesRef,
    Dest: dest(pages[3].ref), Count: PDFNumber.of(0),
  });
  assign(outlinesRef, { Type: 'Outlines', First: part1Ref, Last: part2Ref, Count: PDFNumber.of(4) });
  doc.catalog.set(PDFName.of('Outlines'), outlinesRef);
  doc.catalog.set(PDFName.of('PageMode'), PDFName.of('UseOutlines'));
  await fsp.writeFile(path.join(out, 'outline.pdf'), await doc.save());
}

async function mixedSizeFixture() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const sizes = [[595, 842], [842, 595], [400, 400]];
  sizes.forEach(([w, h], i) => {
    const page = doc.addPage([w, h]);
    page.drawText(`Mixed size ${i + 1}: ${w}x${h}`, { x: 40, y: h - 60, size: 12, font });
  });
  await fsp.writeFile(path.join(out, 'mixed-size.pdf'), await doc.save());
}

async function rotatedFixture() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const p1 = doc.addPage([595, 842]);
  p1.drawText('Upright page', { x: 60, y: 780, size: 14, font });
  const p2 = doc.addPage([595, 842]);
  p2.setRotation(degrees(90));
  p2.drawText('Rotated page 90', { x: 60, y: 780, size: 14, font });
  await fsp.writeFile(path.join(out, 'rotated.pdf'), await doc.save());
}

async function encryptedFixture() {
  const o = randomBytes(16).toString('hex');
  const u = randomBytes(16).toString('hex');
  const id = randomBytes(16).toString('hex');
  const content = 'BT /F1 14 Tf 40 160 Td (Encrypted detection fixture) Tj ET';
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Filter /Standard /V 1 /R 2 /O <${o}> /U <${u}> /P -44 >>`,
  ];
  let body = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((s, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${s}\nendobj\n`;
  });
  const xrefPos = body.length;
  let xref = 'xref\n0 7\n0000000000 65535 f \n';
  for (const off of offsets) xref += `${String(off).padStart(10, '0')} 00000 n \n`;
  const trailer = `trailer\n<< /Size 7 /Root 1 0 R /Encrypt 6 0 R /ID [<${id}> <${id}>] >>\nstartxref\n${xrefPos}\n%%EOF\n`;
  await fsp.writeFile(path.join(out, 'encrypted.pdf'), body + xref + trailer);
}

async function main() {
  await fsp.mkdir(out, { recursive: true });
  await cjkFixture();
  await outlineFixture();
  await mixedSizeFixture();
  await rotatedFixture();
  await encryptedFixture();
  for (const f of ['cjk.pdf', 'outline.pdf', 'mixed-size.pdf', 'rotated.pdf', 'encrypted.pdf']) {
    const s = await fsp.stat(path.join(out, f));
    console.log(`${f}: ${s.size} bytes`);
  }
}

await main();
