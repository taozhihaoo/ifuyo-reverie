/**
 * Reverie App — Electron main process (M1 §18 + M2 annotation integration).
 * Thin shell: window + IPC. All real logic lives in src/ (Library, Queue,
 * Pipeline, Annotation Core) so the architecture boundary App -> Core stays
 * honest and testable without Electron.
 */
import { app, BrowserWindow, ipcMain, shell, Menu, dialog, screen } from 'electron';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { promises as fsp, watch as fsWatch } from 'node:fs';
import { getLibraryRoot, getQueueDir } from '../src/core/paths.js';
import { loadIndex, rebuildIndex, loadReadState, setReadState, deleteArticle } from '../src/library/index.js';
import { listJobs, recoverOnStartup, JOB_STATUSES } from '../src/capture/queue.js';
import { processQueue } from '../src/capture/worker.js';
import { verifyArticleDir } from '../src/library/persist.js';
import { createAnnotationService } from '../src/annotation/service.js';
import { parseMarkdownBlocks } from '../src/reader/markdown-reader.js';
import { loadUserState, updateUserState, forgetDocument, userStatePath } from '../src/library/user-state.js';
import { loadSearchIndex, refreshSearchIndex, invalidateSearchIndex, search, queryLibrary, tagFacets, viewCounts } from '../src/search/search-service.js';
import { runDoctor, repairSafe, repairDoctorFinding } from '../src/library/doctor.js';
import { addFeedUrl, refreshFeed, refreshAllFeeds, deleteFeedOnly, listFeedsWithCounts, updateFeedMeta } from '../src/feed/feed-service.js';
import { previewImport, commitImport } from '../src/importexport/import-service.js';
import { exportDocumentToMarkdown, validateMarkdownExport } from '../src/importexport/export/markdown-exporter.js';
import { exportMetadataCsv, exportMetadataJson, exportHighlightsJson, exportHighlightsMarkdown } from '../src/importexport/export/metadata-exporter.js';
import { exportArticleToEpub } from '../src/importexport/export/epub-exporter.js';
import { buildReviewQueue, markReviewed } from '../src/review/daily-review.js';

const here = path.dirname(fileURLToPath(import.meta.url));

// ---- M1/M12: native messaging HOST mode — Chrome/Edge launch this very exe
// with the extension origin as argv when the user clicks "Save page to
// Reverie". Must be detected before any window/single-instance logic: the
// host runs headless (GUI-subsystem binary → no console flash) and exits
// when stdin closes.
//
// Electron's main-process stdin does not emit 'data' events on Windows, so
// the frame loop cannot run here — re-exec as plain Node (ELECTRON_RUN_AS_NODE)
// with stdio inherited straight from the browser's pipes.
if (process.argv.slice(1).some((a) => String(a).startsWith('chrome-extension://'))) {
  const { spawn } = await import('node:child_process');
  const hostScript = fileURLToPath(new URL('../src/capture/native-host.js', import.meta.url));
  const child = spawn(process.execPath, [hostScript, ...process.argv.slice(1)], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      // this launcher writes "\r\n" to stdout at boot before any app code —
      // the host uses the marker to emit a first-frame alignment pad
      ...(process.platform === 'win32' ? { REVERIE_STDOUT_SKIP: '2' } : {}),
    },
    stdio: 'inherit',
  });
  // await: the code below must never run for a host invocation (no window,
  // no single-instance lock fight with the GUI app); exit with the child's code
  const exitCode = await new Promise((resolve) => {
    child.on('exit', (_code, signal) => resolve(signal ? 1 : (_code ?? 0)));
    child.on('error', (err) => {
      process.stderr.write(`[reverie] host spawn failed: ${err.message}\n`); // browser shows the capture as failed
      resolve(1);
    });
  });
  process.exit(exitCode);
}
// ---- M11 bootstrap: settings → library root (env keeps highest precedence)
import { loadAppSettings, saveAppSettings, appSettingsPath } from '../src/core/app-settings.js';
import { appLog, logsDir } from '../src/core/app-log.js';
import { buildInfo } from '../src/core/build-info.js';
const appSettings = await loadAppSettings();
if (!process.env.REVERIE_LIBRARY && appSettings.libraryPath) {
  process.env.REVERIE_LIBRARY = appSettings.libraryPath; // user-selected library (M11 §11)
}
const libraryRoot = getLibraryRoot();
const queueDir = getQueueDir();
const isSafeMode = process.argv.includes('--safe-mode');
appLog.info(`reverie starting v${app.getVersion()} library=${libraryRoot} safeMode=${isSafeMode}`);

// M11 §35: crash handling — log + visible error, never a silent swallow
process.on('uncaughtException', (err) => {
  appLog.error(`uncaughtException: ${err?.name}: ${err?.message}`);
});
process.on('unhandledRejection', (reason) => {
  appLog.error(`unhandledRejection: ${String(reason?.message ?? reason).slice(0, 500)}`);
});

let processing = false;
async function runQueueIfIdle() {
  if (processing) return;
  processing = true;
  try {
    await recoverOnStartup(queueDir);
    const pending = (await listJobs(queueDir)).some((j) => j.status === JOB_STATUSES.QUEUED || j.status === JOB_STATUSES.RUNNING);
    await processQueue({ queueDir, libraryRoot, onJobUpdate: () => broadcast('queue:changed') });
    broadcast('queue:changed');
    if (pending) {
      // a processed capture only writes articles/ — the UI queries the index,
      // so without this rebuild the new article is invisible until restart
      await rebuildIndex(libraryRoot);
      await refreshSearchIndex(libraryRoot).catch((e) => console.error('[reverie] search refresh:', e.message));
      broadcast('library:changed');
    }
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

// Post-1.0: the capture host only writes the job to the queue dir — it cannot
// signal the app. Without this watcher, captures made while the app is running
// sit unprocessed until the next launch (user: "right-clicked save, app shows
// nothing"). Debounced fs.watch → process immediately while running.
let queueWatchTimer = null;
function watchQueueDir() {
  try {
    fsWatch(queueDir, { persistent: false }, () => {
      if (queueWatchTimer) clearTimeout(queueWatchTimer);
      queueWatchTimer = setTimeout(() => {
        queueWatchTimer = null;
        void runQueueIfIdle();
      }, 500);
    });
  } catch (err) {
    appLog.warn(`queue dir watch unavailable: ${err.message}`); // capture still processed on next launch
  }
}

/** Load an article directory + its annotation service (single lookup). */
async function loadArticle(documentId) {
  const index = await loadIndex(libraryRoot);
  const entry = index.entries.find((e) => e.document_id === documentId);
  if (!entry) throw new Error(`unknown document: ${documentId}`);
  const dir = path.join(libraryRoot, entry.path);

  // M6: books are EPUB documents read via the EPUB Reader Adapter
  if (entry.type === 'book') {
    const { openBookSession, bookCanonicalText } = await import('../src/reader/epub-reader-core.js');
    const session = await openBookSession(path.join(dir, 'book.epub'));
    const canonicalText = bookCanonicalText(session);
    const service = createAnnotationService({
      articleDir: dir,
      documentId,
      getReaderContext: async () => ({ canonicalText }),
    });
    const readState = await loadReadState();
    // last_location lives in user-state.json (M3 §7), not read-state.json —
    // reading progress was persisted via updateUserState (M6 §26/M7 §40)
    const userState = await loadUserState();
    return {
      entry, dir,
      meta: { ...entry, title: entry.title },
      type: 'book',
      // chapter.xhtml is the sanitized body HTML — identical string the
      // renderer inserts, so DOM textContent == canonicalText (M6 §33)
      chapters: session.chapters.map((ch) => ({
        index: ch.index, title: ch.title, href: ch.href, xhtml: ch.xhtml, text: ch.text,
      })),
      canonicalText,
      service,
      read_state: readState.states[documentId]?.state ?? 'unread',
      last_location: userState.states[documentId]?.last_location ?? null,
    };
  }

  // M7: PDF documents are read via the PDF Reader Adapter
  if (entry.type === 'pdf') {
    const {
      openPdfDocument, closePdfDocument, extractPdfPages, extractPdfMeta,
      extractPdfOutline, extractPdfPageLabels, pdfCanonicalText, pdfPageSpans,
    } = await import('../src/reader/pdf-reader-core.js');
    const doc = await openPdfDocument(path.join(dir, 'document.pdf'));
    let pages, pdfMeta, outline, labels;
    try {
      pages = await extractPdfPages(doc);
      pdfMeta = await extractPdfMeta(doc);
      outline = await extractPdfOutline(doc);
      labels = await extractPdfPageLabels(doc);
    } finally {
      await closePdfDocument(doc);
    }
    // canonical = page texts joined with no separator — byte-identical to the
    // renderer's pdf.js TextLayer DOM concatenation (M7 §13)
    const canonicalText = pdfCanonicalText(pages);
    const service = createAnnotationService({
      articleDir: dir,
      documentId,
      getReaderContext: async () => ({ canonicalText }),
    });
    const readState = await loadReadState();
    return {
      entry, dir,
      meta: { ...entry, title: entry.title, pdf_meta: pdfMeta },
      type: 'pdf',
      pages: pages.map((p) => ({
        index: p.index, width: p.width, height: p.height,
        rotation: p.rotation, has_text: p.text.length > 0,
      })),
      page_spans: pdfPageSpans(pages),
      canonicalText,
      outline,
      page_labels: labels,
      service,
      read_state: readState.states[documentId]?.state ?? 'unread',
      last_location: (await loadUserState()).states[documentId]?.last_location ?? null,
    };
  }

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

let searchIndexReady = Promise.resolve(); // set in whenReady; data IPC gates on it

function registerIpc() {
  const withSearchIndexReady = (fn) => async (...args) => {
    await searchIndexReady;
    return fn(...args);
  };
  ipcMain.handle('library:list', withSearchIndexReady(async () => {
    const index = await loadIndex(libraryRoot);
    const readState = await loadReadState();
    const jobs = await listJobs(queueDir);
    const pending = jobs.filter((j) => j.status === JOB_STATUSES.QUEUED || j.status === JOB_STATUSES.RUNNING).length;
    const entries = index.entries.map((e) => ({
      ...e,
      read_state: readState.states[e.document_id]?.state ?? 'unread',
    }));
    return { entries, pending_captures: pending, built_at: index.built_at };
  }));

  ipcMain.handle('article:load', async (_e, documentId) => {
    const loaded = await loadArticle(documentId);
    const readState = await loadReadState();
    const { annotations, invalid, duplicates } = await loaded.service.listResolved();
    // Recent view source of truth (M3 §131): persist on open, then refresh the derived index
    await updateUserState(documentId, { last_opened_at: new Date().toISOString() });
    await refreshSearchIndex(libraryRoot).catch(() => {});
    if (invalid.length > 0 || duplicates.length > 0) {
      console.error(`[reverie] annotation diagnostics for ${documentId}:`, JSON.stringify({ invalid, duplicates }));
    }
    if (loaded.type === 'book') {
      return {
        meta: loaded.meta, type: 'book', dir: loaded.dir,
        chapters: loaded.chapters, canonicalText: loaded.canonicalText,
        annotations, diagnostics: { invalid, duplicates },
        read_state: readState.states[documentId]?.state ?? 'unread',
        last_location: loaded.last_location ?? null,
        path: loaded.entry.path,
      };
    }
    if (loaded.type === 'pdf') {
      return {
        meta: loaded.meta, type: 'pdf', dir: loaded.dir,
        pages: loaded.pages, page_spans: loaded.page_spans,
        canonicalText: loaded.canonicalText, outline: loaded.outline,
        page_labels: loaded.page_labels,
        annotations, diagnostics: { invalid, duplicates },
        read_state: readState.states[documentId]?.state ?? 'unread',
        last_location: loaded.last_location ?? null,
        path: loaded.entry.path,
      };
    }
    return {
      meta: loaded.meta, type: 'article', dir: loaded.dir,
      markdown: loaded.markdown, blocks: loaded.blocks, canonicalText: loaded.canonicalText,
      annotations, diagnostics: { invalid, duplicates },
      read_state: readState.states[documentId]?.state ?? 'unread',
      path: loaded.entry.path,
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
  ipcMain.handle('library:view', withSearchIndexReady(async (_e, { view = 'all', query = '', tags = [], sort = 'captured', limit = 200, offset = 0 }) => {
    const results = await queryLibrary(query, { view, tags, sort, limit, offset, libraryRoot });
    return { ...results, counts: viewCounts(), tag_facets: tagFacets() };
  }));

  ipcMain.handle('search:query', withSearchIndexReady(async (_e, { query, limit = 50, offset = 0 }) => {
    await refreshSearchIndex(libraryRoot).catch(() => {});
    return search(query, { limit, offset });
  }));

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
  ipcMain.handle('doctor:repair', async (_e, { dryRun = false } = {}) => repairSafe(libraryRoot, { dryRun }));
  ipcMain.handle('doctor:repair-finding', async (_e, { checkId, docDir, dryRun = false } = {}) =>
    repairDoctorFinding(libraryRoot, { checkId, docDir, dryRun }));
  ipcMain.handle('report:write', async (_e, { destDir, fileName, content }) => {
    if (typeof content !== 'string' || content.length > 2 * 1024 * 1024) throw new Error('invalid report');
    const safe = String(fileName ?? 'DoctorReport.md').replace(/[\\/:*?"<>|]/g, '_').slice(0, 120);
    await fsp.mkdir(destDir, { recursive: true });
    const p = path.join(destDir, safe.endsWith('.md') ? safe : safe + '.md');
    await fsp.writeFile(p, content, 'utf8');
    return p;
  });
  // ---- M11: application settings / windows integration
  ipcMain.handle('settings:get', async () => {
    const settings = await loadAppSettings();
    return { ...settings, effectiveLibraryRoot: libraryRoot, libraryPathEnv: Boolean(process.env.REVERIE_LIBRARY) };
  });
  ipcMain.handle('settings:set-library', async (_e, { libraryPath }) => {
    if (typeof libraryPath !== 'string' || libraryPath.trim() === '') throw new Error('库路径不能为空');
    const resolved = path.resolve(libraryPath.trim());
    if (path.isAbsolute(resolved) === false) throw new Error('库路径必须是绝对路径');
    await fsp.mkdir(resolved, { recursive: true }); // create if new (M11 §11 Create Library)
    await saveAppSettings({ libraryPath: resolved });
    appLog.info(`library path set: ${resolved} (effective after relaunch)`);
    return { saved: true, libraryPath: resolved, restartRequired: true };
  });
  ipcMain.handle('app:relaunch', async () => {
    app.relaunch();
    app.exit(0);
  });
  ipcMain.handle('app:info', async () => ({ version: app.getVersion(), ...buildInfo(), logsDir: logsDir() }));
  ipcMain.handle('app:open-logs', async () => {
    await fsp.mkdir(logsDir(), { recursive: true });
    shell.openPath(logsDir());
  });
  ipcMain.handle('app:open-library-folder', async () => {
    shell.openPath(libraryRoot);
  });
  ipcMain.handle('dialog:pick-export-dir', async () => {
    const r = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  });
  ipcMain.handle('dialog:pick-epub', async () => {
    const r = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'EPUB', extensions: ['epub'] }],
    });
    return r.canceled ? null : r.filePaths[0];
  });
  ipcMain.handle('book:add', async (_e, { sourcePath }) => {
    const { addEpubBook } = await import('../src/reader/book-library.js');
    const result = await addEpubBook(libraryRoot, sourcePath);
    invalidateSearchIndex();
    await rebuildIndex(libraryRoot).catch(() => {});
    await refreshSearchIndex(libraryRoot).catch(() => {});
    broadcast('library:changed');
    return result;
  });
  ipcMain.handle('book:save-progress', async (_e, { documentId, last_location }) => {
    await updateUserState(documentId, { last_location });
    return { ok: true };
  });
  ipcMain.handle('book:add-bookmark', async (_e, { documentId, location }) => {
    const loaded = await loadArticle(documentId);
    // bookmarks work for every paged/scrollable reader: books use
    // {chapter_index}, PDFs {page_index}, articles {offset} — the locator
    // shape follows the reader's own location model (M2 reader-location)
    const { annotation } = await loaded.service.createBookmark({ location });
    return annotation;
  });
  ipcMain.handle('dialog:pick-pdf', async () => {
    const r = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    return r.canceled ? null : r.filePaths[0];
  });
  ipcMain.handle('pdf:add', async (_e, { sourcePath }) => {
    const { addPdfBook } = await import('../src/reader/pdf-library.js');
    const result = await addPdfBook(libraryRoot, sourcePath);
    invalidateSearchIndex();
    await rebuildIndex(libraryRoot).catch(() => {});
    await refreshSearchIndex(libraryRoot).catch(() => {});
    broadcast('library:changed');
    return result;
  });
  // M7: PDF bytes for the renderer's pdf.js. Fixed library-internal filename,
  // no user-supplied path components; the original file is never written to.
  ipcMain.handle('pdf:get-data', async (_e, { documentId }) => {
    const loaded = await loadArticle(documentId);
    if (loaded.type !== 'pdf') throw new Error('not a pdf document');
    return fsp.readFile(path.join(loaded.dir, 'document.pdf'));
  });
  // M7: pdf.js runtime assets (cmaps/standard_fonts/wasm) for the renderer.
  // file:// fetch is not available to the sandboxed renderer, so pdf.js's
  // BinaryDataFactory is routed through this IPC. Names are validated against
  // the vendored allowlist dirs — no traversal, no arbitrary reads.
  const VENDOR_DIRS = new Set(['cmaps', 'standard_fonts', 'wasm']);
  const VENDOR_EXTENSIONS = new Set(['.bcmap', '.ttf', '.otf', '.pfb', '.ttc', '.wasm', '.js']);
  ipcMain.handle('pdf:vendor-data', async (_e, { name }) => {
    if (typeof name !== 'string' || name.length === 0 || name.length > 200) {
      throw new Error('invalid vendor asset name');
    }
    const [dir, ...rest] = name.split('/');
    if (!VENDOR_DIRS.has(dir) || rest.length !== 1) throw new Error('invalid vendor asset path');
    const file = rest[0];
    if (!VENDOR_EXTENSIONS.has(path.extname(file)) || file.includes('..') || file.includes('\\')) {
      throw new Error('invalid vendor asset file');
    }
    return fsp.readFile(path.join(here, 'vendor', 'pdfjs', dir, file));
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
          // M9: EPUB goes through the advanced export engine (single pipeline)
          const { exportDocumentsToEpub } = await import('../src/importexport/export/epub-export-service.js');
          const result = await exportDocumentsToEpub({
            libraryRoot, entries: [{ document_id: documentId, path: entry.path, title: entry.title }],
            destDir, fileName: safe,
          });
          if (!result.success) throw new Error(result.errors?.join('；') ?? 'export failed');
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
  // M9: merged/separate advanced EPUB export
  ipcMain.handle('export:epub', async (_e, { documentIds, destDir, fileName, options = {}, mode = 'merge' }) => {
    const { exportDocumentsToEpub } = await import('../src/importexport/export/epub-export-service.js');
    const index = await loadIndex(libraryRoot);
    const entries = (Array.isArray(documentIds) ? documentIds : [])
      .map((id) => index.entries.find((e) => e.document_id === id))
      .filter(Boolean)
      .map((e) => ({ document_id: e.document_id, path: e.path, title: e.title }));
    if (entries.length === 0) {
      return { success: false, error: '未选择要导出的文档', warnings: [], skipped: [] };
    }
    try {
      if (mode === 'separate') {
        let ok = 0;
        const failed = [];
        for (const entry of entries) {
          try {
            await exportDocumentsToEpub({
              libraryRoot, entries: [entry], destDir, options,
            });
            ok += 1;
          } catch (err) {
            failed.push({ document_id: entry.document_id, title: entry.title, error: err.message });
          }
        }
        return { success: failed.length === 0, mode, exported: ok, failed, warnings: [], skipped: [] };
      }
      const result = await exportDocumentsToEpub({
        libraryRoot, entries, destDir, fileName, options,
      });
      return { ...result, mode };
    } catch (err) {
      return { success: false, error: err.message, code: err.code ?? null, warnings: [], skipped: [] };
    }
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
  ipcMain.handle('review:queue', async (_e, { strategy, limit, date }) => {
    return buildReviewQueue(libraryRoot, { strategy, limit, date });
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

let mainWindow = null;
const windowBounds = appSettings.window ?? null; // M11 §30: persisted window state

function createWindow() {
  const bounds = { width: 1180, height: 800 };
  if (windowBounds
    && Number.isInteger(windowBounds.width) && windowBounds.width >= 500
    && Number.isInteger(windowBounds.height) && windowBounds.height >= 400) {
    bounds.width = windowBounds.width;
    bounds.height = windowBounds.height;
    // only restore position when it lands on a visible display (M11 §30)
    const visible = screen.getAllDisplays().some((d) => {
      const a = d.workArea;
      const x = windowBounds.x ?? 0;
      const y = windowBounds.y ?? 0;
      return x >= a.x - 50 && x < a.x + a.width && y >= a.y - 50 && y < a.y + a.height;
    });
    if (visible && Number.isInteger(windowBounds.x) && Number.isInteger(windowBounds.y)) {
      bounds.x = windowBounds.x;
      bounds.y = windowBounds.y;
    }
  }
  const win = new BrowserWindow({
    ...bounds,
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
  if (windowBounds?.maximized) win.maximize();
  mainWindow = win;
  const saveBounds = () => {
    if (win.isDestroyed() || win.isMinimized()) return;
    const b = win.getNormalBounds();
    saveAppSettings({ window: { ...b, maximized: win.isMaximized() } }).catch(() => {});
  };
  win.on('close', saveBounds);
  win.on('maximize', saveBounds);
  win.on('unmaximize', saveBounds);
  // Reader content must never navigate the window; external links go to the system browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  Menu.setApplicationMenu(null);
  void win.loadFile(path.join(here, 'renderer', 'index.html'));
}

// ---- M11: single instance (§20) — a second launch forwards its args here.
// EXCEPT: a native-host invocation (chrome-extension:// argv) must NOT be
// blocked by the single-instance lock — it is a headless capture relay and
// already exited earlier in this file.
const gotLock = process.argv.slice(1).some((a) => String(a).startsWith('chrome-extension://'))
  ? true
  : app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    void openFilesFromArgs(argv);
  });
}

// ---- M12/Post-1.0: auto-register the native messaging host (Windows, HKCU)
// so "Save page to Reverie" works without ever running register.ps1 by hand.
// Idempotent: registry keys are only rewritten when the manifest path changes.
const HOST_NAME = 'com.reverie.capture_host';
async function autoRegisterNativeHost() {
  if (process.platform !== 'win32') return;
  // dev guard: registering would point the registry at node_modules' electron.exe,
  // which cannot run headless as a host — dev uses run-host.cmd instead (M1 §4)
  if (!app.isPackaged && process.env.REVERIE_REGISTER_HOST !== '1') return;
  try {
    const { EXTENSION_ID } = await import('../src/capture/native-host.js');
    const dataDir = path.join(here, '..', 'native-host', 'data'); // repo root / resources/app — shared with register.ps1's location
    await fsp.mkdir(dataDir, { recursive: true });
    const manifestPath = path.join(dataDir, `${HOST_NAME}.json`);
    const manifest = {
      name: HOST_NAME,
      description: 'Reverie Capture Host — receives capture requests from the Reverie browser extension',
      path: process.execPath, // Reverie.exe itself acts as the windowless host
      type: 'stdio',
      allowed_origins: [`chrome-extension://${EXTENSION_ID}/`],
    };
    const manifestJson = JSON.stringify(manifest, null, 2);
    const existing = await fsp.readFile(manifestPath, 'utf8').catch(() => null);
    if (existing !== manifestJson) {
      await fsp.writeFile(manifestPath, manifestJson, 'utf8');
      appLog.info(`native host manifest updated: ${manifestPath}`);
    }
    // point Chrome/Edge at the manifest (HKCU — per-user, no admin);
    // reg add is idempotent, so this is safe on every startup
    for (const regKey of [
      `HKCU\\SOFTWARE\\Google\\Chrome\\NativeMessagingHosts\\${HOST_NAME}`,
      `HKCU\\SOFTWARE\\Microsoft\\Edge\\NativeMessagingHosts\\${HOST_NAME}`,
    ]) {
      await new Promise((resolve, reject) => {
        const p = execFile('reg', ['add', regKey, '/ve', '/d', manifestPath, '/f'], (err, stdout) => (err ? reject(err) : resolve(stdout)));
        p.on('exit', () => resolve());
      }).catch(() => appLog.warn(`native host registration failed: ${regKey}`));
    }
  } catch (err) {
    appLog.warn(`native host auto-registration skipped: ${err.message}`);
  }
}

/** M11 §19: supported file arguments — .epub/.pdf are ingested into the
 * library and opened; anything else is reported, never silently ignored. */
async function openFilesFromArgs(argv) {
  for (const arg of argv.slice(1)) {
    if (arg.startsWith('--')) continue;
    const ext = path.extname(arg).toLowerCase();
    if (ext !== '.epub' && ext !== '.pdf') continue;
    try {
      await fsp.access(arg);
      const importer = ext === '.epub'
        ? (await import('../src/reader/book-library.js')).addEpubBook
        : (await import('../src/reader/pdf-library.js')).addPdfBook;
      const result = await importer(libraryRoot, path.resolve(arg));
      invalidateSearchIndex();
      await rebuildIndex(libraryRoot).catch(() => {});
      await refreshSearchIndex(libraryRoot).catch(() => {});
      broadcast('library:changed');
      mainWindow?.webContents.send('app:open-document', { documentId: result.document_id, title: result.meta.title });
      appLog.info(`opened file from args: ext=${ext} document=${result.document_id}`);
    } catch (err) {
      dialog.showMessageBox({
        type: 'warning',
        message: `无法打开文件：${path.basename(arg)}`,
        detail: `Reverie 未修改该文件。原因：${err.message}`,
      });
      appLog.error(`open-file failed: ${err.message}`);
    }
  }
}

app.whenReady().then(async () => {
  await fsp.mkdir(libraryRoot, { recursive: true });
  await fsp.mkdir(queueDir, { recursive: true });
  registerIpc();
  createWindow();
  void autoRegisterNativeHost(); // Post-1.0: register the capture host in background
  await runQueueIfIdle();
  watchQueueDir(); // captures arriving while running are processed within ~500ms
  await loadSearchIndex(libraryRoot).catch(() => {});
  await refreshSearchIndex(libraryRoot).catch((e) => console.error('[reverie] search refresh:', e.message)); // process what accumulated while the app was closed (M1 §5.1)
  // cold-start fix (M12): the renderer may have queried before the search
  // index was ready — tell it to re-query now that the index is built
  broadcast('library:changed');
  void openFilesFromArgs(process.argv);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
