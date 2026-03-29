import { useAppStore } from '../store/app-store.js'
import { ContentViewer } from './ContentViewer.jsx'
import { ContentTypeIcon } from './icons/ContentTypeIcon.jsx'

function fmtDateTime(iso) {
  const d = new Date(iso)
  return (
    d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' · ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  )
}

export default function LibraryDetailPanel({ file, onClose, onDelete, style }) {
  const setActiveTab = useAppStore((s) => s.setActiveTab)
  const setActiveNotesFolder = useAppStore((s) => s.setActiveNotesFolder)
  const setActiveNotesChapter = useAppStore((s) => s.setActiveNotesChapter)

  const handleViewNotes = () => {
    setActiveNotesFolder(file.folder ?? null)
    setActiveNotesChapter(file.name)
    setActiveTab('notes')
  }

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
        <div className="min-w-0 flex items-start gap-2">
          <ContentTypeIcon type={file.contentType || 'video'} size={16} className="flex-shrink-0 mt-0.5 text-gray-500" />
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-white leading-snug">{title}</h2>
            <p className="text-xs text-gray-400 mt-0.5 truncate">{subtitle}</p>
          </div>
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
        <ContentViewer file={file} onClose={onClose} />
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
