import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  readConfig: () => ipcRenderer.invoke('config:read'),
  writeConfig: data => ipcRenderer.invoke('config:write', data),
  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  extractInfo: url => ipcRenderer.invoke('ytdlp:extractInfo', url),
  addDownload: (url, formatId, title) => ipcRenderer.invoke('download:add', { url, formatId, title }),
  retryDownload: id => ipcRenderer.invoke('download:retry', id),
  getAllDownloads: () => ipcRenderer.invoke('download:getAll'),
  listLibrary: () => ipcRenderer.invoke('library:list'),
  revealInFinder: filePath => ipcRenderer.invoke('library:reveal', filePath),

  onQueueUpdated: cb => {
    ipcRenderer.on('download:queue-updated', (_, q) => cb(q))
    return () => ipcRenderer.removeAllListeners('download:queue-updated')
  },
  onProgress: cb => {
    ipcRenderer.on('download:progress', (_, d) => cb(d))
    return () => ipcRenderer.removeAllListeners('download:progress')
  },
  onCompleted: cb => {
    ipcRenderer.on('download:completed', (_, d) => cb(d))
    return () => ipcRenderer.removeAllListeners('download:completed')
  },
  onFailed: cb => {
    ipcRenderer.on('download:failed', (_, d) => cb(d))
    return () => ipcRenderer.removeAllListeners('download:failed')
  },
})
