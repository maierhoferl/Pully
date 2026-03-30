import React, { useState, useEffect } from 'react'

function FileIcon({ color = '#6b7280' }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
      <polyline points="13 2 13 9 20 9"></polyline>
    </svg>
  )
}

function FolderIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="#f59e0b"
      opacity="0.8"
    >
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#22c55e"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
  )
}

function BookmarkIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#a78bfa"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
    </svg>
  )
}

function ChevronUpIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="18 15 12 9 6 15"></polyline>
    </svg>
  )
}

const ICON_MAP = {
  pdf: <FileIcon color="#ef4444" />,
  document: <FileIcon color="#3b82f6" />,
  image: <FileIcon color="#22c55e" />,
  text: <FileIcon color="#6b7280" />,
  folder: <FolderIcon />,
  other: <FileIcon color="#9ca3af" />,
}

export default function FileList({
  currentFolder,
  selectedPath,
  onSelectFile,
  onNavigateFolder,
  rememberedPaths,
  onRememberFile,
}) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadFolder()
  }, [currentFolder])

  async function loadFolder() {
    setLoading(true)
    try {
      const result = await window.api.files.listDir(currentFolder)
      if (result.error) {
        console.error(result.error)
        setItems([])
      } else {
        setItems(result)
      }
    } catch (error) {
      console.error('Failed to list folder:', error)
    }
    setLoading(false)
  }

  function getIcon(item) {
    if (item.isDirectory) return ICON_MAP.folder
    return ICON_MAP[item.type] || ICON_MAP.other
  }

  function isSelectable(item) {
    return !item.isDirectory && item.type !== 'other'
  }

  function goToParent() {
    const parts = currentFolder.split('/')
    if (parts.length > 1) {
      parts.pop()
      const parentPath = parts.join('/') || '/'
      onNavigateFolder(parentPath)
    }
  }

  function selectAll() {
    items.forEach(item => {
      if (isSelectable(item)) {
        onSelectFile(item)
      }
    })
  }

  function deselectAll() {
    // Clear selection by clicking on first non-selectable or by calling handler with null
    // This would need to be implemented based on how selection is handled
  }

  async function handleRemember(item, e) {
    e.stopPropagation()
    if (onRememberFile) {
      await onRememberFile(item)
    }
  }

  if (loading) return <div className="p-4 text-white">Loading...</div>

  // Check if we can go up (not at root)
  const canGoUp = currentFolder !== '/' && currentFolder.length > 1

  return (
    <div className="h-full flex flex-col bg-gray-950">
      {/* Toolbar */}
      <div className="border-b border-gray-800 bg-gray-900 p-2 flex items-center gap-2">
        <button
          onClick={goToParent}
          disabled={!canGoUp}
          className={`flex items-center gap-1 px-2 py-1 rounded text-sm transition-colors ${
            canGoUp
              ? 'text-white hover:bg-gray-800 active:bg-gray-700'
              : 'text-gray-600 cursor-not-allowed opacity-50'
          }`}
          title="Parent folder"
        >
          <ChevronUpIcon />
          Up
        </button>

        <div className="w-px h-5 bg-gray-700"></div>

        <button
          onClick={selectAll}
          className="flex items-center gap-1 px-2 py-1 rounded text-sm text-white hover:bg-gray-800 active:bg-gray-700 transition-colors"
          title="Select all files"
        >
          ✓ All
        </button>

        <button
          onClick={deselectAll}
          className="flex items-center gap-1 px-2 py-1 rounded text-sm text-white hover:bg-gray-800 active:bg-gray-700 transition-colors"
          title="Deselect all"
        >
          ✕ None
        </button>
      </div>

      {/* Items list */}
      <div className="flex-1 overflow-y-auto">
        {items.map(item => (
          <div
            key={item.path}
            className={`flex items-center gap-2 p-2 border-b border-gray-800 cursor-pointer transition-colors group ${
              item.path === selectedPath
                ? 'bg-indigo-950/60 text-white border-l-2 border-indigo-500'
                : 'text-white hover:bg-gray-900'
            } ${!isSelectable(item) && item.isDirectory ? '' : !isSelectable(item) ? 'opacity-40 cursor-default' : ''}`}
            onClick={() => {
              if (item.isDirectory) {
                onNavigateFolder(item.path)
              } else if (isSelectable(item)) {
                onSelectFile(item)
              }
            }}
          >
            {getIcon(item)}
            <span className="flex-1 text-sm truncate">{item.name}</span>

            {/* Remember button */}
            {!item.isDirectory && isSelectable(item) && (
              <button
                onClick={(e) => handleRemember(item, e)}
                className={`p-1 rounded transition-opacity ${
                  rememberedPaths?.includes(item.path)
                    ? 'opacity-100'
                    : 'opacity-0 group-hover:opacity-100'
                }`}
                title={rememberedPaths?.includes(item.path) ? 'Already remembered' : 'Remember this file'}
              >
                <BookmarkIcon />
              </button>
            )}

            {/* Remembered indicator */}
            {rememberedPaths?.includes(item.path) && (
              <CheckIcon />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
