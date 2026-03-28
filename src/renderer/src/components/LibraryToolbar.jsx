import React from 'react'

const SORT_CYCLE = [
  { field: 'date',   direction: 'desc', label: 'Date ↓' },
  { field: 'date',   direction: 'asc',  label: 'Date ↑' },
  { field: 'name',   direction: 'asc',  label: 'Name ↑' },
  { field: 'name',   direction: 'desc', label: 'Name ↓' },
  { field: 'folder', direction: 'asc',  label: 'Folder A–Z' },
  { field: 'folder', direction: 'desc', label: 'Folder Z–A' },
]

export default function LibraryToolbar({ sort, search, onSortChange, onSearchChange, resultCount }) {
  const idx = SORT_CYCLE.findIndex(s => s.field === sort.field && s.direction === sort.direction)
  const isDefault = sort.field === 'date' && sort.direction === 'desc'
  const label = idx >= 0 ? SORT_CYCLE[idx].label : 'Date ↓'

  function cycleSort() {
    const next = SORT_CYCLE[(idx + 1) % SORT_CYCLE.length]
    onSortChange(next.field, next.direction)
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-800 flex-shrink-0">
      <div className={`flex flex-1 items-center gap-2 bg-gray-900 rounded-md px-2.5 py-1.5 border ${search ? 'border-indigo-500' : 'border-gray-700'}`}>
        <svg className={`w-3.5 h-3.5 flex-shrink-0 ${search ? 'text-indigo-400' : 'text-gray-500'}`} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          type="text"
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="Search title, uploader, description…"
          className="flex-1 bg-transparent text-sm text-white placeholder-gray-600 focus:outline-none min-w-0"
        />
        {search && (
          <>
            <span className="text-xs text-gray-500 flex-shrink-0 tabular-nums">{resultCount} result{resultCount !== 1 ? 's' : ''}</span>
            <button onClick={() => onSearchChange('')} className="text-gray-500 hover:text-gray-300 text-xs flex-shrink-0 leading-none">✕</button>
          </>
        )}
      </div>
      <button
        onClick={cycleSort}
        className={`flex-shrink-0 text-xs px-2.5 py-1.5 rounded-md border transition-colors whitespace-nowrap ${
          isDefault
            ? 'border-gray-700 text-gray-400 bg-gray-900 hover:border-gray-600'
            : 'border-indigo-600 text-indigo-300 bg-indigo-950/60 hover:bg-indigo-900/60'
        }`}
      >
        {label}
      </button>
    </div>
  )
}
