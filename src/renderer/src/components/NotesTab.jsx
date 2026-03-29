// src/renderer/src/components/NotesTab.jsx
import { useState, useEffect } from 'react'
import NotesFolderList from './NotesFolderList.jsx'
import NotesChapterView from './NotesChapterView.jsx'
import LibraryDetailPanel from './LibraryDetailPanel.jsx'
import { useAppStore } from '../store/app-store.js'

export default function NotesTab() {
  const [folders, setFolders] = useState([])
  const [notesSelectedFile, setNotesSelectedFile] = useState(null)
  const [sideWidth, setSideWidth] = useState(400)

  function handleSideDragStart(e) {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = sideWidth
    function onMove(ev) {
      setSideWidth(Math.max(1, startWidth + (startX - ev.clientX)))
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }
  const activeNotesFolder = useAppStore((s) => s.activeNotesFolder)
  const activeNotesChapter = useAppStore((s) => s.activeNotesChapter)
  const setActiveNotesFolder = useAppStore((s) => s.setActiveNotesFolder)
  const activeTab = useAppStore((s) => s.activeTab)

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
        <div className="px-3 pt-3 pb-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Folders
        </div>
        <NotesFolderList
          folders={folders}
          activeFolder={activeNotesFolder}
          onSelect={setActiveNotesFolder}
        />
      </div>

      {/* Center panel — chapter view */}
      <div className="flex-1 overflow-hidden">
        <NotesChapterView
          folderName={activeNotesFolder}
          activeChapter={activeNotesChapter}
          onPlay={setNotesSelectedFile}
        />
      </div>

      {/* Resize handle */}
      <div
        role="separator"
        className="w-1 bg-gray-800 hover:bg-blue-600 cursor-col-resize flex-shrink-0 flex items-center justify-center transition-colors"
        onMouseDown={handleSideDragStart}
      >
        <div className="h-6 w-0.5 bg-gray-600 rounded pointer-events-none" />
      </div>

      {/* Right panel — video detail */}
      {notesSelectedFile ? (
        <LibraryDetailPanel
          file={notesSelectedFile}
          onClose={() => setNotesSelectedFile(null)}
          style={{ width: sideWidth }}
        />
      ) : (
        <div
          style={{ width: sideWidth }}
          className="flex-shrink-0 bg-gray-900 border-l border-gray-700 flex items-center justify-center h-full"
        >
          <p className="text-sm text-gray-600">Select a file to view details</p>
        </div>
      )}
    </div>
  )
}
