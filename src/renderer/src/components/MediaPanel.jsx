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

function MediaEntry({ entry }) {
  const formats = getBestFormats(entry)
  const [selected, setSelected] = useState(formats[0]?.format_id || 'best')

  async function handleAdd() {
    await window.api.addDownload(entry.webpage_url || entry.url, selected, entry.title || entry.id || 'Untitled')
  }

  return (
    <div className="flex items-center gap-2 py-1 px-2 hover:bg-gray-800 rounded">
      {entry.thumbnail && (
        <img src={entry.thumbnail} alt="" className="w-12 h-8 object-cover rounded flex-shrink-0"
          onError={e => { e.target.style.display = 'none' }} />
      )}
      <span className="flex-1 text-sm truncate text-gray-200" title={entry.title}>
        {entry.title || entry.id}
      </span>
      <select value={selected} onChange={e => setSelected(e.target.value)}
        className="text-xs bg-gray-700 border border-gray-600 rounded px-1 py-0.5 text-gray-200">
        {formats.map(f => <option key={f.format_id} value={f.format_id}>{f.label}</option>)}
      </select>
      <button onClick={handleAdd}
        className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-2 py-0.5 rounded flex-shrink-0">
        + Queue
      </button>
    </div>
  )
}

export function MediaPanel() {
  const { mediaScanResults, mediaScanLoading } = useAppStore()
  const [collapsed, setCollapsed] = useState(false)

  if (!mediaScanLoading && mediaScanResults.length === 0) return null

  return (
    <div className={`border-t border-gray-700 bg-gray-900 ${collapsed ? '' : 'max-h-48 overflow-y-auto'}`}>
      <div onClick={() => setCollapsed(c => !c)}
        className="flex items-center gap-2 px-2 py-1 cursor-pointer hover:bg-gray-800 sticky top-0 bg-gray-900 border-b border-gray-700">
        <span className="text-xs font-medium text-gray-400">
          {mediaScanLoading
            ? '⏳ Scanning for media…'
            : `${mediaScanResults.length} video${mediaScanResults.length !== 1 ? 's' : ''} found`}
        </span>
        <span className="ml-auto text-gray-600 text-xs">{collapsed ? '▼' : '▲'}</span>
      </div>
      {!collapsed && (
        <div className="py-1">
          {mediaScanResults.map(entry => (
            <MediaEntry key={entry.id || entry.url} entry={entry} />
          ))}
        </div>
      )}
    </div>
  )
}
