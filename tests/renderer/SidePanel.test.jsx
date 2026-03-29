import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import SidePanel from '@renderer/components/SidePanel'
import { useAppStore } from '@renderer/store/app-store'

// Mock the child components
vi.mock('@renderer/components/MediaPanel', () => ({
  MediaPanel: () => <div data-testid="media-panel">MediaPanel</div>
}))

vi.mock('@renderer/components/ProgressPanel', () => ({
  default: () => <div data-testid="progress-panel">ProgressPanel</div>
}))

vi.mock('@renderer/components/BrowserNotesPanel', () => ({
  BrowserNotesPanel: () => <div data-testid="browser-notes-panel">BrowserNotesPanel</div>
}))

describe('SidePanel', () => {
  beforeEach(() => {
    // Reset store state before each test
    const store = useAppStore.getState()
    store.setBrowserActiveChapter(null)
    store.setDownloads([])
  })

  it('renders MediaPanel in top pane', () => {
    render(<SidePanel />)
    expect(screen.getByTestId('media-panel')).toBeInTheDocument()
  })

  it('renders both Notes and Progress tab buttons', () => {
    render(<SidePanel />)
    expect(screen.getByRole('button', { name: /Notes/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Progress/i })).toBeInTheDocument()
  })

  it('renders BrowserNotesPanel by default (Notes tab active)', () => {
    render(<SidePanel />)
    expect(screen.getByTestId('browser-notes-panel')).toBeInTheDocument()
    expect(screen.queryByTestId('progress-panel')).not.toBeInTheDocument()
  })

  it('Notes tab is selected by default', () => {
    render(<SidePanel />)
    const notesButton = screen.getByRole('button', { name: /Notes/i })
    expect(notesButton).toHaveClass('text-blue-600')
  })

  it('switches to ProgressPanel when Progress tab is clicked', () => {
    render(<SidePanel />)
    const progressButton = screen.getByRole('button', { name: /Progress/i })

    fireEvent.click(progressButton)

    expect(screen.queryByTestId('browser-notes-panel')).not.toBeInTheDocument()
    expect(screen.getByTestId('progress-panel')).toBeInTheDocument()
  })

  it('switches back to BrowserNotesPanel when Notes tab is clicked after Progress', () => {
    render(<SidePanel />)
    const notesButton = screen.getByRole('button', { name: /Notes/i })
    const progressButton = screen.getByRole('button', { name: /Progress/i })

    // Click Progress
    fireEvent.click(progressButton)
    expect(screen.getByTestId('progress-panel')).toBeInTheDocument()

    // Click Notes
    fireEvent.click(notesButton)
    expect(screen.getByTestId('browser-notes-panel')).toBeInTheDocument()
    expect(screen.queryByTestId('progress-panel')).not.toBeInTheDocument()
  })

  it('Progress tab button has blue styling when active', () => {
    render(<SidePanel />)
    const progressButton = screen.getByRole('button', { name: /Progress/i })

    fireEvent.click(progressButton)

    expect(progressButton).toHaveClass('text-blue-600')
  })

  it('Notes tab button loses blue styling when Progress tab is active', () => {
    render(<SidePanel />)
    const notesButton = screen.getByRole('button', { name: /Notes/i })
    const progressButton = screen.getByRole('button', { name: /Progress/i })

    fireEvent.click(progressButton)

    expect(notesButton).not.toHaveClass('text-blue-600')
    expect(notesButton).toHaveClass('text-gray-600')
  })

  it('can toggle between tabs multiple times', () => {
    render(<SidePanel />)
    const notesButton = screen.getByRole('button', { name: /Notes/i })
    const progressButton = screen.getByRole('button', { name: /Progress/i })

    // Start on Notes
    expect(screen.getByTestId('browser-notes-panel')).toBeInTheDocument()

    // Switch to Progress
    fireEvent.click(progressButton)
    expect(screen.getByTestId('progress-panel')).toBeInTheDocument()

    // Switch back to Notes
    fireEvent.click(notesButton)
    expect(screen.getByTestId('browser-notes-panel')).toBeInTheDocument()

    // Switch to Progress again
    fireEvent.click(progressButton)
    expect(screen.getByTestId('progress-panel')).toBeInTheDocument()
  })
})
