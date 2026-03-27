import React, { useEffect } from 'react'
import { useAppStore } from '../store/app-store.js'

function fmtSize(b) {
  if (b > 1e9) return `${(b / 1e9).toFixed(2)} GB`
  if (b > 1e6) return `${(b / 1e6).toFixed(1)} MB`
  return `${(b / 1e3).toFixed(0)} KB`
}
function fmtDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function LibraryTab() {
  const { libraryFiles, setLibraryFiles, config } = useAppStore()

  useEffect(() => {
    window.api.listLibrary().then(setLibraryFiles)
  }, [])

  if (!config.outputFolder) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-2">
        <p>No output folder configured.</p>
        <p className="text-sm">Open Settings (⚙) to set a download folder.</p>
      </div>
    )
  }
  if (libraryFiles.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        No downloaded files yet.
      </div>
    )
  }
  return (
    <div className="p-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {libraryFiles.map(file => (
          <button key={file.path} onClick={() => window.api.revealInFinder(file.path)}
            className="bg-gray-800 hover:bg-gray-700 rounded-lg p-3 text-left transition-colors"
            title="Reveal in Finder">
            <div className="aspect-video bg-gray-700 rounded mb-2 flex items-center justify-center text-3xl">🎬</div>
            <p className="text-xs text-white font-medium truncate">{file.name}</p>
            <p className="text-xs text-gray-500 mt-0.5">{fmtSize(file.size)} · {fmtDate(file.mtime)}</p>
          </button>
        ))}
      </div>
    </div>
  )
}
