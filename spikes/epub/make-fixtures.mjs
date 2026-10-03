/**
 * Generate synthetic EPUB fixtures into tests/fixtures/epub/ (all content
 * authored for this repo — no third-party copyright). Zero-dependency
 * STORE-only ZIP writer; EPUB requires 'mimetype' first & uncompressed,
 * which STORE satisfies for every entry.
 */
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------- minimal STORE-only zip ----------
const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** entries: [{ name, data: Uint8Array }] in order; all STORED. */
export function makeZip(entries) {
  const chunks = [];
  const central = [];
  let offset = 0;
  const enc = new TextEncoder();

  for (const { name, data } of entries) {
    const nameBytes = enc.encode(name);
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true); // version needed
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint16(8, 0, true); // STORE
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, nameBytes.length, true);
    chunks.push(new Uint8Array(local.buffer), nameBytes, data);

    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(8, 0x0800, true);
    cd.setUint16(10, 0, true); // STORE
    cd.setUint32(16, crc, true);
    cd.setUint32(20, data.length, true);
    cd.setUint32(24, data.length, true);
    cd.setUint16(28, nameBytes.length, true);
    cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), nameBytes);

    offset += 30 + nameBytes.length + data.length;
  }

  const centralSize = central.reduce((n, c) => n + c.length, 0);
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true);
  eocd.setUint16(8, entries.length, true);
  eocd.setUint16(10, entries.length, true);
  eocd.setUint32(12, centralSize, true);
  eocd.setUint32(16, offset, true);
  return Buffer.concat([...chunks, ...central, new Uint8Array(eocd.buffer)]);
}

// ---------- EPUB content ----------
const chapter = (title, paras) =>
  `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>${title}</title></head>
<body>
<h1>${title}</h1>
${paras.map((p) => `<p>${p}</p>`).join('\n')}
</body>
</html>`;

const containerXml = `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`;

const opf = (title, id, spine, manifest, { version = '2.0', nav = false, ncx = false } = {}) => `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="${version}" unique-identifier="bookid">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="bookid">urn:uuid:${id}</dc:identifier>
<dc:title>${title}</dc:title>
<dc:language>zh-CN</dc:language>
<dc:creator>Reverie Spike</dc:creator>
</metadata>
<manifest>
${manifest.join('\n')}
${nav ? '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>' : ''}
${ncx ? '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>' : ''}
</manifest>
<spine${ncx ? ' toc="ncx"' : ''}>${spine.map((s) => `<itemref idref="${s}"/>`).join('')}</spine>
</package>`;

const tocNcx = (title, points) => `<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
<head><meta name="dtb:uid" content="reverie-spike"/></head>
<docTitle><text>${title}</text></docTitle>
<navMap>
${points.map((p, i) => `<navPoint id="np${i + 1}" playOrder="${i + 1}"><navLabel><text>${p.title}</text></navLabel><content src="${p.src}"/></navPoint>`).join('\n')}
</navMap>
</ncx>`;

const tocNav = (points) => `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>目录</title></head>
<body><nav epub:type="toc"><h1>目录</h1><ol>
${points.map((p) => `<li><a href="${p.src}">${p.title}</a></li>`).join('\n')}
</ol></nav></body></html>`;

const lorem = (n, seedWord) =>
  Array.from({ length: n }, (_, i) =>
    `第${i + 1}段：阅读是一种把时间变成自己的方式。${seedWord ?? '痕迹'}会留在页边，也会留在记忆里。深夜的灯光、纸的重量、翻页的声音，这些都是阅读的一部分。`,
  );

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

function epub2({ title, id, chapters }) {
  const files = [
    { name: 'mimetype', data: Buffer.from('application/epub+zip') },
    { name: 'META-INF/container.xml', data: Buffer.from(containerXml) },
  ];
  const manifest = chapters.map((c, i) => `<item id="ch${i + 1}" href="ch${i + 1}.xhtml" media-type="application/xhtml+xml"/>`);
  const spine = chapters.map((_, i) => `ch${i + 1}`);
  files.push({
    name: 'OEBPS/content.opf',
    data: Buffer.from(opf(title, id, spine, manifest, { ncx: true })),
  });
  files.push({ name: 'OEBPS/toc.ncx', data: Buffer.from(tocNcx(title, chapters.map((c, i) => ({ title: c.title, src: `ch${i + 1}.xhtml` })))) });
  chapters.forEach((c, i) => files.push({ name: `OEBPS/ch${i + 1}.xhtml`, data: Buffer.from(chapter(c.title, c.paras)) }));
  return makeZip(files);
}

function epub3({ title, id, chapters }) {
  const files = [
    { name: 'mimetype', data: Buffer.from('application/epub+zip') },
    { name: 'META-INF/container.xml', data: Buffer.from(containerXml) },
  ];
  const manifest = chapters.map((c, i) => `<item id="ch${i + 1}" href="ch${i + 1}.xhtml" media-type="application/xhtml+xml"/>`);
  const spine = chapters.map((_, i) => `ch${i + 1}`);
  files.push({ name: 'OEBPS/content.opf', data: Buffer.from(opf(title, id, spine, manifest, { version: '3.0', nav: true })) });
  files.push({ name: 'OEBPS/nav.xhtml', data: Buffer.from(tocNav(chapters.map((c, i) => ({ title: c.title, src: `ch${i + 1}${c.file}` })))) });
  chapters.forEach((c, i) => files.push({ name: `OEBPS/ch${i + 1}.xhtml`, data: Buffer.from(chapter(c.title, c.paras)) }));
  return makeZip(files);
}

async function main() {
  const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'tests', 'fixtures', 'epub');
  await fsp.mkdir(out, { recursive: true });

  const books = {
    'simple.epub': epub2({
      title: '单章书', id: 'aaaa1111-0000-4000-8000-000000000001',
      chapters: [{ title: '唯一的一章', paras: lorem(12, '单章') }],
    }),
    'multi-chapter.epub': epub2({
      title: '五章书', id: 'bbbb2222-0000-4000-8000-000000000002',
      chapters: ['山门', '溪谷', '夜灯', '长坡', '归途'].map((t, i) => ({
        title: `第${i + 1}章 ${t}`,
        paras: lorem(10, t),
      })),
    }),
    'long-chapter.epub': epub2({
      title: '长章书', id: 'cccc3333-0000-4000-8000-000000000003',
      chapters: [{ title: '很长的章', paras: lorem(200, '长章') }],
    }),
    'with-image.epub': null, // built below (extra manifest entry)
    'epub3.epub': epub3({
      title: '三代书', id: 'dddd4444-0000-4000-8000-000000000004',
      chapters: [
        { title: 'EPUB3 第一章', paras: lorem(8, '三代'), file: '.xhtml' },
        { title: 'EPUB3 第二章', paras: lorem(8, '三代'), file: '.xhtml' },
      ],
    }),
  };

  // with-image: EPUB2 with a 1px PNG
  {
    const files = [
      { name: 'mimetype', data: Buffer.from('application/epub+zip') },
      { name: 'META-INF/container.xml', data: Buffer.from(containerXml) },
    ];
    const manifest = [
      '<item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>',
      '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>',
      '<item id="img1" href="dot.png" media-type="image/png"/>',
    ];
    files.push({ name: 'OEBPS/content.opf', data: Buffer.from(opf('带图的书', 'eeee5555-0000-4000-8000-000000000005', ['ch1'], manifest)) });
    files.push({ name: 'OEBPS/toc.ncx', data: Buffer.from(tocNcx('带图的书', [{ title: '带图的一章', src: 'ch1.xhtml' }])) });
    const paras = [...lorem(5, '带图'), '<img src="dot.png" alt="一个红点"/>', ...lorem(3, '带图')];
    files.push({ name: 'OEBPS/ch1.xhtml', data: Buffer.from(chapter('带图的一章', paras)) });
    files.push({ name: 'OEBPS/dot.png', data: PNG_1PX });
    books['with-image.epub'] = makeZip(files);
  }

  for (const [name, buf] of Object.entries(books)) {
    await fsp.writeFile(path.join(out, name), buf);
    console.log(`${name}: ${buf.length} bytes`);
  }
}

await main();
