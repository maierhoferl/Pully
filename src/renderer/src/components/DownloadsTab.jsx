import React from 'react'
import { useAppStore } from '../store/app-store.js'
import { DownloadRow } from './DownloadRow.jsx'

export default function DownloadsTab() {
  const downloads = useAppStore(s => s.downloads)
  if (downloads.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        No downloads yet. Browse to a page to find media.
      </div>
    )
  }
  const active = downloads.filter(d => d.status === 'downloading' || d.status === 'queued')
  const done = downloads.filter(d => d.status === 'done' || d.status === 'failed')
  return (
    <div>
      {active.length > 0 && (
        <>
          <h2 className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider bg-gray-900 sticky top-0 z-10">
            Active ({active.length})
          </h2>
          {active.map(item => <DownloadRow key={item.id} item={item} />)}
        </>
      )}
      {done.length > 0 && (
        <>
          <h2 className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider bg-gray-900 sticky top-0 z-10">
            Completed
          </h2>
          {done.map(item => <DownloadRow key={item.id} item={item} />)}
        </>
      )}
    </div>
  )
}
