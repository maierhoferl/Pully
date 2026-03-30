import React, { useState } from 'react'

function ChevronIcon({ isExpanded }) {
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
      style={{ transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s' }}
    >
      <polyline points="6 9 12 15 18 9"></polyline>
    </svg>
  )
}

function FolderIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      opacity="0.7"
    >
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
    </svg>
  )
}

export default function FileTree({ currentFolder, onNavigate, onSelectFolder }) {
  const [expanded, setExpanded] = useState(new Set([currentFolder]))
  const [tree, setTree] = useState([])
  const [loading, setLoading] = useState(false)

  React.useEffect(() => {
    loadRoots()
  }, [])

  async function loadRoots() {
    setLoading(true)
    try {
      const roots = await window.api.files.listRoots()
      setTree(roots.map(root => ({ name: root, path: root, isDirectory: true, children: [] })))
    } catch (error) {
      console.error('Failed to load roots:', error)
    }
    setLoading(false)
  }

  async function expandFolder(folderPath) {
    if (expanded.has(folderPath)) {
      setExpanded(new Set([...expanded].filter(p => p !== folderPath)))
      return
    }

    try {
      const items = await window.api.files.listDir(folderPath)
      const folders = items.filter(i => i.isDirectory)
      setExpanded(new Set([...expanded, folderPath]))
    } catch (error) {
      console.error('Failed to expand folder:', error)
    }
  }

  function renderNode(folder, depth = 0) {
    const isExpanded = expanded.has(folder.path)

    return (
      <div key={folder.path}>
        <div
          className={`flex items-center p-2 cursor-pointer transition-colors ${
            currentFolder === folder.path
              ? 'bg-indigo-950/60 text-indigo-300 border-l-2 border-indigo-500'
              : 'hover:bg-gray-800 text-gray-300'
          }`}
          onClick={() => {
            expandFolder(folder.path)
            onNavigate(folder.path)
          }}
          style={{ paddingLeft: `${8 + depth * 16}px` }}
        >
          {folder.isDirectory && (
            <ChevronIcon isExpanded={isExpanded} />
          )}
          <div className="ml-2" style={{ color: '#f59e0b' }}>
            <FolderIcon />
          </div>
          <span className="ml-2 text-sm truncate">{folder.name}</span>
        </div>
      </div>
    )
  }

  if (loading) return <div className="p-4 text-gray-400">Loading...</div>

  return (
    <div className="h-full overflow-y-auto bg-gray-900 p-2 text-sm">
      <div className="font-semibold mb-2 text-gray-400 px-1">Places</div>
      {tree.map(root => renderNode(root))}
    </div>
  )
}
