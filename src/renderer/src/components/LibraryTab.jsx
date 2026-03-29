import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '../store/app-store.js'
import LibraryDetailPanel from './LibraryDetailPanel.jsx'
import LibraryToolbar from './LibraryToolbar.jsx'

// Stable color per folder name (derived from name hash so colors don't shift when folders are added)
const PALETTE = [
  {
    border: 'border-indigo-500',
    bg: 'bg-indigo-950/60',
    text: 'text-indigo-300',
    dot: 'bg-indigo-500',
    dragBg: 'bg-indigo-900/40',
    ring: 'ring-indigo-500'
  },
  {
    border: 'border-emerald-500',
    bg: 'bg-emerald-950/60',
    text: 'text-emerald-300',
    dot: 'bg-emerald-500',
    dragBg: 'bg-emerald-900/40',
    ring: 'ring-emerald-500'
  },
  {
    border: 'border-amber-500',
    bg: 'bg-amber-950/60',
    text: 'text-amber-300',
    dot: 'bg-amber-500',
    dragBg: 'bg-amber-900/40',
    ring: 'ring-amber-500'
  },
  {
    border: 'border-rose-500',
    bg: 'bg-rose-950/60',
    text: 'text-rose-300',
    dot: 'bg-rose-500',
    dragBg: 'bg-rose-900/40',
    ring: 'ring-rose-500'
  },
  {
    border: 'border-cyan-500',
    bg: 'bg-cyan-950/60',
    text: 'text-cyan-300',
    dot: 'bg-cyan-500',
    dragBg: 'bg-cyan-900/40',
    ring: 'ring-cyan-500'
  },
  {
    border: 'border-violet-500',
    bg: 'bg-violet-950/60',
    text: 'text-violet-300',
    dot: 'bg-violet-500',
    dragBg: 'bg-violet-900/40',
    ring: 'ring-violet-500'
  },
  {
    border: 'border-orange-500',
    bg: 'bg-orange-950/60',
    text: 'text-orange-300',
    dot: 'bg-orange-500',
    dragBg: 'bg-orange-900/40',
    ring: 'ring-orange-500'
  },
  {
    border: 'border-teal-500',
    bg: 'bg-teal-950/60',
    text: 'text-teal-300',
    dot: 'bg-teal-500',
    dragBg: 'bg-teal-900/40',
    ring: 'ring-teal-500'
  }
]

function folderColor(name) {
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return PALETTE[h % PALETTE.length]
}

export default function LibraryTab() {
  const {
    libraryFiles,
    setLibraryFiles,
    config,
    downloads,
    removeDownloadByUrl,
    librarySort,
    librarySearch,
    setLibrarySort,
    setLibrarySearch,
    librarySelectedFile,
    setLibrarySelectedFile
  } = useAppStore()
  const [allFolders, setAllFolders] = useState([])
  const [selectedPath, setSelectedPath] = useState(null)
  const [collapsed, setCollapsed] = useState(new Set())
  const [dragFilePath, setDragFilePath] = useState(null)
  const [dragOverFolder, setDragOverFolder] = useState(null)
  const [creating, setCreating] = useState(false)
  const [newFolderInput, setNewFolderInput] = useState('')
  const inputRef = useRef(null)
  const [contextMenu, setContextMenu] = useState(null) // { x, y, folder: string|null }
  const [renamingFolder, setRenamingFolder] = useState(null) // folder name being renamed
  const [renameInput, setRenameInput] = useState('')
  const renameInputRef = useRef(null)
  const skipRenameBlurRef = useRef(false)
  const [deletingFolder, setDeletingFolder] = useState(null) // { name, count }
  const [classifyStatus, setClassifyStatus] = useState(null) // null | 'running' | result string
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

  async function refresh() {
    const [files, folders] = await Promise.all([window.api.listLibrary(), window.api.listFolders()])
    setLibraryFiles(files)
    setAllFolders(folders)
  }

  async function handleAutoClassify() {
    setClassifyStatus('running')
    try {
      const result = await window.api.autoClassify()
      await refresh()
      setClassifyStatus(`Moved ${result.moved.length} · ${result.skipped} skipped`)
      setTimeout(() => setClassifyStatus(null), 3000)
    } catch {
      setClassifyStatus(null)
    }
  }

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 15_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (creating) inputRef.current?.focus()
  }, [creating])

  useEffect(() => {
    if (!contextMenu) return
    function close() {
      setContextMenu(null)
    }
    function onKey(e) {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [contextMenu])

  useEffect(() => {
    if (renamingFolder) renameInputRef.current?.focus()
  }, [renamingFolder])

  useEffect(() => {
    if (librarySelectedFile) {
      setSelectedPath(librarySelectedFile)
      setLibrarySelectedFile(null) // consume the request
    }
  }, [librarySelectedFile])

  // Exclude files that are still being downloaded
  const activeUrls = useMemo(
    () =>
      new Set(
        downloads
          .filter((d) => d.status === 'queued' || d.status === 'downloading')
          .map((d) => d.url)
          .filter(Boolean)
      ),
    [downloads]
  )

  const visibleFiles = useMemo(
    () =>
      libraryFiles.filter((f) => {
        if (f.name.includes('.part')) return false
        if (f.url && activeUrls.has(f.url)) return false
        return true
      }),
    [libraryFiles, activeUrls]
  )

  const hasUncategorized = useMemo(() => visibleFiles.some((f) => !f.folder), [visibleFiles])

  const { groups, groupKeys, totalResults } = useMemo(() => {
    const query = librarySearch.toLowerCase().trim()
    const filtered = query
      ? visibleFiles.filter((f) =>
          [f.title, f.uploader, f.description, f.url, f.name, f.folder].some(
            (v) => v && v.toLowerCase().includes(query)
          )
        )
      : visibleFiles

    const groups = {}
    for (const file of filtered) {
      const key = file.folder || '__root'
      if (!groups[key]) groups[key] = []
      groups[key].push(file)
    }

    const { field, direction } = librarySort
    for (const files of Object.values(groups)) {
      files.sort((a, b) => {
        if (field === 'date') {
          return direction === 'desc'
            ? new Date(b.mtime) - new Date(a.mtime)
            : new Date(a.mtime) - new Date(b.mtime)
        }
        const ta = (a.title || a.name).toLowerCase()
        const tb = (b.title || b.name).toLowerCase()
        return direction === 'asc' ? ta.localeCompare(tb) : tb.localeCompare(ta)
      })
    }

    const namedFolders = [
      ...new Set([...allFolders, ...visibleFiles.filter((f) => f.folder).map((f) => f.folder)])
    ]

    let namedKeys = query ? namedFolders.filter((k) => groups[k]?.length > 0) : namedFolders

    namedKeys.sort((a, b) => {
      if (field === 'date') {
        const aT = groups[a]?.length
          ? Math.max(...groups[a].map((f) => new Date(f.mtime).getTime()))
          : 0
        const bT = groups[b]?.length
          ? Math.max(...groups[b].map((f) => new Date(f.mtime).getTime()))
          : 0
        return direction === 'desc' ? bT - aT : aT - bT
      }
      if (field === 'name') {
        const aLabel = groups[a]?.[0]
          ? (groups[a][0].title || groups[a][0].name).toLowerCase()
          : a.toLowerCase()
        const bLabel = groups[b]?.[0]
          ? (groups[b][0].title || groups[b][0].name).toLowerCase()
          : b.toLowerCase()
        return direction === 'asc' ? aLabel.localeCompare(bLabel) : bLabel.localeCompare(aLabel)
      }
      return direction === 'asc'
        ? a.toLowerCase().localeCompare(b.toLowerCase())
        : b.toLowerCase().localeCompare(a.toLowerCase())
    })

    const showRoot = !query || groups['__root']?.length > 0
    const groupKeys = [...(showRoot ? ['__root'] : []), ...namedKeys]

    return { groups, groupKeys, totalResults: filtered.length }
  }, [visibleFiles, librarySort, librarySearch, allFolders])

  const selected = selectedPath ? visibleFiles.find((f) => f.path === selectedPath) : null

  function toggleCollapse(key) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  async function handleDelete(file, { confirm: askConfirm = true } = {}) {
    if (askConfirm && config.confirmDelete !== false) {
      const title = file.title || file.name.replace(/\.[^/.]+$/, '')
      const ok = window.confirm(`Move "${title}" to Trash?`)
      if (!ok) return
    }
    await window.api.deleteFile(file.path)
    setLibraryFiles(libraryFiles.filter((f) => f.path !== file.path))
    if (selectedPath === file.path) setSelectedPath(null)
    if (file.url) removeDownloadByUrl(file.url)
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
    if (!name) {
      setCreating(false)
      return
    }
    await window.api.createFolder(name)
    setNewFolderInput('')
    setCreating(false)
    await refresh()
  }

  async function handleRenameFolder() {
    if (skipRenameBlurRef.current) {
      skipRenameBlurRef.current = false
      return
    }
    const name = renameInput.trim()
    setRenamingFolder(null)
    setRenameInput('')
    if (!name || name === renamingFolder) return
    await window.api.renameFolder(renamingFolder, name)
    await refresh()
  }

  async function handleDeleteFolder(strategy) {
    const name = deletingFolder.name
    setDeletingFolder(null)
    await window.api.deleteFolder(name, strategy)
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

  const isEmpty = visibleFiles.length === 0 && allFolders.length === 0
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
      <div className="flex-1 flex flex-col overflow-hidden">
        <LibraryToolbar
          sort={librarySort}
          search={librarySearch}
          onSortChange={setLibrarySort}
          onSearchChange={setLibrarySearch}
          resultCount={totalResults}
          onAutoClassify={handleAutoClassify}
          classifyStatus={classifyStatus}
          hasUncategorized={hasUncategorized}
        />
        <div
          className="flex-1 overflow-y-auto"
          onContextMenu={(e) => {
            if (e.target === e.currentTarget) {
              e.preventDefault()
              setContextMenu({ x: e.clientX, y: e.clientY, folder: null })
            }
          }}
        >
          {groupKeys.map((key) => {
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
                    : ''
                ].join(' ')}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragOverFolder(key)
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget)) setDragOverFolder(null)
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  handleDrop(key)
                }}
              >
                {/* Folder header */}
                <div
                  className={[
                    'flex items-center gap-2 px-3 py-1.5 cursor-pointer select-none sticky top-0 z-10 transition-colors',
                    isRoot
                      ? `bg-gray-800/95 ${isDragOver ? 'bg-gray-700' : ''}`
                      : `border-l-2 ${color.border} ${isDragOver ? color.dragBg : color.bg}`
                  ].join(' ')}
                  onClick={() => toggleCollapse(key)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setContextMenu({ x: e.clientX, y: e.clientY, folder: isRoot ? null : key })
                  }}
                >
                  {!isRoot && <div className={`w-2 h-2 rounded-full flex-shrink-0 ${color.dot}`} />}
                  {!isRoot && renamingFolder === key ? (
                    <input
                      ref={renameInputRef}
                      value={renameInput}
                      onChange={(e) => setRenameInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRenameFolder()
                        if (e.key === 'Escape') {
                          setRenamingFolder(null)
                          setRenameInput('')
                        }
                      }}
                      onBlur={handleRenameFolder}
                      onClick={(e) => e.stopPropagation()}
                      className={`flex-1 bg-transparent border-b border-indigo-500 text-xs font-semibold uppercase tracking-wide focus:outline-none ${color.text}`}
                    />
                  ) : (
                    <span
                      className={`text-xs font-semibold uppercase tracking-wide ${isRoot ? 'text-gray-400' : color.text}`}
                    >
                      {isRoot ? 'Uncategorized' : key}
                    </span>
                  )}
                  <span className="text-xs text-gray-500">({files.length})</span>
                  {isDragOver && (
                    <span className="text-xs text-gray-400 ml-1 italic">drop here</span>
                  )}
                  <span className="ml-auto text-gray-600 text-xs">{isCollapsed ? '▶' : '▼'}</span>
                </div>

                {/* Files */}
                {!isCollapsed && (
                  <div className="flex flex-col gap-1 p-2">
                    {files.map((file) => {
                      const title = file.title || file.name.replace(/\.[^/.]+$/, '')
                      const isSelected = file.path === selectedPath
                      return (
                        <div
                          key={file.path}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.effectAllowed = 'move'
                            setDragFilePath(file.path)
                          }}
                          onDragEnd={() => {
                            setDragFilePath(null)
                            setDragOverFolder(null)
                          }}
                          className={[
                            'group flex items-center gap-3 px-3 py-2 rounded-lg w-full cursor-grab active:cursor-grabbing transition-colors',
                            dragFilePath === file.path ? 'opacity-40' : '',
                            isSelected
                              ? 'bg-indigo-900/50 border border-indigo-700'
                              : 'bg-gray-800 hover:bg-gray-700 border border-transparent'
                          ].join(' ')}
                        >
                          <button
                            className="flex items-center gap-3 text-left flex-1 min-w-0"
                            onClick={() =>
                              setSelectedPath((prev) => (prev === file.path ? null : file.path))
                            }
                          >
                            <div className="w-16 aspect-video bg-gray-700 rounded overflow-hidden flex-shrink-0 flex items-center justify-center">
                              <span className="text-gray-500 text-lg">
                                {file.name?.endsWith('.ref') ? '🔖' : '▶'}
                              </span>
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-white truncate">{title}</p>
                              <p className="text-xs text-gray-400 truncate">
                                {file.uploader || '—'}
                              </p>
                            </div>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDelete(file, { confirm: false })
                            }}
                            className="opacity-0 group-hover:opacity-100 flex-shrink-0 p-1.5 rounded text-gray-600 hover:text-red-400 hover:bg-red-950/60 transition-all"
                            title="Move to Trash"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6l-1 14H6L5 6" />
                              <path d="M10 11v6" />
                              <path d="M14 11v6" />
                              <path d="M9 6V4h6v2" />
                            </svg>
                          </button>
                        </div>
                      )
                    })}
                    {files.length === 0 && (
                      <p className="text-xs text-gray-600 px-3 py-1.5 italic">
                        Empty — drag files here
                      </p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>{' '}
        {/* end scroll area */}
        {/* Inline new folder input (triggered from context menu) */}
        {creating && (
          <div className="px-3 py-3 border-t border-gray-800 mt-1 flex gap-2">
            <input
              ref={inputRef}
              value={newFolderInput}
              onChange={(e) => setNewFolderInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateFolder()
                if (e.key === 'Escape') {
                  setCreating(false)
                  setNewFolderInput('')
                }
              }}
              placeholder="Folder name…"
              className="flex-1 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500"
            />
            <button
              onClick={handleCreateFolder}
              className="text-sm text-indigo-400 hover:text-indigo-300 px-2 py-1"
            >
              Create
            </button>
            <button
              onClick={() => {
                setCreating(false)
                setNewFolderInput('')
              }}
              className="text-sm text-gray-500 hover:text-gray-400 px-2 py-1"
            >
              Cancel
            </button>
          </div>
        )}
      </div>{' '}
      {/* end flex-col */}
      {/* Context menu */}
      {contextMenu && (
        <div
          style={{ position: 'fixed', top: contextMenu.y, left: contextMenu.x, zIndex: 1000 }}
          className="bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1 min-w-[148px]"
          onMouseDown={(e) => {
            e.stopPropagation()
            if (renamingFolder) skipRenameBlurRef.current = true
          }}
        >
          <button
            onClick={() => {
              setContextMenu(null)
              setCreating(true)
            }}
            className="w-full text-left px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-700 transition-colors"
          >
            New Folder
          </button>
          {contextMenu.folder && (
            <>
              <div className="border-t border-gray-700 my-1" />
              <button
                onClick={() => {
                  setRenameInput(contextMenu.folder)
                  setRenamingFolder(contextMenu.folder)
                  setContextMenu(null)
                }}
                className="w-full text-left px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-700 transition-colors"
              >
                Rename
              </button>
              <button
                onClick={() => {
                  setDeletingFolder({
                    name: contextMenu.folder,
                    count: groups[contextMenu.folder]?.length ?? 0
                  })
                  setContextMenu(null)
                }}
                className="w-full text-left px-3 py-1.5 text-sm text-red-400 hover:bg-red-950/40 transition-colors"
              >
                Delete
              </button>
            </>
          )}
        </div>
      )}
      {/* Delete folder dialog */}
      {deletingFolder && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          onMouseDown={() => setDeletingFolder(null)}
        >
          <div
            className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3 className="text-white font-semibold mb-2">
              Delete &quot;{deletingFolder.name}&quot;
            </h3>
            <p className="text-gray-400 text-sm mb-5">
              What should happen to the {deletingFolder.count} file
              {deletingFolder.count !== 1 ? 's' : ''} in this folder?
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => handleDeleteFolder('unassign')}
                className="px-4 py-2 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors text-left"
              >
                Move to Uncategorized
              </button>
              <button
                onClick={() => handleDeleteFolder('delete')}
                className="px-4 py-2 text-sm bg-red-950/60 hover:bg-red-900/60 text-red-300 border border-red-800 rounded-lg transition-colors text-left"
              >
                Delete files permanently
              </button>
              <button
                onClick={() => setDeletingFolder(null)}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-400 transition-colors text-left"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      <div
        role="separator"
        className="w-1 bg-gray-800 hover:bg-blue-600 cursor-col-resize flex-shrink-0 flex items-center justify-center transition-colors"
        onMouseDown={handleSideDragStart}
      >
        <div className="h-6 w-0.5 bg-gray-600 rounded pointer-events-none" />
      </div>
      {selected ? (
        <LibraryDetailPanel
          file={selected}
          onClose={() => setSelectedPath(null)}
          onDelete={handleDelete}
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
