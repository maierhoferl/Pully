import React, { useRef } from 'react'
import { useAppStore } from '../store/app-store.js'

export default function BrowserTabBar() {
  const {
    browserTabs,
    activeBrowserTabId,
    addBrowserTab,
    closeBrowserTab,
    closeOtherBrowserTabs,
    setActiveBrowserTab,
    reorderBrowserTabs
  } = useAppStore()

  const dragTabId = useRef(null)

  function handleDragStart(e, id) {
    dragTabId.current = id
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDragOver(e, id) {
    e.preventDefault()
    if (dragTabId.current === id) return
    const fromIdx = browserTabs.findIndex((t) => t.id === dragTabId.current)
    const toIdx = browserTabs.findIndex((t) => t.id === id)
    if (fromIdx === -1 || toIdx === -1) return
    const reordered = [...browserTabs]
    const [moved] = reordered.splice(fromIdx, 1)
    reordered.splice(toIdx, 0, moved)
    reorderBrowserTabs(reordered)
  }

  function handleDrop(e) {
    e.preventDefault()
    dragTabId.current = null
  }

  return (
    <div
      className="flex items-center h-8 bg-gray-950 border-b border-gray-700 select-none overflow-x-auto"
      style={{ WebkitAppRegion: 'no-drag' }}
    >
      {/* Tab list */}
      <div className="flex items-end flex-1 min-w-0 overflow-x-auto gap-0.5 px-1">
        {browserTabs.map((tab) => {
          const isActive = tab.id === activeBrowserTabId
          return (
            <div
              key={tab.id}
              draggable
              onDragStart={(e) => handleDragStart(e, tab.id)}
              onDragOver={(e) => handleDragOver(e, tab.id)}
              onDrop={handleDrop}
              onClick={() => setActiveBrowserTab(tab.id)}
              className={`group flex items-center gap-1.5 px-2 py-0.5 rounded-t text-xs cursor-pointer flex-shrink-0 min-w-[80px] max-w-[200px] transition-colors ${
                isActive
                  ? 'bg-gray-800 text-white'
                  : 'bg-gray-900 text-gray-400 hover:bg-gray-800 hover:text-gray-200'
              }`}
              style={{ userSelect: 'none' }}
            >
              {/* Favicon */}
              {tab.favicon ? (
                <img src={tab.favicon} className="w-3.5 h-3.5 flex-shrink-0" alt="" />
              ) : (
                <div className="w-3.5 h-3.5 rounded-sm bg-gray-600 flex-shrink-0" />
              )}
              {/* Title */}
              <span className="flex-1 truncate min-w-0">
                {tab.suspended ? `💤 ${tab.title}` : tab.title}
              </span>
              {/* Close button */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  closeBrowserTab(tab.id)
                }}
                className="flex-shrink-0 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-white leading-none"
                title="Close tab"
              >
                ×
              </button>
            </div>
          )
        })}
      </div>

      {/* New tab button */}
      <button
        onClick={() => addBrowserTab()}
        className="flex-shrink-0 px-2 py-0.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded text-sm leading-none"
        title="New tab (⌘T)"
      >
        +
      </button>

      {/* Close others button */}
      <button
        onClick={closeOtherBrowserTabs}
        className="flex-shrink-0 px-2 py-0.5 text-gray-500 hover:text-white hover:bg-gray-700 rounded text-xs leading-none mr-1"
        title="Close other tabs"
        disabled={browserTabs.length <= 1}
      >
        ⊗
      </button>
    </div>
  )
}
