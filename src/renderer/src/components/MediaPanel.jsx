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
    <button disabled className={`text-sm font-semibold px-4 py-1.5 rounded flex-shrink-0 min-w-[90px] text-center ${style}`}>
      {label}
    </button>
  )
}

function MediaEntry({ entry }) {
  const formats = getBestFormats(entry)
  const [selected, setSelected] = useState(formats[0]?.format_id || 'best')
  const [downloadId, setDownloadId] = useState(null)

  async function handleDownload() {
    const id = await window.api.addDownload(entry.webpage_url || entry.url, selected, entry.title || entry.id || 'Untitled')
    setDownloadId(id)
  }

  return (
    <div className="flex items-center gap-3 py-2.5 px-3 hover:bg-gray-800 rounded-lg border border-transparent hover:border-gray-700 transition-colors">
      {entry.thumbnail && (
        <img src={entry.thumbnail} alt="" className="w-24 h-14 object-cover rounded-md flex-shrink-0 shadow"
          onError={e => { e.target.style.display = 'none' }} />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate leading-snug" title={entry.title}>
          {entry.title || entry.id}
        </p>
        <select value={selected} onChange={e => setSelected(e.target.value)}
          className="mt-1 text-xs bg-gray-700 border border-gray-600 rounded px-1.5 py-0.5 text-gray-300 max-w-full">
          {formats.map(f => <option key={f.format_id} value={f.format_id}>{f.label}</option>)}
        </select>
      </div>
      {downloadId
        ? <DownloadButton downloadId={downloadId} />
        : (
          <button onClick={handleDownload}
            className="text-sm font-semibold bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white px-4 py-1.5 rounded flex-shrink-0 min-w-[90px] text-center transition-colors">
            Download
          </button>
        )
      }
    </div>
  )
}

export function MediaPanel() {
  const { mediaScanResults, mediaScanLoading } = useAppStore()
  const [collapsed, setCollapsed] = useState(false)

  // Don't show before the first navigation
  if (!mediaScanLoading && mediaScanResults === null) return null

  const hasResults = Array.isArray(mediaScanResults) && mediaScanResults.length > 0

  function headingText() {
    if (mediaScanLoading) return 'Scanning for content to download…'
    if (!hasResults) return 'No videos found'
    return `${mediaScanResults.length} video${mediaScanResults.length !== 1 ? 's' : ''} found`
  }

  return (
    <div className={`border-t-2 border-blue-600 bg-gray-950 ${collapsed ? '' : hasResults ? 'max-h-72 overflow-y-auto' : ''}`}>
      <div onClick={() => hasResults && setCollapsed(c => !c)}
        className={`flex items-center gap-2 px-3 py-2.5 sticky top-0 bg-gray-950 border-b border-gray-800 z-10 ${hasResults ? 'cursor-pointer hover:bg-gray-900' : ''}`}>
        <span className={`text-sm font-bold tracking-wide ${mediaScanLoading ? 'text-blue-400' : hasResults ? 'text-white' : 'text-gray-500'}`}>
          {headingText()}
        </span>
        {hasResults && (
          <span className="ml-auto text-gray-500 text-xs">{collapsed ? '▼' : '▲'}</span>
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
