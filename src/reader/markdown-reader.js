/**
 * Markdown Reader blocks (M2 §12/§36/§37) — the SINGLE source of the
 * canonical reader text.
 *
 * Contract:
 *   parseMarkdownBlocks(md) -> { blocks, canonicalText }
 *   canonicalText === blocks.map(b => b.text).join('')
 *   and the renderer's DOM textContent (built from these blocks) equals
 *   canonicalText — enforced by tests and by create-time anchor validation.
 *
 * Stability (M2 §37): for an unchanged article, repeated parsing yields
 * identical block ids/text/canonical text — ids are order-based (b0..bN),
 * which is exactly the stability we need; content changes shift ids, which
 * is why anchors carry quote + prefix/suffix for re-resolution.
 *
 * Inline content is preserved as segments so the reader keeps links/bold/
 * code/images while block.text stays the plain-text canonical form.
 */

const INLINE_RE = /(!\[[^\]]*\]\([^)]+\))|(\[[^\]]+\]\([^)]+\))|(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\n]+\*)/g;

/** Parse one inline string into segments; `text` is the canonical plain form. */
export function parseInlineSegments(s) {
  const segments = [];
  let last = 0;
  for (const m of s.matchAll(INLINE_RE)) {
    if (m.index > last) segments.push({ t: 'text', v: s.slice(last, m.index) });
    last = m.index + m[0].length;
    const token = m[0];
    if (token.startsWith('![')) {
      segments.push({ t: 'image', alt: /\[([^\]]*)\]/.exec(token)[1], src: /\(([^)]+)\)/.exec(token)[1] });
    } else if (token.startsWith('[')) {
      const href = /\(([^)]+)\)/.exec(token)[1];
      const label = /\[([^\]]+)\]/.exec(token)[1];
      segments.push(/^(https?:|mailto:)/i.test(href) ? { t: 'link', v: label, href } : { t: 'text', v: label });
    } else if (token.startsWith('`')) {
      segments.push({ t: 'code', v: token.slice(1, -1) });
    } else if (token.startsWith('**')) {
      segments.push({ t: 'bold', v: token.slice(2, -2) });
    } else {
      segments.push({ t: 'em', v: token.slice(1, -1) });
    }
  }
  if (last < s.length) segments.push({ t: 'text', v: s.slice(last) });
  return segments;
}

export const segmentText = (segments) => segments.map((s) => (s.t === 'image' ? '' : s.v ?? '')).join('');

/** Parse inline content into segments, collapsing whitespace like the DOM would. */
function inlineOf(s) {
  return parseInlineSegments(s.replace(/\s+/g, ' ').trim());
}

/** Parse article Markdown into stable blocks + canonical text. */
export function parseMarkdownBlocks(md) {
  const lines = md.split('\n');
  const blocks = [];
  let i = 0;
  let para = [];

  const pushBlock = (b) => {
    b.id = `b${blocks.length}`;
    blocks.push(b);
  };
  const flushPara = () => {
    if (para.length === 0) return;
    const segments = inlineOf(para.join(' '));
    pushBlock({ type: 'paragraph', segments, text: segmentText(segments) });
    para = [];
  };

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('```')) {
      flushPara();
      const lang = line.slice(3).trim();
      const body = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) body.push(lines[i++]);
      i++; // closing fence
      const text = body.join('\n');
      pushBlock({ type: 'code', lang: lang || null, text });
      continue;
    }

    const heading = /^(#{1,6}) (.+)$/.exec(line);
    if (heading) {
      flushPara();
      const segments = inlineOf(heading[2]);
      pushBlock({ type: 'heading', level: heading[1].length, segments, text: segmentText(segments) });
      i++;
      continue;
    }

    if (/^---+\s*$/.test(line)) {
      flushPara();
      pushBlock({ type: 'hr', text: '' });
      i++;
      continue;
    }

    if (line.startsWith('> ')) {
      flushPara();
      const paragraphs = [];
      while (i < lines.length && lines[i].startsWith('> ')) {
        paragraphs.push(lines[i].slice(2).trim());
        i++;
      }
      const segments = inlineOf(paragraphs.join(' '));
      pushBlock({ type: 'quote', segments, text: segmentText(segments) });
      continue;
    }

    const tableMatch = /^\| .+\|$/.test(line.trim()) && /^\| [\s|-]+\|$/.test((lines[i + 1] ?? '').trim());
    if (tableMatch) {
      flushPara();
      const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.replace(/\\\|/g, '|').trim());
      const header = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && /^\| .+\|$/.test(lines[i].trim())) {
        rows.push(cells(lines[i]));
        i++;
      }
      const flat = [...header, ...rows.flat()];
      pushBlock({ type: 'table', header, rows, text: flat.join('') });
      continue;
    }

    const listItem = /^(\s*)([-]|\d+\.) (.*)$/.exec(line);
    if (listItem) {
      flushPara();
      const items = [];
      while (i < lines.length) {
        const m = /^(\s*)([-]|\d+\.) (.*)$/.exec(lines[i]);
        if (!m) break;
        const segments = inlineOf(m[3]);
        items.push({ ordered: m[2] !== '-', indent: m[1].length, segments, text: segmentText(segments) });
        i++;
      }
      pushBlock({ type: 'list', ordered: items[0].ordered, items, text: items.map((it) => it.text).join('') });
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

  const canonicalText = blocks.map((b) => b.text).join('');
  return { blocks, canonicalText };
}
