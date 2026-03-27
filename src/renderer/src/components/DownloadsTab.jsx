import React from 'react'
import { useAppStore } from '../store/app-store.js'
import { DownloadRow } from './DownloadRow.jsx'
import pullyHero from '../assets/pully-hero.png'

export default function DownloadsTab() {
  const downloads = useAppStore(s => s.downloads)
  if (downloads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-gray-500">
        <img src={pullyHero} alt="Pully" className="w-48 h-48 object-contain opacity-90" />
        <p className="text-sm">No downloads yet. Browse to a page to find media.</p>
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
