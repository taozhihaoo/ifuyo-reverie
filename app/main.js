/**
 * Reverie App — Electron main process (M1 §18 + M2 annotation integration).
 * Thin shell: window + IPC. All real logic lives in src/ (Library, Queue,
 * Pipeline, Annotation Core) so the architecture boundary App -> Core stays
 * honest and testable without Electron.
 */
import { app, BrowserWindow, ipcMain, shell, Menu } from 'electron';
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
    await rebuildIndex(libraryRoot);
    broadcast('library:changed');
    return result;
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
  await runQueueIfIdle(); // process what accumulated while the app was closed (M1 §5.1)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
