import { useState, useEffect } from 'react'
import { ContentTypeIcon } from './icons/ContentTypeIcon.jsx'
import { useAppStore } from '../store/app-store.js'

function safeHostname(url) {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

export function ChapterCard({ chapter, onGenerateSummary, onUpdateBullets, onPlay }) {
  const [editingBullets, setEditingBullets] = useState(false)
  const [bulletText, setBulletText] = useState(chapter.bullets.join('\n'))
  const [summarizing, setSummarizing] = useState(false)
  const [summaryError, setSummaryError] = useState(null)
  const [localSummary, setLocalSummary] = useState(chapter.summary)

  useEffect(() => {
    setLocalSummary(chapter.summary)
  }, [chapter.summary])

  useEffect(() => {
    if (!editingBullets) setBulletText(chapter.bullets.join('\n'))
  }, [chapter.bullets, editingBullets])

  const handleSaveBullets = () => {
    const bullets = bulletText
      .split('\n')
      .map((b) => b.replace(/^-\s*/, '').trim())
      .filter(Boolean)
    onUpdateBullets(chapter.filePath, bullets)
    setEditingBullets(false)
  }

  const handleGenerate = async () => {
    setSummarizing(true)
    setSummaryError(null)
    try {
      const { summary } = await onGenerateSummary(chapter.filePath)
      setLocalSummary(summary)
    } catch (e) {
      setSummaryError(e.message || 'Failed to generate summary')
    } finally {
      setSummarizing(false)
    }
  }

  const libraryFiles = useAppStore((s) => s.libraryFiles)
  const fileMatch = libraryFiles?.find((f) => f.name === chapter.filePath)
  const contentType = fileMatch?.contentType || chapter.contentType || 'video'

  return (
    <div className="mb-6 last:mb-0">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <ContentTypeIcon type={contentType} size={16} className="flex-shrink-0 text-gray-500" />
          <h2 className="text-base font-semibold text-white truncate">{chapter.title}</h2>
        </div>
        <button
          onClick={() => onPlay(chapter.filePath)}
          className="text-xs text-blue-400 hover:text-blue-300 whitespace-nowrap ml-4 shrink-0"
        >
          ▶ Play
        </button>
      </div>
      <div className="text-xs text-gray-500 mb-3 flex gap-3">
        <span>📁 {chapter.filePath}</span>
        {chapter.url && (
          <span>
            🔗{' '}
            <a
              href={chapter.url}
              target="_blank"
              rel="noreferrer"
              className="text-blue-400 hover:underline"
            >
              {safeHostname(chapter.url)}
            </a>
          </span>
        )}
        {chapter.downloadedAt && <span>📅 {chapter.downloadedAt}</span>}
      </div>

      {/* AI Summary */}
      <div className="mb-3">
        <div className="text-xs font-medium text-gray-400 mb-1">AI Summary</div>
        {localSummary ? (
          <div className="text-sm text-gray-300 leading-relaxed">{localSummary}</div>
        ) : (
          <div className="text-xs text-gray-500 italic">No summary yet.</div>
        )}
        {summarizing ? (
          <div className="text-xs text-gray-400 mt-1 animate-pulse">Generating…</div>
        ) : summaryError ? (
          <div className="mt-1 flex gap-2 items-center">
            <span className="text-xs text-red-400">{summaryError}</span>
            <button onClick={handleGenerate} className="text-xs text-blue-400 hover:text-blue-300">
              Retry
            </button>
          </div>
        ) : (
          <button
            onClick={handleGenerate}
            className="mt-1 text-xs text-blue-400 hover:text-blue-300"
          >
            {localSummary ? '↻ Regenerate' : 'Generate Summary'}
          </button>
        )}
      </div>

      {/* My Notes */}
      <div>
        <div className="text-xs font-medium text-gray-400 mb-1">My Notes</div>
        {editingBullets ? (
          <div>
            <textarea
              value={bulletText}
              onChange={(e) => setBulletText(e.target.value)}
              rows={4}
              className="w-full bg-gray-700 text-white text-sm rounded px-2 py-1 border border-gray-600 resize-none"
              placeholder="One note per line"
            />
            <div className="flex gap-2 mt-1">
              <button
                onClick={handleSaveBullets}
                className="text-xs text-green-400 hover:text-green-300"
              >
                Save
              </button>
              <button
                onClick={() => {
                  setBulletText(chapter.bullets.join('\n'))
                  setEditingBullets(false)
                }}
                className="text-xs text-gray-400 hover:text-gray-300"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div>
            {chapter.bullets.length > 0 ? (
              <ul className="text-sm text-gray-300 space-y-0.5 mb-1">
                {chapter.bullets.map((b, i) => (
                  <li key={i} className="before:content-['•'] before:mr-2 before:text-gray-500">
                    {b}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-xs text-gray-500 italic mb-1">No notes yet.</div>
            )}
            <button
              onClick={() => setEditingBullets(true)}
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              ✎ Edit
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
