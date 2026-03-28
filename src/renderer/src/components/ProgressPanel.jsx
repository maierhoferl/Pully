import React from 'react'
import { useAppStore } from '../store/app-store.js'
import { DownloadRow } from './DownloadRow.jsx'

export default function ProgressPanel() {
  const downloads = useAppStore(s => s.downloads)
  const active = downloads.filter(d => d.status === 'downloading' || d.status === 'queued')
  const done = downloads.filter(d => d.status === 'done' || d.status === 'failed')
  const ordered = [...active, ...done]

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 bg-gray-950 border-b border-gray-800 sticky top-0 z-10">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Progress</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {ordered.length === 0 ? (
          <p className="text-xs text-gray-600 px-3 py-3">No downloads yet</p>
        ) : (
          ordered.map(item => <DownloadRow key={item.id} item={item} />)
        )}
      </div>
    </div>
  )
}
