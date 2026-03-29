import { useEffect } from 'react'
import { useAppStore } from '../store/app-store.js'

export function useIpcEvents() {
  const {
    setDownloads,
    updateDownloadProgress,
    updateDownloadFailed,
    setLibraryFiles,
    setConfig,
    setBrowserActiveChapter
  } = useAppStore()

  useEffect(() => {
    const unsubQueue = window.api.onQueueUpdated(setDownloads)
    const unsubProgress = window.api.onProgress(updateDownloadProgress)
    const unsubCompleted = window.api.onCompleted(() => {
      window.api.listLibrary().then(setLibraryFiles)
    })
    const unsubFailed = window.api.onFailed(({ id, error }) => {
      updateDownloadFailed({ id, error })
    })
    const unsubLogEntry = window.api.onLogEntry((entry) => {
      useAppStore.setState((state) => ({
        logEntries: [...state.logEntries, entry].slice(-1000)
      }))
    })
    const handleChapterUpdated = (data) => {
      setBrowserActiveChapter(data)
    }
    const unsubChapterUpdated = window.api.on('notes:chapter-updated', handleChapterUpdated)

    window.api.getAllDownloads().then(setDownloads)
    window.api.readConfig().then((cfg) => {
      setConfig(cfg)
      // Trigger folder curation on startup if enabled (fire-and-forget)
      if (cfg.maintainFolder) {
        window.api.runCuration().catch(() => {})
      }
    })

    return () => {
      unsubQueue()
      unsubProgress()
      unsubCompleted()
      unsubFailed()
      unsubLogEntry()
      unsubChapterUpdated()
    }
  }, [])
}
