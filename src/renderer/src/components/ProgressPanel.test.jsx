import React from 'react'
import { render, screen } from '@testing-library/react'
import { useAppStore } from '../store/app-store.js'
import ProgressPanel from './ProgressPanel.jsx'

// Mock DownloadRow to avoid complex rendering
vi.mock('./DownloadRow.jsx', () => ({
  DownloadRow: ({ item }) => <div data-testid="download-row">{item.title}</div>,
}))

afterEach(() => {
  useAppStore.setState({ downloads: [] })
})

test('shows empty state when no downloads', () => {
  useAppStore.setState({ downloads: [] })
  render(<ProgressPanel />)
  expect(screen.getByText('No downloads yet')).toBeInTheDocument()
})

test('shows Progress header', () => {
  useAppStore.setState({ downloads: [] })
  render(<ProgressPanel />)
  expect(screen.getByText('Progress')).toBeInTheDocument()
})

test('renders download rows for all downloads', () => {
  useAppStore.setState({
    downloads: [
      { id: '1', title: 'Video A', status: 'downloading', percent: 50 },
      { id: '2', title: 'Video B', status: 'done' },
    ],
  })
  render(<ProgressPanel />)
  const rows = screen.getAllByTestId('download-row')
  expect(rows).toHaveLength(2)
})

test('renders active downloads before completed ones', () => {
  useAppStore.setState({
    downloads: [
      { id: '1', title: 'Done Video', status: 'done' },
      { id: '2', title: 'Active Video', status: 'downloading', percent: 40 },
    ],
  })
  render(<ProgressPanel />)
  const rows = screen.getAllByTestId('download-row')
  expect(rows[0]).toHaveTextContent('Active Video')
  expect(rows[1]).toHaveTextContent('Done Video')
})
