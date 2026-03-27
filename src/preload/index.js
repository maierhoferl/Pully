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
