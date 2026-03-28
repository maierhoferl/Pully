# Browser Layout Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Browser tab's vertical stack layout with a two-column layout: webview on the left, resizable right panel containing MediaPanel (top 70%) and a new Progress section (bottom 30%), and remove the now-redundant Downloads tab.

**Architecture:** Two new components — `ProgressPanel` (download list) and `SidePanel` (vertical split wrapper) — slot into a refactored `BrowserTab` that gains a horizontal drag split. Both splits use the same pure-React `onMouseDown`/`window` listener pattern with clamped sizes. `DownloadsTab` is deleted and its tab entry removed from `TabBar` and `App`.

**Tech Stack:** React 19, Tailwind CSS, Zustand, Vitest + @testing-library/react (JSDOM), Electron webview.

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/renderer/src/components/ProgressPanel.jsx` | Download list with "Progress" header; active first, then done/failed |
| Create | `src/renderer/src/components/SidePanel.jsx` | Vertical split (MediaPanel top / ProgressPanel bottom) with drag handle |
| Modify | `src/renderer/src/components/BrowserTab.jsx` | Horizontal split: webview left, SidePanel right with drag handle |
| Modify | `src/renderer/src/components/MediaPanel.jsx` | Remove `max-h-72 overflow-y-auto` from root div (scrolling now owned by SidePanel wrapper) |
| Modify | `src/renderer/src/components/TabBar.jsx` | Remove `downloads` entry from TABS |
| Modify | `src/renderer/src/App.jsx` | Remove DownloadsTab lazy import and render |
| Delete | `src/renderer/src/components/DownloadsTab.jsx` | No longer needed |
| Create | `src/renderer/src/components/ProgressPanel.test.jsx` | Renderer tests for ProgressPanel |
| Create | `src/renderer/src/components/SidePanel.test.jsx` | Renderer tests for SidePanel |

---

### Task 1: ProgressPanel component

**Files:**
- Create: `src/renderer/src/components/ProgressPanel.jsx`
- Create: `src/renderer/src/components/ProgressPanel.test.jsx`

- [ ] **Step 1: Write the failing tests**

Create `src/renderer/src/components/ProgressPanel.test.jsx`:

```jsx
import React from 'react'
import { render, screen } from '@testing-library/react'
import { useAppStore } from '../store/app-store.js'
import ProgressPanel from './ProgressPanel.jsx'

// Mock DownloadRow to avoid complex rendering
vi.mock('./DownloadRow.jsx', () => ({
  DownloadRow: ({ item }) => <div data-testid="download-row">{item.title}</div>,
}))

afterEach(() => {
  useAppStore.setState({ downloads: [] })
})

test('shows empty state when no downloads', () => {
  useAppStore.setState({ downloads: [] })
  render(<ProgressPanel />)
  expect(screen.getByText('No downloads yet')).toBeInTheDocument()
})

test('shows Progress header', () => {
  useAppStore.setState({ downloads: [] })
  render(<ProgressPanel />)
  expect(screen.getByText('Progress')).toBeInTheDocument()
})

test('renders download rows for all downloads', () => {
  useAppStore.setState({
    downloads: [
      { id: '1', title: 'Video A', status: 'downloading', percent: 50 },
      { id: '2', title: 'Video B', status: 'done' },
    ],
  })
  render(<ProgressPanel />)
  const rows = screen.getAllByTestId('download-row')
  expect(rows).toHaveLength(2)
})

test('renders active downloads before completed ones', () => {
  useAppStore.setState({
    downloads: [
      { id: '1', title: 'Done Video', status: 'done' },
      { id: '2', title: 'Active Video', status: 'downloading', percent: 40 },
    ],
  })
  render(<ProgressPanel />)
  const rows = screen.getAllByTestId('download-row')
  expect(rows[0]).toHaveTextContent('Active Video')
  expect(rows[1]).toHaveTextContent('Done Video')
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/renderer/src/components/ProgressPanel.test.jsx --config vitest.renderer.config.js
```

Expected: fail with "Cannot find module './ProgressPanel.jsx'"

- [ ] **Step 3: Implement ProgressPanel**

Create `src/renderer/src/components/ProgressPanel.jsx`:

```jsx
import React from 'react'
import { useAppStore } from '../store/app-store.js'
import { DownloadRow } from './DownloadRow.jsx'

export default function ProgressPanel() {
  const downloads = useAppStore(s => s.downloads)
  const active = downloads.filter(d => d.status === 'downloading' || d.status === 'queued')
  const done = downloads.filter(d => d.status === 'done' || d.status === 'failed')
  const ordered = [...active, ...done]

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 bg-gray-950 border-b border-gray-800 sticky top-0 z-10">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Progress</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {ordered.length === 0 ? (
          <p className="text-xs text-gray-600 px-3 py-3">No downloads yet</p>
        ) : (
          ordered.map(item => <DownloadRow key={item.id} item={item} />)
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/renderer/src/components/ProgressPanel.test.jsx --config vitest.renderer.config.js
```

Expected: 4 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/ProgressPanel.jsx src/renderer/src/components/ProgressPanel.test.jsx
git commit -m "feat: add ProgressPanel component"
```

---

### Task 2: SidePanel component

**Files:**
- Create: `src/renderer/src/components/SidePanel.jsx`
- Create: `src/renderer/src/components/SidePanel.test.jsx`

- [ ] **Step 1: Write the failing tests**

Create `src/renderer/src/components/SidePanel.test.jsx`:

```jsx
import React from 'react'
import { render, screen } from '@testing-library/react'
import { useAppStore } from '../store/app-store.js'
import SidePanel from './SidePanel.jsx'

// Stub heavy sub-components
vi.mock('./MediaPanel.jsx', () => ({
  MediaPanel: () => <div data-testid="media-panel">MediaPanel</div>,
}))
vi.mock('./ProgressPanel.jsx', () => ({
  default: () => <div data-testid="progress-panel">ProgressPanel</div>,
}))

afterEach(() => {
  useAppStore.setState({ mediaScanResults: null, mediaScanLoading: false })
})

test('renders MediaPanel', () => {
  render(<SidePanel />)
  expect(screen.getByTestId('media-panel')).toBeInTheDocument()
})

test('renders ProgressPanel', () => {
  render(<SidePanel />)
  expect(screen.getByTestId('progress-panel')).toBeInTheDocument()
})

test('renders a drag handle between the two panels', () => {
  render(<SidePanel />)
  expect(screen.getByRole('separator')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/renderer/src/components/SidePanel.test.jsx --config vitest.renderer.config.js
```

Expected: fail with "Cannot find module './SidePanel.jsx'"

- [ ] **Step 3: Implement SidePanel**

Create `src/renderer/src/components/SidePanel.jsx`:

```jsx
import React, { useRef, useState, useEffect } from 'react'
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
      <div style={{ height: `${splitPct}%` }} className="overflow-y-auto min-h-0 flex-shrink-0">
        <MediaPanel />
      </div>
      <div
        role="separator"
        className="h-1 bg-gray-800 hover:bg-blue-600 cursor-row-resize flex-shrink-0 flex items-center justify-center transition-colors"
        onMouseDown={handleDragStart}
      >
        <div className="w-6 h-0.5 bg-gray-600 rounded pointer-events-none" />
      </div>
      <div className="flex-1 overflow-y-auto min-h-0">
        <ProgressPanel />
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/renderer/src/components/SidePanel.test.jsx --config vitest.renderer.config.js
```

Expected: 3 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/SidePanel.jsx src/renderer/src/components/SidePanel.test.jsx
git commit -m "feat: add SidePanel with vertical drag split"
```

---

### Task 3: Refactor BrowserTab to horizontal split

**Files:**
- Modify: `src/renderer/src/components/BrowserTab.jsx`
- Modify: `src/renderer/src/components/MediaPanel.jsx`

> Note: No BrowserTab renderer tests are added here — `<webview>` is Electron-specific and not available in JSDOM. Verified manually in dev mode.

- [ ] **Step 1: Remove `max-h-72 overflow-y-auto` from MediaPanel root div**

In `src/renderer/src/components/MediaPanel.jsx`, find line 128:

```jsx
    <div className={`border-t-2 border-blue-600 bg-gray-950 ${collapsed ? '' : hasResults ? 'max-h-72 overflow-y-auto' : ''}`}>
```

Replace with:

```jsx
    <div className="border-t-2 border-blue-600 bg-gray-950">
```

The SidePanel wrapper now owns scrolling for the MediaPanel section.

- [ ] **Step 2: Rewrite BrowserTab to horizontal split**

Replace the entire content of `src/renderer/src/components/BrowserTab.jsx` with:

```jsx
import React, { useRef, useState, useEffect, useCallback } from 'react'
import { useAppStore } from '../store/app-store.js'
import SidePanel from './SidePanel.jsx'

const HOME = 'https://www.youtube.com'
const RESCAN_INTERVAL_MS = 30_000

export default function BrowserTab() {
  const webviewRef = useRef(null)
  const [inputUrl, setInputUrl] = useState(HOME)
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)
  const [sideWidth, setSideWidth] = useState(320)
  const { startMediaScan, setMediaScanResults } = useAppStore()
  const scanDebounceRef = useRef(null)
  const currentUrlRef = useRef(null)

  const scanPage = useCallback(async pageUrl => {
    try {
      const results = await window.api.extractInfo(pageUrl)
      setMediaScanResults(results)
    } catch {
      setMediaScanResults([])
    }
  }, [setMediaScanResults])

  const debouncedScan = useCallback((url) => {
    clearTimeout(scanDebounceRef.current)
    scanDebounceRef.current = setTimeout(() => {
      currentUrlRef.current = url
      startMediaScan()
      scanPage(url)
    }, 500)
  }, [scanPage, startMediaScan])

  useEffect(() => {
    const wv = webviewRef.current
    if (!wv) return

    const updateNav = () => {
      setInputUrl(wv.getURL())
      setCanGoBack(wv.canGoBack())
      setCanGoForward(wv.canGoForward())
    }

    const onNavigate = () => { updateNav() }

    const onInPageNavigate = () => {
      const url = wv.getURL()
      updateNav()
      if (url !== currentUrlRef.current) {
        debouncedScan(url)
      }
    }

    const onStartLoading = () => {
      clearTimeout(scanDebounceRef.current)
      startMediaScan()
    }

    const onFinishLoad = () => {
      const url = wv.getURL()
      setInputUrl(url)
      setCanGoBack(wv.canGoBack())
      setCanGoForward(wv.canGoForward())
      currentUrlRef.current = url
      scanPage(url)
    }

    wv.addEventListener('did-navigate', onNavigate)
    wv.addEventListener('did-navigate-in-page', onInPageNavigate)
    wv.addEventListener('did-start-loading', onStartLoading)
    wv.addEventListener('did-finish-load', onFinishLoad)

    const intervalId = setInterval(() => {
      const url = wv.getURL()
      if (url && url !== 'about:blank') {
        scanPage(url)
      }
    }, RESCAN_INTERVAL_MS)

    return () => {
      wv.removeEventListener('did-navigate', onNavigate)
      wv.removeEventListener('did-navigate-in-page', onInPageNavigate)
      wv.removeEventListener('did-start-loading', onStartLoading)
      wv.removeEventListener('did-finish-load', onFinishLoad)
      clearTimeout(scanDebounceRef.current)
      clearInterval(intervalId)
    }
  }, [scanPage, startMediaScan, debouncedScan])

  function navigate(raw) {
    const wv = webviewRef.current
    if (!wv) return
    let url = raw
    if (!url.match(/^https?:\/\//)) {
      url = url.includes('.') ? `https://${url}` : `https://www.google.com/search?q=${encodeURIComponent(url)}`
    }
    wv.loadURL(url)
  }

  function handleSideDragStart(e) {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = sideWidth

    function onMove(ev) {
      setSideWidth(Math.max(200, Math.min(600, startWidth + (startX - ev.clientX))))
    }

    function onUp() {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1 px-2 py-1 bg-gray-900 border-b border-gray-700">
        <button onClick={() => webviewRef.current?.goBack()} disabled={!canGoBack}
          className="p-1 rounded text-gray-400 hover:text-white disabled:opacity-30 hover:bg-gray-700">←</button>
        <button onClick={() => webviewRef.current?.goForward()} disabled={!canGoForward}
          className="p-1 rounded text-gray-400 hover:text-white disabled:opacity-30 hover:bg-gray-700">→</button>
        <form onSubmit={e => { e.preventDefault(); navigate(inputUrl) }} className="flex-1">
          <input type="text" value={inputUrl} onChange={e => setInputUrl(e.target.value)}
            onFocus={e => e.target.select()}
            className="w-full bg-gray-800 text-white text-sm px-3 py-1 rounded border border-gray-600 focus:outline-none focus:border-blue-500"
            placeholder="Enter URL or search…" />
        </form>
      </div>
      <div className="flex flex-1 min-h-0">
        <webview ref={webviewRef} src={HOME} className="flex-1 min-w-0" style={{ height: '100%' }} allowpopups="true" />
        <div
          className="w-1 bg-gray-800 hover:bg-blue-600 cursor-col-resize flex-shrink-0 flex items-center justify-center transition-colors"
          onMouseDown={handleSideDragStart}
        >
          <div className="h-6 w-0.5 bg-gray-600 rounded pointer-events-none" />
        </div>
        <div style={{ width: sideWidth }} className="flex-shrink-0 h-full">
          <SidePanel />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Run renderer tests to confirm nothing broke**

```bash
npm run test:renderer
```

Expected: all existing tests pass (ProgressPanel and SidePanel tests from Tasks 1 and 2)

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/BrowserTab.jsx src/renderer/src/components/MediaPanel.jsx
git commit -m "feat: refactor BrowserTab to horizontal split with SidePanel"
```

---

### Task 4: Remove Downloads tab

**Files:**
- Modify: `src/renderer/src/components/TabBar.jsx`
- Modify: `src/renderer/src/App.jsx`
- Delete: `src/renderer/src/components/DownloadsTab.jsx`

- [ ] **Step 1: Remove downloads from TabBar**

In `src/renderer/src/components/TabBar.jsx`, replace:

```js
const TABS = [
  { id: 'browser', label: 'Browser' },
  { id: 'downloads', label: 'Downloads' },
  { id: 'library', label: 'Library' },
]
```

With:

```js
const TABS = [
  { id: 'browser', label: 'Browser' },
  { id: 'library', label: 'Library' },
]
```

- [ ] **Step 2: Remove DownloadsTab from App.jsx**

In `src/renderer/src/App.jsx`, replace:

```jsx
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
```

With:

```jsx
import React, { lazy, Suspense } from 'react'
import { TabBar } from './components/TabBar.jsx'
import { SettingsPanel } from './components/SettingsPanel.jsx'
import { useAppStore } from './store/app-store.js'
import { useIpcEvents } from './hooks/useIpcEvents.js'

const BrowserTab = lazy(() => import('./components/BrowserTab.jsx'))
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
          <div className={activeTab === 'library' ? 'h-full overflow-y-auto' : 'hidden'}><LibraryTab /></div>
        </Suspense>
      </div>
      {settingsOpen && <SettingsPanel />}
    </div>
  )
}
```

- [ ] **Step 3: Delete DownloadsTab.jsx**

```bash
git rm src/renderer/src/components/DownloadsTab.jsx
```

- [ ] **Step 4: Run all tests**

```bash
npm run test:all
```

Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/TabBar.jsx src/renderer/src/App.jsx
git commit -m "feat: remove Downloads tab — progress now lives in Browser sidebar"
```
