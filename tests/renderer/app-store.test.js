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
      // Reset browser tabs to a single fresh home tab
      result.current.closeOtherBrowserTabs(result.current.activeBrowserTabId)
      result.current.updateBrowserTab(result.current.activeBrowserTabId, {
        browserUrl: 'https://www.youtube.com',
        title: 'New Tab',
        suspended: false,
        mediaScanResults: null,
        mediaScanLoading: false
      })
    })
  })

  describe('browser tabs', () => {
    it('addBrowserTab creates a tab and makes it active', () => {
      const { result } = renderHook(() => useAppStore())

      act(() => {
        result.current.addBrowserTab('https://example.com')
      })

      const tabs = result.current.browserTabs
      const activeId = result.current.activeBrowserTabId

      expect(tabs.length).toBe(2) // initial home tab + new tab
      const newTab = tabs.find((t) => t.browserUrl === 'https://example.com')
      expect(newTab).toBeDefined()
      expect(newTab.suspended).toBe(false)
      expect(activeId).toBe(newTab.id)
    })

    it('closeBrowserTab removes tab and activates adjacent if active was closed', () => {
      const { result } = renderHook(() => useAppStore())

      // Add a second tab
      act(() => {
        result.current.addBrowserTab('https://example.com')
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

      // There is exactly 1 tab after beforeEach reset
      const lastTabId = result.current.activeBrowserTabId

      act(() => {
        result.current.closeBrowserTab(lastTabId)
      })

      const after = result.current
      expect(after.browserTabs.length).toBe(1)
      expect(after.browserTabs[0].browserUrl).toBe('https://www.youtube.com')
      expect(after.browserTabs[0].id).not.toBe(lastTabId)
      expect(after.activeBrowserTabId).toBe(after.browserTabs[0].id)
    })

    it('closeOtherBrowserTabs keeps only active tab', () => {
      const { result } = renderHook(() => useAppStore())

      act(() => {
        result.current.addBrowserTab('https://a.com')
        result.current.addBrowserTab('https://b.com')
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
        result.current.updateBrowserTab(tabId, {
          title: 'Updated Title',
          browserUrl: 'https://new.com'
        })
      })

      const tab = result.current.browserTabs.find((t) => t.id === tabId)
      expect(tab.title).toBe('Updated Title')
      expect(tab.browserUrl).toBe('https://new.com')
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
