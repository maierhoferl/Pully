import React from 'react'
import { render, screen } from '@testing-library/react'
import { useAppStore } from '../store/app-store.js'
import SidePanel from './SidePanel.jsx'
import { describe, test, expect, afterEach, vi } from 'vitest'

// Stub heavy sub-components
vi.mock('./MediaPanel.jsx', () => ({
  MediaPanel: () => <div data-testid="media-panel">MediaPanel</div>
}))
vi.mock('./ProgressPanel.jsx', () => ({
  default: () => <div data-testid="progress-panel">ProgressPanel</div>
}))
vi.mock('./BrowserNotesPanel.jsx', () => ({
  BrowserNotesPanel: () => <div data-testid="browser-notes-panel">BrowserNotesPanel</div>
}))

afterEach(() => {
  useAppStore.setState({ mediaScanResults: null, mediaScanLoading: false })
})

describe('SidePanel', () => {
  test('renders MediaPanel', () => {
    render(<SidePanel />)
    expect(screen.getByTestId('media-panel')).toBeInTheDocument()
  })

  test('renders BrowserNotesPanel by default', () => {
    render(<SidePanel />)
    expect(screen.getByTestId('browser-notes-panel')).toBeInTheDocument()
  })

  test('renders a drag handle between the two panels', () => {
    render(<SidePanel />)
    expect(screen.getByRole('separator')).toBeInTheDocument()
  })
})
