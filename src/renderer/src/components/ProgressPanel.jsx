import React from 'react'
import { useAppStore } from '../store/app-store.js'
import { DownloadRow } from './DownloadRow.jsx'

export default function ProgressPanel() {
  const downloads = useAppStore(s => s.downloads)
  const active = downloads.filter(d => d.status === 'downloading' || d.status === 'queued' || d.status === 'cancelling')
  const done = downloads.filter(d => d.status === 'done' || d.status === 'failed')
  const ordered = [...active, ...done]

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-3 py-2 bg-gray-950 border-b border-gray-800 sticky top-0 z-10">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Progress</span>
      </div>
      {ordered.length === 0 ? (
        <p className="text-xs text-gray-600 px-3 py-3">No downloads yet</p>
      ) : (
        ordered.map(item => <DownloadRow key={item.id} item={item} />)
      )}
    </div>
  )
}
