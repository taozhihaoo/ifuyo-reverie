// Reverie preload — the only bridge between the sandboxed renderer and main.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('reverie', {
  libraryList: () => ipcRenderer.invoke('library:list'),
  libraryView: (opts) => ipcRenderer.invoke('library:view', opts ?? {}),
  searchQuery: (query, opts) => ipcRenderer.invoke('search:query', { query, ...(opts ?? {}) }),
  searchRefresh: () => ipcRenderer.invoke('search:refresh'),
  doctorRun: () => ipcRenderer.invoke('doctor:run'),
  doctorRepair: (dryRun) => ipcRenderer.invoke('doctor:repair', { dryRun }),
  doctorRepairFinding: (checkId, docDir, dryRun) => ipcRenderer.invoke('doctor:repair-finding', { checkId, docDir, dryRun }),
  writeReport: (destDir, fileName, content) => ipcRenderer.invoke('report:write', { destDir, fileName, content }),
  settingsGet: () => ipcRenderer.invoke('settings:get'),
  settingsSetLibrary: (libraryPath) => ipcRenderer.invoke('settings:set-library', { libraryPath }),
  appRelaunch: () => ipcRenderer.invoke('app:relaunch'),
  appInfo: () => ipcRenderer.invoke('app:info'),
  appOpenLogs: () => ipcRenderer.invoke('app:open-logs'),
  appOpenLibraryFolder: () => ipcRenderer.invoke('app:open-library-folder'),
  onOpenDocument: (cb) => {
    const h = (_e, payload) => cb(payload);
    ipcRenderer.on('app:open-document', h);
    return () => ipcRenderer.removeListener('app:open-document', h);
  },
  pickEpub: () => ipcRenderer.invoke('dialog:pick-epub'),
  bookAdd: (sourcePath) => ipcRenderer.invoke('book:add', { sourcePath }),
  pickPdf: () => ipcRenderer.invoke('dialog:pick-pdf'),
  pdfAdd: (sourcePath) => ipcRenderer.invoke('pdf:add', { sourcePath }),
  pdfGetData: (documentId) => ipcRenderer.invoke('pdf:get-data', { documentId }),
  pdfVendorData: (name) => ipcRenderer.invoke('pdf:vendor-data', { name }),
  bookSaveProgress: (documentId, last_location) => ipcRenderer.invoke('book:save-progress', { documentId, last_location }),
  bookAddBookmark: (documentId, location) => ipcRenderer.invoke('book:add-bookmark', { documentId, location }),
  exportDocuments: (ids, format, dest) => ipcRenderer.invoke('export:documents', { documentIds: ids, format, destDir: dest }),
  exportEpub: (documentIds, destDir, { fileName = null, options = {}, mode = 'merge' } = {}) => ipcRenderer.invoke('export:epub', { documentIds, destDir, fileName, options, mode }),
  exportMetadata: (fmt) => ipcRenderer.invoke('export:metadata', { format: fmt }),
  exportHighlights: (fmt) => ipcRenderer.invoke('export:highlights', { format: fmt }),
  pickExportDir: () => ipcRenderer.invoke('dialog:pick-export-dir'),
  reviewQueue: (strategy, limit) => ipcRenderer.invoke('review:queue', { strategy, limit }),
  reviewMark: (items) => ipcRenderer.invoke('review:mark', { items }),
  feedsList: () => ipcRenderer.invoke('feeds:list'),
  feedsAdd: (url) => ipcRenderer.invoke('feeds:add', { url }),
  feedsRefresh: (feedId) => ipcRenderer.invoke('feeds:refresh', { feedId }),
  feedsRefreshAll: () => ipcRenderer.invoke('feeds:refresh-all'),
  feedsSetEnabled: (feedId, enabled) => ipcRenderer.invoke('feeds:set-enabled', { feedId, enabled }),
  feedsRename: (feedId, customTitle) => ipcRenderer.invoke('feeds:rename', { feedId, customTitle }),
  feedsDelete: (feedId) => ipcRenderer.invoke('feeds:delete', { feedId }),
  importPreview: (filePath, format) => ipcRenderer.invoke('import:preview', { filePath, format }),
  importCommit: (filePath, format) => ipcRenderer.invoke('import:commit', { filePath, format }),
  reviewArticleContext: (documentId) => ipcRenderer.invoke('review:article-context', { documentId }),
  stateSet: (documentId, patch) => ipcRenderer.invoke('state:set', { documentId, patch }),
  tagsAdd: (documentId, tag) => ipcRenderer.invoke('tags:add', { documentId, tag }),
  tagsRemove: (documentId, tag) => ipcRenderer.invoke('tags:remove', { documentId, tag }),
  articleLoad: (documentId) => ipcRenderer.invoke('article:load', documentId),
  articleDelete: (documentId) => ipcRenderer.invoke('article:delete', documentId),
  articleReadState: (documentId, state) => ipcRenderer.invoke('article:read-state', { documentId, state }),
  articleReveal: (documentId) => ipcRenderer.invoke('article:reveal', documentId),
  articleResolvePath: (documentId, relative) => ipcRenderer.invoke('article:resolve-path', { documentId, relative }),
  libraryReindex: () => ipcRenderer.invoke('library:reindex'),
  queueList: () => ipcRenderer.invoke('queue:list'),
  queueProcess: () => ipcRenderer.invoke('queue:process'),
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
  annotationCreate: (documentId, anchor, note) => ipcRenderer.invoke('annotation:create', { documentId, anchor, note }),
  annotationUpdateNote: (documentId, annotationId, note) => ipcRenderer.invoke('annotation:update-note', { documentId, annotationId, note }),
  annotationDelete: (documentId, annotationId) => ipcRenderer.invoke('annotation:delete', { documentId, annotationId }),
  annotationRepair: (documentId, annotationId, anchor) => ipcRenderer.invoke('annotation:repair', { documentId, annotationId, anchor }),
  onLibraryChanged: (cb) => {
    const h = () => cb();
    ipcRenderer.on('library:changed', h);
    return () => ipcRenderer.removeListener('library:changed', h);
  },
  onQueueChanged: (cb) => {
    const h = () => cb();
    ipcRenderer.on('queue:changed', h);
    return () => ipcRenderer.removeListener('queue:changed', h);
  },
});
