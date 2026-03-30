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
      opacity="0.7"
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

  if (loading) return <div className="p-4 text-white">Loading...</div>

  return (
    <div className="h-full flex flex-col bg-gray-950">
      <div className="flex-1 overflow-y-auto">
        {items.map(item => (
          <div
            key={item.path}
            className={`flex items-center gap-2 p-2 border-b border-gray-800 cursor-pointer transition-colors ${
              item.path === selectedPath
                ? 'bg-indigo-950/60 text-white border-l-2 border-indigo-500'
                : 'text-white hover:bg-gray-900'
            } ${!isSelectable(item) ? 'opacity-40 cursor-default' : ''}`}
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
            {rememberedPaths?.includes(item.path) && (
              <CheckIcon />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
