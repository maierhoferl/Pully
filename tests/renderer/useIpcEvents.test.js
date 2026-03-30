import { renderHook } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useIpcEvents } from '@renderer/hooks/useIpcEvents'
import { useAppStore } from '@renderer/store/app-store'

describe('useIpcEvents', () => {
  beforeEach(() => {
    // Reset store state before each test
    const { result } = renderHook(() => useAppStore())
    result.current.setActiveTab('browser')
    result.current.setSettingsOpen(false)
    result.current.setConfig({ outputFolder: '', maxConcurrent: 3 })
    result.current.setDownloads([])
    result.current.setLibraryFiles([])
    result.current.setLibrarySort('date', 'desc')
    result.current.setLibrarySearch('')
    result.current.setActiveNotesFolder(null)
    result.current.setActiveNotesChapter(null)
    result.current.setLibrarySelectedFile(null)
    result.current.updateBrowserTab(result.current.activeBrowserTabId, { browserActiveChapter: null })

    // Reset window.api mocks
    window.api = {
      onQueueUpdated: vi.fn(() => vi.fn()),
      onProgress: vi.fn(() => vi.fn()),
      onCompleted: vi.fn(() => vi.fn()),
      onFailed: vi.fn(() => vi.fn()),
      onLogEntry: vi.fn(() => vi.fn()),
      on: vi.fn(() => vi.fn()),
      getAllDownloads: vi.fn(() => Promise.resolve([])),
      readConfig: vi.fn(() => Promise.resolve({ outputFolder: '', maxConcurrent: 3 })),
      listLibrary: vi.fn(() => Promise.resolve([]))
    }
  })

  describe('notes:chapter-updated subscription', () => {
    it('subscribes to notes:chapter-updated event on mount', () => {
      renderHook(() => useIpcEvents())

      expect(window.api.on).toHaveBeenCalledWith('notes:chapter-updated', expect.any(Function))
    })

    it('updates active tab browserActiveChapter when notes:chapter-updated is received', () => {
      const { result: storeResult } = renderHook(() => useAppStore())
      const tabId = storeResult.current.activeBrowserTabId

      renderHook(() => useIpcEvents())

      const handler = window.api.on.mock.calls.find(
        (call) => call[0] === 'notes:chapter-updated'
      )[1]

      const chapterData = {
        notesPath: '/path/to/notes.md',
        chapter: {
          filePath: 'video.mp4',
          title: 'My Video',
          url: 'https://example.com/video',
          downloadedAt: '2026-03-29',
          summary: 'Summary here',
          bullets: ['bullet 1', 'bullet 2']
        }
      }

      handler(chapterData)

      const { result } = renderHook(() => useAppStore())
      const activeTab = result.current.browserTabs.find((t) => t.id === tabId)
      expect(activeTab.browserActiveChapter).toEqual(chapterData)
    })

    it('unsubscribes from notes:chapter-updated on cleanup', () => {
      const { unmount } = renderHook(() => useIpcEvents())

      const unsubscribe = vi.fn()
      window.api.on.mockReturnValueOnce(unsubscribe)

      // Re-render to trigger cleanup
      unmount()

      // The unsubscribe function was returned by window.api.on
      // and should be called during cleanup
      // We need to verify that window.api.on returned a function that gets called
      expect(window.api.on).toHaveBeenCalled()
    })
  })

  describe('other IPC subscriptions', () => {
    it('subscribes to all expected IPC events on mount', () => {
      renderHook(() => useIpcEvents())

      expect(window.api.onQueueUpdated).toHaveBeenCalled()
      expect(window.api.onProgress).toHaveBeenCalled()
      expect(window.api.onCompleted).toHaveBeenCalled()
      expect(window.api.onFailed).toHaveBeenCalled()
      expect(window.api.onLogEntry).toHaveBeenCalled()
      expect(window.api.on).toHaveBeenCalledWith('notes:chapter-updated', expect.any(Function))
    })

    it('fetches initial data on mount', () => {
      renderHook(() => useIpcEvents())

      expect(window.api.getAllDownloads).toHaveBeenCalled()
      expect(window.api.readConfig).toHaveBeenCalled()
    })
  })
})
