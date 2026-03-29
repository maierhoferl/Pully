import { useState, useEffect } from 'react'
import { useAppStore } from '../store/app-store.js'
import VideoPlayer from './VideoPlayer.jsx'

function fmtDateTime(iso) {
  const d = new Date(iso)
  return (
    d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' · ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  )
}

export default function LibraryDetailPanel({ file, onClose, onDelete, style }) {
  const [isPlaying, setIsPlaying] = useState(false)

  // Reset player when the selected file changes
  useEffect(() => {
    setIsPlaying(false)
  }, [file?.path])

  const setActiveTab = useAppStore((s) => s.setActiveTab)
  const setActiveNotesFolder = useAppStore((s) => s.setActiveNotesFolder)
  const setActiveNotesChapter = useAppStore((s) => s.setActiveNotesChapter)

  const handleViewNotes = () => {
    setActiveNotesFolder(file.folder ?? null)
    setActiveNotesChapter(file.name)
    setActiveTab('notes')
  }

  const isRef = file.name?.endsWith('.ref')
  const title = file.title || file.name.replace(/\.[^/.]+$/, '')
  const uploader = file.uploader || '—'
  const description = file.description || '—'
  const dateStr = file.downloadedAt
    ? fmtDateTime(file.downloadedAt)
    : file.mtime
      ? fmtDateTime(file.mtime)
      : '—'
  const subtitle = `${uploader} · ${dateStr}`

  return (
    <div
      className="flex-shrink-0 bg-gray-900 border-l border-gray-700 flex flex-col h-full overflow-hidden"
      style={style}
    >
      <div className="flex items-start justify-between gap-2 p-4 flex-shrink-0">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-white leading-snug">{title}</h2>
          <p className="text-xs text-gray-400 mt-0.5 truncate">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleViewNotes}
            className="text-blue-400 hover:text-blue-300 text-xs px-2 py-1 rounded hover:bg-blue-950 transition-colors"
            title="View in Notes tab"
          >
            📝 Notes
          </button>
          {onDelete && (
            <button
              onClick={() => onDelete(file)}
              className="text-red-500 hover:text-red-400 text-xs px-2 py-1 rounded hover:bg-red-950 transition-colors"
              title="Move to Trash"
            >
              🗑 Delete
            </button>
          )}
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white mt-0.5 text-lg leading-none"
            aria-label="Close panel"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="mx-4 mb-3 flex-shrink-0">
        {isRef ? (
          <div className="relative aspect-video bg-gray-800 rounded overflow-hidden flex items-center justify-center">
            <button
              onClick={() => file.url && window.api.openUrl(file.url)}
              disabled={!file.url}
              className="relative z-10 bg-purple-700 hover:bg-purple-600 text-white font-bold px-5 py-2.5 rounded text-sm transition-colors disabled:opacity-40"
            >
              ▶ Watch Online
            </button>
          </div>
        ) : isPlaying ? (
          <VideoPlayer src={file.videoUrl} onClose={() => setIsPlaying(false)} />
        ) : (
          <div className="relative aspect-video bg-gray-700 rounded overflow-hidden">
            <button
              onClick={() => setIsPlaying(true)}
              className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/50 transition-colors"
            >
              <span className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-5 py-2.5 rounded text-sm transition-colors">
                ▶ PLAY
              </span>
            </button>
          </div>
        )}
      </div>

      {file.url && (
        <div className="px-4 mb-3 flex-shrink-0">
          <a
            href={file.url}
            onClick={(e) => {
              e.preventDefault()
              window.api.openUrl(file.url)
            }}
            className="text-xs text-indigo-400 hover:text-indigo-300 truncate block"
            title={file.url}
          >
            {file.url}
          </a>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <p className="text-xs text-gray-400 whitespace-pre-wrap leading-relaxed">{description}</p>
      </div>
    </div>
  )
}
