import { useEffect } from 'react'
import { useAppStore } from '../store/app-store.js'

export function useIpcEvents() {
  const { setDownloads, updateDownloadProgress, setLibraryFiles, setConfig } = useAppStore()

  useEffect(() => {
    const unsubQueue = window.api.onQueueUpdated(setDownloads)
    const unsubProgress = window.api.onProgress(updateDownloadProgress)
    const unsubCompleted = window.api.onCompleted(() => {
      window.api.listLibrary().then(setLibraryFiles)
    })
    const unsubFailed = window.api.onFailed(() => {})

    window.api.getAllDownloads().then(setDownloads)
    window.api.readConfig().then(setConfig)

    return () => { unsubQueue(); unsubProgress(); unsubCompleted(); unsubFailed() }
  }, [])
}
