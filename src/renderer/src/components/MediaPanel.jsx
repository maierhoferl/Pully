import React, { useState } from 'react'
import { useAppStore } from '../store/app-store.js'

function formatSize(bytes) {
  if (!bytes) return ''
  if (bytes > 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
  if (bytes > 1e6) return `${(bytes / 1e6).toFixed(1)} MB`
  return `${(bytes / 1e3).toFixed(0)} KB`
}

function getBestFormats(entry) {
  if (!entry.formats) {
    return [{ format_id: 'best', label: `Best quality (${entry.ext || 'mp4'})` }]
  }
  const seen = new Set()
  return entry.formats
    .filter(f => {
      const key = `${f.height || 'audio'}-${f.ext}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => (b.height || 0) - (a.height || 0))
    .slice(0, 8)
    .map(f => ({
      format_id: f.format_id,
      label: f.height
        ? `${f.height}p ${f.ext}${f.filesize ? ' · ' + formatSize(f.filesize) : ''}`
        : `Audio ${f.ext}`,
    }))
}

function DownloadButton({ downloadId }) {
  const downloads = useAppStore(s => s.downloads)
  const dl = downloads.find(d => d.id === downloadId)

  if (!dl) return null

  let label = 'Queued'
  let style = 'bg-gray-600 text-gray-300 cursor-not-allowed'

  if (dl.status === 'downloading') {
    const pct = typeof dl.percent === 'number' ? dl.percent : 0
    label = `${Math.round(pct)}%`
    style = 'bg-blue-700 text-white cursor-not-allowed'
  } else if (dl.status === 'done') {
    label = 'Done ✓'
    style = 'bg-green-700 text-white cursor-not-allowed'
  } else if (dl.status === 'failed') {
    label = 'Failed'
    style = 'bg-red-700 text-white cursor-not-allowed'
  }

  return (
    <button disabled className={`text-xs font-semibold px-2 py-1 rounded flex-shrink-0 transition-colors text-center ${style}`}>
      {label}
    </button>
  )
}

function MediaEntry({ entry }) {
  const formats = getBestFormats(entry)
  const [selected, setSelected] = useState(formats[0]?.format_id || 'best')
  const [downloadId, setDownloadId] = useState(null)
  const [rememberState, setRememberState] = useState('idle') // idle | pending | done | exists | error

  async function handleDownload() {
    const sourceUrl = entry.webpage_url || entry.url
    const metadata = {
      title: entry.title || entry.id || 'Untitled',
      uploader: entry.uploader || entry.channel || null,
      description: entry.description || null,
      thumbnailUrl: entry.thumbnail || null,
      url: sourceUrl,
    }
    const id = await window.api.addDownload(
      sourceUrl,
      selected,
      entry.title || entry.id || 'Untitled',
      metadata
    )
    setDownloadId(id)
  }

  async function handleRemember() {
    if (rememberState !== 'idle') return
    setRememberState('pending')
    try {
      const result = await window.api.rememberMedia({
        title: entry.title || entry.id || 'Untitled',
        uploader: entry.uploader || entry.channel || null,
        description: entry.description || null,
        thumbnailUrl: entry.thumbnail || null,
        url: entry.webpage_url || entry.url,
      })
      setRememberState(result.alreadyExists ? 'exists' : 'done')
    } catch {
      setRememberState('error')
    }
  }

  const rememberLabel = { idle: 'Remember', pending: '…', done: 'Saved ✓', exists: 'In library', error: 'Failed' }[rememberState]
  const rememberStyle = {
    idle: 'bg-green-700 hover:bg-green-600 text-white cursor-pointer',
    pending: 'bg-gray-600 text-gray-400 cursor-not-allowed',
    done: 'bg-purple-800 text-purple-200 cursor-default',
    exists: 'bg-gray-700 text-gray-400 cursor-default',
    error: 'bg-red-800 text-red-200 cursor-default',
  }[rememberState]

  const isPlaylist = Boolean(entry.playlist_id)

  return (
    <div className="bg-gray-800 hover:bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 transition-colors">
      {/* Title */}
      <p className="text-sm font-medium text-white truncate leading-snug" title={entry.title}>
        {entry.title || entry.id}
      </p>
      {/* Metadata line: type indicator + quality selector */}
      <div className="flex items-center gap-3 mt-0.5">
        <span className="text-[0.65rem] text-gray-400 flex-shrink-0">
          {isPlaylist ? 'Playlist' : 'Single video'}
        </span>
        <select
          value={selected}
          onChange={e => setSelected(e.target.value)}
          className="text-[0.7rem] bg-gray-700 border border-gray-600 rounded px-1.5 py-0.5 text-gray-300"
        >
          {formats.map(f => <option key={f.format_id} value={f.format_id}>{f.label}</option>)}
        </select>
      </div>
      {/* Thumbnail + action buttons */}
      <div className="flex gap-3 mt-2">
        {entry.thumbnail && (
          <img
            src={entry.thumbnail}
            alt=""
            className="w-24 h-14 object-cover rounded-md flex-shrink-0 shadow"
            onError={e => { e.target.style.display = 'none' }}
          />
        )}
        <div className="flex flex-col gap-1.5">
          <button
            onClick={handleRemember}
            disabled={rememberState !== 'idle'}
            title={rememberState === 'exists' ? 'Already in library' : 'Save reference without downloading'}
            className={`text-xs font-semibold px-2 py-1 rounded transition-colors ${rememberStyle}`}
          >
            {rememberLabel}
          </button>
          {downloadId
            ? <DownloadButton downloadId={downloadId} />
            : (
              <button
                onClick={handleDownload}
                className="text-xs font-semibold bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white px-2 py-1 rounded transition-colors"
              >
                Download
              </button>
            )
          }
        </div>
      </div>
    </div>
  )
}

export function MediaPanel() {
  const { mediaScanResults, mediaScanLoading, currentBrowserUrl, startMediaScan, setMediaScanResults } = useAppStore()
  const [collapsed, setCollapsed] = useState(false)

  async function handleRefresh() {
    if (!currentBrowserUrl || mediaScanLoading) return
    startMediaScan()
    try {
      const results = await window.api.extractInfo(currentBrowserUrl)
      setMediaScanResults(results)
    } catch {
      setMediaScanResults([])
    }
  }

  // Don't show before the first navigation
  if (!mediaScanLoading && mediaScanResults === null) return null

  const hasResults = Array.isArray(mediaScanResults) && mediaScanResults.length > 0

  function headingText() {
    if (mediaScanLoading) return 'Scanning for content to download…'
    if (!hasResults) return 'No videos found'
    return `${mediaScanResults.length} video${mediaScanResults.length !== 1 ? 's' : ''} found`
  }

  return (
    <div className="bg-gray-950">
      <div onClick={() => hasResults && setCollapsed(c => !c)}
        className={`flex items-center gap-2 px-3 py-2.5 sticky top-0 bg-gray-950 border-b border-gray-800 z-10 ${hasResults ? 'cursor-pointer hover:bg-gray-900' : ''}`}>
        <span className={`text-sm font-bold tracking-wide ${mediaScanLoading ? 'text-blue-400' : hasResults ? 'text-white' : 'text-gray-500'}`}>
          {headingText()}
        </span>
        <button
          onClick={e => { e.stopPropagation(); handleRefresh() }}
          disabled={!currentBrowserUrl || mediaScanLoading}
          className="ml-auto p-1 rounded text-gray-500 hover:text-white hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Refresh"
        >
          ↻
        </button>
        {hasResults && (
          <span className="text-gray-500 text-xs">{collapsed ? '▼' : '▲'}</span>
        )}
      </div>
      {!collapsed && hasResults && (
        <div className="p-2 flex flex-col gap-1">
          {mediaScanResults.map(entry => (
            <MediaEntry key={entry.id || entry.url} entry={entry} />
          ))}
        </div>
      )}
    </div>
  )
}
