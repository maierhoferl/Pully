import React, { useState, useEffect } from 'react'
import { useAppStore } from '../store/app-store'
import FileTree from './FileTree'
import FileList from './FileList'
import LibraryDetailPanel from './LibraryDetailPanel'
import { LibraryNotesPanel } from './LibraryNotesPanel'
import FolderImportDialog from './FolderImportDialog'

export default function FilesTab() {
  const { filesLastDir, filesSideWidth, filesSideSplitPct, setFilesLastDir, setFilesSideWidth, setFilesSideSplitPct } = useAppStore()
  const [currentFolder, setCurrentFolder] = useState(filesLastDir || '/')
  const [selectedFile, setSelectedFile] = useState(null)
  const [sideWidth, setSideWidth] = useState(filesSideWidth || 320)
  const [sideSplitPct, setSideSplitPct] = useState(filesSideSplitPct || 60)
  const [rememberedPaths, setRememberedPaths] = useState([])
  const [folderImportDialog, setFolderImportDialog] = useState(null)

  useEffect(() => {
    setFilesLastDir(currentFolder)
  }, [currentFolder])

  useEffect(() => {
    setFilesSideWidth(sideWidth)
  }, [sideWidth])

  useEffect(() => {
    setFilesSideSplitPct(sideSplitPct)
  }, [sideSplitPct])

  async function handleSelectFile(file) {
    setSelectedFile(file)
  }

  async function handleRememberFile(file) {
    try {
      const result = await window.api.files.rememberFile(file.path)
      if (result.error) {
        alert(`Error: ${result.error}`)
      } else {
        alert(`✓ Imported: ${result.title}`)
        setRememberedPaths([...rememberedPaths, file.path])
      }
    } catch (error) {
      alert(`Failed: ${error.message}`)
    }
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
              <LibraryDetailPanel
                file={selectedFile}
                isFileImport={true}
                onRememberFile={handleRememberFile}
              />
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

      {folderImportDialog && (
        <FolderImportDialog
          folderPath={folderImportDialog.path}
          fileCount={folderImportDialog.count}
          onConfirm={() => {
            // Implement folder import logic in next phase
            setFolderImportDialog(null)
          }}
          onCancel={() => setFolderImportDialog(null)}
        />
      )}
    </div>
  )
}
