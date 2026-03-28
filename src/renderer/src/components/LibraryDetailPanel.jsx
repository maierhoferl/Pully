import React from 'react'
import { useAppStore } from '../store/app-store.js'

function fmtDateTime(iso) {
  const d = new Date(iso)
  return (
    d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' · ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  )
}

export default function LibraryDetailPanel({ file, onClose, onDeleted }) {
  const { config } = useAppStore()
  const title = file.title || file.name.replace(/\.[^/.]+$/, '')
  const uploader = file.uploader || '—'
  const description = file.description || '—'
  const dateStr = file.downloadedAt ? fmtDateTime(file.downloadedAt) : fmtDateTime(file.mtime)
  const subtitle = `${uploader} · ${dateStr}`

  async function handleDelete() {
    if (config.confirmDelete !== false) {
      const ok = window.confirm(`Move "${title}" to Trash?`)
      if (!ok) return
    }
    await window.api.deleteFile(file.path)
    onDeleted(file.path)
  }

  return (
    <div className="w-[640px] flex-shrink-0 bg-gray-900 border-l border-gray-700 flex flex-col h-full overflow-hidden">
      <div className="flex items-start justify-between gap-2 p-4 flex-shrink-0">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-white leading-snug">{title}</h2>
          <p className="text-xs text-gray-400 mt-0.5 truncate">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleDelete}
            className="text-red-500 hover:text-red-400 text-xs px-2 py-1 rounded hover:bg-red-950 transition-colors"
            title="Move to Trash"
          >
            🗑 Delete
          </button>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white mt-0.5 text-lg leading-none"
            aria-label="Close panel"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="relative mx-4 mb-3 aspect-video bg-gray-700 rounded overflow-hidden flex-shrink-0">
        {file.thumbnailUrl && (
          <img
            src={file.thumbnailUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            onError={e => { e.target.style.display = 'none' }}
          />
        )}
        <button
          onClick={() => window.api.playFile(file.path)}
          className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/50 transition-colors"
        >
          <span className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-5 py-2.5 rounded text-sm transition-colors">
            ▶ PLAY
          </span>
        </button>
      </div>

      {file.url && (
        <div className="px-4 mb-3 flex-shrink-0">
          <a
            href={file.url}
            onClick={e => { e.preventDefault(); window.api.openUrl(file.url) }}
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
