import React from 'react'
import { useAppStore } from '../store/app-store.js'

const TABS = [
  { id: 'browser', label: 'Browser' },
  { id: 'downloads', label: 'Downloads' },
  { id: 'library', label: 'Library' },
]

export function TabBar() {
  const { activeTab, setActiveTab, setSettingsOpen } = useAppStore()
  return (
    <div className="flex items-center h-10 bg-gray-900 border-b border-gray-700 px-2 select-none"
         style={{ WebkitAppRegion: 'drag' }}>
      <div className="flex items-center gap-1.5 ml-20 select-none" style={{ WebkitAppRegion: 'no-drag' }}>
        <span className="text-sm font-bold text-white tracking-tight">Pully</span>
      </div>
      <div className="flex gap-1 ml-4" style={{ WebkitAppRegion: 'no-drag' }}>
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-1 rounded text-sm font-medium transition-colors ${
              activeTab === tab.id ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>
      <button onClick={() => setSettingsOpen(true)}
        className="ml-auto text-gray-400 hover:text-white px-2 py-1 rounded hover:bg-gray-700 text-lg"
        style={{ WebkitAppRegion: 'no-drag' }} title="Settings">
        ⚙
      </button>
    </div>
  )
}
