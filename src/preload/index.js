import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  readConfig: () => ipcRenderer.invoke('config:read'),
  writeConfig: data => ipcRenderer.invoke('config:write', data),
  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  extractInfo: url => ipcRenderer.invoke('ytdlp:extractInfo', url),
  addDownload: (url, formatId, title, metadata) => ipcRenderer.invoke('download:add', { url, formatId, title, metadata }),
  retryDownload: id => ipcRenderer.invoke('download:retry', id),
  cancelDownload: id => ipcRenderer.invoke('download:cancel', id),
  getAllDownloads: () => ipcRenderer.invoke('download:getAll'),
  setAdblockEnabled: isEnabled => ipcRenderer.invoke('adblock:setEnabled', isEnabled),
  listLibrary: () => ipcRenderer.invoke('library:list'),
  revealInFinder: filePath => ipcRenderer.invoke('library:reveal', filePath),
  playFile: filePath => ipcRenderer.invoke('library:play', filePath),
  resolveStream: url => ipcRenderer.invoke('media:resolveStream', url),
  openUrl: url => ipcRenderer.invoke('shell:openUrl', url),
  deleteFile: filePath => ipcRenderer.invoke('library:delete', filePath),
  listFolders: () => ipcRenderer.invoke('library:listFolders'),
  createFolder: name => ipcRenderer.invoke('library:createFolder', name),
  moveFile: args => ipcRenderer.invoke('library:moveFile', args),
  renameFolder: (from, to) => ipcRenderer.invoke('library:renameFolder', { from, to }),
  deleteFolder: (folder, strategy) => ipcRenderer.invoke('library:deleteFolder', { folder, strategy }),
  autoClassify: () => ipcRenderer.invoke('library:autoClassify'),
  fetchClassifyModels: (provider, apiKey) => ipcRenderer.invoke('classify:fetchModels', provider, apiKey),

  // Notes
  readNotes: (folderName) => ipcRenderer.invoke('notes:read', folderName),
  initChapter: (filePath) => ipcRenderer.invoke('notes:init-chapter', filePath),
  updateBullets: (filePath, bullets) => ipcRenderer.invoke('notes:update-bullets', filePath, bullets),
  generateSummary: (filePath) => ipcRenderer.invoke('notes:generate-summary', filePath),
  fetchAiModels: (provider, apiKey) => ipcRenderer.invoke('classify:fetchModels', provider, apiKey),

  onQueueUpdated: cb => {
    const handler = (_, q) => cb(q)
    ipcRenderer.on('download:queue-updated', handler)
    return () => ipcRenderer.removeListener('download:queue-updated', handler)
  },
  onProgress: cb => {
    const handler = (_, d) => cb(d)
    ipcRenderer.on('download:progress', handler)
    return () => ipcRenderer.removeListener('download:progress', handler)
  },
  onCompleted: cb => {
    const handler = (_, d) => cb(d)
    ipcRenderer.on('download:completed', handler)
    return () => ipcRenderer.removeListener('download:completed', handler)
  },
  onFailed: cb => {
    const handler = (_, d) => cb(d)
    ipcRenderer.on('download:failed', handler)
    return () => ipcRenderer.removeListener('download:failed', handler)
  },
  onLogEntry: (callback) => ipcRenderer.on('log:entry', (event, entry) => callback(entry)),
})
