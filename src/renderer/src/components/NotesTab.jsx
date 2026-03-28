// src/renderer/src/components/NotesTab.jsx
import { useState, useEffect } from 'react'
import NotesFolderList from './NotesFolderList.jsx'
import NotesChapterView from './NotesChapterView.jsx'
import { useAppStore } from '../store/app-store.js'

export default function NotesTab() {
  const [folders, setFolders] = useState([])
  const activeNotesFolder = useAppStore(s => s.activeNotesFolder)
  const activeNotesChapter = useAppStore(s => s.activeNotesChapter)
  const setActiveNotesFolder = useAppStore(s => s.setActiveNotesFolder)

  useEffect(() => {
    window.api.listFolders().then(setFolders)
  }, [])

  const selectedFolder = activeNotesFolder !== undefined ? activeNotesFolder : null

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left sidebar — folder list */}
      <div className="w-44 shrink-0 border-r border-gray-700 overflow-y-auto">
        <div className="px-3 pt-3 pb-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">Folders</div>
        <NotesFolderList
          folders={folders}
          activeFolder={selectedFolder}
          onSelect={setActiveNotesFolder}
        />
      </div>

      {/* Right panel — chapter view */}
      <div className="flex-1 overflow-hidden">
        <NotesChapterView
          folderName={selectedFolder}
          activeChapter={activeNotesChapter}
        />
      </div>
    </div>
  )
}
