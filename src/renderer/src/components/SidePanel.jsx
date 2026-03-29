import { useRef, useState } from 'react'
import { MediaPanel } from './MediaPanel.jsx'
import ProgressPanel from './ProgressPanel.jsx'
import { BrowserNotesPanel } from './BrowserNotesPanel.jsx'

export default function SidePanel({ onRememberSite, onDownloadSite }) {
  const [splitPct, setSplitPct] = useState(70)
  const [activeTab, setActiveTab] = useState('notes')
  const containerRef = useRef(null)

  function handleDragStart(e) {
    e.preventDefault()
    const startY = e.clientY
    const startPct = splitPct

    function onMove(ev) {
      const container = containerRef.current
      if (!container) return
      const height = container.getBoundingClientRect().height
      if (height === 0) return
      const deltaPct = ((ev.clientY - startY) / height) * 100
      setSplitPct(Math.max(20, Math.min(80, startPct + deltaPct)))
    }

    function onUp() {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <div ref={containerRef} className="flex flex-col h-full bg-gray-950 border-l border-gray-700">
      <div
        style={{ height: `${splitPct}%` }}
        className="overflow-y-auto min-h-0 flex-shrink-0 border-t-2 border-blue-600"
      >
        <MediaPanel onRememberSite={onRememberSite} onDownloadSite={onDownloadSite} />
      </div>
      <div
        role="separator"
        className="h-1 bg-gray-800 hover:bg-blue-600 cursor-row-resize flex-shrink-0 flex items-center justify-center transition-colors"
        onMouseDown={handleDragStart}
      >
        <div className="w-6 h-0.5 bg-gray-600 rounded pointer-events-none" />
      </div>
      <div className="flex flex-col flex-1 border-t border-gray-700">
        {/* Tab bar */}
        <div className="flex border-b border-gray-700 bg-gray-800">
          <button
            onClick={() => setActiveTab('notes')}
            className={`flex-1 py-2 px-4 text-sm font-medium transition-colors ${
              activeTab === 'notes'
                ? 'text-blue-400 border-b-2 border-blue-500'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            Notes
          </button>
          <button
            onClick={() => setActiveTab('progress')}
            className={`flex-1 py-2 px-4 text-sm font-medium transition-colors ${
              activeTab === 'progress'
                ? 'text-blue-400 border-b-2 border-blue-500'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            Progress
          </button>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-hidden">
          {activeTab === 'notes' ? <BrowserNotesPanel /> : <ProgressPanel />}
        </div>
      </div>
    </div>
  )
}
