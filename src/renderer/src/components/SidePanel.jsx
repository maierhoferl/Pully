import React, { useRef, useState } from 'react'
import { MediaPanel } from './MediaPanel.jsx'
import ProgressPanel from './ProgressPanel.jsx'

export default function SidePanel() {
  const [splitPct, setSplitPct] = useState(70)
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
      <div style={{ height: `${splitPct}%` }} className="overflow-y-auto min-h-0 flex-shrink-0 border-t-2 border-blue-600">
        <MediaPanel />
      </div>
      <div
        role="separator"
        className="h-1 bg-gray-800 hover:bg-blue-600 cursor-row-resize flex-shrink-0 flex items-center justify-center transition-colors"
        onMouseDown={handleDragStart}
      >
        <div className="w-6 h-0.5 bg-gray-600 rounded pointer-events-none" />
      </div>
      <div className="flex flex-col min-h-0 flex-1">
        <ProgressPanel />
      </div>
    </div>
  )
}
