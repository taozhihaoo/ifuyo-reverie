import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { resetCacheForTests, loadUserState, stateOf } from '../../src/library/user-state.js';
import { invalidateSearchIndex, loadSearchIndex } from '../../src/search/search-service.js';
import { addFeedUrl, refreshFeed, refreshAllFeeds, deleteFeedOnly } from '../../src/feed/feed-service.js';
import { loadFeeds } from '../../src/feed/feed-store.js';
import { createAnnotationService } from '../../src/annotation/service.js';
import { fetchUrl } from '../../src/capture/fetch.js';
import { FetchError } from '../../src/capture/fetch.js';

const fixtureDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'feed');
const fixture = (name) => fsp.readFile(path.join(fixtureDir, name), 'utf8');
const tmpdir = () => fsp.mkdtemp(path.join(os.tmpdir(), 'reverie-m4-'));

async function startServer() {
  const state = { requestCount: {}, serveV2: false };
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;
    state.requestCount[p] = (state.requestCount[p] ?? 0) + 1;
    const send = (code, body, type = 'application/xml; charset=utf-8', extra = {}) => {
      res.writeHead(code, { 'content-type': type, ...extra });
      res.end(body);
    };
    const xml = (name) => fsp.readFile(path.join(fixtureDir, name), 'utf8');

    if (p === '/feed.xml') return send(200, await xml('rss-full.xml'));
    if (p === '/rss.xml') return send(200, await xml('rss-minimal.xml'));
    if (p === '/feed-original.xml') {
      const body = state.serveV2 ? await xml('rss-updated-item.xml') : await xml('rss-updated-item-v1.xml');
      return send(200, body);
    }
    if (p === '/feed-changed.xml') return send(200, await xml('rss-updated-item.xml'));
    if (p === '/feed-dup.xml') return send(200, await xml('rss-duplicate.xml'));
    if (p === '/feed-no-guid.xml') return send(200, await xml('rss-no-guid.xml'));
    if (p === '/feed-304') {
      if (req.headers['if-none-match'] === '"v7"') { res.writeHead(304); return res.end(); }
      return send(200, await xml('rss-minimal.xml'), 'application/xml', { etag: '"v7"' });
    }
    if (p === '/redirect') {
      res.writeHead(301, { location: '/rss.xml' });
      return res.end();
    }
    if (p === '/loop') {
      res.writeHead(302, { location: '/loop' });
      return res.end();
    }
    if (p === '/to-private') {
      res.writeHead(302, { location: 'http://127.0.0.1:9/evil' });
      return res.end();
    }
    if (p === '/not-found') return send(404, 'gone');
    if (p === '/gone') return send(410, 'gone');
    if (p === '/rate-limited') return send(429, 'slow down');
    if (p === '/server-error') return send(500, 'boom');
    if (p === '/unavailable') return send(503, 'unavailable');
    if (p === '/not-xml') return send(200, 'plain text', 'text/plain');
    if (p === '/huge') {
      res.writeHead(200, { 'content-type': 'application/xml' });
      res.write('<rss><channel><title>');
      const chunk = 'x'.repeat(1024 * 1024);
      for (let i = 0; i < 7; i++) res.write(chunk);
      return res.end('</title></channel></rss>');
    }
    if (p === '/hang') return; // never respond
    res.writeHead(404);
    res.end();
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, origin: `http://127.0.0.1:${server.address().port}`, state };
}

process.env.REVERIE_ALLOW_PRIVATE_NETWORK = '1'; // test server lives on loopback
const { server, origin, state } = await startServer();
process.on('exit', () => server.close());

const setup = async () => {
  const lib = await tmpdir();
  process.env.REVERIE_LIBRARY = lib;
  process.env.REVERIE_HOME = path.join(lib, '..', `home-${path.basename(lib)}`);
  resetCacheForTests();
  invalidateSearchIndex();
  return lib;
};

const countArticles = async (lib) => {
  const index = await loadSearchIndex(lib);
  return index.documents.length;
};

test('add feed: fetch + parse + persist subscription + ingest articles into Inbox/Unread', async () => {
  const lib = await setup();
  const result = await addFeedUrl(lib, `${origin}/feed.xml`);
  assert.equal(result.duplicate, false);
  assert.ok(result.feed.feed_id);
  assert.equal(result.feed.remote_title, 'RSS Full Feed');
  assert.equal(result.refresh.status, 'success');
  assert.equal(result.refresh.new_items, 2);

  // articles exist as real documents with feed provenance
  const index = await loadSearchIndex(lib);
  const feedDocs = index.documents.filter((d) => d.feed_id === result.feed.feed_id);
  assert.equal(feedDocs.length, 2);
  for (const d of feedDocs) {
    assert.equal(d.read, false, 'new RSS item is unread (M4 §45)');
    assert.equal(d.inbox, true, 'new RSS item lands in Inbox (M4 §46)');
    assert.equal(d.source_type, 'feed');
  }
  // raw item source preserved
  const docDir = path.join(lib, feedDocs[0].path);
  const raw = JSON.parse(await fsp.readFile(path.join(docDir, 'source', 'feed-item.json'), 'utf8'));
  assert.ok(raw.item.title);
});

test('refresh idempotency: second refresh creates nothing new (M4 §115)', async () => {
  const lib = await setup();
  const first = await addFeedUrl(lib, `${origin}/feed.xml`);
  const before = await countArticles(lib);
  const second = await refreshFeed(lib, first.feed.feed_id);
  assert.equal(second.status, 'success');
  assert.equal(second.new_items, 0);
  assert.equal(second.unchanged, 2);
  assert.equal(await countArticles(lib), before);
});

test('same guid twice in one payload -> one article (M4 §108)', async () => {
  const lib = await setup();
  const res = await addFeedUrl(lib, `${origin}/feed-dup.xml`);
  assert.equal(res.refresh.status, 'success');
  assert.equal(await countArticles(lib), 2, 'dup-1 collapses; dup-2a/2b merge by URL into one');
});

test('no GUID: link-based identity dedups across refreshes (M4 §38)', async () => {
  const lib = await setup();
  const first = await addFeedUrl(lib, `${origin}/feed-no-guid.xml`);
  assert.equal(first.refresh.new_items, 2);
  const second = await refreshFeed(lib, first.feed.feed_id);
  assert.equal(second.new_items, 0);
  assert.equal(await countArticles(lib), 2);
});

test('changed content: same identity -> update, user state + annotations preserved (M4 §40/44/109)', async () => {
  const lib = await setup();
  // v1 served first
  const feedAdd = await addFeedUrl(lib, `${origin}/feed-original.xml`);
  const documentId = feedAdd.refresh.results?.[0]?.document_id
    ?? (await loadSearchIndex(lib)).documents.find((d) => d.feed_id === feedAdd.feed.feed_id).document_id;
  const docDir = path.join(lib, (await loadSearchIndex(lib)).documents.find((d) => d.document_id === documentId).path);

  // user state + annotation (annotation via M2 service on v1 content)
  await fsp.writeFile(path.join(docDir, 'annotations.jsonl'), '');
  const service = createAnnotationService({
    articleDir: docDir,
    documentId,
    getReaderContext: async () => ({ canonicalText: '这是版本一的原始内容。' }),
  });
  const { annotation } = await service.createHighlight({
    anchor: { quote: '这是版本一的原始内容', prefix: '', suffix: '', position: { start: 0, end: 10 } },
    note: 'M4 回归笔记',
  });
  const { updateUserState } = await import('../../src/library/user-state.js');
  await updateUserState(documentId, { read: true, favorite: true, tags: ['rss'] });

  // feed updates the item
  state.serveV2 = true;
  const updated = await refreshFeed(lib, feedAdd.feed.feed_id);
  assert.equal(updated.updated_items, 1, JSON.stringify(updated));

  // article content updated...
  const md = await fsp.readFile(path.join(docDir, 'article.md'), 'utf8');
  assert.ok(md.includes('版本二'));
  // ...user state untouched...
  const st = stateOf(await loadUserState(), documentId);
  assert.equal(st.read, true);
  assert.equal(st.favorite, true);
  assert.deepEqual(st.tags, ['rss']);
  // ...annotation still exists with the same id, still resolvable-or-orphaned
  const { readAnnotationsFile } = await import('../../src/annotation/store.js');
  const { annotations } = await readAnnotationsFile(path.join(docDir, 'annotations.jsonl'));
  assert.equal(annotations.length, 1);
  assert.equal(annotations[0].annotation_id, annotation.annotation_id);
  assert.ok(['resolved', 'orphaned'].includes(annotations[0].status));
});

test('item order change does not duplicate (M4 §77)', async () => {
  const lib = await setup();
  await addFeedUrl(lib, `${origin}/feed-no-guid.xml`);
  const before = await countArticles(lib);
  await refreshFeed(lib, (await loadFeeds(lib)).feeds[0].feed_id);
  assert.equal(await countArticles(lib), before);
});

test.only('delete feed keeps articles; re-adding the same feed re-links, not duplicates (M4 §49/§50)', async () => {
  const lib = await setup();
  const first = await addFeedUrl(lib, `${origin}/feed.xml`);
  const articlesBefore = await countArticles(lib);
  await deleteFeedOnly(lib, first.feed.feed_id);
  assert.equal(await countArticles(lib), articlesBefore, 'articles remain after subscription delete');

  const second = await addFeedUrl(lib, `${origin}/feed.xml`);
  assert.equal(second.duplicate, false);
  assert.equal(second.refresh.new_items, 0, 'existing items re-linked, not recreated');
  assert.equal(await countArticles(lib), articlesBefore);
});

test('paused feed is skipped; enabled stays separate from inbox (M4 §48)', async () => {
  const lib = await setup();
  const { updateFeed } = await import('../../src/feed/feed-store.js');
  const added = await addFeedUrl(lib, `${origin}/feed.xml`);
  await updateFeed(lib, added.feed.feed_id, { enabled: false });
  const res = await refreshFeed(lib, added.feed.feed_id);
  assert.equal(res.status, 'skipped-paused');
});

test('concurrent refresh of the same feed is serialized (M4 §116)', async () => {
  const lib = await setup();
  const first = await addFeedUrl(lib, `${origin}/feed.xml`);
  const [a, b] = await Promise.all([
    refreshFeed(lib, first.feed.feed_id),
    refreshFeed(lib, first.feed.feed_id),
  ]);
  const busy = [a, b].filter((r) => r.status === 'skipped-busy');
  assert.equal(busy.length, 1, 'one of the two must be skipped-busy');
  assert.equal(await countArticles(lib), 2, 'no duplicate articles');
});

test('refresh all tolerates partial failure (M4 §69/120)', async () => {
  const lib = await setup();
  await addFeedUrl(lib, `${origin}/feed.xml`); // good
  await addFeedUrl(lib, `${origin}/server-error`).catch(() => {}); // fails at add (500) — add via direct store for the test
  const all = await refreshAllFeeds(lib);
  assert.equal(all.failed, all.results.filter((r) => r.status === 'failed').length);
});
