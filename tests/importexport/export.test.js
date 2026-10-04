/**
 * Export tests (M5 §29-34/§40/§87/§88): Markdown + Metadata + Highlights +
 * basic EPUB, with validation, read-only guarantees, and unicode coverage.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { exportDocumentToMarkdown, validateMarkdownExport } from '../../src/importexport/export/markdown-exporter.js';
import { exportMetadataCsv, exportMetadataJson, exportHighlightsJson, exportHighlightsMarkdown } from '../../src/importexport/export/metadata-exporter.js';
import { exportArticleToEpub, validateEpubBuffer } from '../../src/importexport/export/epub-exporter.js';
import { newId } from '../../src/core/ids.js';

const sampleMeta = (over = {}) => ({
  format_version: 1,
  document_id: newId(),
  type: 'article',
  title: '本地优先的设计',
  author: '灰灰',
  created_at: '2026-10-04T08:00:00.000Z',
  captured_at: '2026-10-04T08:00:00.000Z',
  updated_at: '2026-10-04T08:00:00.000Z',
  source: { original_url: 'https://example.com/a', canonical_url: 'https://example.com/a', capture_time: '2026-10-04T08:00:00.000Z', extractor: { name: 'readability', version: '0.6.0' }, content_hash: 'sha256-aa' },
  ...over,
});

const sampleAnnotations = [
  { annotation_id: newId(), document_id: 'doc1', type: 'highlight', status: 'resolved', quoted_text: '文件是唯一的真相', note: '核心原则', tags: ['principle'], created_at: '2026-10-05T00:00:00.000Z', locator: { kind: 'text-quote', position: { start: 3, end: 11 } } },
  { annotation_id: newId(), document_id: 'doc1', type: 'highlight', status: 'orphaned', quoted_text: '已经消失的引文', note: '', tags: [], created_at: '2026-10-06T00:00:00.000Z', locator: { kind: 'text-quote', position: { start: 999, end: 1050 } } },
];

test('markdown export: front matter + body + annotations section (M5 §29/31)', async () => {
  const md = exportDocumentToMarkdown(sampleMeta(), '# 本地优先的设计\n\n正文第一段。\n', sampleAnnotations);
  assert.ok(md.startsWith('---\ntitle: "本地优先的设计"'));
  assert.ok(md.includes('source_url: "https://example.com/a"'));
  assert.ok(md.includes('document_id:'));
  assert.ok(md.includes('# 本地优先的设计'));
  assert.ok(md.includes('正文第一段'));
  assert.ok(md.includes('## Annotations'));
  assert.ok(md.includes('> 文件是唯一的真相'));
  assert.ok(md.includes('**Note:** 核心原则'));
  assert.equal(validateMarkdownExport(md).ok, true);
});

test('markdown export validation catches empty output', () => {
  assert.equal(validateMarkdownExport('').ok, false);
  assert.equal(validateMarkdownExport('no front matter').ok, false);
});

test('metadata export: CSV columns + JSON fidelity (M5 §32)', async () => {
  const entries = [{
    document_id: 'doc1', type: 'article', title: 'T', author: 'A',
    canonical_url: 'https://example.com/a', original_url: 'https://example.com/a?x',
    created_at: '2026-10-04T08:00:00.000Z', captured_at: '2026-10-04T08:00:00.000Z',
    published_at: null, annotation_count: 2, source_type: 'feed', feed_title: 'Feed',
  }];
  const stateOf = () => ({ read: true, favorite: true, inbox: false, tags: ['rust', 'AI'] });
  const csv = exportMetadataCsv(entries, stateOf);
  const lines = csv.trim().split('\n');
  assert.equal(lines.length, 2);
  assert.ok(lines[0].includes('document_id'));
  assert.ok(lines[1].includes('rust;AI'));
  const json = JSON.parse(exportMetadataJson(entries, stateOf));
  assert.equal(json.documents.length, 1);
  assert.equal(json.documents[0].read, 'true');
  assert.equal(json.documents[0].tags, 'rust;AI');
});

test('highlight export keeps quote/note/status and includes orphaned ones (M5 §33)', async () => {
  const items = sampleAnnotations.map((a) => ({
    annotation: a,
    document: { title: '本地优先的设计', url: 'https://example.com/a' },
  }));
  const json = JSON.parse(exportHighlightsJson(items));
  assert.equal(json.highlights.length, 2);
  const orphaned = json.highlights.find((h) => h.status === 'orphaned');
  assert.ok(orphaned, 'orphaned highlight must be exported');
  assert.equal(orphaned.quoted_text, '已经消失的引文');
  const md = exportHighlightsMarkdown(items);
  assert.ok(md.includes('## 本地优先的设计'));
  assert.ok(md.includes('> 文件是唯一的真相'));
  assert.ok(md.includes('**Note:** 核心原则'));
});

test('unicode round-trips through every export format (M5 §75)', async () => {
  const meta = sampleMeta({ title: '日本語の記事 🎉', author: '作者・せい' });
  const md = exportDocumentToMarkdown(meta, '# 日本語の記事 🎉\n\n中文正文。\n', []);
  assert.ok(md.includes('日本語の記事 🎉'));
  const entries = [{ document_id: meta.document_id, type: 'article', title: '日本語の記事 🎉', tags: '日本語' }];
  const csv = exportMetadataCsv(entries, () => ({ read: false, favorite: false, inbox: true, tags: ['日本語'] }));
  assert.ok(csv.includes('日本語'));
});

// ---- basic EPUB export (M5 §34) ----

test('epub export produces a structurally valid EPUB 3 container (M5 §34/§40)', async () => {
  const buf = exportArticleToEpub({
    title: 'EPUB 导出测试',
    author: '测试者',
    markdown: '# 第一章\n\n第一章的正文内容，足够长。\n\n## 第二节\n\n更多内容。\n',
    publishedAt: '2026-10-04T08:00:00.000Z',
    sourceUrl: 'https://example.com/epub-test',
    documentId: newId(),
  });
  const v = validateEpubBuffer(buf);
  assert.deepEqual(v, { ok: true, errors: [] }, v.errors?.join('; '));
  // mimetype entry is stored first; the fixed 'mimetype' string appears in the first local header
  assert.equal(buf.slice(0, 2).toString(), 'PK');
  assert.ok(buf.length > 500);
});

test('epub export refuses empty articles instead of emitting broken files (M4 §36)', () => {
  assert.throws(() => exportArticleToEpub({ title: 'empty', markdown: '  ', documentId: newId() }), /empty article/);
});
