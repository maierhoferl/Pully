// src/renderer/src/components/NotesChapterView.jsx
import { useState, useRef, useEffect } from 'react'
import { useAppStore } from '../store/app-store.js'
import { ChapterCard } from './ChapterCard.jsx'

export default function NotesChapterView({ folderName, activeChapter, onPlay }) {
  const [chapters, setChapters] = useState([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(null)
  const chapterRefs = useRef({})

  useEffect(() => {
    setLoadError(null)
    setLoading(true)
    window.api
      .readNotes(folderName)
      .then((data) => setChapters(data.chapters))
      .catch((e) => setLoadError(e.message || 'Failed to load notes'))
      .finally(() => setLoading(false))
  }, [folderName])

  useEffect(() => {
    if (activeChapter && chapterRefs.current[activeChapter]) {
      chapterRefs.current[activeChapter].scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [activeChapter, chapters])

  async function resolveFilePath(fileBasename) {
    const files = useAppStore.getState().libraryFiles
    const file = files.find(
      (f) => f.name === fileBasename && (folderName ? f.folder === folderName : !f.folder)
    )
    if (file) return file.path
    // Fallback: construct path from config when libraryFiles hasn't been loaded yet
    const cfg = await window.api.readConfig()
    return folderName
      ? `${cfg.outputFolder}/${folderName}/${fileBasename}`
      : `${cfg.outputFolder}/${fileBasename}`
  }

  const handlePlay = async (fileBasename) => {
    const files = useAppStore.getState().libraryFiles
    const file = files.find(
      (f) => f.name === fileBasename && (folderName ? f.folder === folderName : !f.folder)
    )
    if (file) {
      onPlay?.(file)
    } else {
      // File not yet in store — resolve path and build a minimal file object
      const filePath = await resolveFilePath(fileBasename)
      onPlay?.({
        name: fileBasename,
        path: filePath,
        folder: folderName ?? null,
        videoUrl: 'pully://' + filePath,
        title: null,
        uploader: null,
        description: null,
        thumbnailUrl: null,
        url: null,
        downloadedAt: null
      })
    }
  }

  const handleGenerateSummary = async (fileBasename) => {
    const filePath = await resolveFilePath(fileBasename)
    return window.api.generateSummary(filePath)
  }

  const handleUpdateBullets = async (fileBasename, bullets) => {
    const filePath = await resolveFilePath(fileBasename)
    window.api.updateBullets(filePath, bullets)
    setChapters((prev) => prev.map((c) => (c.filePath === fileBasename ? { ...c, bullets } : c)))
  }

  if (loading) return <div className="p-4 text-sm text-gray-400">Loading…</div>
  if (loadError) return <div className="p-4 text-sm text-red-400">{loadError}</div>
  if (chapters.length === 0)
    return (
      <div className="p-4 text-sm text-gray-500">
        No notes yet. Download a video to get started.
      </div>
    )

  return (
    <div className="p-4 overflow-y-auto h-full">
      {chapters.map((chapter) => (
        <div
          key={chapter.filePath}
          ref={(el) => {
            chapterRefs.current[chapter.filePath] = el
          }}
          className="border-b border-gray-700 pb-5 mb-5 last:border-0"
        >
          <ChapterCard
            chapter={chapter}
            onGenerateSummary={handleGenerateSummary}
            onUpdateBullets={handleUpdateBullets}
            onPlay={handlePlay}
          />
        </div>
      ))}
    </div>
  )
}
