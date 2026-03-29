import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ChapterCard } from '@renderer/components/ChapterCard.jsx'

const mockLibraryFiles = [
  {
    name: 'video.mp4',
    path: '/output/video.mp4',
    folder: null,
    title: 'Chapter 1: Introduction'
  }
]

vi.mock('@renderer/store/app-store.js', () => {
  const mockUseAppStore = vi.fn((selector) => {
    const state = { libraryFiles: mockLibraryFiles }
    if (selector) {
      return selector(state)
    }
    return state
  })
  mockUseAppStore.getState = vi.fn(() => ({ libraryFiles: mockLibraryFiles }))
  return { useAppStore: mockUseAppStore }
})

describe('ChapterCard', () => {
  const mockChapter = {
    filePath: 'video.mp4',
    title: 'Chapter 1: Introduction',
    url: 'https://example.com/video',
    downloadedAt: '2026-03-28',
    summary: 'This is a test summary.',
    bullets: ['Point 1', 'Point 2', 'Point 3']
  }

  const mockHandlers = {
    onGenerateSummary: vi.fn(async () => ({ summary: 'Generated summary' })),
    onUpdateBullets: vi.fn(),
    onPlay: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders chapter title', () => {
    render(
      <ChapterCard
        chapter={mockChapter}
        folderName={null}
        onGenerateSummary={mockHandlers.onGenerateSummary}
        onUpdateBullets={mockHandlers.onUpdateBullets}
        onPlay={mockHandlers.onPlay}
      />
    )
    expect(screen.getByText('Chapter 1: Introduction')).toBeTruthy()
  })

  it('renders file path', () => {
    render(
      <ChapterCard
        chapter={mockChapter}
        folderName={null}
        onGenerateSummary={mockHandlers.onGenerateSummary}
        onUpdateBullets={mockHandlers.onUpdateBullets}
        onPlay={mockHandlers.onPlay}
      />
    )
    expect(screen.getByText(/📁 video.mp4/)).toBeTruthy()
  })

  it('renders URL with safe hostname', () => {
    render(
      <ChapterCard
        chapter={mockChapter}
        folderName={null}
        onGenerateSummary={mockHandlers.onGenerateSummary}
        onUpdateBullets={mockHandlers.onUpdateBullets}
        onPlay={mockHandlers.onPlay}
      />
    )
    const link = screen.getByText('example.com')
    expect(link).toBeTruthy()
    expect(link.getAttribute('href')).toBe('https://example.com/video')
  })

  it('renders downloaded date', () => {
    render(
      <ChapterCard
        chapter={mockChapter}
        folderName={null}
        onGenerateSummary={mockHandlers.onGenerateSummary}
        onUpdateBullets={mockHandlers.onUpdateBullets}
        onPlay={mockHandlers.onPlay}
      />
    )
    expect(screen.getByText(/📅 2026-03-28/)).toBeTruthy()
  })

  it('renders AI summary section with summary text', () => {
    render(
      <ChapterCard
        chapter={mockChapter}
        folderName={null}
        onGenerateSummary={mockHandlers.onGenerateSummary}
        onUpdateBullets={mockHandlers.onUpdateBullets}
        onPlay={mockHandlers.onPlay}
      />
    )
    expect(screen.getByText('AI Summary')).toBeTruthy()
    expect(screen.getByText('This is a test summary.')).toBeTruthy()
  })

  it('shows "Regenerate" button when summary exists', () => {
    render(
      <ChapterCard
        chapter={mockChapter}
        folderName={null}
        onGenerateSummary={mockHandlers.onGenerateSummary}
        onUpdateBullets={mockHandlers.onUpdateBullets}
        onPlay={mockHandlers.onPlay}
      />
    )
    expect(screen.getByText('↻ Regenerate')).toBeTruthy()
  })

  it('shows "Generate Summary" button when no summary exists', () => {
    const chapterNoSummary = { ...mockChapter, summary: '' }
    render(
      <ChapterCard
        chapter={chapterNoSummary}
        onGenerateSummary={mockHandlers.onGenerateSummary}
        onUpdateBullets={mockHandlers.onUpdateBullets}
        onPlay={mockHandlers.onPlay}
      />
    )
    expect(screen.getByText('Generate Summary')).toBeTruthy()
  })

  it('calls onGenerateSummary when Generate Summary button is clicked', async () => {
    render(
      <ChapterCard
        chapter={mockChapter}
        folderName={null}
        onGenerateSummary={mockHandlers.onGenerateSummary}
        onUpdateBullets={mockHandlers.onUpdateBullets}
        onPlay={mockHandlers.onPlay}
      />
    )
    fireEvent.click(screen.getByText('↻ Regenerate'))
    await waitFor(() => {
      expect(mockHandlers.onGenerateSummary).toHaveBeenCalledWith('video.mp4')
    })
  })

  it('updates local summary after generation', async () => {
    render(
      <ChapterCard
        chapter={mockChapter}
        folderName={null}
        onGenerateSummary={mockHandlers.onGenerateSummary}
        onUpdateBullets={mockHandlers.onUpdateBullets}
        onPlay={mockHandlers.onPlay}
      />
    )
    fireEvent.click(screen.getByText('↻ Regenerate'))
    await waitFor(() => {
      expect(screen.getByText('Generated summary')).toBeTruthy()
    })
  })

  it('shows error message when summary generation fails', async () => {
    const failingHandler = vi.fn(async () => {
      throw new Error('Network error')
    })
    render(
      <ChapterCard
        chapter={mockChapter}
        onGenerateSummary={failingHandler}
        onUpdateBullets={mockHandlers.onUpdateBullets}
        onPlay={mockHandlers.onPlay}
      />
    )
    fireEvent.click(screen.getByText('↻ Regenerate'))
    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeTruthy()
    })
  })

  it('shows Retry button when summary generation fails', async () => {
    const failingHandler = vi.fn(async () => {
      throw new Error('Network error')
    })
    render(
      <ChapterCard
        chapter={mockChapter}
        onGenerateSummary={failingHandler}
        onUpdateBullets={mockHandlers.onUpdateBullets}
        onPlay={mockHandlers.onPlay}
      />
    )
    fireEvent.click(screen.getByText('↻ Regenerate'))
    await waitFor(() => {
      expect(screen.getByText('Retry')).toBeTruthy()
    })
  })

  it('renders My Notes section with bullet points', () => {
    render(
      <ChapterCard
        chapter={mockChapter}
        folderName={null}
        onGenerateSummary={mockHandlers.onGenerateSummary}
        onUpdateBullets={mockHandlers.onUpdateBullets}
        onPlay={mockHandlers.onPlay}
      />
    )
    expect(screen.getByText('My Notes')).toBeTruthy()
    expect(screen.getByText('Point 1')).toBeTruthy()
    expect(screen.getByText('Point 2')).toBeTruthy()
    expect(screen.getByText('Point 3')).toBeTruthy()
  })

  it('shows Edit button in view mode', () => {
    render(
      <ChapterCard
        chapter={mockChapter}
        folderName={null}
        onGenerateSummary={mockHandlers.onGenerateSummary}
        onUpdateBullets={mockHandlers.onUpdateBullets}
        onPlay={mockHandlers.onPlay}
      />
    )
    expect(screen.getByText('✎ Edit')).toBeTruthy()
  })

  it('shows textarea and buttons when Edit is clicked', () => {
    render(
      <ChapterCard
        chapter={mockChapter}
        folderName={null}
        onGenerateSummary={mockHandlers.onGenerateSummary}
        onUpdateBullets={mockHandlers.onUpdateBullets}
        onPlay={mockHandlers.onPlay}
      />
    )
    fireEvent.click(screen.getByText('✎ Edit'))
    expect(screen.getByRole('textbox')).toBeTruthy()
    expect(screen.getByText('Save')).toBeTruthy()
    expect(screen.getByText('Cancel')).toBeTruthy()
  })

  it('populates textarea with bullets separated by newlines', () => {
    render(
      <ChapterCard
        chapter={mockChapter}
        folderName={null}
        onGenerateSummary={mockHandlers.onGenerateSummary}
        onUpdateBullets={mockHandlers.onUpdateBullets}
        onPlay={mockHandlers.onPlay}
      />
    )
    fireEvent.click(screen.getByText('✎ Edit'))
    const textarea = screen.getByRole('textbox')
    expect(textarea.value).toBe('Point 1\nPoint 2\nPoint 3')
  })

  it('allows editing the textarea content', () => {
    render(
      <ChapterCard
        chapter={mockChapter}
        folderName={null}
        onGenerateSummary={mockHandlers.onGenerateSummary}
        onUpdateBullets={mockHandlers.onUpdateBullets}
        onPlay={mockHandlers.onPlay}
      />
    )
    fireEvent.click(screen.getByText('✎ Edit'))
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'New point 1\nNew point 2' } })
    expect(textarea.value).toBe('New point 1\nNew point 2')
  })

  it('calls onUpdateBullets with parsed bullets when Save is clicked', async () => {
    render(
      <ChapterCard
        chapter={mockChapter}
        folderName={null}
        onGenerateSummary={mockHandlers.onGenerateSummary}
        onUpdateBullets={mockHandlers.onUpdateBullets}
        onPlay={mockHandlers.onPlay}
      />
    )
    fireEvent.click(screen.getByText('✎ Edit'))
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'New point 1\nNew point 2' } })
    fireEvent.click(screen.getByText('Save'))
    expect(mockHandlers.onUpdateBullets).toHaveBeenCalledWith('video.mp4', [
      'New point 1',
      'New point 2'
    ])
  })

  it('removes leading dashes from bullets when saving', async () => {
    render(
      <ChapterCard
        chapter={mockChapter}
        folderName={null}
        onGenerateSummary={mockHandlers.onGenerateSummary}
        onUpdateBullets={mockHandlers.onUpdateBullets}
        onPlay={mockHandlers.onPlay}
      />
    )
    fireEvent.click(screen.getByText('✎ Edit'))
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: '- Point 1\n- Point 2' } })
    fireEvent.click(screen.getByText('Save'))
    expect(mockHandlers.onUpdateBullets).toHaveBeenCalledWith('video.mp4', ['Point 1', 'Point 2'])
  })

  it('closes editing mode after Save is clicked', async () => {
    render(
      <ChapterCard
        chapter={mockChapter}
        folderName={null}
        onGenerateSummary={mockHandlers.onGenerateSummary}
        onUpdateBullets={mockHandlers.onUpdateBullets}
        onPlay={mockHandlers.onPlay}
      />
    )
    fireEvent.click(screen.getByText('✎ Edit'))
    expect(screen.getByRole('textbox')).toBeTruthy()
    fireEvent.click(screen.getByText('Save'))
    expect(screen.queryByRole('textbox')).toBeFalsy()
    expect(screen.getByText('✎ Edit')).toBeTruthy()
  })

  it('restores original bullets when Cancel is clicked', () => {
    render(
      <ChapterCard
        chapter={mockChapter}
        folderName={null}
        onGenerateSummary={mockHandlers.onGenerateSummary}
        onUpdateBullets={mockHandlers.onUpdateBullets}
        onPlay={mockHandlers.onPlay}
      />
    )
    fireEvent.click(screen.getByText('✎ Edit'))
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'Completely different' } })
    fireEvent.click(screen.getByText('Cancel'))
    expect(mockHandlers.onUpdateBullets).not.toHaveBeenCalled()
    expect(screen.getByText('Point 1')).toBeTruthy()
  })

  it('closes editing mode after Cancel is clicked', () => {
    render(
      <ChapterCard
        chapter={mockChapter}
        folderName={null}
        onGenerateSummary={mockHandlers.onGenerateSummary}
        onUpdateBullets={mockHandlers.onUpdateBullets}
        onPlay={mockHandlers.onPlay}
      />
    )
    fireEvent.click(screen.getByText('✎ Edit'))
    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.queryByRole('textbox')).toBeFalsy()
    expect(screen.getByText('✎ Edit')).toBeTruthy()
  })

  it('renders "No notes yet" message when bullets list is empty', () => {
    const chapterNoBullets = { ...mockChapter, bullets: [] }
    render(
      <ChapterCard
        chapter={chapterNoBullets}
        folderName={null}
        onGenerateSummary={mockHandlers.onGenerateSummary}
        onUpdateBullets={mockHandlers.onUpdateBullets}
        onPlay={mockHandlers.onPlay}
      />
    )
    expect(screen.getByText('No notes yet.')).toBeTruthy()
  })

  it('calls onPlay with file object when heading is clicked', () => {
    render(
      <ChapterCard
        chapter={mockChapter}
        folderName={null}
        onGenerateSummary={mockHandlers.onGenerateSummary}
        onUpdateBullets={mockHandlers.onUpdateBullets}
        onPlay={mockHandlers.onPlay}
      />
    )
    fireEvent.click(screen.getByText('Chapter 1: Introduction'))

    expect(mockHandlers.onPlay).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'video.mp4',
        path: '/output/video.mp4',
        title: 'Chapter 1: Introduction'
      })
    )
  })

  it('does not render URL section when url is not provided', () => {
    const chapterNoUrl = { ...mockChapter, url: null }
    render(
      <ChapterCard
        chapter={chapterNoUrl}
        onGenerateSummary={mockHandlers.onGenerateSummary}
        onUpdateBullets={mockHandlers.onUpdateBullets}
        onPlay={mockHandlers.onPlay}
      />
    )
    expect(screen.queryByText(/🔗/)).toBeFalsy()
  })

  it('does not render download date when downloadedAt is not provided', () => {
    const chapterNoDate = { ...mockChapter, downloadedAt: null }
    render(
      <ChapterCard
        chapter={chapterNoDate}
        onGenerateSummary={mockHandlers.onGenerateSummary}
        onUpdateBullets={mockHandlers.onUpdateBullets}
        onPlay={mockHandlers.onPlay}
      />
    )
    expect(screen.queryByText(/📅/)).toBeFalsy()
  })

  it('shows "No summary yet" message when summary is empty', () => {
    const chapterNoSummary = { ...mockChapter, summary: '' }
    render(
      <ChapterCard
        chapter={chapterNoSummary}
        onGenerateSummary={mockHandlers.onGenerateSummary}
        onUpdateBullets={mockHandlers.onUpdateBullets}
        onPlay={mockHandlers.onPlay}
      />
    )
    expect(screen.getByText('No summary yet.')).toBeTruthy()
  })

  it('updates bullet text when chapter.bullets prop changes', async () => {
    const { rerender } = render(
      <ChapterCard
        chapter={mockChapter}
        folderName={null}
        onGenerateSummary={mockHandlers.onGenerateSummary}
        onUpdateBullets={mockHandlers.onUpdateBullets}
        onPlay={mockHandlers.onPlay}
      />
    )

    fireEvent.click(screen.getByText('✎ Edit'))
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'Modified text' } })

    // Re-render with updated chapter (simulating prop change)
    const updatedChapter = { ...mockChapter, bullets: ['Point 1', 'Point 2', 'Point 3'] }
    rerender(
      <ChapterCard
        chapter={updatedChapter}
        onGenerateSummary={mockHandlers.onGenerateSummary}
        onUpdateBullets={mockHandlers.onUpdateBullets}
        onPlay={mockHandlers.onPlay}
      />
    )

    // Exit edit mode and re-enter to verify bullets synced
    fireEvent.click(screen.getByText('Cancel'))
    fireEvent.click(screen.getByText('✎ Edit'))
    const newTextarea = screen.getByRole('textbox')
    expect(newTextarea.value).toBe('Point 1\nPoint 2\nPoint 3')
  })

  it('updates local summary when chapter.summary prop changes', async () => {
    const chapterNoSummary = { ...mockChapter, summary: '' }
    const { rerender } = render(
      <ChapterCard
        chapter={chapterNoSummary}
        onGenerateSummary={mockHandlers.onGenerateSummary}
        onUpdateBullets={mockHandlers.onUpdateBullets}
        onPlay={mockHandlers.onPlay}
      />
    )

    expect(screen.getByText('No summary yet.')).toBeTruthy()

    // Update chapter with new summary
    const updatedChapter = { ...chapterNoSummary, summary: 'Updated summary' }
    rerender(
      <ChapterCard
        chapter={updatedChapter}
        onGenerateSummary={mockHandlers.onGenerateSummary}
        onUpdateBullets={mockHandlers.onUpdateBullets}
        onPlay={mockHandlers.onPlay}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Updated summary')).toBeTruthy()
      expect(screen.queryByText('No summary yet.')).toBeFalsy()
    })
  })
})
