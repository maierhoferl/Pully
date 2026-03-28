import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  readConfig: () => ipcRenderer.invoke('config:read'),
  writeConfig: data => ipcRenderer.invoke('config:write', data),
  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  extractInfo: url => ipcRenderer.invoke('ytdlp:extractInfo', url),
  addDownload: (url, formatId, title, metadata) => ipcRenderer.invoke('download:add', { url, formatId, title, metadata }),
  retryDownload: id => ipcRenderer.invoke('download:retry', id),
  getAllDownloads: () => ipcRenderer.invoke('download:getAll'),
  setAdblockEnabled: isEnabled => ipcRenderer.invoke('adblock:setEnabled', isEnabled),
  listLibrary: () => ipcRenderer.invoke('library:list'),
  revealInFinder: filePath => ipcRenderer.invoke('library:reveal', filePath),
  playFile: filePath => ipcRenderer.invoke('library:play', filePath),

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
})
