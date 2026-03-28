import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/renderer/src/store/app-store.js', () => {
  const state = {
    activeNotesFolder: null,
    activeNotesChapter: null,
    libraryFiles: [],
    setActiveNotesFolder: vi.fn(),
    setActiveNotesChapter: vi.fn(),
    setActiveTab: vi.fn(),
    setLibrarySelectedFile: vi.fn(),
  }
  return { useAppStore: vi.fn(selector => selector ? selector(state) : state) }
})

const mockApi = {
  listFolders: vi.fn(async () => ['Travel', 'Cooking']),
  readNotes: vi.fn(async () => ({
    title: 'Library',
    chapters: [{
      file: 'video.mp4', url: 'https://youtube.com/watch?v=1',
      downloadedAt: '2026-03-28', heading: 'My Video',
      summary: 'Great content.', bullets: ['key point'],
    }]
  })),
  generateSummary: vi.fn(async () => ({ summary: 'New summary' })),
  updateBullets: vi.fn(),
}
window.api = mockApi

import NotesTab from '../../src/renderer/src/components/NotesTab.jsx'

beforeEach(() => vi.clearAllMocks())

describe('NotesTab', () => {
  it('renders folder list and root entry', async () => {
    render(<NotesTab />)
    await waitFor(() => expect(screen.getByText('(Library)')).toBeTruthy())
    expect(screen.getByText('Travel')).toBeTruthy()
    expect(screen.getByText('Cooking')).toBeTruthy()
  })

  it('renders chapter heading and summary', async () => {
    render(<NotesTab />)
    await waitFor(() => expect(screen.getByText('My Video')).toBeTruthy())
    expect(screen.getByText('Great content.')).toBeTruthy()
  })

  it('renders bullet points', async () => {
    render(<NotesTab />)
    await waitFor(() => expect(screen.getByText('key point')).toBeTruthy())
  })

  it('shows Edit button and textarea on click', async () => {
    render(<NotesTab />)
    await waitFor(() => screen.getByText('✎ Edit'))
    fireEvent.click(screen.getByText('✎ Edit'))
    expect(screen.getByRole('textbox')).toBeTruthy()
  })
})
