import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAppStore } from '@renderer/store/app-store'
import { BrowserNotesPanel } from '@renderer/components/BrowserNotesPanel'

describe('Browser Notes Integration Flow', () => {
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

    // Setup window.api mocks
    window.api = {
      extractInfo: vi.fn().mockResolvedValue([
        {
          title: 'Test Video',
          url: 'https://example.com/video',
          type: 'video',
          thumbnail: 'https://example.com/thumb.jpg'
        }
      ]),
      addDownload: vi.fn().mockReturnValue('download-123'),
      on: vi.fn(() => vi.fn()),
      off: vi.fn(),
      listLibrary: vi.fn().mockResolvedValue([]),
      updateBullets: vi.fn().mockResolvedValue({}),
      generateSummary: vi.fn().mockResolvedValue({
        summary: 'AI generated summary'
      }),
      playFile: vi.fn().mockResolvedValue({}),
      getAllDownloads: vi.fn().mockResolvedValue([]),
      readConfig: vi.fn().mockResolvedValue({ outputFolder: '', maxConcurrent: 3 }),
      onQueueUpdated: vi.fn(() => vi.fn()),
      onProgress: vi.fn(() => vi.fn()),
      onCompleted: vi.fn(() => vi.fn()),
      onFailed: vi.fn(() => vi.fn()),
      onLogEntry: vi.fn(() => vi.fn())
    }
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('Download click → stub created → notes panel shows → completion updates filename', async () => {
    const { result: storeResult } = renderHook(() => useAppStore())
    const { rerender } = render(<BrowserNotesPanel />)

    // Initially, no active chapter
    expect(screen.getByText(/Click Remember or Download to start notes/i)).toBeInTheDocument()

    // Simulate IPC event: notes stub created (Download button clicked)
    act(() => {
      storeResult.current.setBrowserActiveChapter({
        notesPath: '/path/to/notes.md',
        chapter: {
          filePath: null,
          title: 'Test Video',
          url: 'https://example.com/video',
          downloadedAt: '2026-03-29',
          summary: '',
          bullets: []
        }
      })
    })

    // Verify Notes panel shows the chapter with title
    await waitFor(() => {
      expect(screen.getByText('Test Video')).toBeInTheDocument()
    })

    // Verify URL is displayed
    expect(screen.getByText(/example\.com/)).toBeInTheDocument()

    // Verify filename is not yet available (still null)
    expect(screen.queryByText(/📁 null/)).not.toBeInTheDocument()

    // Simulate download completion with real filename
    act(() => {
      storeResult.current.setBrowserActiveChapter({
        notesPath: '/path/to/notes.md',
        chapter: {
          filePath: 'test-video.mp4',
          title: 'Test Video',
          url: 'https://example.com/video',
          downloadedAt: '2026-03-29',
          summary: '',
          bullets: []
        }
      })
    })

    // Verify filename is now visible
    await waitFor(() => {
      expect(screen.getByText(/test-video\.mp4/)).toBeInTheDocument()
    })
  })

  it('User can type notes before download completes (no lost edits)', async () => {
    const { result } = renderHook(() => useAppStore())
    act(() => {
      result.current.setBrowserActiveChapter({
        notesPath: '/path/to/notes.md',
        chapter: {
          filePath: null,
          title: 'Test Video',
          url: 'https://example.com/video',
          downloadedAt: '2026-03-29',
          summary: '',
          bullets: []
        }
      })
    })

    render(<BrowserNotesPanel />)

    // Verify title is displayed
    expect(screen.getByText('Test Video')).toBeInTheDocument()

    // User clicks "✎ Edit" button
    const editButton = screen.getByRole('button', { name: /✎ Edit/i })
    fireEvent.click(editButton)

    // User types some notes
    const textarea = screen.getByPlaceholderText(/One note per line/i)
    fireEvent.change(textarea, { target: { value: 'Important content' } })
    expect(textarea.value).toBe('Important content')

    // Simulate download completion with real filename while user is editing
    act(() => {
      result.current.setBrowserActiveChapter({
        notesPath: '/path/to/notes.md',
        chapter: {
          filePath: 'test-video.mp4',
          title: 'Test Video',
          url: 'https://example.com/video',
          downloadedAt: '2026-03-29',
          summary: '',
          bullets: []
        }
      })
    })

    // Verify filename updated
    await waitFor(() => {
      expect(screen.getByText(/test-video\.mp4/)).toBeInTheDocument()
    })

    // Verify user's edits in textarea are still there (not overwritten)
    const updatedTextarea = screen.getByPlaceholderText(/One note per line/i)
    expect(updatedTextarea.value).toBe('Important content')
  })

  it('AI summary arrives while user editing bullets — no conflict', async () => {
    const { result } = renderHook(() => useAppStore())
    act(() => {
      result.current.setBrowserActiveChapter({
        notesPath: '/path/to/notes.md',
        chapter: {
          filePath: 'video.mp4',
          title: 'Test Video',
          url: 'https://example.com/video',
          downloadedAt: '2026-03-29',
          summary: '',
          bullets: []
        }
      })
    })

    render(<BrowserNotesPanel />)

    // User clicks "✎ Edit"
    const editButton = screen.getByRole('button', { name: /✎ Edit/i })
    fireEvent.click(editButton)

    // User starts typing notes
    const textarea = screen.getByPlaceholderText(/One note per line/i)
    fireEvent.change(textarea, { target: { value: 'User notes here' } })
    expect(textarea.value).toBe('User notes here')

    // Simulate AI summary completion (new summary arrives via IPC)
    act(() => {
      result.current.setBrowserActiveChapter({
        notesPath: '/path/to/notes.md',
        chapter: {
          filePath: 'video.mp4',
          title: 'Test Video',
          url: 'https://example.com/video',
          downloadedAt: '2026-03-29',
          summary: 'AI generated summary of the video content',
          bullets: []
        }
      })
    })

    // Verify summary is updated
    await waitFor(() => {
      expect(screen.getByText(/AI generated summary of the video content/)).toBeInTheDocument()
    })

    // Verify user's bullet text is NOT replaced
    const updatedTextarea = screen.getByPlaceholderText(/One note per line/i)
    expect(updatedTextarea.value).toBe('User notes here')
  })

  it('User can save bullets and they persist through chapter updates', async () => {
    const { result } = renderHook(() => useAppStore())
    act(() => {
      result.current.setBrowserActiveChapter({
        notesPath: '/path/to/notes.md',
        chapter: {
          filePath: 'video.mp4',
          title: 'Test Video',
          url: 'https://example.com/video',
          downloadedAt: '2026-03-29',
          summary: '',
          bullets: []
        }
      })
    })

    render(<BrowserNotesPanel />)

    // User edits bullets
    const editButton = screen.getByRole('button', { name: /✎ Edit/i })
    fireEvent.click(editButton)

    const textarea = screen.getByPlaceholderText(/One note per line/i)
    fireEvent.change(textarea, { target: { value: '- First point\n- Second point' } })

    // User clicks Save
    const saveButton = screen.getByRole('button', { name: /Save/i })
    fireEvent.click(saveButton)

    // Verify updateBullets was called with correct bullets
    await waitFor(() => {
      expect(window.api.updateBullets).toHaveBeenCalledWith('video.mp4', [
        'First point',
        'Second point'
      ])
    })

    // Simulate IPC event with saved bullets
    act(() => {
      result.current.setBrowserActiveChapter({
        notesPath: '/path/to/notes.md',
        chapter: {
          filePath: 'video.mp4',
          title: 'Test Video',
          url: 'https://example.com/video',
          downloadedAt: '2026-03-29',
          summary: '',
          bullets: ['First point', 'Second point']
        }
      })
    })

    // Verify bullets are displayed
    await waitFor(() => {
      expect(screen.getByText('First point')).toBeInTheDocument()
      expect(screen.getByText('Second point')).toBeInTheDocument()
    })
  })

  it('Play button calls playFile API with correct filePath', async () => {
    const { result } = renderHook(() => useAppStore())
    act(() => {
      result.current.setBrowserActiveChapter({
        notesPath: '/path/to/notes.md',
        chapter: {
          filePath: 'video.mp4',
          title: 'Test Video',
          url: 'https://example.com/video',
          downloadedAt: '2026-03-29',
          summary: '',
          bullets: []
        }
      })
    })

    render(<BrowserNotesPanel />)

    // User clicks Play button (▶ Play)
    const playButton = screen.getByRole('button', { name: /▶ Play/i })
    fireEvent.click(playButton)

    // Verify playFile was called with the correct filePath
    expect(window.api.playFile).toHaveBeenCalledWith('video.mp4')
  })

  it('Generate Summary button triggers summary generation', async () => {
    const { result } = renderHook(() => useAppStore())
    act(() => {
      result.current.setBrowserActiveChapter({
        notesPath: '/path/to/notes.md',
        chapter: {
          filePath: 'video.mp4',
          title: 'Test Video',
          url: 'https://example.com/video',
          downloadedAt: '2026-03-29',
          summary: '',
          bullets: []
        }
      })
    })

    render(<BrowserNotesPanel />)

    // User clicks Generate Summary button
    const generateButton = screen.getByRole('button', { name: /Generate Summary/i })
    fireEvent.click(generateButton)

    // Verify generateSummary was called
    expect(window.api.generateSummary).toHaveBeenCalledWith('video.mp4')

    // Simulate the summary update from IPC
    act(() => {
      result.current.setBrowserActiveChapter({
        notesPath: '/path/to/notes.md',
        chapter: {
          filePath: 'video.mp4',
          title: 'Test Video',
          url: 'https://example.com/video',
          downloadedAt: '2026-03-29',
          summary: 'AI generated summary',
          bullets: []
        }
      })
    })

    // Wait for the summary to appear
    await waitFor(() => {
      expect(screen.getByText(/AI generated summary/)).toBeInTheDocument()
    })
  })
})
