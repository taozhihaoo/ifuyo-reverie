import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFeed, normalizeDate, normalizeAuthor, FeedParseError } from '../../src/feed/feed-parser.js';

const fixtureDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'feed');
const load = (name) => fsp.readFile(path.join(fixtureDir, name), 'utf8');

test('RSS 2.0 full: title/author/link/guid/date/categories/content normalize', async () => {
  const feed = parseFeed(await load('rss-full.xml'), { sourceUrl: 'https://example.com/feed.xml' });
  assert.equal(feed.format, 'rss');
  assert.equal(feed.title, 'RSS Full Feed');
  assert.equal(feed.site_url, 'https://example.com/');
  assert.equal(feed.items.length, 2);

  const byGuid = new Map(feed.items.map((i) => [i.external_id, i]));
  const first = byGuid.get('urn:uuid:11111111-1111-4111-8111-111111111111');
  const second = byGuid.get('urn:uuid:22222222-2222-4222-8222-222222222222');
  assert.ok(first && second);
  assert.equal(first.external_id, 'urn:uuid:11111111-1111-4111-8111-111111111111');
  assert.equal(first.external_id_type, 'guid');
  assert.equal(first.link, 'https://example.com/posts/1');
  assert.equal(first.published_at, '2026-10-05T08:00:00.000Z');
  assert.equal(first.author, '作者甲'); // "email (Name)" form normalized
  assert.deepEqual(first.categories, ['技术', 'RSS']);
  assert.equal(first.content_is_full, true);
  assert.ok(first.content.includes('<strong>完整正文</strong>'));

  // dc:creator author + non-UTC timezone date
  assert.equal(second.author, '作者乙');
  assert.equal(second.published_at, '2026-10-06T01:30:00.000Z');
  // newest first
  assert.ok(feed.items[0].published_at >= feed.items[feed.items.length - 1].published_at); // newest first
});

test('content priority: content:encoded wins over description; description-only stays summary', async () => {
  const feed = parseFeed(await load('rss-content-encoded.xml'));
  const [withContent, summaryOnly] = feed.items;
  assert.equal(withContent.content_is_full, true);
  assert.ok(withContent.content.includes('content:encoded 的完整正文'));
  assert.equal(summaryOnly.content_is_full, false);
  assert.equal(summaryOnly.content, '只有摘要的第二篇。');
});

test('missing GUID falls back to link-based identity (M4 §38)', async () => {
  const feed = parseFeed(await load('rss-no-guid.xml'));
  for (const item of feed.items) {
    assert.equal(item.external_id, null);
    assert.ok(item.link);
  }
});

test('item title fallback never null (M4 §29)', async () => {
  const feed = parseFeed(await load('rss-minimal.xml'));
  assert.equal(feed.items[0].title, '只有标题的条目');
  const missing = parseFeed(await load('rss-missing-fields.xml'));
  const noTitle = missing.items.find((i) => i.external_id === 'mf-1');
  assert.notEqual(noTitle.title, '');
  assert.equal(noTitle.published_at, null); // invalid date -> null, no crash
});

test('invalid date -> null (M3 §31: never crash)', async () => {
  const feed = parseFeed(await load('rss-invalid-date.xml'));
  assert.equal(feed.items[0].published_at, null);
});

test('Atom full: entries/links/author/content/categories normalize', async () => {
  const feed = parseFeed(await load('atom-full.xml'));
  assert.equal(feed.format, 'atom');
  assert.equal(feed.title, 'Full Atom Feed');
  assert.equal(feed.site_url, 'https://atom.example/');
  const entry = feed.items[0];
  assert.equal(entry.external_id, 'urn:uuid:entry-1');
  assert.equal(entry.external_id_type, 'atom-id');
  assert.equal(entry.link, 'https://atom.example/entries/1'); // rel=alternate, not self
  assert.equal(entry.author, '条目作者'); // entry author over feed author
  assert.equal(entry.published_at, '2026-10-04T01:00:00.000Z');
  assert.equal(entry.updated_at, '2026-10-05T01:00:00.000Z');
  assert.deepEqual(entry.categories, ['技术', 'Atom']);
  assert.equal(entry.content_type, 'html');
});

test('Atom multiple links: rel=alternate preferred over self/enclosure/fallback (M4 §27)', async () => {
  const feed = parseFeed(await load('atom-multiple-links.xml'));
  assert.equal(feed.items[0].link, 'https://ml.example/article');
});

test('Atom content types: html decodes, text stays text', async () => {
  const htmlFeed = parseFeed(await load('atom-content-html.xml'));
  assert.equal(htmlFeed.items[0].content_type, 'html');
  assert.ok(htmlFeed.items[0].content.includes('<em>'));
  const textFeed = parseFeed(await load('atom-content-text.xml'));
  assert.equal(textFeed.items[0].content_type, 'text');
  assert.ok(textFeed.items[0].content.includes('纯文本正文'));
});

test('malformed XML -> FeedParseError, never a crash (M4 §61)', async () => {
  for (const name of ['rss-malformed.xml', 'atom-malformed.xml']) {
    try {
      await parseFeed(await load(name));
      assert.fail(`${name} should not parse`);
    } catch (err) {
      assert.ok(err instanceof FeedParseError, `${name}: ${err.message}`);
    }
  }
});

test('DOCTYPE (XXE / billion laughs) is rejected outright (M4 §59)', async () => {
  for (const name of ['rss-xxe.xml', 'rss-billion-laughs.xml']) {
    try {
      await parseFeed(await load(name));
      assert.fail(`${name} should be rejected`);
    } catch (err) {
      assert.equal(err.code, 'UNSUPPORTED_DOCTYPE');
    }
  }
});

test('unsupported root element -> UNSUPPORTED_FORMAT', () => {
  assert.throws(() => parseFeed('<html><body>not a feed</body></html>'), (err) => {
    assert.equal(err.code, 'UNSUPPORTED_FORMAT');
    return true;
  });
});

test('atom-missing-id: entry still parseable, external_id null (dedup falls back)', async () => {
  const feed = parseFeed(await load('atom-missing-id.xml'));
  assert.equal(feed.items.length, 1);
  assert.equal(feed.items[0].external_id, null);
  assert.equal(feed.items[0].link, 'https://mi.example/1');
});

test('normalizeDate / normalizeAuthor edge cases', () => {
  assert.equal(normalizeDate('Mon, 05 Oct 2026 08:00:00 GMT'), '2026-10-05T08:00:00.000Z');
  assert.equal(normalizeDate('2026-10-05T08:00:00Z'), '2026-10-05T08:00:00.000Z');
  assert.equal(normalizeDate('nonsense'), null);
  assert.equal(normalizeDate(''), null);
  assert.equal(normalizeAuthor('author@example.com (作者甲)'), '作者甲');
  assert.equal(normalizeAuthor('普通名字'), '普通名字');
  assert.equal(normalizeAuthor(''), null);
});
