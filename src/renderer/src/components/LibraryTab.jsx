import React, { useEffect, useState } from 'react'
import { useAppStore } from '../store/app-store.js'
import LibraryDetailPanel from './LibraryDetailPanel.jsx'

export default function LibraryTab() {
  const { libraryFiles, setLibraryFiles, config } = useAppStore()
  const [selectedPath, setSelectedPath] = useState(null)

  useEffect(() => {
    window.api.listLibrary().then(setLibraryFiles)
  }, [])

  const selected = selectedPath ? libraryFiles.find(f => f.path === selectedPath) : null

  function handleSelect(file) {
    setSelectedPath(prev => prev === file.path ? null : file.path)
  }

  function handleDeleted(filePath) {
    setLibraryFiles(libraryFiles.filter(f => f.path !== filePath))
    setSelectedPath(null)
  }

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
    <div className="flex h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto p-3">
        <div className="flex flex-col gap-1">
          {libraryFiles.map(file => {
            const title = file.title || file.name.replace(/\.[^/.]+$/, '')
            const uploader = file.uploader || '—'
            const isSelected = file.path === selectedPath
            return (
              <button
                key={file.path}
                onClick={() => handleSelect(file)}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors w-full ${
                  isSelected
                    ? 'bg-indigo-900/50 border border-indigo-700'
                    : 'bg-gray-800 hover:bg-gray-700 border border-transparent'
                }`}
              >
                <div className="w-16 aspect-video bg-gray-700 rounded overflow-hidden flex-shrink-0 flex items-center justify-center">
                  {file.thumbnailUrl
                    ? <img src={file.thumbnailUrl} alt="" className="w-full h-full object-cover"
                        onError={e => { e.target.style.display = 'none' }} />
                    : <span className="text-gray-500 text-lg">▶</span>
                  }
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white truncate">{title}</p>
                  <p className="text-xs text-gray-400 truncate">{uploader}</p>
                </div>
              </button>
            )
          })}
        </div>
      </div>
      {selected && (
        <LibraryDetailPanel file={selected} onClose={() => setSelectedPath(null)} onDeleted={handleDeleted} />
      )}
    </div>
  )
}
