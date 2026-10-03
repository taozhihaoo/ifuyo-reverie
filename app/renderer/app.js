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

// ============================================================ library views
const VIEW_EMPTY = {
  all: '资料库还是空的。在浏览器里点击 “Save page to Reverie” 保存第一篇。',
  inbox: 'Inbox 是空的——没有待处理的资料。',
  favorites: '还没有收藏。',
  unread: '没有未读资料。',
  recent: '最近没有打开过文章。',
};

async function showLibrary() {
  els.reader.hidden = true;
  els.library.hidden = false;
  searchResults.hidden = true;
  document.getElementById('annotation-panel').hidden = true;
  hidePopup();

  const { results, total, counts, tag_facets } = await reverie.libraryView({
    view: currentView, query: searchInput.value.trim(), tags: currentTags,
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

  els.list.textContent = '';
  els.empty.hidden = results.length > 0;
  els.empty.textContent = VIEW_EMPTY[currentView] ?? VIEW_EMPTY.all;
  if (total > results.length) {
    const more = document.createElement('li');
    more.className = 'load-more';
    more.textContent = `显示 ${results.length} / ${total} 篇（缩小范围或使用搜索）`;
    els.list.appendChild(more);
  }

  for (const e of results) {
    els.list.appendChild(renderLibraryRow(e));
  }
}

function renderLibraryRow(e) {
  const li = document.createElement('li');
  li.className = 'lib-row';
  const head = document.createElement('div');
  head.className = 'a-head';
  const dot = document.createElement('span');
  dot.className = 'read-dot' + (e.read ? ' read' : '');
  dot.title = e.read ? '已读' : '未读';
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
    [e.favorite ? '★ 取消收藏' : '☆ 收藏', () => setState(e.document_id, { favorite: !e.favorite })],
    [e.read ? '标为未读' : '标为已读', () => setState(e.document_id, { read: !e.read })],
    [e.inbox ? '移出 Inbox' : '加入 Inbox', () => setState(e.document_id, { inbox: !e.inbox })],
    ['删除', () => removeArticle(e.document_id, e.title)],
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
  tagInput.placeholder = '添加标签，回车确认';
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
    x.title = `移除标签 ${tag}`;
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
    alert('无法保存此更改，请重试。'); // friendly error, M3 §75
    console.error('state persist failed:', err.message);
  }
  showLibrary();
}

async function removeArticle(documentId, title) {
  if (!confirm(`删除「${title}」？\n将同时删除：正文、标注、标签与状态、本地资源。`)) return;
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

const MATCH_LABEL = { title: '标题', author: '作者', tag: '标签', highlight: '高亮', note: '笔记', body: '正文', url: '链接' };

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
    p.textContent = `搜索语法有误：${res.error}`;
    searchResults.appendChild(p);
    return;
  }
  if (res.total === 0) {
    const p = document.createElement('p');
    p.className = 'search-error';
    p.textContent = '没有找到匹配的结果。换个关键词试试。';
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
      badge.textContent = MATCH_LABEL[m.type] ?? m.type;
      if (m.annotation_status === 'orphaned') badge.textContent += '（无法定位）';
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
      alert('该标注已无法在当前正文中定位（内容可能已变化）。引文与笔记仍保留在标注面板中。');
      document.getElementById('annotation-panel').hidden = false;
      return;
    }
    navigateTo(annotation);
  } else if (match.type === 'body' && match.term) {
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
  btnRepair.hidden = repairTarget === null;
  btnHighlight.hidden = repairTarget !== null;
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
    quote.textContent = a.quoted_text ?? '(无锚点笔记)';
    li.appendChild(quote);
    if (a.status === 'orphaned') {
      const warn = document.createElement('p');
      warn.className = 'ann-warn';
      warn.textContent = '⚠ 无法在当前文档中定位';
      li.appendChild(warn);
    }
    const noteEl = document.createElement('textarea');
    noteEl.className = 'ann-note';
    noteEl.placeholder = '添加笔记…';
    noteEl.value = a.note ?? '';
    noteEl.rows = a.note ? 2 : 1;
    noteEl.addEventListener('change', async () => {
      await reverie.annotationUpdateNote(currentDoc.documentId, a.annotation_id, noteEl.value);
      await refreshAnnotations();
    });
    li.appendChild(noteEl);
    const actions = document.createElement('div');
    actions.className = 'ann-actions';
    for (const [label, fn] of a.status === 'orphaned'
      ? [['修复', () => { repairTarget = a.annotation_id; hidePanel(); alert('请在正文中选中该标注的新位置文本，然后在弹出菜单中选择“修复此标注”。'); }, ['删除', () => removeAnnotation(a.annotation_id)]]]
      : [['跳转原文', () => navigateTo(a)], ['删除', () => removeAnnotation(a.annotation_id)]]) {
      void label; void fn;
    }
    // (build actions explicitly — the array-of-arrays above is unreadable)
    actions.textContent = '';
    const buttons = a.status === 'orphaned'
      ? [
          ['修复', () => { repairTarget = a.annotation_id; hidePanel(); alert('请在正文中选中该标注的新位置文本，然后在弹出菜单中选择“修复此标注”。'); }],
          ['删除', () => removeAnnotation(a.annotation_id)],
        ]
      : [
          ['跳转原文', () => navigateTo(a)],
          ['删除', () => removeAnnotation(a.annotation_id)],
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
  if (!confirm('删除这条标注？')) return;
  await reverie.annotationDelete(currentDoc.documentId, annotationId);
  await refreshAnnotations();
}

function navigateTo(a) {
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
  els.title.textContent = loaded.meta.title ?? '(untitled)';
  els.meta.textContent = [
    loaded.meta.author,
    loaded.meta.source?.canonical_url ? hostOf(loaded.meta.source.canonical_url) : hostOf(loaded.meta.source?.original_url ?? ''),
    `保存于 ${fmtDate(loaded.meta.captured_at)}`,
  ].filter(Boolean).join(' · ');

  const ctx = {
    resolveImage: async (rel) => await reverie.articleResolvePath(documentId, rel),
  };
  els.content.textContent = '';
  els.content.appendChild(renderBlocks(loaded.blocks, ctx));
  renderPanel(loaded.annotations);
  requestAnimationFrame(() => applyHighlights(loaded.annotations));

  const entry = (await reverie.libraryList()).entries.find((e) => e.document_id === documentId);
  if (entry?.read_state !== 'read') await reverie.articleReadState(documentId, 'read');
  window.scrollTo(0, 0);
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
    currentView = b.dataset.view;
    document.querySelectorAll('[data-view]').forEach((x) => x.classList.toggle('active', x === b));
    showLibrary();
  });
}
document.getElementById('btn-back').addEventListener('click', showLibrary);
document.getElementById('btn-reindex').addEventListener('click', async () => {
  const { count } = await reverie.libraryReindex();
  const { total } = await reverie.searchRefresh();
  els.queueHint.textContent = `索引已重建（文章 ${count} 篇，搜索 ${total} 条）`;
  setTimeout(() => { els.queueHint.textContent = ''; }, 2500);
});
document.getElementById('btn-annotations').addEventListener('click', () => { panel.hidden = !panel.hidden; });

reverie.onLibraryChanged(() => { if (!els.library.hidden) showLibrary(); });
reverie.onQueueChanged(() => { if (!els.library.hidden) showLibrary(); });

showLibrary();
