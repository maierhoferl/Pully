import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { useAppStore } from '@renderer/store/app-store'

describe('useAppStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    const { result } = renderHook(() => useAppStore())
    result.current.setActiveTab('browser')
    result.current.setSettingsOpen(false)
    result.current.setConfig({ outputFolder: '', maxConcurrent: 3 })
    result.current.setDownloads([])
    result.current.setCurrentBrowserUrl(null)
    result.current.startMediaScan()
    result.current.setLibraryFiles([])
    result.current.setLibrarySort('date', 'desc')
    result.current.setLibrarySearch('')
    result.current.setActiveNotesFolder(null)
    result.current.setActiveNotesChapter(null)
    result.current.setLibrarySelectedFile(null)
    result.current.setBrowserActiveChapter(null)
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
})
