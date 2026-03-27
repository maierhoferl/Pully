import React, { useState } from 'react'

const STATUS_COLOR = {
  queued: 'text-yellow-400', downloading: 'text-blue-400',
  done: 'text-green-400', failed: 'text-red-400',
}

export function DownloadRow({ item }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="border-b border-gray-800 px-4 py-2">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white truncate">{item.title}</p>
          {item.status === 'downloading' && (
            <div className="mt-1 flex items-center gap-2">
              <div className="flex-1 bg-gray-700 rounded-full h-1.5">
                <div className="bg-blue-500 h-1.5 rounded-full transition-all"
                  style={{ width: `${item.percent || 0}%` }} />
              </div>
              <span className="text-xs text-gray-400 whitespace-nowrap">
                {(item.percent || 0).toFixed(0)}% · {item.speed ?? '—'} · ETA {item.eta ?? '—'}
              </span>
            </div>
          )}
          {item.status === 'failed' && expanded && (
            <p className="text-xs text-red-400 mt-1 font-mono break-all">{item.error}</p>
          )}
        </div>
        <span className={`text-xs font-medium flex-shrink-0 ${STATUS_COLOR[item.status] || 'text-gray-400'}`}>
          {item.status}
        </span>
        {item.status === 'failed' && (
          <>
            <button onClick={() => window.api.retryDownload(item.id)}
              className="text-xs bg-gray-700 hover:bg-gray-600 text-white px-2 py-0.5 rounded">
              Retry
            </button>
            {item.error && (
              <button onClick={() => setExpanded(e => !e)} className="text-xs text-gray-500 hover:text-gray-300">
                {expanded ? '▲' : '▼'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
