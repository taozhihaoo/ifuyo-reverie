/**
 * Reverie App — Electron main process (M1 §18 + M2 annotation integration).
 * Thin shell: window + IPC. All real logic lives in src/ (Library, Queue,
 * Pipeline, Annotation Core) so the architecture boundary App -> Core stays
 * honest and testable without Electron.
 */
import { app, BrowserWindow, ipcMain, shell, Menu, dialog } from 'electron';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { promises as fsp } from 'node:fs';
import { getLibraryRoot, getQueueDir } from '../src/core/paths.js';
import { loadIndex, rebuildIndex, loadReadState, setReadState, deleteArticle } from '../src/library/index.js';
import { listJobs, recoverOnStartup, JOB_STATUSES } from '../src/capture/queue.js';
import { processQueue } from '../src/capture/worker.js';
import { verifyArticleDir } from '../src/library/persist.js';
import { createAnnotationService } from '../src/annotation/service.js';
import { parseMarkdownBlocks } from '../src/reader/markdown-reader.js';
import { loadUserState, updateUserState, forgetDocument, userStatePath } from '../src/library/user-state.js';
import { loadSearchIndex, refreshSearchIndex, invalidateSearchIndex, search, queryLibrary, tagFacets, viewCounts } from '../src/search/search-service.js';
import { runDoctor } from '../src/library/doctor.js';
import { addFeedUrl, refreshFeed, refreshAllFeeds, deleteFeedOnly, listFeedsWithCounts, updateFeedMeta } from '../src/feed/feed-service.js';
import { previewImport, commitImport } from '../src/importexport/import-service.js';
import { exportDocumentToMarkdown, validateMarkdownExport } from '../src/importexport/export/markdown-exporter.js';
import { exportMetadataCsv, exportMetadataJson, exportHighlightsJson, exportHighlightsMarkdown } from '../src/importexport/export/metadata-exporter.js';
import { exportArticleToEpub } from '../src/importexport/export/epub-exporter.js';
import { buildReviewQueue, markReviewed } from '../src/review/daily-review.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const libraryRoot = getLibraryRoot();
const queueDir = getQueueDir();

let processing = false;
async function runQueueIfIdle() {
  if (processing) return;
  processing = true;
  try {
    await recoverOnStartup(queueDir);
    await processQueue({ queueDir, libraryRoot, onJobUpdate: () => broadcast('queue:changed') });
    broadcast('queue:changed');
  } catch (err) {
    console.error('[reverie] queue processing failed:', err.message);
  } finally {
    processing = false;
  }
}

function broadcast(channel) {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel);
  }
}

/** Load an article directory + its annotation service (single lookup). */
async function loadArticle(documentId) {
  const index = await loadIndex(libraryRoot);
  const entry = index.entries.find((e) => e.document_id === documentId);
  if (!entry) throw new Error(`unknown document: ${documentId}`);
  const dir = path.join(libraryRoot, entry.path);
  const meta = await verifyArticleDir(dir); // integrity check on every open
  const markdown = await fsp.readFile(path.join(dir, 'article.md'), 'utf8');
  const { blocks, canonicalText } = parseMarkdownBlocks(markdown);
  const service = createAnnotationService({
    articleDir: dir,
    documentId,
    getReaderContext: async () => ({ canonicalText }),
  });
  return { entry, dir, meta, markdown, blocks, canonicalText, service };
}

function registerIpc() {
  ipcMain.handle('library:list', async () => {
    const index = await loadIndex(libraryRoot);
    const readState = await loadReadState();
    const jobs = await listJobs(queueDir);
    const pending = jobs.filter((j) => j.status === JOB_STATUSES.QUEUED || j.status === JOB_STATUSES.RUNNING).length;
    const entries = index.entries.map((e) => ({
      ...e,
      read_state: readState.states[e.document_id]?.state ?? 'unread',
    }));
    return { entries, pending_captures: pending, built_at: index.built_at };
  });

  ipcMain.handle('article:load', async (_e, documentId) => {
    const { entry, dir, meta, markdown, blocks, canonicalText, service } = await loadArticle(documentId);
    const readState = await loadReadState();
    const { annotations, invalid, duplicates } = await service.listResolved();
    // Recent view source of truth (M3 §131): persist on open, then refresh the derived index
    await updateUserState(documentId, { last_opened_at: new Date().toISOString() });
    await refreshSearchIndex(libraryRoot).catch(() => {});
    if (invalid.length > 0 || duplicates.length > 0) {
      console.error(`[reverie] annotation diagnostics for ${documentId}:`, JSON.stringify({ invalid, duplicates }));
    }
    return {
      meta,
      markdown,
      blocks,
      canonicalText,
      dir,
      annotations,
      diagnostics: { invalid, duplicates },
      read_state: readState.states[documentId]?.state ?? 'unread',
      path: entry.path,
    };
  });

  ipcMain.handle('annotation:create', async (_e, { documentId, anchor, note }) => {
    const { service } = await loadArticle(documentId);
    const { annotation } = await service.createHighlight({ anchor, note });
    const { annotations } = await service.listResolved();
    return { annotation, annotations };
  });

  ipcMain.handle('annotation:update-note', async (_e, { documentId, annotationId, note }) => {
    const { service } = await loadArticle(documentId);
    await service.updateNote(annotationId, note);
    const { annotations } = await service.listResolved();
    return { annotations };
  });

  ipcMain.handle('annotation:delete', async (_e, { documentId, annotationId }) => {
    const { service } = await loadArticle(documentId);
    await service.delete(annotationId);
    const { annotations } = await service.listResolved();
    return { annotations };
  });

  ipcMain.handle('annotation:repair', async (_e, { documentId, annotationId, anchor }) => {
    const { service } = await loadArticle(documentId);
    const { annotation } = await service.repair(annotationId, { anchor });
    const { annotations } = await service.listResolved();
    return { annotation, annotations };
  });

  ipcMain.handle('article:delete', async (_e, documentId) => {
    const result = await deleteArticle(libraryRoot, documentId);
    await forgetDocument(documentId);
    invalidateSearchIndex();
    await rebuildIndex(libraryRoot);
    await refreshSearchIndex(libraryRoot).catch(() => {});
    broadcast('library:changed');
    return result;
  });

  // ---- M3: search & library views ----
  ipcMain.handle('library:view', async (_e, { view = 'all', query = '', tags = [], sort = 'captured', limit = 200, offset = 0 }) => {
    const results = await queryLibrary(query, { view, tags, sort, limit, offset, libraryRoot });
    return { ...results, counts: viewCounts(), tag_facets: tagFacets() };
  });

  ipcMain.handle('search:query', async (_e, { query, limit = 50, offset = 0 }) => {
    await refreshSearchIndex(libraryRoot).catch(() => {});
    return search(query, { limit, offset });
  });

  ipcMain.handle('search:refresh', async () => {
    invalidateSearchIndex();
    const { total } = await refreshSearchIndex(libraryRoot);
    return { total };
  });

  ipcMain.handle('state:set', async (_e, { documentId, patch }) => {
    // order matters (M3 §72/73): user-owned file first, then derived index
    const state = await updateUserState(documentId, patch);
    await refreshSearchIndex(libraryRoot).catch(() => {});
    broadcast('library:changed');
    return state;
  });

  ipcMain.handle('tags:add', async (_e, { documentId, tag }) => {
    const { stateOf } = await import('../src/library/user-state.js');
    const userState = await loadUserState();
    const current = stateOf(userState, documentId);
    const state = await updateUserState(documentId, { tags: [...current.tags, tag] });
    await refreshSearchIndex(libraryRoot).catch(() => {});
    broadcast('library:changed');
    return state;
  });

  ipcMain.handle('tags:remove', async (_e, { documentId, tag }) => {
    const { stateOf, canonicalTag } = await import('../src/library/user-state.js');
    const userState = await loadUserState();
    const current = stateOf(userState, documentId);
    const key = canonicalTag(tag)?.key;
    const state = await updateUserState(documentId, { tags: current.tags.filter((t) => t.toLowerCase() !== key) });
    await refreshSearchIndex(libraryRoot).catch(() => {});
    broadcast('library:changed');
    return state;
  });

  ipcMain.handle('doctor:run', async () => runDoctor(libraryRoot));
  ipcMain.handle('dialog:pick-export-dir', async () => {
    const r = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  });
  ipcMain.handle('export:documents', async (_e, { documentIds, format = 'markdown', destDir }) => {
    if (!Array.isArray(documentIds) || documentIds.length === 0) return { exported_count: 0, failed_count: 0, failed: [] };
    await fsp.mkdir(destDir, { recursive: true });
    const exported = [];
    const failed = [];
    for (const documentId of documentIds) {
      try {
        const index = await loadIndex(libraryRoot);
        const entry = index.entries.find((e) => e.document_id === documentId);
        if (!entry) throw new Error('unknown document: ' + documentId);
        const dir = path.join(libraryRoot, entry.path);
        const meta = await verifyArticleDir(dir);
        const markdown = await fsp.readFile(path.join(dir, 'article.md'), 'utf8');
        const { readAnnotationsFile } = await import('../src/annotation/store.js');
        const { annotations } = await readAnnotationsFile(path.join(dir, 'annotations.jsonl'));
        const safe = (meta.title || meta.document_id).replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
        if (format === 'markdown') {
          const md = exportDocumentToMarkdown(meta, markdown, annotations);
          await fsp.writeFile(path.join(destDir, safe + '.md'), md);
        } else if (format === 'epub') {
          const buf = exportArticleToEpub({
            title: meta.title, author: meta.author ?? null, markdown,
            publishedAt: meta.published_at ?? null,
            sourceUrl: meta.source?.canonical_url ?? meta.source?.original_url ?? null,
            documentId: meta.document_id,
          });
          await fsp.writeFile(path.join(destDir, safe + '.epub'), buf);
        } else {
          throw new Error('unsupported format: ' + format);
        }
        exported.push({ document_id: documentId, title: meta.title });
      } catch (err) {
        failed.push({ document_id: documentId, error: err.message });
      }
    }
    return { exported_count: exported.length, failed_count: failed.length, failed, dest: destDir };
  });
  ipcMain.handle('export:metadata', async (_e, { format = 'csv' }) => {
    const index = await loadIndex(libraryRoot);
    const readState = await loadReadState();
    const stateAdapter = (id) => {
      const st = readState.states[id];
      return { read: st?.read ?? false, favorite: st?.favorite ?? false, inbox: st?.inbox ?? false, tags: st?.tags ?? [] };
    };
    if (format === 'json') return exportMetadataJson(index.entries, stateAdapter);
    return exportMetadataCsv(index.entries, stateAdapter);
  });
  ipcMain.handle('export:highlights', async (_e, { format = 'markdown' }) => {
    const index = await loadIndex(libraryRoot);
    const { readAnnotationsFile } = await import('../src/annotation/store.js');
    const items = [];
    for (const entry of index.entries) {
      try {
        const dir = path.join(libraryRoot, entry.path);
        const { annotations } = await readAnnotationsFile(path.join(dir, 'annotations.jsonl'));
        for (const a of annotations) {
          items.push({ annotation: a, document: { document_id: entry.document_id, title: entry.title, url: entry.canonical_url ?? entry.original_url ?? null } });
        }
      } catch { /* skip broken files */ }
    }
    if (format === 'json') return exportHighlightsJson(items);
    return exportHighlightsMarkdown(items);
  });
  ipcMain.handle('review:queue', async (_e, { strategy, limit }) => {
    return buildReviewQueue(libraryRoot, { strategy, limit });
  });
  ipcMain.handle('review:mark', async (_e, { items }) => {
    await markReviewed(items ?? []);
    return { ok: true };
  });

  // ---- M5: import / export / daily review ----
  ipcMain.handle('import:preview', async (_e, { filePath, format }) => {
    return previewImport(libraryRoot, filePath, { format });
  });
  ipcMain.handle('import:commit', async (_e, { filePath, format }) => {
    const report = await commitImport(libraryRoot, filePath, { format });
    invalidateSearchIndex();
    await refreshSearchIndex(libraryRoot).catch(() => {});
    await rebuildIndex(libraryRoot).catch(() => {});
    broadcast('library:changed');
    return report;
  });
  ipcMain.handle('export:documents', async (_e, { documentIds, format = 'markdown', destDir }) => {
    await fsp.mkdir(destDir, { recursive: true });
    const exported = [];
    const failed = [];
    for (const documentId of documentIds) {
      try {
        const index = await loadIndex(libraryRoot);
        const entry = index.entries.find((e) => e.document_id === documentId);
        if (!entry) throw new Error(`unknown document: ${documentId}`);
        const dir = path.join(libraryRoot, entry.path);
        const meta = await verifyArticleDir(dir);
        const markdown = await fsp.readFile(path.join(dir, 'article.md'), 'utf8');
        const { readAnnotationsFile } = await import('../src/annotation/store.js');
        const { annotations } = await readAnnotationsFile(path.join(dir, 'annotations.jsonl'));
        const safe = (meta.title || meta.document_id).replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
        if (format === 'markdown') {
          const md = exportDocumentToMarkdown(meta, markdown, annotations);
          await fsp.writeFile(path.join(destDir, `${safe}.md`), md);
        } else if (format === 'epub') {
          const buf = exportArticleToEpub({
            title: meta.title, author: meta.author ?? null, markdown,
            publishedAt: meta.published_at ?? null,
            sourceUrl: meta.source?.canonical_url ?? meta.source?.original_url ?? null,
            documentId: meta.document_id,
          });
          await fsp.writeFile(path.join(destDir, `${safe}.epub`), buf);
        } else {
          throw new Error(`unsupported export format: ${format}`);
        }
        exported.push({ document_id: documentId, title: meta.title });
      } catch (err) {
        failed.push({ document_id: documentId, error: err.message });
      }
    }
    return { exported_count: exported.length, failed_count: failed.length, failed, dest: destDir };
  });
  ipcMain.handle('export:metadata', async (_e, { format = 'csv' }) => {
    const index = await loadIndex(libraryRoot);
    const readState = await loadReadState();
    const stateAdapter = (id) => {
      const st = readState.states[id];
      return {
        read: st?.read ?? false,
        favorite: st?.favorite ?? false,
        inbox: st?.inbox ?? false,
        tags: st?.tags ?? [],
      };
    };
    if (format === 'json') return exportMetadataJson(index.entries, stateAdapter);
    return exportMetadataCsv(index.entries, stateAdapter);
  });
  ipcMain.handle('export:highlights', async (_e, { format = 'markdown' }) => {
    const index = await loadIndex(libraryRoot);
    const { readAnnotationsFile } = await import('../src/annotation/store.js');
    const items = [];
    for (const entry of index.entries) {
      try {
        const dir = path.join(libraryRoot, entry.path);
        const { annotations } = await readAnnotationsFile(path.join(dir, 'annotations.jsonl'));
        for (const a of annotations) {
          items.push({ annotation: a, document: { document_id: entry.document_id, title: entry.title, url: entry.canonical_url ?? entry.original_url ?? null } });
        }
      } catch { /* skip broken annotation files — diagnostics via doctor */ }
    }
    if (format === 'json') return exportHighlightsJson(items);
    return exportHighlightsMarkdown(items);
  });
  ipcMain.handle('review:queue', async (_e, { strategy, limit, date }) => {
    return buildReviewQueue(libraryRoot, { strategy, limit, date });
  });
  ipcMain.handle('review:mark', async (_e, { items }) => {
    await markReviewed(items ?? []);
    return { ok: true };
  });
  ipcMain.handle('review:article-context', async (_e, { documentId }) => {
    const index = await loadIndex(libraryRoot);
    const entry = index.entries.find((e) => e.document_id === documentId);
    if (!entry) return { exists: false };
    return { exists: true, title: entry.title, path: entry.path };
  });

  // ---- M4: feeds ----
  ipcMain.handle('feeds:list', async () => listFeedsWithCounts(libraryRoot));
  ipcMain.handle('feeds:add', async (_e, { url }) => {
    const result = await addFeedUrl(libraryRoot, url);
    invalidateSearchIndex();
    await refreshSearchIndex(libraryRoot).catch(() => {});
    broadcast('library:changed');
    return { duplicate: result.duplicate, feed_id: result.feed?.feed_id ?? null, refresh: result.refresh ?? null };
  });
  ipcMain.handle('feeds:refresh', async (_e, { feedId }) => {
    const r = await refreshFeed(libraryRoot, feedId);
    invalidateSearchIndex();
    await refreshSearchIndex(libraryRoot).catch(() => {});
    broadcast('library:changed');
    return r;
  });
  ipcMain.handle('feeds:refresh-all', async () => {
    const summary = await refreshAllFeeds(libraryRoot);
    broadcast('library:changed');
    return summary;
  });
  ipcMain.handle('feeds:set-enabled', async (_e, { feedId, enabled }) => {
    const feed = await updateFeedMeta(libraryRoot, feedId, { enabled });
    broadcast('library:changed');
    return feed;
  });
  ipcMain.handle('feeds:rename', async (_e, { feedId, customTitle }) => {
    const feed = await updateFeedMeta(libraryRoot, feedId, { custom_title: customTitle || null });
    broadcast('library:changed');
    return feed;
  });
  ipcMain.handle('feeds:delete', async (_e, { feedId }) => {
    await deleteFeedOnly(libraryRoot, feedId); // articles REMAIN (M4 §49)
    invalidateSearchIndex();
    await refreshSearchIndex(libraryRoot).catch(() => {});
    broadcast('library:changed');
    return { ok: true };
  });

  ipcMain.handle('article:read-state', async (_e, { documentId, state }) => {
    await setReadState(documentId, state);
    broadcast('library:changed');
    return { ok: true };
  });

  ipcMain.handle('article:reveal', async (_e, documentId) => {
    const index = await loadIndex(libraryRoot);
    const entry = index.entries.find((e) => e.document_id === documentId);
    if (!entry) throw new Error(`unknown document: ${documentId}`);
    shell.showItemInFolder(path.join(libraryRoot, entry.path, 'meta.json'));
    return { ok: true };
  });

  ipcMain.handle('article:resolve-path', async (_e, { documentId, relative }) => {
    // resolve 'assets/<hash>.<ext>' inside an article dir to a file:// URL
    if (relative.includes('..') || path.isAbsolute(relative)) throw new Error('bad relative path');
    const index = await loadIndex(libraryRoot);
    const entry = index.entries.find((e) => e.document_id === documentId);
    if (!entry) throw new Error(`unknown document: ${documentId}`);
    const abs = path.join(libraryRoot, entry.path, relative);
    // must stay inside the article dir
    if (!abs.startsWith(path.join(libraryRoot, entry.path))) throw new Error('path escapes article dir');
    return pathToFileURL(abs).href;
  });

  ipcMain.handle('library:reindex', async () => {
    const { index, errors } = await rebuildIndex(libraryRoot);
    broadcast('library:changed');
    return { count: index.entries.length, errors };
  });

  ipcMain.handle('queue:list', async () => listJobs(queueDir));
  ipcMain.handle('queue:process', async () => {
    await runQueueIfIdle();
    return { ok: true };
  });

  ipcMain.handle('app:open-external', async (_e, url) => {
    if (!/^https?:\/\//i.test(url)) throw new Error('only http(s) URLs can be opened externally');
    await shell.openExternal(url);
    return { ok: true };
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1180,
    height: 800,
    title: 'Reverie',
    backgroundColor: '#faf9f7',
    webPreferences: {
      preload: path.join(here, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  // Reader content must never navigate the window; external links go to the system browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  Menu.setApplicationMenu(null);
  void win.loadFile(path.join(here, 'renderer', 'index.html'));
}

app.whenReady().then(async () => {
  await fsp.mkdir(libraryRoot, { recursive: true });
  await fsp.mkdir(queueDir, { recursive: true });
  registerIpc();
  createWindow();
  await runQueueIfIdle();
  await loadSearchIndex(libraryRoot).catch(() => {});
  await refreshSearchIndex(libraryRoot).catch((e) => console.error('[reverie] search refresh:', e.message)); // process what accumulated while the app was closed (M1 §5.1)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
