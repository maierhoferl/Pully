import React, { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../store/app-store.js'
import LibraryDetailPanel from './LibraryDetailPanel.jsx'

// Stable color per folder name (derived from name hash so colors don't shift when folders are added)
const PALETTE = [
  { border: 'border-indigo-500', bg: 'bg-indigo-950/60', text: 'text-indigo-300', dot: 'bg-indigo-500', dragBg: 'bg-indigo-900/40', ring: 'ring-indigo-500' },
  { border: 'border-emerald-500', bg: 'bg-emerald-950/60', text: 'text-emerald-300', dot: 'bg-emerald-500', dragBg: 'bg-emerald-900/40', ring: 'ring-emerald-500' },
  { border: 'border-amber-500', bg: 'bg-amber-950/60', text: 'text-amber-300', dot: 'bg-amber-500', dragBg: 'bg-amber-900/40', ring: 'ring-amber-500' },
  { border: 'border-rose-500', bg: 'bg-rose-950/60', text: 'text-rose-300', dot: 'bg-rose-500', dragBg: 'bg-rose-900/40', ring: 'ring-rose-500' },
  { border: 'border-cyan-500', bg: 'bg-cyan-950/60', text: 'text-cyan-300', dot: 'bg-cyan-500', dragBg: 'bg-cyan-900/40', ring: 'ring-cyan-500' },
  { border: 'border-violet-500', bg: 'bg-violet-950/60', text: 'text-violet-300', dot: 'bg-violet-500', dragBg: 'bg-violet-900/40', ring: 'ring-violet-500' },
  { border: 'border-orange-500', bg: 'bg-orange-950/60', text: 'text-orange-300', dot: 'bg-orange-500', dragBg: 'bg-orange-900/40', ring: 'ring-orange-500' },
  { border: 'border-teal-500', bg: 'bg-teal-950/60', text: 'text-teal-300', dot: 'bg-teal-500', dragBg: 'bg-teal-900/40', ring: 'ring-teal-500' },
]

function folderColor(name) {
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return PALETTE[h % PALETTE.length]
}

export default function LibraryTab() {
  const { libraryFiles, setLibraryFiles, config } = useAppStore()
  const [allFolders, setAllFolders] = useState([])
  const [selectedPath, setSelectedPath] = useState(null)
  const [collapsed, setCollapsed] = useState(new Set())
  const [dragFilePath, setDragFilePath] = useState(null)
  const [dragOverFolder, setDragOverFolder] = useState(null)
  const [creating, setCreating] = useState(false)
  const [newFolderInput, setNewFolderInput] = useState('')
  const inputRef = useRef(null)

  async function refresh() {
    const [files, folders] = await Promise.all([
      window.api.listLibrary(),
      window.api.listFolders(),
    ])
    setLibraryFiles(files)
    setAllFolders(folders)
  }

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 15_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (creating) inputRef.current?.focus()
  }, [creating])

  // Group files by folder; derive complete folder list
  const groups = {}
  for (const file of libraryFiles) {
    const key = file.folder || '__root'
    if (!groups[key]) groups[key] = []
    groups[key].push(file)
  }
  const namedFolders = [...new Set([...allFolders, ...libraryFiles.filter(f => f.folder).map(f => f.folder)])].sort()
  const groupKeys = ['__root', ...namedFolders]

  const selected = selectedPath ? libraryFiles.find(f => f.path === selectedPath) : null

  function toggleCollapse(key) {
    setCollapsed(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  function handleDeleted(filePath) {
    setLibraryFiles(libraryFiles.filter(f => f.path !== filePath))
    if (selectedPath === filePath) setSelectedPath(null)
  }

  async function handleDrop(targetFolderKey) {
    if (!dragFilePath || dragFilePath === null) return
    const targetFolder = targetFolderKey === '__root' ? null : targetFolderKey
    const newPath = await window.api.moveFile({ filePath: dragFilePath, targetFolder })
    setDragFilePath(null)
    setDragOverFolder(null)
    if (selectedPath === dragFilePath) setSelectedPath(newPath)
    await refresh()
  }

  async function handleCreateFolder() {
    const name = newFolderInput.trim()
    if (!name) { setCreating(false); return }
    await window.api.createFolder(name)
    setNewFolderInput('')
    setCreating(false)
    await refresh()
  }

  if (!config.outputFolder) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-2">
        <p>No output folder configured.</p>
        <p className="text-sm">Open Settings (⚙) to set a download folder.</p>
      </div>
    )
  }

  const isEmpty = libraryFiles.length === 0 && namedFolders.length === 0
  if (isEmpty) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        No downloaded files yet.
      </div>
    )
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* File list with folder groups */}
      <div className="flex-1 overflow-y-auto">
        {groupKeys.map(key => {
          const isRoot = key === '__root'
          const files = groups[key] || []
          const color = isRoot ? null : folderColor(key)
          const isCollapsed = collapsed.has(key)
          const isDragOver = dragOverFolder === key

          return (
            <div
              key={key}
              className={[
                'transition-all rounded-sm',
                isDragOver
                  ? `ring-2 ring-offset-1 ring-offset-gray-900 ${isRoot ? 'ring-gray-500' : color.ring}`
                  : '',
              ].join(' ')}
              onDragOver={e => { e.preventDefault(); setDragOverFolder(key) }}
              onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOverFolder(null) }}
              onDrop={e => { e.preventDefault(); handleDrop(key) }}
            >
              {/* Folder header */}
              <div
                className={[
                  'flex items-center gap-2 px-3 py-1.5 cursor-pointer select-none sticky top-0 z-10 transition-colors',
                  isRoot
                    ? `bg-gray-800/95 ${isDragOver ? 'bg-gray-700' : ''}`
                    : `border-l-2 ${color.border} ${isDragOver ? color.dragBg : color.bg}`,
                ].join(' ')}
                onClick={() => toggleCollapse(key)}
              >
                {!isRoot && <div className={`w-2 h-2 rounded-full flex-shrink-0 ${color.dot}`} />}
                <span className={`text-xs font-semibold uppercase tracking-wide ${isRoot ? 'text-gray-400' : color.text}`}>
                  {isRoot ? 'Uncategorized' : key}
                </span>
                <span className="text-xs text-gray-500">({files.length})</span>
                {isDragOver && <span className="text-xs text-gray-400 ml-1 italic">drop here</span>}
                <span className="ml-auto text-gray-600 text-xs">{isCollapsed ? '▶' : '▼'}</span>
              </div>

              {/* Files */}
              {!isCollapsed && (
                <div className="flex flex-col gap-1 p-2">
                  {files.map(file => {
                    const title = file.title || file.name.replace(/\.[^/.]+$/, '')
                    const isSelected = file.path === selectedPath
                    return (
                      <button
                        key={file.path}
                        draggable
                        onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setDragFilePath(file.path) }}
                        onDragEnd={() => { setDragFilePath(null); setDragOverFolder(null) }}
                        onClick={() => setSelectedPath(prev => prev === file.path ? null : file.path)}
                        className={[
                          'flex items-center gap-3 px-3 py-2 rounded-lg text-left w-full cursor-grab active:cursor-grabbing transition-colors',
                          dragFilePath === file.path ? 'opacity-40' : '',
                          isSelected
                            ? 'bg-indigo-900/50 border border-indigo-700'
                            : 'bg-gray-800 hover:bg-gray-700 border border-transparent',
                        ].join(' ')}
                      >
                        <div className="w-16 aspect-video bg-gray-700 rounded overflow-hidden flex-shrink-0 flex items-center justify-center">
                          {file.thumbnailUrl
                            ? <img src={file.thumbnailUrl} alt="" className="w-full h-full object-cover"
                                onError={e => { e.target.style.display = 'none' }} />
                            : <span className="text-gray-500 text-lg">▶</span>
                          }
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-white truncate">{title}</p>
                          <p className="text-xs text-gray-400 truncate">{file.uploader || '—'}</p>
                        </div>
                      </button>
                    )
                  })}
                  {files.length === 0 && (
                    <p className="text-xs text-gray-600 px-3 py-1.5 italic">Empty — drag files here</p>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {/* New folder control */}
        <div className="px-3 py-3 border-t border-gray-800 mt-1">
          {creating ? (
            <div className="flex gap-2">
              <input
                ref={inputRef}
                value={newFolderInput}
                onChange={e => setNewFolderInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleCreateFolder()
                  if (e.key === 'Escape') { setCreating(false); setNewFolderInput('') }
                }}
                placeholder="Folder name…"
                className="flex-1 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500"
              />
              <button onClick={handleCreateFolder} className="text-sm text-indigo-400 hover:text-indigo-300 px-2 py-1">
                Create
              </button>
              <button onClick={() => { setCreating(false); setNewFolderInput('') }} className="text-sm text-gray-500 hover:text-gray-400 px-2 py-1">
                Cancel
              </button>
            </div>
          ) : (
            <button onClick={() => setCreating(true)} className="text-xs text-gray-500 hover:text-gray-400 flex items-center gap-1.5 transition-colors">
              <span className="text-base leading-none">＋</span> New Folder
            </button>
          )}
        </div>
      </div>

      {selected && (
        <LibraryDetailPanel
          file={selected}
          onClose={() => setSelectedPath(null)}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  )
}
