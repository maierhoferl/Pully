import React, { lazy, Suspense } from 'react'
import { TabBar } from './components/TabBar.jsx'
import { SettingsPanel } from './components/SettingsPanel.jsx'
import { useAppStore } from './store/app-store.js'
import { useIpcEvents } from './hooks/useIpcEvents.js'

const BrowserTab = lazy(() => import('./components/BrowserTab.jsx'))
const DownloadsTab = lazy(() => import('./components/DownloadsTab.jsx'))
const LibraryTab = lazy(() => import('./components/LibraryTab.jsx'))

const Loading = () => <div className="flex items-center justify-center h-full text-gray-400">Loading…</div>

export default function App() {
  useIpcEvents()
  const activeTab = useAppStore(s => s.activeTab)
  const settingsOpen = useAppStore(s => s.settingsOpen)

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white overflow-hidden">
      <TabBar />
      <div className="flex-1 overflow-hidden">
        <Suspense fallback={<Loading />}>
          <div className={activeTab === 'browser' ? 'h-full' : 'hidden'}><BrowserTab /></div>
          <div className={activeTab === 'downloads' ? 'h-full overflow-y-auto' : 'hidden'}><DownloadsTab /></div>
          <div className={activeTab === 'library' ? 'h-full overflow-y-auto' : 'hidden'}><LibraryTab /></div>
        </Suspense>
      </div>
      {settingsOpen && <SettingsPanel />}
    </div>
  )
}
