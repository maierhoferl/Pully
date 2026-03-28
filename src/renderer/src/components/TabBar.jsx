import React from 'react'
import { useAppStore } from '../store/app-store.js'

const TABS = [
  { id: 'browser', label: 'Browser' },
  { id: 'downloads', label: 'Downloads' },
  { id: 'library', label: 'Library' },
]

function ShieldIcon({ enabled }) {
  return enabled ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      <polyline points="9 12 11 14 15 10"/>
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-3.16 1.18"/>
      <path d="M16.73 8.65A6.75 6.75 0 0 1 20 12v2c0 2.4-1.23 4.53-3.11 6.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  )
}

export function TabBar() {
  const { activeTab, setActiveTab, setSettingsOpen, config, setConfig } = useAppStore()
  const adblockEnabled = config.adblockEnabled ?? true

  const handleToggleAdblock = async () => {
    const next = !adblockEnabled
    setConfig({ ...config, adblockEnabled: next })
    await window.api.setAdblockEnabled(next)
  }

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
      <div className="ml-auto flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' }}>
        <button onClick={handleToggleAdblock}
          className={`px-2 py-1 rounded hover:bg-gray-700 transition-colors ${adblockEnabled ? 'text-blue-400' : 'text-gray-500'}`}
          title={adblockEnabled ? 'Adblock on' : 'Adblock off'}>
          <ShieldIcon enabled={adblockEnabled} />
        </button>
        <button onClick={() => setSettingsOpen(true)}
          className="text-gray-400 hover:text-white px-2 py-1 rounded hover:bg-gray-700 text-lg"
          title="Settings">
          ⚙
        </button>
      </div>
    </div>
  )
}
