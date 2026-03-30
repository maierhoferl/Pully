import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { BrowserNotesPanel } from '@renderer/components/BrowserNotesPanel'
import { useAppStore } from '@renderer/store/app-store'

vi.mock('@renderer/components/ChapterCard', () => ({
  ChapterCard: ({ chapter }) => (
    <div data-testid="chapter-card">Mock ChapterCard: {chapter.title}</div>
  )
}))

describe('BrowserNotesPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Reset store state
    const { renderHook } = require('@testing-library/react')
    const { result } = renderHook(() => useAppStore())
    const tabId = result.current.activeBrowserTabId
    result.current.updateBrowserTab(tabId, { browserActiveChapter: null })

    // Setup window.api mocks
    window.api = {
      updateBullets: vi.fn(() => Promise.resolve()),
      generateSummary: vi.fn(() => Promise.resolve({ summary: 'Generated summary' })),
      playVideo: vi.fn(() => Promise.resolve())
    }
  })

  it('renders empty state when no chapter is active', () => {
    render(<BrowserNotesPanel />)

    expect(screen.getByText(/Click Remember or Download to start notes/)).toBeInTheDocument()
  })

  it('renders ChapterCard when chapter is active', () => {
    const { renderHook } = require('@testing-library/react')
    const { result } = renderHook(() => useAppStore())

    const mockChapter = {
      notesPath: '/path/to/notes.md',
      chapter: {
        filePath: 'video.mp4',
        title: 'My Video',
        url: 'https://example.com',
        downloadedAt: '2026-03-29',
        summary: 'Summary',
        bullets: []
      }
    }

    result.current.updateBrowserTab(result.current.activeBrowserTabId, {
      browserActiveChapter: mockChapter
    })

    render(<BrowserNotesPanel />)

    expect(screen.getByTestId('chapter-card')).toBeInTheDocument()
    expect(screen.getByText('Mock ChapterCard: My Video')).toBeInTheDocument()
  })

  it('passes chapter data to ChapterCard component', () => {
    const { renderHook } = require('@testing-library/react')
    const { result } = renderHook(() => useAppStore())

    const mockChapter = {
      notesPath: '/path/to/notes.md',
      chapter: {
        filePath: 'test-video.mp4',
        title: 'Test Chapter',
        url: 'https://example.com/test',
        downloadedAt: '2026-03-28',
        summary: 'Test summary',
        bullets: ['bullet 1', 'bullet 2']
      }
    }

    result.current.updateBrowserTab(result.current.activeBrowserTabId, {
      browserActiveChapter: mockChapter
    })

    render(<BrowserNotesPanel />)

    expect(screen.getByText('Mock ChapterCard: Test Chapter')).toBeInTheDocument()
  })

  it('has scrollable container for panel content', () => {
    const { renderHook } = require('@testing-library/react')
    const { result } = renderHook(() => useAppStore())

    const mockChapter = {
      notesPath: '/path/to/notes.md',
      chapter: {
        filePath: 'video.mp4',
        title: 'My Video',
        url: 'https://example.com',
        downloadedAt: '2026-03-29',
        summary: 'Summary',
        bullets: []
      }
    }

    result.current.updateBrowserTab(result.current.activeBrowserTabId, {
      browserActiveChapter: mockChapter
    })

    const { container } = render(<BrowserNotesPanel />)

    const scrollableDiv = container.querySelector('.overflow-y-auto')
    expect(scrollableDiv).toBeTruthy()
  })
})
