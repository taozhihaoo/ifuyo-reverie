/**
 * Reverie renderer (M1 §18 + M2 §25-32) — Library, Reader, Annotations.
 * Markdown arrives as parsed BLOCKS from the main process (single canonical
 * text source: src/reader/markdown-reader.js). The DOM built here therefore
 * matches canonicalText, which is what anchors resolve against.
 *
 * Highlight rendering is a pure overlay: CSS Custom Highlights — no DOM
 * mutation of article content, nothing written back into article.md.
 */
/* global reverie, ReaderAnchor */

// ---------- blocks -> DOM (segments keep links/bold/code/images) ----------
function renderSegments(parent, segments, ctx) {
  for (const s of segments) {
    switch (s.t) {
      case 'text': parent.appendChild(document.createTextNode(s.v)); break;
      case 'code': {
        const c = document.createElement('code'); c.textContent = s.v; parent.appendChild(c); break;
      }
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
        if (s.src.startsWith('assets/')) {
          ctx.resolveImage(s.src).then((url) => { img.src = url; }).catch(() => {});
        } else if (/^https?:/i.test(s.src) || s.src.startsWith('data:')) {
          img.src = s.src;
        }
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
        frag.appendChild(h);
        break;
      }
      case 'paragraph': {
        const p = document.createElement('p');
        renderSegments(p, b.segments, ctx);
        frag.appendChild(p);
        break;
      }
      case 'code': {
        const pre = document.createElement('pre');
        if (b.lang) pre.dataset.lang = b.lang;
        const code = document.createElement('code');
        code.textContent = b.text;
        pre.appendChild(code);
        frag.appendChild(pre);
        break;
      }
      case 'quote': {
        const q = document.createElement('blockquote');
        const p = document.createElement('p');
        renderSegments(p, b.segments, ctx);
        q.appendChild(p);
        frag.appendChild(q);
        break;
      }
      case 'list': {
        const list = document.createElement(b.ordered ? 'ol' : 'ul');
        for (const item of b.items) {
          const li = document.createElement('li');
          li.style.marginLeft = `${Math.min(item.indent, 8)}px`;
          renderSegments(li, item.segments, ctx);
          list.appendChild(li);
        }
        frag.appendChild(list);
        break;
      }
      case 'table': {
        const table = document.createElement('table');
        const tr = document.createElement('tr');
        for (const c of b.header) {
          const th = document.createElement('th');
          th.textContent = c;
          tr.appendChild(th);
        }
        table.appendChild(tr);
        for (const row of b.rows) {
          const rowTr = document.createElement('tr');
          for (const c of row) {
            const td = document.createElement('td');
            td.textContent = c;
            rowTr.appendChild(td);
          }
          table.appendChild(rowTr);
        }
        frag.appendChild(table);
        break;
      }
      case 'hr': frag.appendChild(document.createElement('hr')); break;
    }
  }
  return frag;
}

// ---------- highlights (CSS Custom Highlight overlay, M2 §34/35) ----------
function applyHighlights(annotations) {
  if (!('highlights' in CSS)) return; // graceful degradation, statuses still visible in the panel
  CSS.highlights.delete('reverie-hl');
  const ranges = [];
  for (const a of annotations) {
    if (a.status !== 'resolved' || !a.locator?.position) continue;
    const range = ReaderAnchor.rangeForOffsets(
      document.getElementById('reader-content'),
      a.locator.position.start,
      a.locator.position.end,
    );
    if (range) ranges.push(range);
  }
  if (ranges.length > 0) CSS.highlights.set('reverie-hl', new Highlight(...ranges));
}

function flashRange(range) {
  if (!('highlights' in CSS) || !range) return;
  const hl = new Highlight(range);
  CSS.highlights.set('reverie-flash', hl);
  setTimeout(() => CSS.highlights.delete('reverie-flash'), 1400);
  const el = range.startContainer.parentElement;
  el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ---------- selection popup (M2 §26/§32) ----------
const popup = document.getElementById('selection-popup');
let currentDoc = null;
let repairTarget = null; // annotation_id being manually repaired

function hidePopup() {
  popup.hidden = true;
}

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
    try {
      await reverie.annotationCreate(currentDoc.documentId, parts, '');
    } catch (err) {
      console.error('create failed:', err.message);
    }
    sel.removeAllRanges();
    hidePopup();
    await refreshAnnotations();
  };
  btnRepair.onclick = async () => {
    try {
      await reverie.annotationRepair(currentDoc.documentId, repairTarget, parts);
    } catch (err) {
      console.error('repair failed:', err.message);
    }
    repairTarget = null;
    sel.removeAllRanges();
    hidePopup();
    await refreshAnnotations();
  };
});

// ---------- annotations panel (M2 §29-32) ----------
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
      ? [
          ['定位原文并修复', () => { repairTarget = a.annotation_id; hidePanel(); alert('请在正文中选中该标注的新位置文本，然后在弹出菜单中选择“修复此标注”。'); }],
          ['删除', () => removeAnnotation(a.annotation_id)],
        ]
      : [
          ['跳转原文', () => navigateTo(a)],
          ['删除', () => removeAnnotation(a.annotation_id)],
        ]) {
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
  const range = ReaderAnchor.rangeForOffsets(
    document.getElementById('reader-content'),
    a.locator.position.start,
    a.locator.position.end,
  );
  flashRange(range);
}

async function refreshAnnotations() {
  const { annotations } = await reverie.articleLoad(currentDoc.documentId);
  currentDoc.annotations = annotations;
  renderPanel(annotations);
  applyHighlights(annotations);
}

function hidePanel() {
  panel.hidden = true;
}

// ---------- views ----------
const els = {
  library: document.getElementById('library-view'),
  list: document.getElementById('article-list'),
  empty: document.getElementById('library-empty'),
  reader: document.getElementById('reader-view'),
  title: document.getElementById('reader-title'),
  meta: document.getElementById('reader-meta'),
  content: document.getElementById('reader-content'),
  queueHint: document.getElementById('queue-hint'),
};

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '');
const hostOf = (url) => {
  try { return new URL(url).host; } catch { return ''; }
};

async function showLibrary() {
  const { entries, pending_captures } = await reverie.libraryList();
  els.reader.hidden = true;
  els.library.hidden = false;
  panel.hidden = true;
  els.list.textContent = '';
  els.empty.hidden = entries.length > 0;
  els.queueHint.textContent = pending_captures > 0 ? `⏳ ${pending_captures} 个保存任务处理中…` : '';

  for (const e of entries.sort((a, b) => (b.captured_at ?? '').localeCompare(a.captured_at ?? ''))) {
    const li = document.createElement('li');
    const title = document.createElement('p');
    title.className = 'a-title';
    title.textContent = e.title;
    const meta = document.createElement('div');
    meta.className = 'a-meta';
    const dot = document.createElement('span');
    dot.className = 'read-dot' + (e.read_state === 'read' ? ' read' : '');
    dot.title = e.read_state;
    const source = e.original_url ?? e.canonical_url;
    meta.append(
      dot,
      Object.assign(document.createElement('span'), { textContent: hostOf(source) }),
      Object.assign(document.createElement('span'), { textContent: e.author ?? '' }),
      Object.assign(document.createElement('span'), { textContent: fmtDate(e.captured_at) }),
    );
    const actions = document.createElement('span');
    actions.className = 'a-actions';
    for (const [label, fn] of [
      ['删除', () => removeArticle(e.document_id, e.title)],
      ['文件夹', () => reverie.articleReveal(e.document_id)],
      [e.read_state === 'read' ? '标为未读' : '标为已读', () => toggleRead(e)],
    ]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.addEventListener('click', (ev) => { ev.stopPropagation(); fn(); });
      actions.appendChild(b);
    }
    meta.appendChild(actions);
    li.append(title, meta);
    li.addEventListener('click', () => openArticle(e.document_id));
    els.list.appendChild(li);
  }
}

async function toggleRead(e) {
  await reverie.articleReadState(e.document_id, e.read_state === 'read' ? 'unread' : 'read');
}

async function removeArticle(documentId, title) {
  // explicit user action only
  if (!confirm(`删除「${title}」？此操作会把文章目录从 Library 中移除。`)) return;
  await reverie.articleDelete(documentId);
}

async function openArticle(documentId) {
  const loaded = await reverie.articleLoad(documentId);
  currentDoc = { documentId, ...loaded };
  els.library.hidden = true;
  els.reader.hidden = false;
  panel.hidden = true;
  els.title.textContent = loaded.meta.title ?? '(untitled)';
  els.meta.textContent = [
    loaded.meta.author,
    loaded.meta.source?.canonical_url ? hostOf(loaded.meta.source.canonical_url) : hostOf(loaded.meta.source?.original_url ?? ''),
    `保存于 ${fmtDate(loaded.meta.captured_at)}`,
    loaded.meta.published_at ? `发布于 ${fmtDate(loaded.meta.published_at)}` : '',
  ].filter(Boolean).join(' · ');

  const ctx = {
    resolveImage: async (rel) => {
      const abs = await reverie.articleResolvePath(documentId, rel);
      return abs; // file: scheme allowed by CSP img-src
    },
  };
  els.content.textContent = '';
  els.content.appendChild(renderBlocks(loaded.blocks, ctx));
  renderPanel(loaded.annotations);
  // highlights need the DOM in place first
  requestAnimationFrame(() => applyHighlights(loaded.annotations));

  // mark read on open (minimal read state, M1 §19)
  const entry = (await reverie.libraryList()).entries.find((e) => e.document_id === documentId);
  if (entry?.read_state !== 'read') {
    await reverie.articleReadState(documentId, 'read');
  }
  window.scrollTo(0, 0);
}

document.getElementById('btn-back').addEventListener('click', showLibrary);
document.getElementById('btn-reindex').addEventListener('click', async () => {
  const { count } = await reverie.libraryReindex();
  els.queueHint.textContent = `索引已重建（${count} 篇）`;
  setTimeout(() => { els.queueHint.textContent = ''; }, 2500);
});
document.getElementById('btn-annotations').addEventListener('click', () => {
  panel.hidden = !panel.hidden;
});

reverie.onLibraryChanged(() => { if (!els.library.hidden) showLibrary(); });
reverie.onQueueChanged(() => { if (!els.library.hidden) showLibrary(); });

showLibrary();
