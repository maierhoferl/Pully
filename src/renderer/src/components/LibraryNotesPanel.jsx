import React from 'react'
import { useAppStore } from '../store/app-store'
import { ChapterCard } from './ChapterCard'

export function LibraryNotesPanel() {
  const libraryActiveChapter = useAppStore((state) => state.libraryActiveChapter)

  const handleBulletsChange = async (filePath, bullets) => {
    try {
      await window.api.updateBullets(filePath, bullets)
      // Chapter state will be updated via IPC event, no need to manually update
    } catch (error) {
      console.error('Failed to save bullets:', error)
    }
  }

  const handleGenerateSummary = async (filePath) => {
    try {
      const result = await window.api.generateSummary(filePath)
      return result
      // Summary state will be updated via IPC event
    } catch (error) {
      console.error('Failed to generate summary:', error)
      // Re-throw to let ChapterCard handle the error state
      throw error
    }
  }

  if (!libraryActiveChapter) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 text-sm">
        Select a file to add notes
      </div>
    )
  }

  const { chapter } = libraryActiveChapter

  return (
    <div className="overflow-y-auto h-full p-4">
      <ChapterCard
        chapter={chapter}
        onUpdateBullets={handleBulletsChange}
        onGenerateSummary={handleGenerateSummary}
      />
    </div>
  )
}
