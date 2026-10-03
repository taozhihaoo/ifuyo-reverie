// Reverie preload — the only bridge between the sandboxed renderer and main.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('reverie', {
  libraryList: () => ipcRenderer.invoke('library:list'),
  articleLoad: (documentId) => ipcRenderer.invoke('article:load', documentId),
  articleDelete: (documentId) => ipcRenderer.invoke('article:delete', documentId),
  articleReadState: (documentId, state) => ipcRenderer.invoke('article:read-state', { documentId, state }),
  articleReveal: (documentId) => ipcRenderer.invoke('article:reveal', documentId),
  articleResolvePath: (documentId, relative) => ipcRenderer.invoke('article:resolve-path', { documentId, relative }),
  libraryReindex: () => ipcRenderer.invoke('library:reindex'),
  queueList: () => ipcRenderer.invoke('queue:list'),
  queueProcess: () => ipcRenderer.invoke('queue:process'),
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
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
