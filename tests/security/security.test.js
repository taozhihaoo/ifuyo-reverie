import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { sanitizeArticleHtml } from '../../src/security/sanitize-html.js';
import { isAllowedExternalUrl, urlScheme } from '../../src/security/url.js';
import { isSafeEntryName, safeEntryPath, validateZipEntries } from '../../src/security/zip.js';

test('sanitize strips scripts, event handlers, and dangerous schemes', async () => {
  const dirty = `<p onclick="alert(1)">hello
    <script>alert(2)</script>
    <a href="javascript:alert(3)">x</a>
    <img src="https://example.com/a.png" onerror="alert(4)">
    <iframe src="https://evil.example"></iframe>
    <style>body{}</style>
    <form action="/steal"><input name="pw"></form>
  </p>`;
  const clean = await sanitizeArticleHtml(dirty);
  assert.equal(clean.includes('<script'), false);
  assert.equal(clean.includes('onclick'), false);
  assert.equal(clean.includes('onerror'), false);
  assert.equal(clean.includes('javascript:'), false);
  assert.equal(clean.includes('<iframe'), false);
  assert.equal(clean.includes('<style'), false);
  assert.equal(clean.includes('<form'), false);
  assert.equal(clean.includes('<input'), false);
});

test('sanitize keeps legitimate article structure', async () => {
  const html = `<h1>Title</h1>
    <p>text with <strong>bold</strong>, <em>italic</em>, <code>code()</code></p>
    <blockquote><p>quote</p></blockquote>
    <pre><code class="language-js">const a = 1</code></pre>
    <table><tr><th>h</th><td>d</td></tr></table>
    <ul><li>item</li></ul>
    <a href="https://example.com/page">link</a>
    <img src="https://example.com/pic.png" alt="pic">`;
  const clean = await sanitizeArticleHtml(html);
  for (const keep of ['<h1>', '<strong>', '<em>', '<code', '<blockquote>', '<pre>', '<table>', '<ul>', '<li>',
    'href="https://example.com/page"', 'src="https://example.com/pic.png"']) {
    assert.ok(clean.includes(keep), `lost: ${keep}`);
  }
});

test('sanitize drops srcset and non-image data: URIs', async () => {
  const clean = await sanitizeArticleHtml(
    '<img srcset="https://a.example/x.png 2x" src="https://a.example/x.png"><a href="data:text/html,hi">d</a>',
  );
  assert.equal(clean.includes('srcset'), false);
  assert.equal(clean.includes('data:text/html'), false);
});

test('url allowlist: http(s)/mailto pass, everything else fails', () => {
  assert.equal(isAllowedExternalUrl('https://example.com/a?b=c'), true);
  assert.equal(isAllowedExternalUrl('http://example.com/'), true);
  assert.equal(isAllowedExternalUrl('mailto:someone@example.com'), true);
  assert.equal(isAllowedExternalUrl('javascript:alert(1)'), false);
  assert.equal(isAllowedExternalUrl('JaVaScRiPt:alert(1)'), false);
  assert.equal(isAllowedExternalUrl('data:text/html,<h1>'), false);
  assert.equal(isAllowedExternalUrl('file:///C:/Windows/System32'), false);
  assert.equal(isAllowedExternalUrl('chrome://settings'), false);
  assert.equal(isAllowedExternalUrl('vbscript:msgbox'), false);
  assert.equal(isAllowedExternalUrl('//cdn.example/protocol-relative'), false);
  assert.equal(isAllowedExternalUrl('/relative/path'), false);
  assert.equal(isAllowedExternalUrl(''), false);
  assert.equal(isAllowedExternalUrl('https://evil.example/\u0000'), false);
});

test('urlScheme extracts lowercase scheme', () => {
  assert.equal(urlScheme('HTTPS://x.example'), 'https');
  assert.equal(urlScheme('mailto:a@b.c'), 'mailto');
  assert.equal(urlScheme('no-scheme'), '');
});

test('zip entry names: traversal/absolute/NUL rejected', () => {
  for (const bad of [
    '../evil.txt', '..\\evil.txt', 'a/../../evil', 'C:\\Windows\\evil',
    '/etc/passwd', '\\\\server\\share\\f', 'good\\..\\..\\bad', '\0bad',
    'a/b/../../../c', '.',
  ]) {
    assert.equal(isSafeEntryName(bad), false, `should reject: ${JSON.stringify(bad)}`);
  }
  for (const good of ['ch1.xhtml', 'OEBPS/content.opf', 'assets/img/pic_1.png', 'a\\b.txt']) {
    assert.equal(isSafeEntryName(good), true, `should accept: ${JSON.stringify(good)}`);
  }
});

test('safeEntryPath keeps targets inside the base dir (Zip Slip)', () => {
  const base = path.resolve('/tmp/base');
  assert.equal(safeEntryPath(base, 'a/b.txt'), path.resolve(base, 'a/b.txt'));
  assert.throws(() => safeEntryPath(base, '../outside.txt'));
  assert.throws(() => safeEntryPath(base, 'C:\\Windows\\evil'));
  assert.throws(() => safeEntryPath(base, '/absolute'));
});

test('zip central directory: count / size / ratio bombs rejected', () => {
  const good = [{ filename: 'a.txt', compressedSize: 10, uncompressedSize: 20 }];
  assert.deepEqual(validateZipEntries(good), { ok: true, entries: 1, totalBytes: 20 });

  assert.throws(() => validateZipEntries(
    Array.from({ length: 20001 }, (_, i) => ({ filename: `f${i}.txt`, compressedSize: 1, uncompressedSize: 1 })),
  ), /too many entries/);

  assert.throws(() => validateZipEntries(
    [{ filename: 'big.txt', compressedSize: 1000, uncompressedSize: 2 * 1024 * 1024 * 1024 }],
  ), /too large/);

  assert.throws(() => validateZipEntries(
    [{ filename: 'bomb.txt', compressedSize: 1000, uncompressedSize: 20 * 1024 * 1024 }],
  ), /compression bomb/);

  assert.throws(() => validateZipEntries(
    [{ filename: '../evil', compressedSize: 1, uncompressedSize: 1 }],
  ), /unsafe zip entry/);
});
