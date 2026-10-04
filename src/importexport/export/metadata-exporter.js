/**
 * Metadata + Highlight exports (M5 §32/§33): structured migration data.
 * Metadata: JSON (full fidelity) + CSV (spreadsheet). No body/html in CSV.
 * Highlights: JSON (full fidelity incl. locator) + Markdown (human archive).
 */
import path from 'node:path';

function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const METADATA_COLUMNS = [
  'document_id', 'document_type', 'title', 'author', 'source_url',
  'created_at', 'captured_at', 'published_at', 'tags', 'favorite',
  'read', 'inbox', 'annotation_count', 'source_type', 'feed_title',
];

/** One row per document from an index entry + user state. */
function metadataRow(entry, userStateOf) {
  const st = userStateOf(entry.document_id);
  return {
    document_id: entry.document_id,
    document_type: entry.type,
    title: entry.title,
    author: entry.author ?? '',
    source_url: entry.canonical_url ?? entry.original_url ?? '',
    created_at: entry.created_at ?? '',
    captured_at: entry.captured_at ?? '',
    published_at: entry.published_at ?? '',
    tags: (st.tags ?? []).join(';'),
    favorite: st.favorite ? 'true' : 'false',
    read: st.read ? 'true' : 'false',
    inbox: st.inbox ? 'true' : 'false',
    annotation_count: String(entry.annotation_count ?? 0),
    source_type: entry.source_type ?? '',
    feed_title: entry.feed_title ?? '',
  };
}

export function exportMetadataCsv(entries, userStateOf) {
  const rows = entries.map((e) => metadataRow(e, userStateOf));
  const lines = [METADATA_COLUMNS.join(',')];
  for (const r of rows) {
    lines.push(METADATA_COLUMNS.map((c) => csvEscape(r[c])).join(','));
  }
  return lines.join('\n') + '\n';
}

export function exportMetadataJson(entries, userStateOf) {
  return JSON.stringify({
    export_format_version: 1,
    exported_at: new Date().toISOString(),
    documents: entries.map((e) => metadataRow(e, userStateOf)),
  }, null, 2) + '\n';
}

/** Highlight export record (M5 §33): everything a user needs outside Reverie. */
export function exportHighlightsJson(annotationsWithDocs) {
  return JSON.stringify({
    export_format_version: 1,
    exported_at: new Date().toISOString(),
    highlights: annotationsWithDocs.map(({ annotation, document }) => ({
      annotation_id: annotation.annotation_id,
      document_id: annotation.document_id,
      document_title: document?.title ?? null,
      source_url: document?.url ?? null,
      quoted_text: annotation.quoted_text ?? null,
      note: annotation.note ?? '',
      tags: annotation.tags ?? [],
      status: annotation.status,
      created_at: annotation.created_at,
      locator: annotation.locator ?? null,
    })),
  }, null, 2) + '\n';
}

export function exportHighlightsMarkdown(annotationsWithDocs) {
  const lines = ['# Highlights', ''];
  const byDoc = new Map();
  for (const { annotation, document } of annotationsWithDocs) {
    const key = document?.document_id ?? 'unknown';
    if (!byDoc.has(key)) byDoc.set(key, { document, items: [] });
    byDoc.get(key).items.push(annotation);
  }
  for (const { document, items } of byDoc.values()) {
    lines.push(`## ${document?.title ?? '(untitled)'}`);
    lines.push('');
    const url = document?.url;
    if (url) { lines.push(`Source: ${url}`); lines.push(''); }
    for (const a of items) {
      if (a.quoted_text) { lines.push(`> ${a.quoted_text.replace(/\n/g, '\n> ')}`); lines.push(''); }
      if (a.note) { lines.push(`**Note:** ${a.note}`); lines.push(''); }
      lines.push(`*${a.status} — ${a.created_at?.slice(0, 10) ?? ''}*`);
      lines.push('');
    }
  }
  return lines.join('\n');
}
