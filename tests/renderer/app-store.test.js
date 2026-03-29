import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { useAppStore } from '@renderer/store/app-store'

describe('useAppStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    const { result } = renderHook(() => useAppStore())
    act(() => {
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
      result.current.setBrowserActiveChapter(null)
      // Reset browser tabs to a single fresh home tab
      result.current.closeOtherBrowserTabs(result.current.activeBrowserTabId)
      result.current.updateBrowserTab(result.current.activeBrowserTabId, { url: '', title: 'New Tab', suspended: false, mediaScanResults: null, mediaScanLoading: false })
    })
  })

  describe('browserActiveChapter', () => {
    it('initializes with null', () => {
      const { result } = renderHook(() => useAppStore())
      expect(result.current.browserActiveChapter).toBeNull()
    })

    it('setBrowserActiveChapter updates state', () => {
      const { result } = renderHook(() => useAppStore())

      const chapter = {
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

      act(() => {
        result.current.setBrowserActiveChapter(chapter)
      })

      expect(result.current.browserActiveChapter).toEqual(chapter)
    })

    it('setBrowserActiveChapter replaces entire state', () => {
      const { result } = renderHook(() => useAppStore())

      const chapter1 = {
        notesPath: '/path/to/notes1.md',
        chapter: {
          filePath: 'video1.mp4',
          title: 'Video 1',
          url: 'https://example.com/video1',
          downloadedAt: '2026-03-29',
          summary: 'Summary 1',
          bullets: ['bullet 1']
        }
      }

      const chapter2 = {
        notesPath: '/path/to/notes2.md',
        chapter: {
          filePath: 'video2.mp4',
          title: 'Video 2',
          url: 'https://example.com/video2',
          downloadedAt: '2026-03-29',
          summary: 'Summary 2',
          bullets: ['bullet 2']
        }
      }

      act(() => {
        result.current.setBrowserActiveChapter(chapter1)
      })

      expect(result.current.browserActiveChapter).toEqual(chapter1)

      act(() => {
        result.current.setBrowserActiveChapter(chapter2)
      })

      expect(result.current.browserActiveChapter).toEqual(chapter2)
    })

    it('setBrowserActiveChapter can clear state by setting null', () => {
      const { result } = renderHook(() => useAppStore())

      const chapter = {
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

      act(() => {
        result.current.setBrowserActiveChapter(chapter)
      })

      expect(result.current.browserActiveChapter).toEqual(chapter)

      act(() => {
        result.current.setBrowserActiveChapter(null)
      })

      expect(result.current.browserActiveChapter).toBeNull()
    })
  })

  describe('browser tabs', () => {
    it('addBrowserTab creates a tab and makes it active', () => {
      const { result } = renderHook(() => useAppStore())

      act(() => {
        result.current.addBrowserTab({ url: 'https://example.com', title: 'Example' })
      })

      const tabs = result.current.browserTabs
      const activeId = result.current.activeBrowserTabId

      expect(tabs.length).toBe(2) // initial home tab + new tab
      const newTab = tabs.find((t) => t.url === 'https://example.com')
      expect(newTab).toBeDefined()
      expect(newTab.title).toBe('Example')
      expect(activeId).toBe(newTab.id)
    })

    it('closeBrowserTab removes tab and activates adjacent if active was closed', () => {
      const { result } = renderHook(() => useAppStore())

      // Add a second tab
      act(() => {
        result.current.addBrowserTab({ url: 'https://example.com', title: 'Example' })
      })

      const tabs = result.current.browserTabs
      const activeId = result.current.activeBrowserTabId
      const otherTab = tabs.find((t) => t.id !== activeId)

      // Close the active tab
      act(() => {
        result.current.closeBrowserTab(activeId)
      })

      expect(result.current.browserTabs.length).toBe(1)
      expect(result.current.activeBrowserTabId).toBe(otherTab.id)
    })

    it('closeBrowserTab on last tab opens a fresh home tab', () => {
      const { result } = renderHook(() => useAppStore())

      const lastTabId = result.current.activeBrowserTabId

      act(() => {
        result.current.closeBrowserTab(lastTabId)
      })

      expect(result.current.browserTabs.length).toBe(1)
      const newTab = result.current.browserTabs[0]
      expect(newTab.id).not.toBe(lastTabId)
      expect(newTab.url).toBe('')
      expect(result.current.activeBrowserTabId).toBe(newTab.id)
    })

    it('closeOtherBrowserTabs keeps only active tab', () => {
      const { result } = renderHook(() => useAppStore())

      act(() => {
        result.current.addBrowserTab({ url: 'https://a.com', title: 'A' })
        result.current.addBrowserTab({ url: 'https://b.com', title: 'B' })
      })

      expect(result.current.browserTabs.length).toBe(3)
      const activeId = result.current.activeBrowserTabId

      act(() => {
        result.current.closeOtherBrowserTabs(activeId)
      })

      expect(result.current.browserTabs.length).toBe(1)
      expect(result.current.browserTabs[0].id).toBe(activeId)
      expect(result.current.activeBrowserTabId).toBe(activeId)
    })

    it('updateBrowserTab patches a tab by id', () => {
      const { result } = renderHook(() => useAppStore())

      const tabId = result.current.activeBrowserTabId

      act(() => {
        result.current.updateBrowserTab(tabId, { title: 'Updated Title', url: 'https://new.com' })
      })

      const tab = result.current.browserTabs.find((t) => t.id === tabId)
      expect(tab.title).toBe('Updated Title')
      expect(tab.url).toBe('https://new.com')
    })

    it('suspendBrowserTab sets suspended:true', () => {
      const { result } = renderHook(() => useAppStore())

      const tabId = result.current.activeBrowserTabId

      act(() => {
        result.current.suspendBrowserTab(tabId)
      })

      const tab = result.current.browserTabs.find((t) => t.id === tabId)
      expect(tab.suspended).toBe(true)
    })
  })
})
