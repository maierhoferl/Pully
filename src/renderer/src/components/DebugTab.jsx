// src/renderer/src/components/DebugTab.jsx
import { useState, useRef, useEffect } from 'react'
import { useAppStore } from '../store/app-store'

const CATEGORIES = ['Download', 'Classify', 'Summarize', 'Notes', 'App']
const LEVELS = ['Info', 'Warn', 'Error']

export function DebugTab() {
  const logEntries = useAppStore((state) => state.logEntries)
  const [selectedCategories, setSelectedCategories] = useState(
    new Set(['download', 'classify', 'summarize', 'notes']) // All except 'app'
  )
  const [selectedLevels, setSelectedLevels] = useState(
    new Set(['warn', 'error']) // Warn and Error by default
  )
  const [pauseScroll, setPauseScroll] = useState(false)
  const listEndRef = useRef(null)

  // Auto-scroll to bottom unless paused
  useEffect(() => {
    if (!pauseScroll && listEndRef.current) {
      listEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logEntries, pauseScroll])

  const toggleCategory = (categoryLabel) => {
    const categoryValue = categoryLabel.toLowerCase()
    const newSelected = new Set(selectedCategories)
    if (newSelected.has(categoryValue)) {
      newSelected.delete(categoryValue)
    } else {
      newSelected.add(categoryValue)
    }
    setSelectedCategories(newSelected)
  }

  const toggleLevel = (levelLabel) => {
    const levelValue = levelLabel.toLowerCase()
    const newSelected = new Set(selectedLevels)
    if (newSelected.has(levelValue)) {
      newSelected.delete(levelValue)
    } else {
      newSelected.add(levelValue)
    }
    setSelectedLevels(newSelected)
  }

  const filtered = logEntries.filter((entry) => {
    const catMatch = selectedCategories.has(entry.category)
    const levelMatch = selectedLevels.has(entry.level)
    return catMatch && levelMatch
  })

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
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

  const getCategoryBgColor = (category) => {
    const colors = {
      download: 'bg-green-100 text-green-800',
      classify: 'bg-purple-100 text-purple-800',
      summarize: 'bg-orange-100 text-orange-800',
      notes: 'bg-blue-100 text-blue-800',
      app: 'bg-gray-100 text-gray-800'
    }
    return colors[category.toLowerCase()] || 'bg-gray-100 text-gray-800'
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Toolbar */}
      <div className="bg-white border-b border-gray-200 p-4 space-y-3">
        {/* Category Filter - Multi-select */}
        <div>
          <div className="text-xs font-semibold text-gray-700 mb-2">Categories</div>
          <div className="flex gap-3 flex-wrap">
            {CATEGORIES.map((cat) => (
              <label key={cat} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedCategories.has(cat.toLowerCase())}
                  onChange={() => toggleCategory(cat)}
                  className="rounded"
                />
                <span className="text-sm text-gray-700">{cat}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Level Filter - Multi-select */}
        <div>
          <div className="text-xs font-semibold text-gray-700 mb-2">Level</div>
          <div className="flex gap-3 flex-wrap">
            {LEVELS.map((level) => (
              <label key={level} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedLevels.has(level.toLowerCase())}
                  onChange={() => toggleLevel(level)}
                  className="rounded"
                />
                <span className="text-sm text-gray-700">{level}</span>
              </label>
            ))}
          </div>
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

      {/* Log Table */}
      <div className="flex-1 overflow-auto">
        {filtered.length === 0 ? (
          <div className="text-center text-gray-500 py-8">No log entries</div>
        ) : (
          <table className="w-full border-collapse">
            <thead className="bg-gray-200 sticky top-0">
              <tr>
                <th className="border border-gray-300 px-3 py-2 text-left text-xs font-semibold text-gray-700 w-32">
                  Time
                </th>
                <th className="border border-gray-300 px-3 py-2 text-left text-xs font-semibold text-gray-700 w-20">
                  Level
                </th>
                <th className="border border-gray-300 px-3 py-2 text-left text-xs font-semibold text-gray-700 w-24">
                  Category
                </th>
                <th className="border border-gray-300 px-3 py-2 text-left text-xs font-semibold text-gray-700 flex-1">
                  Message
                </th>
                <th className="border border-gray-300 px-3 py-2 text-center text-xs font-semibold text-gray-700 w-12">
                  Meta
                </th>
              </tr>
            </thead>
            <tbody>
              {[...filtered].reverse().map((entry, idx) => (
                <tr key={idx} className="border-b hover:bg-gray-100 transition-colors">
                  <td className="border border-gray-300 px-3 py-2 text-xs text-gray-600 font-mono whitespace-nowrap">
                    {new Date(entry.ts).toLocaleTimeString()}
                  </td>
                  <td className="border border-gray-300 px-3 py-2">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-bold ${getLevelColor(
                        entry.level
                      )}`}
                    >
                      {entry.level.toUpperCase()}
                    </span>
                  </td>
                  <td className="border border-gray-300 px-3 py-2">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium ${getCategoryBgColor(
                        entry.category
                      )}`}
                    >
                      {entry.category}
                    </span>
                  </td>
                  <td className="border border-gray-300 px-3 py-2 text-sm text-gray-800 max-w-md truncate">
                    <div className="flex items-center gap-2">
                      <span className="flex-1 truncate">{entry.message}</span>
                      <button
                        onClick={() => copyToClipboard(entry.message)}
                        className="flex-shrink-0 px-2 py-1 bg-gray-300 text-gray-700 rounded text-xs font-medium hover:bg-gray-400 transition-colors"
                        title="Copy message"
                      >
                        Copy
                      </button>
                    </div>
                  </td>
                  <td className="border border-gray-300 px-3 py-2 text-center">
                    {entry.meta ? (
                      <details className="cursor-pointer">
                        <summary className="text-xs text-blue-600 font-semibold select-none">
                          View
                        </summary>
                        <pre className="mt-2 text-xs bg-gray-800 text-gray-100 p-2 rounded overflow-auto max-h-48">
                          {JSON.stringify(entry.meta, null, 2)}
                        </pre>
                      </details>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div ref={listEndRef} />
      </div>
    </div>
  )
}
