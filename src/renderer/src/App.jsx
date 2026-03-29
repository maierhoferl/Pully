import React, { lazy, Suspense } from 'react'
import { TabBar } from './components/TabBar.jsx'
import { SettingsPanel } from './components/SettingsPanel.jsx'
import { useAppStore } from './store/app-store.js'
import { useIpcEvents } from './hooks/useIpcEvents.js'

const BrowserTab = lazy(() => import('./components/BrowserTab.jsx'))
const LibraryTab = lazy(() => import('./components/LibraryTab.jsx'))
const NotesTab = lazy(() => import('./components/NotesTab.jsx'))
const DebugTab = lazy(() => import('./components/DebugTab').then((m) => ({ default: m.DebugTab })))

const Loading = () => (
  <div className="flex items-center justify-center h-full text-gray-400">Loading…</div>
)

export default function App() {
  useIpcEvents()
  const activeTab = useAppStore((s) => s.activeTab)
  const settingsOpen = useAppStore((s) => s.settingsOpen)

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white overflow-hidden">
      <TabBar />
      <div className="flex-1 overflow-hidden">
        <Suspense fallback={<Loading />}>
          <div className={activeTab === 'browser' ? 'h-full' : 'hidden'}>
            <BrowserTab />
          </div>
          <div className={activeTab === 'library' ? 'h-full overflow-y-auto' : 'hidden'}>
            <LibraryTab />
          </div>
          <div className={activeTab === 'notes' ? 'h-full overflow-hidden' : 'hidden'}>
            <NotesTab />
          </div>
          <div className={activeTab === 'debug' ? 'h-full overflow-hidden' : 'hidden'}>
            <DebugTab />
          </div>
        </Suspense>
      </div>
      {settingsOpen && <SettingsPanel />}
    </div>
  )
}
