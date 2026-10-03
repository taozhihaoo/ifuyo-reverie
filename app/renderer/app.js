/**
 * Reverie renderer (M1 §18) — Library + Reader.
 * The markdown renderer builds DOM via createElement/textContent only:
 * article content can never inject HTML or script (defense in depth on top
 * of the capture-side sanitizer).
 */
/* global reverie */

// ---------- safe markdown -> DOM ----------
const INLINE_RE = /(!\[[^\]]*\]\([^)]+\))|(\[[^\]]+\]\([^)]+\))|(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\n]+\*)/g;

function renderInline(parent, text, ctx) {
  let last = 0;
  for (const m of text.matchAll(INLINE_RE)) {
    if (m.index > last) parent.appendChild(document.createTextNode(text.slice(last, m.index)));
    last = m.index + m[0].length;
    const token = m[0];
    if (token.startsWith('![')) {
      const alt = /\[([^\]]*)\]/.exec(token)[1];
      const src = /\(([^)]+)\)/.exec(token)[1];
      const img = document.createElement('img');
      img.alt = alt;
      if (/^https?:/i.test(src) || src.startsWith('assets/')) {
        ctx.resolveImage(src).then((url) => { if (url) img.src = url; }).catch(() => {});
      }
      parent.appendChild(img);
    } else if (token.startsWith('[')) {
      const label = /\[([^\]]+)\]/.exec(token)[1];
      const href = /\(([^)]+)\)/.exec(token)[1];
      if (/^(https?:|mailto:)/i.test(href)) {
        const a = document.createElement('a');
        a.textContent = label;
        a.href = '#';
        a.addEventListener('click', (e) => { e.preventDefault(); reverie.openExternal(href); });
        parent.appendChild(a);
      } else {
        parent.appendChild(document.createTextNode(label));
      }
    } else if (token.startsWith('`')) {
      const code = document.createElement('code');
      code.textContent = token.slice(1, -1);
      parent.appendChild(code);
    } else if (token.startsWith('**')) {
      const b = document.createElement('strong');
      b.textContent = token.slice(2, -2);
      parent.appendChild(b);
    } else {
      const em = document.createElement('em');
      em.textContent = token.slice(1, -1);
      parent.appendChild(em);
    }
  }
  if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)));
}

function renderMarkdown(md, ctx) {
  const frag = document.createDocumentFragment();
  const lines = md.split('\n');
  let i = 0;
  let para = [];

  const flushPara = () => {
    if (para.length === 0) return;
    const p = document.createElement('p');
    renderInline(p, para.join(' '), ctx);
    frag.appendChild(p);
    para = [];
  };

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('```')) {
      flushPara();
      const lang = line.slice(3).trim();
      const pre = document.createElement('pre');
      if (lang) pre.dataset.lang = lang;
      const code = document.createElement('code');
      const body = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) body.push(lines[i++]);
      i++; // closing fence
      code.textContent = body.join('\n');
      pre.appendChild(code);
      frag.appendChild(pre);
      continue;
    }

    const heading = /^#{1,6} /.exec(line);
    if (heading) {
      flushPara();
      const h = document.createElement(`h${heading[0].length - 1}`);
      h.textContent = line.slice(heading[0].length);
      frag.appendChild(h);
      i++;
      continue;
    }

    if (/^---+$/.test(line.trim())) {
      flushPara();
      frag.appendChild(document.createElement('hr'));
      i++;
      continue;
    }

    if (line.startsWith('> ')) {
      flushPara();
      const q = document.createElement('blockquote');
      const inner = [];
      while (i < lines.length && lines[i].startsWith('> ')) inner.push(lines[i++].slice(2));
      const p = document.createElement('p');
      renderInline(p, inner.join(' '), ctx);
      q.appendChild(p);
      frag.appendChild(q);
      continue;
    }

    if (/^\| .+\|$/.test(line.trim()) && /^\| [\s|-]+\|$/.test((lines[i + 1] ?? '').trim())) {
      flushPara();
      const table = document.createElement('table');
      const parseRow = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = parseRow(lines[i]);
      i += 2; // header + separator
      const thead = document.createElement('tr');
      for (const c of head) {
        const th = document.createElement('th');
        renderInline(th, c.replace(/\\\|/g, '|'), ctx);
        thead.appendChild(th);
      }
      table.appendChild(thead);
      while (i < lines.length && /^\| .+\|$/.test(lines[i].trim())) {
        const tr = document.createElement('tr');
        for (const c of parseRow(lines[i])) {
          const td = document.createElement('td');
          renderInline(td, c.replace(/\\\|/g, '|'), ctx);
          tr.appendChild(td);
        }
        table.appendChild(tr);
        i++;
      }
      frag.appendChild(table);
      continue;
    }

    const listItem = /^(\s*)([-]|\d+\.) (.*)$/.exec(line);
    if (listItem) {
      flushPara();
      // gather the whole list block
      const list = document.createElement(listItem[2] === '-' ? 'ul' : 'ol');
      while (i < lines.length) {
        const m = /^(\s*)([-]|\d+\.) (.*)$/.exec(lines[i]);
        if (!m) break;
        const li = document.createElement('li');
        const indent = m[1].length;
        li.style.marginLeft = `${Math.min(indent, 8)}px`;
        renderInline(li, m[3], ctx);
        list.appendChild(li);
        i++;
      }
      frag.appendChild(list);
      continue;
    }

    if (line.trim() === '') {
      flushPara();
      i++;
      continue;
    }

    para.push(line.trim());
    i++;
  }
  flushPara();
  return frag;
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
  const { meta, markdown, dir } = await reverie.articleLoad(documentId);
  els.library.hidden = true;
  els.reader.hidden = false;
  els.title.textContent = meta.title ?? '(untitled)';
  els.meta.textContent = [
    meta.author,
    meta.source?.canonical_url ? hostOf(meta.source.canonical_url) : hostOf(meta.source?.original_url ?? ''),
    `保存于 ${fmtDate(meta.captured_at)}`,
    meta.published_at ? `发布于 ${fmtDate(meta.published_at)}` : '',
  ].filter(Boolean).join(' · ');

  const ctx = {
    resolveImage: async (src) => {
      const rel = src.startsWith('assets/') ? src : null;
      if (!rel) return src; // remote URL (recorded failed download) — try as-is
      const abs = await reverie.articleResolvePath(documentId, rel);
      return abs; // file: scheme allowed by CSP img-src
    },
  };
  els.content.textContent = '';
  els.content.appendChild(renderMarkdown(markdown, ctx));

  // mark read on open (minimal read state, M1 §19)
  if ((await reverie.libraryList()).entries.find((e) => e.document_id === documentId)?.read_state !== 'read') {
    await reverie.articleReadState(documentId, 'read');
  }
  void dir;
  window.scrollTo(0, 0);
}

document.getElementById('btn-back').addEventListener('click', showLibrary);
document.getElementById('btn-reindex').addEventListener('click', async () => {
  const { count } = await reverie.libraryReindex();
  els.queueHint.textContent = `索引已重建（${count} 篇）`;
  setTimeout(() => { els.queueHint.textContent = ''; }, 2500);
});

reverie.onLibraryChanged(() => { if (!els.library.hidden) showLibrary(); });
reverie.onQueueChanged(() => { if (!els.library.hidden) showLibrary(); });

showLibrary();
