/**
 * Reverie renderer — Library views, Search, Reader, Annotations.
 * M3: composable library views (All/Inbox/Favorites/Unread/Recent/Tags),
 * global search with match contexts (one card, many matches), keyboard-first
 * navigation, per-document user state (read/favorite/inbox/tags).
 *
 * Safety model unchanged: article content is rendered from canonical BLOCKS
 * via DOM construction (never innerHTML); search snippets are plain text.
 */
/* global reverie, ReaderAnchor */

// pdf-view.js (module) resolves this once pdf.js is ready (M7)
window.__reveriePdfReady = new Promise((resolve) => { window.__reveriePdfResolve = resolve; });
window.__reverieReapplyHighlights = () => { if (currentDoc) applyHighlights(currentDoc.annotations); };

// ============================================================ blocks -> DOM
function renderSegments(parent, segments, ctx) {
  for (const s of segments) {
    switch (s.t) {
      case 'text': parent.appendChild(document.createTextNode(s.v)); break;
      case 'code': { const c = document.createElement('code'); c.textContent = s.v; parent.appendChild(c); break; }
      case 'bold': { const b = document.createElement('strong'); b.textContent = s.v; parent.appendChild(b); break; }
      case 'em': { const e = document.createElement('em'); e.textContent = s.v; parent.appendChild(e); break; }
      case 'link': {
        const a = document.createElement('a');
        a.textContent = s.v; a.href = '#';
        a.addEventListener('click', (ev) => { ev.preventDefault(); reverie.openExternal(s.href); });
        parent.appendChild(a);
        break;
      }
      case 'image': {
        const img = document.createElement('img');
        img.alt = s.alt ?? '';
        if (s.src.startsWith('assets/')) ctx.resolveImage(s.src).then((url) => { img.src = url; }).catch(() => {});
        else if (/^https?:/i.test(s.src) || s.src.startsWith('data:')) img.src = s.src;
        parent.appendChild(img);
        break;
      }
    }
  }
}

function renderBlocks(blocks, ctx) {
  const frag = document.createDocumentFragment();
  for (const b of blocks) {
    switch (b.type) {
      case 'heading': {
        const h = document.createElement(`h${b.level}`);
        renderSegments(h, b.segments, ctx);
        frag.appendChild(h); break;
      }
      case 'paragraph': {
        const p = document.createElement('p');
        renderSegments(p, b.segments, ctx);
        frag.appendChild(p); break;
      }
      case 'code': {
        const pre = document.createElement('pre');
        if (b.lang) pre.dataset.lang = b.lang;
        const code = document.createElement('code');
        code.textContent = b.text;
        pre.appendChild(code);
        frag.appendChild(pre); break;
      }
      case 'quote': {
        const q = document.createElement('blockquote');
        const p = document.createElement('p');
        renderSegments(p, b.segments, ctx);
        q.appendChild(p);
        frag.appendChild(q); break;
      }
      case 'list': {
        const list = document.createElement(b.ordered ? 'ol' : 'ul');
        for (const item of b.items) {
          const li = document.createElement('li');
          li.style.marginLeft = `${Math.min(item.indent, 8)}px`;
          renderSegments(li, item.segments, ctx);
          list.appendChild(li);
        }
        frag.appendChild(list); break;
      }
      case 'table': {
        const table = document.createElement('table');
        const tr = document.createElement('tr');
        for (const c of b.header) { const th = document.createElement('th'); th.textContent = c; tr.appendChild(th); }
        table.appendChild(tr);
        for (const row of b.rows) {
          const rowTr = document.createElement('tr');
          for (const c of row) { const td = document.createElement('td'); td.textContent = c; rowTr.appendChild(td); }
          table.appendChild(rowTr);
        }
        frag.appendChild(table); break;
      }
      case 'hr': frag.appendChild(document.createElement('hr')); break;
    }
  }
  return frag;
}

// ============================================================ highlights
function applyHighlights(annotations) {
  if (!('highlights' in CSS)) return;
  CSS.highlights.delete('reverie-hl');
  const ranges = [];
  for (const a of annotations) {
    if (a.status !== 'resolved' || !a.locator?.position) continue;
    const range = ReaderAnchor.rangeForOffsets(document.getElementById('reader-content'), a.locator.position.start, a.locator.position.end);
    if (range) ranges.push(range);
  }
  if (ranges.length > 0) CSS.highlights.set('reverie-hl', new Highlight(...ranges));
}

function flashRange(range) {
  if (!range) return;
  if ('highlights' in CSS) {
    CSS.highlights.set('reverie-flash', new Highlight(range));
    setTimeout(() => CSS.highlights.delete('reverie-flash'), 1400);
  }
  range.startContainer.parentElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ============================================================ state
const els = {
  library: document.getElementById('library-view'),
  sidebarCounts: {},
  list: document.getElementById('article-list'),
  empty: document.getElementById('library-empty'),
  reader: document.getElementById('reader-view'),
  title: document.getElementById('reader-title'),
  meta: document.getElementById('reader-meta'),
  content: document.getElementById('reader-content'),
  queueHint: document.getElementById('queue-hint'),
};
const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');
const searchHint = document.getElementById('search-hint');
let currentDoc = null;
let repairTarget = null;
let currentView = 'all';
let currentTags = [];
let searchSeq = 0; // M3 §58: only the newest query may render
let activeResultIdx = -1;
let lastSearchResults = [];

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '');
const hostOf = (url) => { try { return new URL(url).host; } catch { return ''; } };
const t = (key, vars) => window.I18N.t(key, vars);

// ============================================================ library views
const viewEmpty = (view) => t('empty.' + view);

let activeFeedId = null;

async function renderFeedList() {
  const box = document.getElementById('feed-list');
  box.textContent = '';
  let feeds = [];
  try { feeds = await reverie.feedsList(); } catch { return; }
  for (const feed of feeds) {
    const row = document.createElement('div');
    row.className = 'feed-row' + (feed.feed_id === activeFeedId ? ' active' : '') + (feed.enabled ? '' : ' paused');
    row.title = feed.original_url;
    const name = document.createElement('span');
    name.className = 'feed-name';
    name.textContent = feed.display_title;
    const unread = document.createElement('span');
    unread.className = 'count';
    unread.textContent = feed.unread_count > 0 ? String(feed.unread_count) : '';
    if (!feed.enabled) {
      const paused = document.createElement('span');
      paused.className = 'count';
      paused.textContent = '⏸';
      row.appendChild(paused);
    }
    row.append(name, unread);
    row.addEventListener('click', () => {
      activeFeedId = feed.feed_id === activeFeedId ? null : feed.feed_id;
      showLibrary();
    });
    const actions = document.createElement('span');
    actions.className = 'feed-actions';
    for (const [label, title, fn] of [
      ['↻', t('feed.refresh'), () => refreshFeedById(feed.feed_id)],
      [feed.enabled ? '⏸' : '▶', feed.enabled ? t('feed.pause') : t('feed.resume'), () => reverie.feedsSetEnabled(feed.feed_id, !feed.enabled).then(showLibrary)],
      ['×', t('feed.delete'), () => {
        if (confirm(t('dialog.feedDelete', { title: feed.display_title }))) {
          reverie.feedsDelete(feed.feed_id).then(() => { if (activeFeedId === feed.feed_id) activeFeedId = null; showLibrary(); });
        }
      }],
    ]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'feed-action';
      b.textContent = label;
      b.title = title;
      b.addEventListener('click', (ev) => { ev.stopPropagation(); fn(); });
      actions.appendChild(b);
    }
    row.appendChild(actions);
    box.appendChild(row);
  }
  // M6: EPUB add button (wire once)
  const addBtn = document.getElementById('btn-add-epub');
  if (addBtn && !addBtn.dataset.wired) {
    addBtn.dataset.wired = '1';
    addBtn.addEventListener('click', async () => {
      const p = await reverie.pickEpub();
      if (!p) return;
      addBtn.disabled = true;
      try {
        await reverie.bookAdd(p);
        await showLibrary();
      } catch (err) {
        alert(t('epub.addFailed') + String(err.message ?? err).slice(0, 80));
      }
      addBtn.disabled = false;
    });
  }
  // M7: PDF add button (wire once); typed PDF errors surface readable text
  const pdfBtn = document.getElementById('btn-add-pdf');
  if (pdfBtn && !pdfBtn.dataset.wired) {
    pdfBtn.dataset.wired = '1';
    pdfBtn.addEventListener('click', async () => {
      const p = await reverie.pickPdf();
      if (!p) return;
      pdfBtn.disabled = true;
      try {
        await reverie.pdfAdd(p);
        await showLibrary();
      } catch (err) {
        const msg = String(err.message ?? err);
        const friendly = msg.includes('PASSWORD_REQUIRED') ? t('pdf.protected')
          : msg.includes('TOO_LARGE') ? t('pdf.tooLarge')
          : msg.includes('PAGE_LIMIT') ? t('pdf.pageLimit')
          : t('pdf.addFailed');
        alert(friendly + '：' + msg.slice(0, 80));
      }
      pdfBtn.disabled = false;
    });
  }
}

async function refreshFeedById(feedId) {
  await reverie.feedsRefresh(feedId);
  showLibrary();
}

// ============================================================ daily review (M5 §42-50)
let reviewSession = null;
let reviewIndex = 0;

function showReviewItem() {
  const view = document.getElementById('review-view');
  view.hidden = false;
  els.library.hidden = true;
  const box = document.getElementById('review-body');
  box.textContent = '';
  if (!reviewSession || reviewIndex >= reviewSession.length) {
    document.getElementById('review-empty').hidden = false;
    document.getElementById('review-empty').textContent = t('review.done');
    document.getElementById('review-nav').hidden = true;
    document.getElementById('review-open').hidden = true;
    return;
  }
  document.getElementById('review-empty').hidden = true;
  document.getElementById('review-nav').hidden = false;
  const item = reviewSession[reviewIndex];
  const kind = t('review.kind.' + item.kind);
  document.getElementById('review-kind').textContent = kind + (item.annotation_status === 'orphaned' ? t('review.orphaned') : '');
  const titleEl = document.getElementById('review-doc-title');
  titleEl.textContent = item.document_title ?? '(untitled)';
  titleEl.onclick = () => item.document_id && openArticle(item.document_id);
  box.textContent = '';
  if (item.context?.quoted_text) {
    const q = document.createElement('blockquote');
    q.textContent = item.context.quoted_text;
    box.appendChild(q);
  }
  if (item.context?.note) {
    const n = document.createElement('p');
    n.textContent = '📝 ' + item.context.note;
    box.appendChild(n);
  }
  const openBtn = document.getElementById('review-open');
  openBtn.hidden = !item.document_id;
  openBtn.onclick = () => item.document_id && openArticle(item.document_id);
  document.getElementById('review-pos').textContent = (reviewIndex + 1) + ' / ' + reviewSession.length;
}

async function startDailyReview() {
  const { queue } = await reverie.reviewQueue('mixed', 10);
  reviewSession = queue;
  reviewIndex = 0;
  els.library.hidden = true;
  els.reader.hidden = true;
  searchResults.hidden = true;
  const view = document.getElementById('review-view');
  view.hidden = false;
  showReviewItem();
}

function nextReviewItem() {
  if (!reviewSession) return;
  reverie.reviewMark(reviewSession.slice(reviewIndex, reviewIndex + 1).map((q) => ({ id: q.id })));
  reviewIndex++;
  showReviewItem();
}

function prevReviewItem() {
  if (reviewIndex > 0) { reviewIndex--; showReviewItem(); }
}

async function showLibrary() {
  els.reader.hidden = true;
  els.library.hidden = false;
  searchResults.hidden = true;
  document.getElementById('annotation-panel').hidden = true;
  const doctorPanelEl = document.getElementById('doctor-panel');
  if (doctorPanelEl) doctorPanelEl.hidden = true;
  hidePopup();

  const { results, total, counts, tag_facets } = await reverie.libraryView({
    view: currentView, query: searchInput.value.trim(), tags: currentTags,
    feedId: activeFeedId ?? undefined,
    sort: currentView === 'recent' ? 'recent-opened' : 'captured',
  });

  // sidebar counters + tag facets
  for (const [view, count] of Object.entries(counts)) {
    const el = document.querySelector(`[data-count="${view}"]`);
    if (el) el.textContent = String(count);
  }
  const tagBox = document.getElementById('tag-facets');
  tagBox.textContent = '';
  for (const { tag, count } of tag_facets) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'facet' + (currentTags.some((t) => t.toLowerCase() === tag.toLowerCase()) ? ' active' : '');
    chip.textContent = `${tag} ${count}`;
    chip.addEventListener('click', () => {
      currentTags = currentTags.some((t) => t.toLowerCase() === tag.toLowerCase())
        ? currentTags.filter((t) => t.toLowerCase() !== tag.toLowerCase())
        : [...currentTags, tag];
      showLibrary();
    });
    tagBox.appendChild(chip);
  }
  await renderFeedList();

  els.list.textContent = '';
  els.empty.hidden = results.length > 0;
  els.empty.textContent = activeFeedId
    ? t('feed.emptyFeed')
    : viewEmpty(currentView);
  if (total > results.length) {
    const more = document.createElement('li');
    more.className = 'load-more';
    more.textContent = t('list.more', { n: results.length, total });
    els.list.appendChild(more);
  }

  for (const e of results) {
    els.list.appendChild(renderLibraryRow(e));
  }

  // M9: current-view batch export (articles only — books/pdf keep their own files)
  currentViewArticleIds = results
    .filter((e) => e.type === 'article')
    .map((e) => e.document_id);
  const exportBtn = document.getElementById('btn-export-view-epub');
  if (exportBtn) {
    exportBtn.hidden = currentViewArticleIds.length === 0;
    exportBtn.textContent = t('btn.exportEpubView', { n: currentViewArticleIds.length });
  }
}

let currentViewArticleIds = [];

async function exportCurrentViewAsEpub() {
  if (currentViewArticleIds.length === 0) return;
  // NOTE: window.prompt does not exist in Electron — use the default title
  // directly (M9 §64: first export should be simple); the file can be renamed.
  const viewLabel = t('view.' + currentView);
  const bookTitle = `Reverie ${viewLabel} ${new Date().toISOString().slice(0, 10)}`;
  // test hook: CDP smokes cannot drive the native directory dialog
  const dest = await (window.__reverieExportDirPicker ? window.__reverieExportDirPicker() : reverie.pickExportDir());
  if (!dest) return;
  els.queueHint.textContent = t('export.doing');
  try {
    const result = await reverie.exportEpub(currentViewArticleIds, dest, {
      fileName: bookTitle,
      options: { bookTitle, includeHighlights: true, includeNotes: true },
      mode: 'merge',
    });
    if (result.success) {
      const warn = (result.warnings?.length ?? 0) > 0 ? t('export.warn', { n: result.warnings.length }) : '';
      const skip = (result.skipped?.length ?? 0) > 0 ? t('export.skipped', { n: result.skipped.length }) : '';
      els.queueHint.textContent = t('export.done', { path: result.outputPath, chapters: result.chapterCount }) + warn + skip;
    } else {
      els.queueHint.textContent = '';
      alert(t('export.failed') + (result.error ?? t('export.unknown')));
    }
  } catch (err) {
    els.queueHint.textContent = '';
    alert(t('export.failed') + String(err.message ?? err).slice(0, 120));
  }
  setTimeout(() => { els.queueHint.textContent = ''; }, 8000);
}

function renderLibraryRow(e) {
  const li = document.createElement('li');
  li.className = 'lib-row';
  const head = document.createElement('div');
  head.className = 'a-head';
  const dot = document.createElement('span');
  dot.className = 'read-dot' + (e.read ? ' read' : '');
  dot.title = e.read ? t('list.read') : t('list.unread');
  const title = document.createElement('span');
  title.className = 'a-title';
  title.textContent = e.title;
  head.append(dot, title);
  const meta = document.createElement('div');
  meta.className = 'a-meta';
  const source = e.original_url ?? e.canonical_url;
  meta.append(
    Object.assign(document.createElement('span'), { textContent: e.favorite ? '★' : '', className: 'fav-star' }),
    Object.assign(document.createElement('span'), { textContent: e.inbox ? '📥' : '' }),
    Object.assign(document.createElement('span'), { textContent: hostOf(source) }),
    Object.assign(document.createElement('span'), { textContent: e.author ?? '' }),
    Object.assign(document.createElement('span'), { textContent: fmtDate(currentView === 'recent' ? e.last_opened_at : e.captured_at) }),
  );
  for (const tag of e.tags) {
    const chip = document.createElement('span');
    chip.className = 'tag-chip';
    chip.textContent = tag;
    meta.appendChild(chip);
  }
  const actions = document.createElement('span');
  actions.className = 'a-actions';
  for (const [label, fn, active] of [
    [e.favorite ? t('row.unfav') : t('row.fav'), () => setState(e.document_id, { favorite: !e.favorite })],
    [e.read ? t('row.markUnread') : t('row.markRead'), () => setState(e.document_id, { read: !e.read })],
    [e.inbox ? t('row.uninbox') : t('row.inbox'), () => setState(e.document_id, { inbox: !e.inbox })],
    [t('row.delete'), () => removeArticle(e.document_id, e.title)],
  ]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    if (active) b.classList.add('active');
    b.addEventListener('click', (ev) => { ev.stopPropagation(); fn(); });
    actions.appendChild(b);
  }
  meta.appendChild(actions);
  li.append(head, meta);

  // inline tag editor (M3 §80)
  const tagRow = document.createElement('div');
  tagRow.className = 'tag-editor';
  const tagInput = document.createElement('input');
  tagInput.type = 'text';
  tagInput.placeholder = t('tag.addPh');
  tagInput.addEventListener('keydown', async (ev) => {
    if (ev.key === 'Enter' && tagInput.value.trim()) {
      ev.stopPropagation();
      await reverie.tagsAdd(e.document_id, tagInput.value);
      tagInput.value = '';
      showLibrary();
    }
    ev.stopPropagation();
  });
  for (const tag of e.tags) {
    const chip = document.createElement('span');
    chip.className = 'tag-chip removable';
    chip.textContent = tag;
    const x = document.createElement('button');
    x.type = 'button';
    x.textContent = '×';
    x.title = t('tag.remove', { tag });
    x.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      await reverie.tagsRemove(e.document_id, tag);
      showLibrary();
    });
    chip.appendChild(x);
    tagRow.appendChild(chip);
  }
  tagRow.appendChild(tagInput);
  li.appendChild(tagRow);

  li.addEventListener('click', () => openArticle(e.document_id));
  return li;
}

async function setState(documentId, patch) {
  try {
    await reverie.stateSet(documentId, patch); // file first, then index (M3 §72/73)
  } catch (err) {
    alert(t('state.saveFailed')); // friendly error, M3 §75
    console.error('state persist failed:', err.message);
  }
  showLibrary();
}

async function removeArticle(documentId, title) {
  if (!confirm(t('dialog.deleteDoc', { title }))) return;
  await reverie.articleDelete(documentId);
}

// ============================================================ search (M3 §18/§55/§58)
function snippetWithMark(snippet, term) {
  const span = document.createElement('span');
  if (!term) { span.textContent = snippet; return span; }
  const lower = snippet.toLowerCase();
  const lowerTerm = term.toLowerCase();
  let last = 0;
  let idx = lower.indexOf(lowerTerm);
  while (idx !== -1) {
    span.appendChild(document.createTextNode(snippet.slice(last, idx)));
    const mark = document.createElement('mark');
    mark.textContent = snippet.slice(idx, idx + lowerTerm.length);
    span.appendChild(mark);
    last = idx + lowerTerm.length;
    idx = lower.indexOf(lowerTerm, last);
  }
  span.appendChild(document.createTextNode(snippet.slice(last)));
  return span;
}

const matchLabel = (type) => t('match.' + type, type);

async function runSearch() {
  const q = searchInput.value.trim();
  const seq = ++searchSeq;
  if (q === '') { searchResults.hidden = true; els.library.hidden = false; return; }
  const res = await reverie.searchQuery(q);
  if (seq !== searchSeq) return; // a newer query already rendered
  els.library.hidden = true;
  searchResults.hidden = false;
  searchHint.textContent = '';
  searchResults.textContent = '';

  if (res.error) {
    const p = document.createElement('p');
    p.className = 'search-error';
    p.textContent = t('search.errorSyntax', { err: res.error });
    searchResults.appendChild(p);
    return;
  }
  if (res.total === 0) {
    const p = document.createElement('p');
    p.className = 'search-error';
    p.textContent = t('search.noResults');
    searchResults.appendChild(p);
    return;
  }

  lastSearchResults = [];
  for (const doc of res.results) {
    const card = document.createElement('div');
    card.className = 'result-card';
    const title = document.createElement('p');
    title.className = 'a-title';
    title.textContent = doc.title;
    card.appendChild(title);
    const meta = document.createElement('div');
    meta.className = 'a-meta';
    meta.append(
      Object.assign(document.createElement('span'), { textContent: doc.author ?? '' }),
      Object.assign(document.createElement('span'), { textContent: fmtDate(doc.captured_at) }),
    );
    card.appendChild(meta);

    for (const m of doc.matches) {
      const row = document.createElement('div');
      row.className = 'match-row';
      row.tabIndex = 0;
      const badge = document.createElement('span');
      badge.className = `match-badge match-${m.type}`;
      badge.textContent = matchLabel(m.type);
      if (m.annotation_status === 'orphaned') badge.textContent += t('search.orphaned');
      const snippet = document.createElement('span');
      snippet.className = 'match-snippet';
      snippet.appendChild(snippetWithMark(m.snippet, m.term));
      row.append(badge, snippet);
      const entry = { documentId: doc.document_id, match: m };
      const open = () => openSearchMatch(entry);
      row.addEventListener('click', open);
      row.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') open(); });
      lastSearchResults.push({ el: row, open });
      card.appendChild(row);
    }
    searchResults.appendChild(card);
  }
  activeResultIdx = -1;
}

/** M3 §24/§85/§86: navigate by match type, reusing M2 anchors for annotations. */
async function openSearchMatch({ documentId, match }) {
  await openArticle(documentId);
  if (match.type === 'highlight' || match.type === 'note') {
    const annotation = currentDoc.annotations.find((a) => a.annotation_id === match.annotation_id);
    if (!annotation) return;
    if (annotation.status === 'orphaned') {
      alert(t('ann.gone'));
      document.getElementById('annotation-panel').hidden = false;
      return;
    }
    navigateTo(annotation);
  } else if (match.type === 'body' && match.term) {
    globalThis.ReverieTtsView?.stopForNavigation(); // M8 §29
    if (currentDoc.type === 'pdf') {
      // M7 §97: global search → open PDF at the page holding the match.
      // Locate via canonical (DOM text may not be built yet for that page).
      const spans = currentDoc.page_spans ?? [];
      const text = (currentDoc.canonicalText ?? '').toLowerCase();
      const idx = text.indexOf(match.term.toLowerCase());
      if (idx !== -1) {
        const span = spans.find((s) => idx >= s.start && idx < s.end);
        await globalThis.ReveriePdf?.revealOffset(idx);
        const range = ReaderAnchor.rangeForOffsets(
          document.getElementById('reader-content'), idx, idx + match.term.length);
        flashRange(range);
        void span;
      }
      return;
    }
    const index = ReaderAnchor.textIndex(document.getElementById('reader-content'));
    const idx = index.text.toLowerCase().indexOf(match.term.toLowerCase());
    if (idx !== -1) {
      const { createRange } = index; void createRange;
      const range = ReaderAnchor.rangeForOffsets(document.getElementById('reader-content'), idx, idx + match.term.length);
      flashRange(range);
    }
  }
}

// ============================================================ reader + annotations
const popup = document.getElementById('selection-popup');

function hidePopup() { popup.hidden = true; }
document.addEventListener('selectionchange', () => {
  if (window.getSelection().isCollapsed) hidePopup();
});

document.getElementById('reader-content').addEventListener('mouseup', () => {
  const sel = window.getSelection();
  if (sel.isCollapsed || !currentDoc) return;
  const range = sel.getRangeAt(0);
  const content = document.getElementById('reader-content');
  if (!content.contains(range.commonAncestorContainer)) return;
  const parts = ReaderAnchor.selectionParts(range, content);
  if (!parts || parts.quote.trim().length === 0) return;

  popup.hidden = false;
  const rect = range.getBoundingClientRect();
  popup.style.left = `${Math.max(8, rect.left + window.scrollX)}px`;
  popup.style.top = `${Math.max(8, rect.bottom + window.scrollY + 6)}px`;
  const btnHighlight = document.getElementById('popup-highlight');
  const btnRepair = document.getElementById('popup-repair');
  const btnRead = document.getElementById('popup-read');
  window.__reverieSelectionParts = parts; // M8: 朗读所选 reads from here
  btnRepair.hidden = repairTarget === null;
  btnHighlight.hidden = repairTarget !== null;
  btnRead.hidden = repairTarget !== null;
  btnHighlight.onclick = async () => {
    try { await reverie.annotationCreate(currentDoc.documentId, parts, ''); }
    catch (err) { console.error('create failed:', err.message); }
    sel.removeAllRanges(); hidePopup(); await refreshAnnotations();
  };
  btnRepair.onclick = async () => {
    try { await reverie.annotationRepair(currentDoc.documentId, repairTarget, parts); }
    catch (err) { console.error('repair failed:', err.message); }
    repairTarget = null; sel.removeAllRanges(); hidePopup(); await refreshAnnotations();
  };
});

const panel = document.getElementById('annotation-panel');
const panelList = document.getElementById('annotation-list');

function renderPanel(annotations) {
  panelList.textContent = '';
  document.getElementById('annotation-count').textContent = String(annotations.length);
  for (const a of [...annotations].sort((x, y) => (x.created_at < y.created_at ? -1 : 1))) {
    const li = document.createElement('li');
    li.className = `ann ${a.status}`;
    const quote = document.createElement('p');
    quote.className = 'ann-quote';
    if (a.type === 'bookmark') {
      const loc = a.locator?.location ?? {};
      const unit = t('ann.unit.' + (loc.chapter_index !== undefined ? 'chapter' : loc.page_index !== undefined ? 'page' : 'offset'));
      const num = (loc.chapter_index ?? loc.page_index ?? loc.offset ?? 0);
      quote.textContent = Number.isInteger(num) && (loc.chapter_index !== undefined || loc.page_index !== undefined)
        ? `🔖 书签 · 第 ${num + 1} ${unit}`
        : `🔖 书签`;
    } else {
      quote.textContent = a.quoted_text ?? t('ann.noQuote');
    }
    li.appendChild(quote);
    if (a.status === 'orphaned') {
      const warn = document.createElement('p');
      warn.className = 'ann-warn';
      warn.textContent = t('ann.orphanWarn');
      li.appendChild(warn);
    }
    const noteEl = document.createElement('textarea');
    noteEl.className = 'ann-note';
    noteEl.placeholder = t('ann.notePh');
    noteEl.value = a.note ?? '';
    noteEl.rows = a.note ? 2 : 1;
    noteEl.addEventListener('change', async () => {
      await reverie.annotationUpdateNote(currentDoc.documentId, a.annotation_id, noteEl.value);
      await refreshAnnotations();
    });
    li.appendChild(noteEl);
    const actions = document.createElement('div');
    actions.className = 'ann-actions';
    actions.textContent = '';
    const buttons = a.type === 'bookmark'
      ? [
          [t('ann.jumpLoc'), () => gotoBookLocation(a.locator?.location ?? {})],
          [t('ann.delete'), () => removeAnnotation(a.annotation_id)],
        ]
      : a.status === 'orphaned'
      ? [
          [t('ann.repair'), () => { repairTarget = a.annotation_id; hidePanel(); alert(t('ann.repairHint')); }],
          [t('ann.delete'), () => removeAnnotation(a.annotation_id)],
        ]
      : [
          [t('ann.jump'), () => navigateTo(a)],
          [t('ann.delete'), () => removeAnnotation(a.annotation_id)],
        ];
    for (const [label, fn] of buttons) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.addEventListener('click', fn);
      actions.appendChild(b);
    }
    li.appendChild(actions);
    panelList.appendChild(li);
  }
}

async function removeAnnotation(annotationId) {
  if (!confirm(t('dialog.deleteAnn'))) return;
  await reverie.annotationDelete(currentDoc.documentId, annotationId);
  await refreshAnnotations();
}

function navigateTo(a) {
  globalThis.ReverieTtsView?.stopForNavigation(); // M8 §29: 跳转中断朗读
  if (a.status !== 'resolved' || !a.locator?.position) return;
  const range = ReaderAnchor.rangeForOffsets(document.getElementById('reader-content'), a.locator.position.start, a.locator.position.end);
  flashRange(range);
}

async function refreshAnnotations() {
  const { annotations } = await reverie.articleLoad(currentDoc.documentId);
  currentDoc.annotations = annotations;
  renderPanel(annotations);
  applyHighlights(annotations);
}

function hidePanel() { panel.hidden = true; }

// ============================================================ views

async function openArticle(documentId) {
  const loaded = await reverie.articleLoad(documentId);
  currentDoc = { documentId, ...loaded };
  els.library.hidden = true;
  searchResults.hidden = true;
  els.reader.hidden = false;
  panel.hidden = true;
  hidePopup();
  els.title.textContent = loaded.meta.title ?? "(untitled)";
  els.meta.textContent = [
    loaded.meta.author,
    loaded.meta.source?.canonical_url ? hostOf(loaded.meta.source.canonical_url) : hostOf(loaded.meta.source?.original_url ?? ""),
    t("reader.savedAt") + " " + fmtDate(loaded.meta.captured_at),
  ].filter(Boolean).join(" · ");
  els.content.textContent = "";
  // reset scroll BEFORE the branches: any later scroll (after the IPC awaits
  // below) would race the readers' position restore (M6 §26 / M7 §41)
  window.scrollTo(0, 0);

  if (loaded.type === "book") {
    globalThis.ReveriePdf?.dispose?.();
    renderBookChapters(loaded);
    buildBookToc(loaded);
    setupBookProgress(documentId);
    setPdfControlsVisible(false);
  } else if (loaded.type === "pdf") {
    if (!globalThis.ReveriePdf) await window.__reveriePdfReady;
    detachBookProgressListener();
    buildBookToc(loaded);
    await globalThis.ReveriePdf.init(loaded, els.content, {
      onProgress: pdfProgressSaver(documentId),
    });
    setPdfControlsVisible(true);
  } else {
    globalThis.ReveriePdf?.dispose?.();
    detachBookProgressListener();
    const ctx = { resolveImage: async (rel) => await reverie.articleResolvePath(documentId, rel) };
    els.content.appendChild(renderBlocks(loaded.blocks, ctx));
    setPdfControlsVisible(false);
  }
  document.getElementById('btn-bookmark').hidden = !(loaded.type === 'book' || loaded.type === 'pdf');
  renderPanel(loaded.annotations);
  requestAnimationFrame(() => applyHighlights(loaded.annotations));
  // M8: TTS follows the Reader — availability hides/shows the toolbar group
  globalThis.ReverieTtsView?.open(loaded, els.content);

  const entry = (await reverie.libraryList()).entries.find((e) => e.document_id === documentId);
  if (entry?.read_state !== "read") await reverie.articleReadState(documentId, "read");
  // M6 §26: restore last reading position after layout settles — this is the
  // LAST scroll action of openArticle; nothing may reset it afterwards
  requestAnimationFrame(() => restoreBookProgress(loaded));
}

// ---- M6: EPUB chapters (sanitized XHTML from main; safe under CSP) ----
function renderBookChapters(loaded) {
  for (const ch of loaded.chapters) {
    const section = document.createElement("section");
    section.className = "book-chapter";
    section.dataset.chapterIndex = String(ch.index);
    section.dataset.anchor = ch.href;
    const body = document.createElement("div");
    body.className = "book-chapter-body";
    body.innerHTML = ch.xhtml; // DOMPurify-sanitized in main (M6 §11-15)
    section.appendChild(body);
    els.content.appendChild(section);
  }
}

function buildBookToc(loaded) {
  const toc = document.getElementById("book-toc");
  const list = document.getElementById("book-toc-list");
  list.textContent = "";
  if (loaded.type === "pdf") {
    // outline tree (M7 §18); corrupt nodes keep their title but are disabled —
    // a broken entry never blocks the document (M7 §19)
    const addItems = (nodes, depth) => {
      for (const n of nodes) {
        const li = document.createElement("li");
        const b = document.createElement("button");
        b.type = "button";
        b.style.paddingLeft = `${8 + depth * 14}px`;
        b.textContent = n.title || (n.page_index != null ? t('toc.page', { n: n.page_index + 1 }) : t('toc.untitled'));
        if (n.page_index == null) {
          b.disabled = true;
        } else {
          b.addEventListener("click", () => {
            globalThis.ReverieTtsView?.stopForNavigation();
            globalThis.ReveriePdf?.scrollToPage(n.page_index);
            toc.hidden = true;
          });
        }
        li.appendChild(b);
        list.appendChild(li);
        if (n.children?.length) addItems(n.children, depth + 1);
      }
    };
    if (loaded.outline?.length > 0) {
      addItems(loaded.outline, 0);
    } else {
      // no outline → page list fallback
      for (let i = 0; i < loaded.pages.length; i++) {
        const li = document.createElement("li");
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = t('toc.page', { n: i + 1 });
        b.addEventListener("click", () => {
          globalThis.ReverieTtsView?.stopForNavigation();
          globalThis.ReveriePdf?.scrollToPage(i);
          toc.hidden = true;
        });
        li.appendChild(b);
        list.appendChild(li);
      }
    }
    return;
  }
  for (const ch of loaded.chapters) {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = ch.title || ch.href;
    b.addEventListener("click", () => {
      globalThis.ReverieTtsView?.stopForNavigation();
      const sec = els.content.querySelector("[data-anchor='" + CSS.escape(ch.href) + "']");
      if (sec) { sec.scrollIntoView({ behavior: "smooth" }); toc.hidden = true; }
    });
    li.appendChild(b);
    list.appendChild(li);
  }
}

// ---- M6 §26/§38: reading progress + bookmarks (reader-location model) ----
function bookProgressFromDom() {
  const sections = els.content.querySelectorAll('.book-chapter');
  const anchorY = window.scrollY + window.innerHeight * 0.3;
  let chapterIndex = 0;
  let ratio = 0;
  for (const sec of sections) {
    const rect = sec.getBoundingClientRect();
    const top = rect.top + window.scrollY;
    if (top <= anchorY) {
      chapterIndex = Number(sec.dataset.chapterIndex) || 0;
      ratio = rect.height > 0 ? Math.min(1, Math.max(0, (anchorY - top) / rect.height)) : 0;
    }
  }
  return { chapter_index: chapterIndex, scroll_ratio: Number(ratio.toFixed(4)) };
}

function gotoBookLocation(loc) {
  globalThis.ReverieTtsView?.stopForNavigation(); // M8 §29: 跳转中断朗读
  if (typeof loc?.chapter_index === 'number') {
    const sec = els.content.querySelector(`.book-chapter[data-chapter-index='${loc.chapter_index}']`);
    if (!sec) return;
    const rect = sec.getBoundingClientRect();
    const top = rect.top + window.scrollY;
    const ratio = typeof loc.scroll_ratio === 'number' ? Math.min(1, Math.max(0, loc.scroll_ratio)) : 0;
    window.scrollTo({ top: Math.max(0, Math.round(top + rect.height * ratio - window.innerHeight * 0.3)), behavior: 'smooth' });
  } else if (typeof loc?.page_index === 'number') {
    globalThis.ReveriePdf?.scrollToPage(loc.page_index, loc.scroll_ratio ?? 0);
  } else if (typeof loc?.offset === 'number') {
    // article bookmark: canonical offset → range → center
    const range = ReaderAnchor.rangeForOffsets(els.content, loc.offset, Math.min(loc.offset + 1, els.content.textContent.length));
    range?.startContainer.parentElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

let progressTimer = null;
function setupBookProgress(documentId) {
  // swap out the previous book's listener so a late scroll never writes stale progress
  const prev = window.__revProgressListener;
  if (prev) window.removeEventListener('scroll', prev);
  const listener = () => {
    if (!currentDoc || currentDoc.documentId !== documentId || currentDoc.type !== 'book') return;
    clearTimeout(progressTimer);
    progressTimer = setTimeout(() => {
      if (!currentDoc || currentDoc.documentId !== documentId || currentDoc.type !== 'book') return;
      reverie.bookSaveProgress(documentId, bookProgressFromDom()).catch(() => {});
    }, 400);
  };
  window.__revProgressListener = listener;
  window.addEventListener('scroll', listener, { passive: true });
}

function detachBookProgressListener() {
  const prev = window.__revProgressListener;
  if (prev) window.removeEventListener('scroll', prev);
  window.__revProgressListener = null;
}

// ---- M7: PDF progress (page_index unit) — pdf-view detects scrolls, this
// debounces the user-state write and refuses stale cross-document writes.
function pdfProgressSaver(documentId) {
  let timer = null;
  return (loc) => {
    if (!currentDoc || currentDoc.documentId !== documentId || currentDoc.type !== 'pdf') return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!currentDoc || currentDoc.documentId !== documentId || currentDoc.type !== 'pdf') return;
      reverie.bookSaveProgress(documentId, loc).catch(() => {});
    }, 400);
  };
}

function setPdfControlsVisible(visible) {
  document.getElementById('pdf-controls').hidden = !visible;
}

function restoreBookProgress(loaded) {
  const loc = loaded.last_location;
  if (!loc || typeof loc.chapter_index !== 'number') return;
  if (loc.chapter_index > 0 || (typeof loc.scroll_ratio === 'number' && loc.scroll_ratio > 0.01)) {
    gotoBookLocation(loc);
  }
}

// ---- M6 §28-30: in-book search over the canonical text ----
const bookSearchInput = document.getElementById('book-search');
const bookSearchList = document.getElementById('book-search-results');
let bookSearchTimer = null;
bookSearchInput.addEventListener('input', () => {
  clearTimeout(bookSearchTimer);
  bookSearchTimer = setTimeout(runBookSearch, 200);
});

function bookChapterOffsets(loaded) {
  const spans = [];
  let pos = 0;
  for (const ch of loaded.chapters) {
    spans.push({ index: ch.index, title: ch.title, start: pos, end: pos + ch.text.length });
    pos += ch.text.length;
  }
  return spans;
}

function runBookSearch() {
  bookSearchList.textContent = '';
  const term = bookSearchInput.value.trim();
  const text = currentDoc?.canonicalText;
  if (!term || !text || (currentDoc.type !== 'book' && currentDoc.type !== 'pdf')) return;
  const lower = text.toLowerCase();
  const lowerTerm = term.toLowerCase();
  const isPdf = currentDoc.type === 'pdf';
  const spans = isPdf
    ? (currentDoc.page_spans ?? [])
    : bookChapterOffsets(currentDoc);
  if (spans.length === 0) return;
  const spanAt = (off) => spans.find((s) => off >= s.start && off < s.end) ?? spans[spans.length - 1];
  const spanTitle = (s) => {
    if (!isPdf) return s.title || t('toc.chapter', { n: s.index + 1 });
    const label = globalThis.ReveriePdf?.pageLabel?.(s.index);
    const idx = String(s.index + 1);
    return t('toc.pageLabeled', { n: Number(idx), label });
  };
  const MAX = 200;
  let hits = 0;
  let from = 0;
  while (hits < MAX) {
    const i = lower.indexOf(lowerTerm, from);
    if (i === -1) break;
    from = i + lowerTerm.length;
    hits += 1;
    const span = spanAt(i);
    const snippet = text.slice(Math.max(0, i - 20), Math.min(text.length, i + term.length + 30)).replace(/\s+/g, ' ');
    const li = document.createElement('li');
    const head = document.createElement('p');
    head.className = 'bs-chapter';
    head.textContent = spanTitle(span);
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'bs-hit';
    row.appendChild(snippetWithMark(snippet, term));
    row.addEventListener('click', async () => {
      // canonical offsets are valid in the DOM: both sides share one text (M6 §33 / M7 §13)
      globalThis.ReverieTtsView?.stopForNavigation();
      if (isPdf) await globalThis.ReveriePdf?.revealOffset(i);
      const range = ReaderAnchor.rangeForOffsets(els.content, i, i + term.length);
      flashRange(range);
      document.getElementById('book-toc').hidden = true;
    });
    li.append(head, row);
    bookSearchList.appendChild(li);
  }
  if (hits === 0 || hits === MAX) {
    const p = document.createElement('p');
    p.className = 'bs-empty';
    p.textContent = hits === 0 ? t('search.noResults') : t('search.cap200');
    bookSearchList.appendChild(p);
  }
}
// ============================================================ search box + keyboard (M3 §77-79)
let debounceTimer = null;
searchInput.addEventListener('input', () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(runSearch, 200); // M3 §57 debounce
});
searchInput.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape') { searchInput.value = ''; searchResults.hidden = true; els.library.hidden = false; showLibrary(); searchInput.blur(); }
  if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
    ev.preventDefault();
    if (lastSearchResults.length === 0) return;
    activeResultIdx = ev.key === 'ArrowDown'
      ? Math.min(activeResultIdx + 1, lastSearchResults.length - 1)
      : Math.max(activeResultIdx - 1, 0);
    lastSearchResults.forEach((r, i) => r.el.classList.toggle('active', i === activeResultIdx));
    lastSearchResults[activeResultIdx]?.el.scrollIntoView({ block: 'nearest' });
  }
  if (ev.key === 'Enter') {
    if (activeResultIdx >= 0 && lastSearchResults[activeResultIdx]) lastSearchResults[activeResultIdx].open();
    else if (lastSearchResults.length > 0) lastSearchResults[0].open();
  }
});
document.addEventListener('keydown', (ev) => {
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k') {
    ev.preventDefault();
    els.reader.hidden = true;
    searchResults.hidden = false;
    els.library.hidden = true;
    searchInput.focus();
    searchInput.select();
  }
});

for (const b of document.querySelectorAll('[data-view]')) {
  b.addEventListener('click', () => {
    if (b.dataset.view === 'daily-review') { startDailyReview(); return; }
    currentView = b.dataset.view;
    activeFeedId = null;
    document.querySelectorAll('[data-view]').forEach((x) => x.classList.toggle('active', x === b));
    showLibrary();
  });
}
document.getElementById('btn-back').addEventListener('click', () => {
  globalThis.ReverieTtsView?.close();
  globalThis.ReveriePdf?.dispose?.();
  showLibrary();
});
// ============================================================ M11: library location + app info
const llPath = document.getElementById('ll-path');

async function refreshLibraryLocation() {
  try {
    const settings = await reverie.settingsGet();
    llPath.textContent = settings.effectiveLibraryRoot;
    llPath.title = settings.effectiveLibraryRoot
      + (settings.libraryPathEnv ? '\n' + t('ll.envNote') : '');
  } catch { /* settings unavailable — leave blank */ }
}

document.getElementById('btn-library-change').addEventListener('click', async () => {
  const dest = await reverie.pickExportDir(); // directory picker (create allowed)
  if (!dest) return;
  const settings = await reverie.settingsGet();
  if (path0(dest) === path0(settings.effectiveLibraryRoot)) return;
  if (!confirm(t('dialog.libraryChange', { path: dest }))) return;
  try {
    await reverie.settingsSetLibrary(dest);
    if (confirm(t('dialog.libraryRelaunch'))) await reverie.appRelaunch();
    else await refreshLibraryLocation();
  } catch (err) {
    alert(t('ll.saveFailed') + String(err.message ?? err).slice(0, 120));
  }
  function path0(p) { return String(p).replace(/[\\/]+$/, '').toLowerCase(); }
});

document.getElementById('btn-library-open').addEventListener('click', () => reverie.appOpenLibraryFolder());
document.getElementById('btn-logs-open').addEventListener('click', () => reverie.appOpenLogs());
// M4: RSS subscribe (the input existed since M4 but was never wired — caught
// by the M12 journey; Enter adds the feed, refresh shows up per-row)
document.getElementById('feed-url').addEventListener('keydown', async (ev) => {
  if (ev.key !== 'Enter') return;
  const input = ev.target;
  const url = input.value.trim();
  if (!url) return;
  input.value = '';
  input.placeholder = t('feed.adding');
  try {
    const result = await reverie.feedsAdd(url);
    input.placeholder = result.duplicate ? t('feed.duplicate') : t('feed.added');
  } catch (err) {
    input.placeholder = t('feed.failed');
    alert(t('feed.failed') + ': ' + String(err.message ?? err).slice(0, 140) + '\n' + t('feed.failedDetail'));
  }
  await renderFeedList();
  setTimeout(() => { input.placeholder = t('feed.add.ph'); }, 4000);
});
refreshLibraryLocation();
refreshAppInfoLine();

// M11: files opened via association/args (single-instance forwarding)
reverie.onOpenDocument?.((payload) => {
  if (!payload?.documentId) return;
  openArticle(payload.documentId);
});

async function refreshAppInfoLine() {
  try {
    const info = await reverie.appInfo();
    const line = `Reverie ${info.version}${info.buildId ? ` · build ${info.buildId}` : ''} · ${info.platform}`;
    const el = document.getElementById('doctor-summary');
    if (el && el.textContent.length === 0) el.textContent = line;
  } catch { /* optional */ }
}

document.getElementById('btn-logs-open').addEventListener('click', () => reverie.appOpenLogs());

// ---- Post-1.0: appearance (theme / accent) + language switching ----
(function initAppearance() {
  const selLang = document.getElementById('sel-lang');
  const selTheme = document.getElementById('sel-theme');
  const savedLang = (() => { try { return localStorage.getItem('reverie.lang'); } catch { return null; } })();
  if (savedLang) selLang.value = savedLang;
  const savedTheme = (() => { try { return localStorage.getItem('reverie.theme'); } catch { return null; } })();
  if (savedTheme) selTheme.value = savedTheme;
  const savedAccent = (() => { try { return localStorage.getItem('reverie.accent'); } catch { return null; } })();
  if (savedAccent) {
    const dot = document.querySelector(`.accent-dot[data-accent='${savedAccent}']`);
    if (dot) {
      document.querySelectorAll('.accent-dot').forEach((d) => d.classList.remove('active'));
      dot.classList.add('active');
    }
  }
  selLang.addEventListener('change', () => window.I18N.setLang(selLang.value));
  selTheme.addEventListener('change', () => window.Theme.setTheme(selTheme.value));
  document.querySelectorAll('.accent-dot').forEach((dot) => {
    dot.addEventListener('click', () => {
      document.querySelectorAll('.accent-dot').forEach((d) => d.classList.remove('active'));
      dot.classList.add('active');
      window.Theme.setAccent(dot.dataset.accent);
    });
  });
})();

document.getElementById('btn-export-view-epub').addEventListener('click', () => { exportCurrentViewAsEpub(); });

// ============================================================ doctor (M10)
const doctorPanel = document.getElementById('doctor-panel');
const doctorFindings = document.getElementById('doctor-findings');
const doctorSummary = document.getElementById('doctor-summary');
const doctorRepairBtn = document.getElementById('btn-doctor-repair');
const doctorReportBtn = document.getElementById('btn-doctor-report');
let doctorReport = null;

document.getElementById('btn-doctor').addEventListener('click', async () => {
  hidePanel();
  document.getElementById('book-toc').hidden = true;
  doctorPanel.hidden = false;
  doctorSummary.textContent = t('doctor.scanning');
  doctorFindings.textContent = '';
  doctorRepairBtn.hidden = true;
  doctorReportBtn.hidden = true;
  doctorReport = await reverie.doctorRun();
  renderDoctorReport(doctorReport);
});

function renderDoctorReport(report) {
  const s = report.summary;
  doctorSummary.textContent = t('doctor.summary', { docs: s.documents, checks: s.checks, findings: s.findings, e: s.bySeverity.error ?? 0, w: s.bySeverity.warning ?? 0, i: s.bySeverity.info ?? 0, r: s.repairable });
  doctorFindings.textContent = '';
  for (const f of report.findings) {
    const li = document.createElement('li');
    li.className = `doctor-finding sev-${f.severity}`;
    const title = document.createElement('p');
    title.className = 'doctor-title';
    title.textContent = `[${f.severity.toUpperCase()}] ${f.problem}`;
    const meta = document.createElement('p');
    meta.className = 'doctor-meta';
    meta.textContent = `${f.checkId}${f.path ? ' · ' + f.path : ''} → ${f.suggestedAction}`;
    li.append(title, meta);
    // conditional repairs (M10 §21): annotation record-level recovery, with
    // preview confirm before any file is rewritten
    if (f.checkId === 'annotation_corrupt' && f.path) {
      const repairBtn = document.createElement('button');
      repairBtn.type = 'button';
      repairBtn.textContent = t('doctor.repairFindingBtn');
      repairBtn.addEventListener('click', async () => {
        const docDir = f.path;
        const preview = await reverie.doctorRepairFinding('annotation_corrupt', docDir, true);
        if (!preview.changed && preview.dryRun) { alert(t('doctor.nothingToFix')); return; }
        if (!confirm(t('doctor.annRepairConfirm', { dir: docDir, kept: preview.kept, q: preview.quarantined }))) return;
        const result = await reverie.doctorRepairFinding('annotation_corrupt', docDir, false);
        await rerunDoctorQuiet();
        alert(t('doctor.annRepairDone', { kept: result.kept, q: result.quarantined }));
      });
      li.appendChild(repairBtn);
    }
    doctorFindings.appendChild(li);
  }
  if (report.findings.length === 0) {
    const li = document.createElement('li');
    li.textContent = t('doctor.healthy');
    doctorFindings.appendChild(li);
  }
  doctorRepairBtn.hidden = s.repairable === 0;
  doctorReportBtn.hidden = report.findings.length === 0 && s.documents === 0;
}

doctorRepairBtn.addEventListener('click', async () => {
  const preview = await reverie.doctorRepair(true);
  const lines = (preview.actions ?? []).map((a) => t('doctor.actionLine', { action: a.action, target: a.target, n: a.filesAffected, risk: a.risk }));
  if (lines.length === 0) { alert(t('doctor.noActions')); return; }
  if (!confirm(t('doctor.repairConfirm', { n: lines.length, list: lines.join('\n') }))) return;
  const result = await reverie.doctorRepair(false);
  doctorReport = { ...doctorReport, summary: result.afterSummary ?? doctorReport.summary };
  await rerunDoctorQuiet();
  alert(t('doctor.repairDone', { actions: (result.executed ?? []).map((e) => e.action).join(', ') || t('doctor.none'), remaining: result.remainingFindings }));
});

async function rerunDoctorQuiet() {
  doctorReport = await reverie.doctorRun();
  renderDoctorReport(doctorReport);
}

doctorReportBtn.addEventListener('click', async () => {
  if (!doctorReport) return;
  // test hook: CDP smokes cannot drive the native directory dialog
  const dest = await (window.__reverieExportDirPicker ? window.__reverieExportDirPicker() : reverie.pickExportDir());
  if (!dest) return;
  const md = `# Reverie Doctor 报告\n\n- 时间：${doctorReport.generatedAt}\n- 文档：${doctorReport.summary.documents}\n\n`
    + doctorReport.findings.map((f) => `- [${f.severity.toUpperCase()}] ${f.checkId} — ${f.problem} (${f.path}) → ${f.suggestedAction}`).join('\n');
  await reverie.writeReport(dest, `DoctorReport-${new Date().toISOString().slice(0, 10)}.md`, md);
  els.queueHint.textContent = t('doctor.reportDone');
  setTimeout(() => { els.queueHint.textContent = ''; }, 4000);
});
document.getElementById('btn-reindex').addEventListener('click', async () => {
  const { count } = await reverie.libraryReindex();
  const { total } = await reverie.searchRefresh();
  els.queueHint.textContent = t('reindex.done', { count, total });
  setTimeout(() => { els.queueHint.textContent = ''; }, 2500);
});
document.getElementById('btn-annotations').addEventListener('click', () => { panel.hidden = !panel.hidden; });
document.getElementById('btn-toc').addEventListener('click', () => { const t = document.getElementById('book-toc'); t.hidden = !t.hidden; });
document.getElementById('btn-bookmark').addEventListener('click', async () => {
  if (!currentDoc) return;
  try {
    let location;
    if (currentDoc.type === 'pdf') {
      location = globalThis.ReveriePdf?.progressFromDom?.() ?? { page_index: 0 };
    } else if (currentDoc.type === 'book') {
      location = bookProgressFromDom();
    } else {
      // article: bookmark at the current reading offset (M2 reader-location)
      const index = ReaderAnchor.textIndex(els.content);
      const anchorY = window.scrollY + window.innerHeight * 0.3;
      let offset = 0;
      for (const e of index.entries) {
        const el = e.node.parentElement;
        if (!el || !el.getBoundingClientRect) continue;
        const r = el.getBoundingClientRect();
        if (r.top + window.scrollY + Math.min(r.height, window.innerHeight) >= anchorY) { offset = e.start; break; }
      }
      location = { offset, scroll_ratio: Number((window.scrollY / Math.max(1, document.body.scrollHeight - window.innerHeight)).toFixed(4)) };
    }
    await reverie.bookAddBookmark(currentDoc.documentId, location);
    await refreshAnnotations();
  } catch (err) {
    console.error('bookmark failed:', err.message);
  }
});
// M7 §46: PDF page navigation keyboard support (left/right in reader)
document.addEventListener('keydown', (ev) => {
  if (!currentDoc || currentDoc.type !== 'pdf' || els.reader.hidden) return;
  const target = ev.target;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
  if (ev.key === 'ArrowLeft') { ev.preventDefault(); globalThis.ReverieTtsView?.stopForNavigation(); globalThis.ReveriePdf?.prevPage(); }
  else if (ev.key === 'ArrowRight') { ev.preventDefault(); globalThis.ReverieTtsView?.stopForNavigation(); globalThis.ReveriePdf?.nextPage(); }
});
// M7 §11: PDF page/zoom controls
document.getElementById('pdf-prev').addEventListener('click', () => globalThis.ReveriePdf?.prevPage());
document.getElementById('pdf-next').addEventListener('click', () => globalThis.ReveriePdf?.nextPage());
document.getElementById('pdf-zoom-in').addEventListener('click', () => globalThis.ReveriePdf?.zoomBy(1.2));
document.getElementById('pdf-zoom-out').addEventListener('click', () => globalThis.ReveriePdf?.zoomBy(1 / 1.2));

document.getElementById('btn-export-md').addEventListener('click', async () => {
  if (!currentDoc) return;
  const dest = await reverie.pickExportDir();
  if (!dest) return;
  const r = await reverie.exportDocuments([currentDoc.documentId], 'markdown', dest);
  alert(r.failed_count === 0 ? t('export.mdDone') : t('export.mdFailed', { n: r.failed_count }));
});
document.getElementById('btn-export-epub').addEventListener('click', async () => {
  if (!currentDoc) return;
  const dest = await reverie.pickExportDir();
  if (!dest) return;
  const r = await reverie.exportDocuments([currentDoc.documentId], 'epub', dest);
  alert(r.failed_count === 0 ? t('export.epubDone') : t('export.epubFailed', { n: r.failed_count }));
});
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && !els.reader.hidden) { els.reader.hidden = true; els.library.hidden = false; showLibrary(); }
});

reverie.onLibraryChanged(() => { if (!els.library.hidden) showLibrary(); });
reverie.onQueueChanged(() => { if (!els.library.hidden) showLibrary(); });

showLibrary();

// i18n: re-render dynamic surfaces when the language changes (Post-1.0)
document.addEventListener('reverie:langchanged', () => {
  window.I18N.applyStatic(document.getElementById('doctor-panel'));
  window.I18N.applyStatic(document.getElementById('book-toc'));
  window.I18N.applyStatic(document.getElementById('annotation-panel'));
  if (!els.library.hidden) showLibrary();
});
