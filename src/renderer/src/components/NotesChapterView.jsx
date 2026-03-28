// src/renderer/src/components/NotesChapterView.jsx
import { useState, useRef, useEffect } from 'react'
import { useAppStore } from '../store/app-store.js'

function ChapterCard({ chapter, onGenerateSummary, onUpdateBullets, onPlayInLibrary }) {
  const [editingBullets, setEditingBullets] = useState(false)
  const [bulletText, setBulletText] = useState(chapter.bullets.join('\n'))
  const [summarizing, setSummarizing] = useState(false)
  const [summaryError, setSummaryError] = useState(null)
  const [localSummary, setLocalSummary] = useState(chapter.summary)

  const handleSaveBullets = () => {
    const bullets = bulletText.split('\n').map(b => b.replace(/^-\s*/, '').trim()).filter(Boolean)
    onUpdateBullets(chapter.file, bullets)
    setEditingBullets(false)
  }

  const handleGenerate = async () => {
    setSummarizing(true)
    setSummaryError(null)
    try {
      const { summary } = await onGenerateSummary(chapter.file)
      setLocalSummary(summary)
    } catch (e) {
      setSummaryError(e.message || 'Failed to generate summary')
    } finally {
      setSummarizing(false)
    }
  }

  return (
    <div className="mb-6 last:mb-0">
      <div className="flex items-start justify-between mb-2">
        <h2 className="text-base font-semibold text-white">{chapter.heading}</h2>
        <button
          onClick={() => onPlayInLibrary(chapter.file)}
          className="text-xs text-blue-400 hover:text-blue-300 whitespace-nowrap ml-4 shrink-0"
        >
          ▶ Play in Library
        </button>
      </div>
      <div className="text-xs text-gray-500 mb-3 flex gap-3">
        <span>📁 {chapter.file}</span>
        {chapter.url && (
          <span>🔗 <a href={chapter.url} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">{new URL(chapter.url).hostname}</a></span>
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
            <button onClick={handleGenerate} className="text-xs text-blue-400 hover:text-blue-300">Retry</button>
          </div>
        ) : (
          <button onClick={handleGenerate} className="mt-1 text-xs text-blue-400 hover:text-blue-300">
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
              onChange={e => setBulletText(e.target.value)}
              rows={4}
              className="w-full bg-gray-700 text-white text-sm rounded px-2 py-1 border border-gray-600 resize-none"
              placeholder="One note per line"
            />
            <div className="flex gap-2 mt-1">
              <button onClick={handleSaveBullets} className="text-xs text-green-400 hover:text-green-300">Save</button>
              <button onClick={() => { setBulletText(chapter.bullets.join('\n')); setEditingBullets(false) }} className="text-xs text-gray-400 hover:text-gray-300">Cancel</button>
            </div>
          </div>
        ) : (
          <div>
            {chapter.bullets.length > 0 ? (
              <ul className="text-sm text-gray-300 space-y-0.5 mb-1">
                {chapter.bullets.map((b, i) => <li key={i} className="before:content-['•'] before:mr-2 before:text-gray-500">{b}</li>)}
              </ul>
            ) : (
              <div className="text-xs text-gray-500 italic mb-1">No notes yet.</div>
            )}
            <button onClick={() => setEditingBullets(true)} className="text-xs text-blue-400 hover:text-blue-300">✎ Edit</button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function NotesChapterView({ folderName, activeChapter }) {
  const [chapters, setChapters] = useState([])
  const [loading, setLoading] = useState(false)
  const chapterRefs = useRef({})

  useEffect(() => {
    setLoading(true)
    window.api.readNotes(folderName)
      .then(data => setChapters(data.chapters))
      .finally(() => setLoading(false))
  }, [folderName])

  useEffect(() => {
    if (activeChapter && chapterRefs.current[activeChapter]) {
      chapterRefs.current[activeChapter].scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [activeChapter, chapters])

  const setActiveTab = useAppStore(s => s.setActiveTab)
  const setLibrarySelectedFile = useAppStore(s => s.setLibrarySelectedFile)

  // ⚠️ Use file.path (not fileBasename) because LibraryTab uses setSelectedPath
  const handlePlayInLibrary = (fileBasename) => {
    const files = useAppStore.getState().libraryFiles
    const file = files.find(f => f.name === fileBasename && (folderName ? f.folder === folderName : !f.folder))
    setActiveTab('library')
    setLibrarySelectedFile(file ? file.path : fileBasename)
  }

  const handleGenerateSummary = async (fileBasename) => {
    const files = useAppStore.getState().libraryFiles
    const file = files.find(f => f.name === fileBasename && (folderName ? f.folder === folderName : !f.folder))
    if (!file) throw new Error('File not found in library')
    return window.api.generateSummary(file.path)
  }

  const handleUpdateBullets = (fileBasename, bullets) => {
    const files = useAppStore.getState().libraryFiles
    const file = files.find(f => f.name === fileBasename && (folderName ? f.folder === folderName : !f.folder))
    if (!file) return
    window.api.updateBullets(file.path, bullets)
    setChapters(prev => prev.map(c => c.file === fileBasename ? { ...c, bullets } : c))
  }

  if (loading) return <div className="p-4 text-sm text-gray-400">Loading…</div>
  if (chapters.length === 0) return <div className="p-4 text-sm text-gray-500">No notes yet. Download a video to get started.</div>

  return (
    <div className="p-4 overflow-y-auto h-full">
      {chapters.map(chapter => (
        <div
          key={chapter.file}
          ref={el => { chapterRefs.current[chapter.file] = el }}
          className="border-b border-gray-700 pb-5 mb-5 last:border-0"
        >
          <ChapterCard
            chapter={chapter}
            onGenerateSummary={handleGenerateSummary}
            onUpdateBullets={handleUpdateBullets}
            onPlayInLibrary={handlePlayInLibrary}
          />
        </div>
      ))}
    </div>
  )
}
