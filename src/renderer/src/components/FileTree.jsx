import React, { useState, useEffect, useCallback } from 'react'

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
      opacity="0.8"
    >
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
    </svg>
  )
}

export default function FileTree({ currentFolder, onNavigate }) {
  const [expanded, setExpanded] = useState(new Set())
  const [treeData, setTreeData] = useState({})
  const [loading, setLoading] = useState(false)
  const [homeDir, setHomeDir] = useState(null)

  // Initialize with home directory
  useEffect(() => {
    const initHomeDir = async () => {
      try {
        const dir = await window.api.files.getLastDir()
        setHomeDir(dir)
        setExpanded(new Set([dir]))
        loadFolderChildren(dir)
      } catch (error) {
        console.error('Failed to get home directory:', error)
      }
    }
    initHomeDir()
  }, [])

  // Sync left panel selection when currentFolder changes
  useEffect(() => {
    if (currentFolder && !expanded.has(currentFolder)) {
      // Expand parent folders of currentFolder
      const expandParents = async () => {
        const newExpanded = new Set(expanded)
        let pathParts = currentFolder.split('/').filter(Boolean)
        for (let i = pathParts.length; i > 0; i--) {
          const parentPath = '/' + pathParts.slice(0, i).join('/')
          newExpanded.add(parentPath)
          if (!treeData[parentPath]) {
            await loadFolderChildren(parentPath)
          }
        }
        setExpanded(newExpanded)
      }
      expandParents()
    }
  }, [currentFolder])

  async function loadFolderChildren(folderPath) {
    try {
      const items = await window.api.files.listDir(folderPath)
      const folders = items.filter(i => i.isDirectory).sort((a, b) => a.name.localeCompare(b.name))
      setTreeData(prev => ({
        ...prev,
        [folderPath]: folders
      }))
    } catch (error) {
      console.error(`Failed to load children for ${folderPath}:`, error)
      setTreeData(prev => ({
        ...prev,
        [folderPath]: []
      }))
    }
  }

  const toggleFolder = useCallback(async (folderPath) => {
    const newExpanded = new Set(expanded)
    if (newExpanded.has(folderPath)) {
      newExpanded.delete(folderPath)
    } else {
      newExpanded.add(folderPath)
      // Load children if not already loaded
      if (!treeData[folderPath]) {
        await loadFolderChildren(folderPath)
      }
    }
    setExpanded(newExpanded)
  }, [expanded, treeData])

  function renderNode(folder, depth = 0) {
    const isExpanded = expanded.has(folder.path)
    const children = treeData[folder.path] || []

    return (
      <div key={folder.path}>
        <div
          className={`flex items-center p-2 cursor-pointer transition-colors ${
            currentFolder === folder.path
              ? 'bg-indigo-950/60 border-l-2 border-indigo-500 text-white'
              : 'hover:bg-gray-800 text-white'
          }`}
          onClick={() => {
            if (children.length > 0 || !treeData[folder.path]) {
              toggleFolder(folder.path)
            }
            onNavigate(folder.path)
          }}
          style={{ paddingLeft: `${8 + depth * 16}px` }}
        >
          {children.length > 0 && (
            <ChevronIcon isExpanded={isExpanded} />
          )}
          {!children.length && treeData[folder.path] === undefined && (
            <div className="w-4" />
          )}
          {children.length === 0 && treeData[folder.path] !== undefined && (
            <div className="w-4" />
          )}
          <div className="ml-2" style={{ color: '#f59e0b' }}>
            <FolderIcon />
          </div>
          <span className="ml-2 text-sm truncate">{folder.name}</span>
        </div>
        {isExpanded && children.length > 0 && (
          <div>
            {children.map(child => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  if (!homeDir) return <div className="p-4 text-white">Loading...</div>

  return (
    <div className="h-full overflow-y-auto bg-gray-900 p-2 text-sm">
      <div className="font-semibold mb-2 text-white px-1">Folders</div>
      {homeDir && renderNode({ name: homeDir.split('/').pop() || homeDir, path: homeDir, isDirectory: true })}
    </div>
  )
}
