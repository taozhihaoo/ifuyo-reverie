/**
 * Markdown Export (M5 §29-31): article.md + metadata front matter +
 * annotations section. Plain markdown readable by VS Code/Obsidian/any editor.
 * Read-only over library files — export never modifies the original.
 */

const yamlEscape = (s) => (typeof s === 'string' ? s.replace(/"/g, '\\"') : s);

/**
 * Export one document to a Markdown string with YAML front matter.
 * annotations: parsed annotations from annotations.jsonl (optional).
 */
export function exportDocumentToMarkdown(meta, articleMarkdown, annotations = []) {
  const lines = [];
  lines.push('---');
  lines.push(`title: "${yamlEscape(meta.title ?? '')}"`);
  if (meta.author) lines.push(`author: "${yamlEscape(meta.author)}"`);
  const url = meta.source?.canonical_url ?? meta.source?.original_url;
  if (url) lines.push(`source_url: "${yamlEscape(url)}"`);
  lines.push(`document_id: "${meta.document_id}"`);
  if (meta.published_at) lines.push(`published_at: "${meta.published_at}"`);
  if (meta.captured_at) lines.push(`captured_at: "${meta.captured_at}"`);
  if (meta.feed_title) lines.push(`feed_title: "${yamlEscape(meta.feed_title)}"`);
  if (meta.source_type) lines.push(`source_type: ${meta.source_type}`);
  lines.push('---');
  lines.push('');
  lines.push(`# ${meta.title ?? '(untitled)'}`);
  lines.push('');
  const body = articleMarkdown.replace(/^---\s*$/m, '\\---'); // never emit a stray front-matter fence
  lines.push(body);
  lines.push('');

  if (annotations.length > 0) {
    lines.push('---');
    lines.push('');
    lines.push('## Annotations');
    lines.push('');
    for (const a of annotations) {
      if (a.quoted_text) {
        lines.push(`> ${a.quoted_text.replace(/\n/g, '\n> ')}`);
        lines.push('');
      }
      if (a.note) {
        lines.push(`**Note:** ${a.note}`);
        lines.push('');
      }
      const when = a.created_at ? ` — ${a.created_at.slice(0, 10)}` : '';
      lines.push(`*Highlight${when}*`);
      lines.push('');
    }
  }
  return lines.join('\n');
}

/** Validate exported markdown (M5 §40): encoding readable, body present, front matter present. */
export function validateMarkdownExport(md) {
  const errors = [];
  if (!md || md.trim().length === 0) errors.push('导出内容为空');
  if (!md.startsWith('---')) errors.push('缺少 front matter');
  if (!/^# /m.test(md)) errors.push('缺少标题');
  return { ok: errors.length === 0, errors };
}
