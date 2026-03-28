// src/renderer/src/components/DebugTab.jsx
import { useState, useRef, useEffect } from 'react'
import { useAppStore } from '../store/app-store'

const CATEGORIES = ['All', 'Download', 'Classify', 'Summarize', 'Notes', 'App']
const LEVELS = ['All', 'Info', 'Warn', 'Error']

export function DebugTab() {
  const logEntries = useAppStore((state) => state.logEntries)
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [levelFilter, setLevelFilter] = useState('All')
  const [pauseScroll, setPauseScroll] = useState(false)
  const [expandedRows, setExpandedRows] = useState(new Set())
  const listEndRef = useRef(null)

  // Auto-scroll to bottom unless paused
  useEffect(() => {
    if (!pauseScroll && listEndRef.current) {
      listEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logEntries, pauseScroll])

  const filtered = logEntries.filter((entry) => {
    const catMatch =
      categoryFilter === 'All' ||
      entry.category.toLowerCase() === categoryFilter.toLowerCase()
    const levelMatch =
      levelFilter === 'All' ||
      entry.level.toLowerCase() === levelFilter.toLowerCase()
    return catMatch && levelMatch
  })

  const toggleExpand = (index) => {
    const newExpanded = new Set(expandedRows)
    if (newExpanded.has(index)) {
      newExpanded.delete(index)
    } else {
      newExpanded.add(index)
    }
    setExpandedRows(newExpanded)
  }

  const handleClear = () => {
    useAppStore.setState({ logEntries: [] })
  }

  const getLevelColor = (level) => {
    switch (level) {
      case 'info':
        return 'bg-blue-100 text-blue-800'
      case 'warn':
        return 'bg-yellow-100 text-yellow-800'
      case 'error':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getCategoryColor = (category) => {
    const colors = {
      download: 'bg-green-50 border-l-4 border-green-500',
      classify: 'bg-purple-50 border-l-4 border-purple-500',
      summarize: 'bg-orange-50 border-l-4 border-orange-500',
      notes: 'bg-blue-50 border-l-4 border-blue-500',
      app: 'bg-gray-50 border-l-4 border-gray-500'
    }
    return colors[category] || 'bg-gray-50'
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Toolbar */}
      <div className="bg-white border-b border-gray-200 p-4 space-y-3">
        {/* Category Filter */}
        <div className="flex gap-2 flex-wrap">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                categoryFilter === cat
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Level Filter */}
        <div className="flex gap-2 flex-wrap">
          {LEVELS.map((level) => (
            <button
              key={level}
              onClick={() => setLevelFilter(level)}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                levelFilter === level
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {level}
            </button>
          ))}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <button
            onClick={handleClear}
            className="px-3 py-1 bg-red-500 text-white rounded text-sm font-medium hover:bg-red-600"
          >
            Clear
          </button>
          <button
            onClick={() => setPauseScroll(!pauseScroll)}
            className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
              pauseScroll
                ? 'bg-orange-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            {pauseScroll ? '▶ Resume' : '⏸ Pause'}
          </button>
        </div>

        <div className="text-xs text-gray-500">
          {filtered.length} of {logEntries.length} entries
        </div>
      </div>

      {/* Log List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {filtered.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            No log entries
          </div>
        ) : (
          filtered.map((entry, idx) => (
            <div
              key={idx}
              className={`p-3 rounded border cursor-pointer transition-all ${getCategoryColor(
                entry.category
              )}`}
              onClick={() => toggleExpand(idx)}
            >
              {/* Log row */}
              <div className="flex items-start gap-2">
                <span className="text-xs text-gray-500 flex-shrink-0 font-mono">
                  {new Date(entry.ts).toLocaleTimeString()}
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-xs font-bold flex-shrink-0 ${getLevelColor(
                    entry.level
                  )}`}
                >
                  {entry.level.toUpperCase()}
                </span>
                <span className="px-2 py-0.5 bg-gray-200 text-gray-800 rounded text-xs font-medium flex-shrink-0">
                  {entry.category}
                </span>
                <span className="text-sm flex-1">{entry.message}</span>
              </div>

              {/* Expanded meta */}
              {expandedRows.has(idx) && entry.meta && (
                <div className="mt-2 ml-24 pt-2 border-t border-gray-300">
                  <pre className="text-xs bg-gray-800 text-gray-100 p-2 rounded overflow-auto">
                    {JSON.stringify(entry.meta, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ))
        )}
        <div ref={listEndRef} />
      </div>
    </div>
  )
}
