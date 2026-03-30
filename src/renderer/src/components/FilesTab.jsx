import React, { useState, useEffect } from 'react'
import { useAppStore } from '../store/app-store'
import FileTree from './FileTree'
import FileList from './FileList'
import LibraryDetailPanel from './LibraryDetailPanel'
import { LibraryNotesPanel } from './LibraryNotesPanel'

export default function FilesTab() {
  const store = useAppStore()
  const [currentFolder, setCurrentFolder] = useState(store.filesLastDir || '/')
  const [selectedFile, setSelectedFile] = useState(null)
  const [sideWidth, setSideWidth] = useState(store.filesSideWidth || 320)
  const [sideSplitPct, setSideSplitPct] = useState(store.filesSideSplitPct || 60)
  const [rememberedPaths, setRememberedPaths] = useState([])

  useEffect(() => {
    store.setFilesLastDir(currentFolder)
  }, [currentFolder, store])

  useEffect(() => {
    store.setFilesSideWidth(sideWidth)
  }, [sideWidth, store])

  useEffect(() => {
    store.setFilesSideSplitPct(sideSplitPct)
  }, [sideSplitPct, store])

  async function handleSelectFile(file) {
    setSelectedFile(file)
  }

  return (
    <div className="h-full flex gap-0">
      <div className="bg-gray-50 border-r" style={{ width: '200px' }}>
        <FileTree
          currentFolder={currentFolder}
          onNavigate={setCurrentFolder}
        />
      </div>

      <div className="flex-1 border-r">
        <FileList
          currentFolder={currentFolder}
          selectedPath={selectedFile?.path}
          onSelectFile={handleSelectFile}
          onNavigateFolder={setCurrentFolder}
          rememberedPaths={rememberedPaths}
        />
      </div>

      <div
        className="border-l bg-white flex flex-col"
        style={{ width: `${sideWidth}px` }}
      >
        {selectedFile ? (
          <>
            <div style={{ height: `${sideSplitPct}%` }} className="border-b overflow-y-auto">
              <LibraryDetailPanel file={selectedFile} isFileImport={true} />
            </div>
            <div style={{ height: `${100 - sideSplitPct}%` }} className="overflow-y-auto">
              <LibraryNotesPanel file={selectedFile} />
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400">
            Select a file to view details
          </div>
        )}
      </div>
    </div>
  )
}
