import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.hoisted ensures mockState is available inside the vi.mock factory
const mockState = vi.hoisted(() => ({
  mediaScanResults: null,
  mediaScanLoading: false,
  currentBrowserUrl: 'https://example.com',
  startMediaScan: vi.fn(),
  setMediaScanResults: vi.fn(),
  downloads: [],
}))

vi.mock('@renderer/store/app-store.js', () => ({
  useAppStore: vi.fn(selector => selector ? selector(mockState) : mockState),
}))

window.api = {
  addDownload: vi.fn(async () => 'dl-1'),
  rememberMedia: vi.fn(async () => ({ alreadyExists: false })),
}

import { MediaPanel } from '@renderer/components/MediaPanel.jsx'

const baseEntry = {
  id: 'vid1',
  title: 'My Video Title',
  url: 'https://example.com/vid1',
  webpage_url: 'https://example.com/vid1',
  formats: [
    { format_id: 'f1', height: 1080, ext: 'mp4', filesize: null },
    { format_id: 'f2', height: 720, ext: 'mp4', filesize: null },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  mockState.mediaScanResults = null
  mockState.mediaScanLoading = false
  mockState.downloads = []
})

describe('MediaEntry type indicator', () => {
  it('shows "Single video" when playlist_id is absent', () => {
    mockState.mediaScanResults = [baseEntry]
    render(<MediaPanel />)
    expect(screen.getByText('Single video')).toBeTruthy()
  })

  it('shows "Playlist" when playlist_id is present', () => {
    mockState.mediaScanResults = [{ ...baseEntry, playlist_id: 'PL123', playlist_title: 'My Playlist' }]
    render(<MediaPanel />)
    expect(screen.getByText('Playlist')).toBeTruthy()
  })

  it('renders entry title', () => {
    mockState.mediaScanResults = [baseEntry]
    render(<MediaPanel />)
    expect(screen.getByText('My Video Title')).toBeTruthy()
  })

  it('renders quality options from formats', () => {
    mockState.mediaScanResults = [baseEntry]
    render(<MediaPanel />)
    expect(screen.getByText('1080p mp4')).toBeTruthy()
    expect(screen.getByText('720p mp4')).toBeTruthy()
  })
})
