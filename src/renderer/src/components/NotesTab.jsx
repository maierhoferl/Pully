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
  const activeTab = useAppStore(s => s.activeTab)

  useEffect(() => {
    window.api.listFolders().then(setFolders)
  }, [])

  useEffect(() => {
    if (activeTab === 'notes') {
      window.api.listFolders().then(setFolders)
    }
  }, [activeTab])

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left sidebar — folder list */}
      <div className="w-44 shrink-0 border-r border-gray-700 overflow-y-auto">
        <div className="px-3 pt-3 pb-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">Folders</div>
        <NotesFolderList
          folders={folders}
          activeFolder={activeNotesFolder}
          onSelect={setActiveNotesFolder}
        />
      </div>

      {/* Right panel — chapter view */}
      <div className="flex-1 overflow-hidden">
        <NotesChapterView
          folderName={activeNotesFolder}
          activeChapter={activeNotesChapter}
        />
      </div>
    </div>
  )
}
