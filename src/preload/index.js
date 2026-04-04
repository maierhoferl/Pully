import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  readConfig: () => ipcRenderer.invoke('config:read'),
  writeConfig: (data) => ipcRenderer.invoke('config:write', data),
  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  extractInfo: (url) => ipcRenderer.invoke('ytdlp:extractInfo', url),
  addDownload: (url, formatId, title, metadata) =>
    ipcRenderer.invoke('download:add', { url, formatId, title, metadata }),
  rememberMedia: (metadata) => ipcRenderer.invoke('library:remember', metadata),
  savePage: (data) => ipcRenderer.invoke('library:savePage', data),
  retryDownload: (id) => ipcRenderer.invoke('download:retry', id),
  cancelDownload: (id) => ipcRenderer.invoke('download:cancel', id),
  getAllDownloads: () => ipcRenderer.invoke('download:getAll'),
  setAdblockEnabled: (isEnabled) => ipcRenderer.invoke('adblock:setEnabled', isEnabled),
  listLibrary: () => ipcRenderer.invoke('library:list'),
  revealInFinder: (filePath) => ipcRenderer.invoke('library:reveal', filePath),
  playFile: (filePath) => ipcRenderer.invoke('library:play', filePath),
  resolveStream: (url) => ipcRenderer.invoke('media:resolveStream', url),
  openUrl: (url) => ipcRenderer.invoke('shell:openUrl', url),
  deleteFile: (filePath) => ipcRenderer.invoke('library:delete', filePath),
  listFolders: () => ipcRenderer.invoke('library:listFolders'),
  createFolder: (name) => ipcRenderer.invoke('library:createFolder', name),
  moveFile: (args) => ipcRenderer.invoke('library:moveFile', args),
  renameFolder: (from, to) => ipcRenderer.invoke('library:renameFolder', { from, to }),
  deleteFolder: (folder, strategy) =>
    ipcRenderer.invoke('library:deleteFolder', { folder, strategy }),
  autoClassify: () => ipcRenderer.invoke('library:autoClassify'),
  runCuration: () => ipcRenderer.invoke('library:runCuration'),
  fetchClassifyModels: (provider, apiKey) =>
    ipcRenderer.invoke('classify:fetchModels', provider, apiKey),

  // Notes
  readNotes: (folderName) => ipcRenderer.invoke('notes:read', folderName),
  initChapter: (filePath) => ipcRenderer.invoke('notes:init-chapter', filePath),
  updateBullets: (filePath, bullets) =>
    ipcRenderer.invoke('notes:update-bullets', filePath, bullets),
  generateSummary: (filePath) => ipcRenderer.invoke('notes:generate-summary', filePath),
  fetchAiModels: (provider, apiKey) => ipcRenderer.invoke('classify:fetchModels', provider, apiKey),

  onQueueUpdated: (cb) => {
    const handler = (_, q) => cb(q)
    ipcRenderer.on('download:queue-updated', handler)
    return () => ipcRenderer.removeListener('download:queue-updated', handler)
  },
  onProgress: (cb) => {
    const handler = (_, d) => cb(d)
    ipcRenderer.on('download:progress', handler)
    return () => ipcRenderer.removeListener('download:progress', handler)
  },
  onCompleted: (cb) => {
    const handler = (_, d) => cb(d)
    ipcRenderer.on('download:completed', handler)
    return () => ipcRenderer.removeListener('download:completed', handler)
  },
  onFailed: (cb) => {
    const handler = (_, d) => cb(d)
    ipcRenderer.on('download:failed', handler)
    return () => ipcRenderer.removeListener('download:failed', handler)
  },
  onLogEntry: (callback) => {
    const handler = (_, entry) => callback(entry)
    ipcRenderer.on('log:entry', handler)
    return () => ipcRenderer.removeListener('log:entry', handler)
  },
  logError: (category, message, meta) =>
    ipcRenderer.invoke('log:renderer', { level: 'error', category, message, meta }),
  toggleDevTools: () => ipcRenderer.invoke('devtools:toggle'),

  // Bookmarks
  listBookmarks: () => ipcRenderer.invoke('bookmarks:list'),
  addBookmark: (data) => ipcRenderer.invoke('bookmarks:add', data),
  removeBookmark: (url) => ipcRenderer.invoke('bookmarks:remove', url),

  // History
  listHistory: () => ipcRenderer.invoke('history:list'),
  upsertHistory: (data) => ipcRenderer.invoke('history:upsert', data),
  browserTabsRead: () => ipcRenderer.invoke('browser-tabs:read'),
  browserTabsWrite: (data) => ipcRenderer.invoke('browser-tabs:write', data),

  // File Browser
  files: {
    listRoots: () => ipcRenderer.invoke('files:listRoots'),
    listDir: (dirPath) => ipcRenderer.invoke('files:listDir', dirPath),
    getLastDir: () => ipcRenderer.invoke('files:getLastDir'),
    setLastDir: (dirPath) => ipcRenderer.invoke('files:setLastDir', dirPath),
    rememberFile: (filePath) => ipcRenderer.invoke('files:rememberFile', filePath),
    rememberFolder: (folderPath) => ipcRenderer.invoke('files:rememberFolder', folderPath),
    isFileRemembered: (filePath) => ipcRenderer.invoke('files:isFileRemembered', filePath),
    checkOriginalExists: (path) => ipcRenderer.invoke('files:checkOriginalExists', path)
  },

  // File reading
  readFile: (filePath) => ipcRenderer.invoke('file:read', filePath),

  // Generic on() method for subscribing to any IPC event
  on: (channel, callback) => {
    const handler = (_, ...args) => callback(...args)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  }
})
