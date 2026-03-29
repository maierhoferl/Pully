# Debug Logging & Debug Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add structured file-based logging to all key processes (downloads, classification, summarization, notes) with a real-time Debug tab visible only when Debug Mode is enabled in Settings.

**Architecture:** Create a lightweight `logger.js` singleton that writes JSON Lines to daily log files, optionally pushes entries via IPC when debug mode is on, and instrument all key modules. Add a new Debug tab UI that displays filtered log entries in real-time.

**Tech Stack:** Zustand (state), Tailwind (UI), Node.js fs (file I/O), IPC (push events)

---

## File Structure

**New Files:**

- `src/main/logger.js` — Logger singleton with file I/O and cleanup
- `src/renderer/src/components/DebugTab.jsx` — Debug tab UI with filtering and expand/collapse

**Modified Files:**

- `src/main/config-store.js` — Add `debugMode` default
- `src/main/index.js` — Initialize logger, replace console.error calls
- `src/main/ipc-handlers.js` — Register `log:entry` push, call `logger.setDebugMode` on config writes
- `src/renderer/src/store/app-store.js` — Add `logEntries` state and `appendLogEntry` action
- `src/renderer/src/hooks/useIpcEvents.js` — Subscribe to `log:entry` events
- `src/preload/index.js` — Expose `window.api.onLogEntry`
- `src/renderer/src/components/TabBar.jsx` — Conditionally show Debug tab
- `src/renderer/src/components/SettingsPanel.jsx` — Add debugMode toggle
- `src/renderer/src/App.jsx` — Add lazy-loaded DebugTab panel
- `src/main/download-manager.js` — Add logging calls
- `src/main/ytdlp-runner.js` — Add logging calls
- `src/main/auto-classifier.js` — Add logging calls
- `src/main/ai-summarizer.js` — Add logging calls
- `src/main/notes-store.js` — Add logging calls

---

## Task 1: Create Logger Module

**Files:**

- Create: `src/main/logger.js`
- Test: `tests/main/logger.test.js`

- [ ] **Step 1: Write failing test for logger file creation**

```javascript
// tests/main/logger.test.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { createLogger } from '../src/main/logger.js'

describe('Logger', () => {
  let tempDir
  let logger

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'logger-test-'))
  })

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true })
    }
  })

  it('should create a daily log file', () => {
    logger = createLogger(tempDir)
    logger.info('download', 'Test message', { url: 'http://example.com' })

    const today = new Date().toISOString().split('T')[0]
    const logFile = path.join(tempDir, `${today}.log`)
    expect(fs.existsSync(logFile)).toBe(true)
  })

  it('should write JSON Lines format', () => {
    logger = createLogger(tempDir)
    logger.info('download', 'Test message', { url: 'http://example.com' })

    const today = new Date().toISOString().split('T')[0]
    const logFile = path.join(tempDir, `${today}.log`)
    const content = fs.readFileSync(logFile, 'utf-8').trim()
    const parsed = JSON.parse(content)

    expect(parsed.level).toBe('info')
    expect(parsed.category).toBe('download')
    expect(parsed.message).toBe('Test message')
    expect(parsed.meta).toEqual({ url: 'http://example.com' })
    expect(parsed.ts).toBeDefined()
  })

  it('should append multiple entries to same file', () => {
    logger = createLogger(tempDir)
    logger.info('download', 'Message 1')
    logger.warn('classify', 'Message 2')
    logger.error('summarize', 'Message 3')

    const today = new Date().toISOString().split('T')[0]
    const logFile = path.join(tempDir, `${today}.log`)
    const lines = fs.readFileSync(logFile, 'utf-8').trim().split('\n')

    expect(lines).toHaveLength(3)
    expect(JSON.parse(lines[0]).message).toBe('Message 1')
    expect(JSON.parse(lines[1]).message).toBe('Message 2')
    expect(JSON.parse(lines[2]).message).toBe('Message 3')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test -- tests/main/logger.test.js
```

Expected: FAIL — module not found

- [ ] **Step 3: Write minimal logger implementation**

```javascript
// src/main/logger.js
import fs from 'fs'
import path from 'path'

function createLogger(logDir) {
  let mainWindow = null
  let debugMode = false

  function getLogFilePath() {
    const today = new Date().toISOString().split('T')[0]
    return path.join(logDir, `${today}.log`)
  }

  function cleanupOldLogs() {
    if (!fs.existsSync(logDir)) return

    const now = Date.now()
    const threeDaysMs = 3 * 24 * 60 * 60 * 1000
    const files = fs.readdirSync(logDir)

    files.forEach((file) => {
      const filePath = path.join(logDir, file)
      const stat = fs.statSync(filePath)
      if (now - stat.mtimeMs > threeDaysMs) {
        fs.unlinkSync(filePath)
      }
    })
  }

  function ensureLogDir() {
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true })
    }
  }

  function writeEntry(level, category, message, meta) {
    ensureLogDir()

    const entry = {
      ts: new Date().toISOString(),
      level,
      category,
      message,
      ...(meta && { meta })
    }

    const logFile = getLogFilePath()
    fs.appendFileSync(logFile, JSON.stringify(entry) + '\n')

    // Push via IPC if debug mode is on
    if (debugMode && mainWindow) {
      mainWindow.webContents.send('log:entry', entry)
    }
  }

  return {
    info: (category, message, meta) => writeEntry('info', category, message, meta),
    warn: (category, message, meta) => writeEntry('warn', category, message, meta),
    error: (category, message, meta) => writeEntry('error', category, message, meta),
    setWindow: (win) => {
      mainWindow = win
    },
    setDebugMode: (enabled) => {
      debugMode = enabled
      cleanupOldLogs()
    }
  }
}

export { createLogger }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test -- tests/main/logger.test.js
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/logger.js tests/main/logger.test.js
git commit -m "feat: add logger module with file I/O and cleanup"
```

---

## Task 2: Update Config Store

**Files:**

- Modify: `src/main/config-store.js`

- [ ] **Step 1: Read current config-store.js**

```bash
# Identify getDefaults() function and add debugMode: false to it
```

- [ ] **Step 2: Add debugMode to defaults**

In `src/main/config-store.js`, find the `getDefaults()` function and add:

```javascript
export function getDefaults() {
  return {
    outputFolder: app.getPath('downloads'),
    maxConcurrent: 3,
    adblockEnabled: true,
    confirmDelete: true,
    autoClassifyEnabled: false,
    autoClassifyProvider: 'local',
    autoClassifyApiKey: '',
    autoClassifyModel: '',
    aiProvider: 'gemini',
    aiApiKey: '',
    aiModel: '',
    autoSummarizeEnabled: false,
    defaultSummaryPrompt: 'Summarize this video in 3-5 sentences...',
    debugMode: false // ADD THIS LINE
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/main/config-store.js
git commit -m "feat: add debugMode config default"
```

---

## Task 3: Initialize Logger in Main Process

**Files:**

- Modify: `src/main/index.js`
- Modify: `src/main/ipc-handlers.js`

- [ ] **Step 1: Read src/main/index.js to understand structure**

Find where the app is initialized and where BrowserWindow is created.

- [ ] **Step 2: Import and initialize logger in index.js**

At the top of `src/main/index.js`, add:

```javascript
import { createLogger } from './logger.js'
import { readConfig } from './config-store.js'

const isDev = process.env.NODE_ENV === 'development'

// Create logger (in userData/.log/)
const logDir = path.join(app.getPath('userData'), '.log')
const logger = createLogger(logDir)

// Set initial debug mode from config
const config = readConfig()
logger.setDebugMode(config.debugMode)
```

- [ ] **Step 3: Set logger window after BrowserWindow creation**

Find where `mainWindow` is created and add after it:

```javascript
logger.setWindow(mainWindow)
```

- [ ] **Step 4: Replace existing console.error calls**

Find both `console.error` calls in `index.js` (around lines 43 and 94) and replace them:

First one (binary copy error):

```javascript
// Old: console.error('Failed to initialize binaries:', err)
// New:
logger.error('app', 'Failed to initialize binaries', { error: err.message })
```

Second one (adblock init error):

```javascript
// Old: .catch(err => console.error('Adblock init failed:', err))
// New:
.catch(err => logger.error('app', 'Adblock init failed', { error: err.message }))
```

- [ ] **Step 5: Log app start**

After logger is initialized, add:

```javascript
logger.info('app', 'Application started', { isDev })
```

- [ ] **Step 6: Commit**

```bash
git add src/main/index.js
git commit -m "feat: initialize logger and replace console.error calls"
```

---

## Task 4: Wire Logger to Config Updates

**Files:**

- Modify: `src/main/ipc-handlers.js`

- [ ] **Step 1: Find config:write handler**

Locate the `ipcMain.handle('config:write', ...)` handler.

- [ ] **Step 2: Update handler to call logger.setDebugMode**

In the `config:write` handler, after `writeConfig(data)`, add:

```javascript
ipcMain.handle('config:write', (event, data) => {
  writeConfig(data)
  const updated = readConfig()
  // NEW: sync logger debug mode
  logger.setDebugMode(updated.debugMode)
  return updated
})
```

You'll need to import logger at the top:

```javascript
import { createLogger } from './logger.js'
// (or if using a singleton, import the existing instance)
```

Actually, to avoid circular imports, modify `registerIpcHandlers` to accept logger as a parameter:

```javascript
export function registerIpcHandlers(downloadManager, mainWindow, logger) {
  // ... existing code ...
  ipcMain.handle('config:write', (event, data) => {
    writeConfig(data)
    const updated = readConfig()
    logger.setDebugMode(updated.debugMode)
    return updated
  })
}
```

Then in `src/main/index.js`, update the call:

```javascript
registerIpcHandlers(downloadManager, mainWindow, logger)
```

- [ ] **Step 3: Commit**

```bash
git add src/main/ipc-handlers.js src/main/index.js
git commit -m "feat: sync logger debug mode on config updates"
```

---

## Task 5: Add Zustand State for Log Entries

**Files:**

- Modify: `src/renderer/src/store/app-store.js`

- [ ] **Step 1: Read app-store.js structure**

Understand how the Zustand store is organized.

- [ ] **Step 2: Add logEntries state and appendLogEntry action**

Find the `create()` call and add:

```javascript
logEntries: [],

appendLogEntry(entry) {
  // Cap at 1000 entries
  const updated = [
    ...this.logEntries,
    entry
  ]
  if (updated.length > 1000) {
    updated.shift() // Remove oldest
  }
  this.setLogEntries(updated)
},

setLogEntries(entries) {
  this.logEntries = entries
},
```

- [ ] **Step 3: Verify store is exported correctly**

Ensure the store is exported with the new methods available.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/store/app-store.js
git commit -m "feat: add logEntries state to Zustand store"
```

---

## Task 6: Set Up IPC Log Entry Push

**Files:**

- Modify: `src/main/ipc-handlers.js`
- Modify: `src/preload/index.js`

- [ ] **Step 1: Register log:entry push event in ipc-handlers.js**

At the end of `registerIpcHandlers()`, add a comment (no handle needed — this is push-only):

```javascript
// Log entries are pushed to renderer via mainWindow.webContents.send('log:entry', entry)
// No handler needed — logger.js handles sending
```

- [ ] **Step 2: Update preload to expose onLogEntry**

In `src/preload/index.js`, find the `contextBridge.exposeInMainWorld('api', { ... })` call and add:

```javascript
onLogEntry: (callback) => ipcRenderer.on('log:entry', (event, entry) => callback(entry)),
```

- [ ] **Step 3: Commit**

```bash
git add src/preload/index.js
git commit -m "feat: expose onLogEntry IPC channel to renderer"
```

---

## Task 7: Subscribe to Log Events in Renderer

**Files:**

- Modify: `src/renderer/src/hooks/useIpcEvents.js`

- [ ] **Step 1: Read useIpcEvents structure**

Understand how it sets up other IPC subscriptions.

- [ ] **Step 2: Add log:entry subscription**

In `useIpcEvents`, after other subscriptions, add:

```javascript
window.api.onLogEntry((entry) => {
  setAppState((state) => ({
    ...state,
    logEntries: [
      ...state.logEntries.slice(-999), // Keep last 999
      entry
    ]
  }))
})
```

Or if using Zustand directly:

```javascript
window.api.onLogEntry((entry) => {
  useAppStore.setState((state) => ({
    logEntries: [...state.logEntries, entry].slice(-1000)
  }))
})
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/hooks/useIpcEvents.js
git commit -m "feat: subscribe to log entry events in renderer"
```

---

## Task 8: Add Conditional Debug Tab to Tab Bar

**Files:**

- Modify: `src/renderer/src/components/TabBar.jsx`

- [ ] **Step 1: Read TabBar.jsx structure**

Find where `TABS` array is defined.

- [ ] **Step 2: Update TABS to conditionally include Debug**

Modify the render logic to conditionally add Debug tab:

```javascript
const TABS = [
  { id: 'browser', label: 'Browser' },
  { id: 'library', label: 'Library' },
  { id: 'notes', label: 'Notes' }
]

// In render, add conditionally:
const visibleTabs = config.debugMode ? [...TABS, { id: 'debug', label: 'Debug' }] : TABS

// Then map over visibleTabs instead of TABS
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/TabBar.jsx
git commit -m "feat: conditionally show Debug tab when debugMode enabled"
```

---

## Task 9: Add Debug Mode Toggle to Settings

**Files:**

- Modify: `src/renderer/src/components/SettingsPanel.jsx`

- [ ] **Step 1: Read SettingsPanel.jsx structure**

Find where settings toggles are rendered (e.g., `autoClassifyEnabled`, `autoSummarizeEnabled`).

- [ ] **Step 2: Add debugMode toggle**

After the existing toggle for `autoSummarizeEnabled`, add:

```jsx
{
  /* Debug Mode */
}
;<div className="mb-6">
  <div className="flex items-center justify-between">
    <label htmlFor="debugMode" className="text-sm font-medium">
      Debug Mode
    </label>
    <input
      id="debugMode"
      type="checkbox"
      checked={local.debugMode || false}
      onChange={(e) => setLocal({ ...local, debugMode: e.target.checked })}
      className="rounded"
    />
  </div>
  <p className="text-xs text-gray-400 mt-1">Show Debug tab and write logs to disk</p>
</div>
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/SettingsPanel.jsx
git commit -m "feat: add debugMode toggle to Settings panel"
```

---

## Task 10: Create Debug Tab Component

**Files:**

- Create: `src/renderer/src/components/DebugTab.jsx`

- [ ] **Step 1: Write DebugTab component**

```jsx
// src/renderer/src/components/DebugTab.jsx
import { useState, useRef, useEffect } from 'react'
import { useAppStore } from '../store/app-store'

const CATEGORIES = ['All', 'Download', 'Classify', 'Summarize', 'Notes', 'App']
const LEVELS = ['All', 'Info', 'Warn', 'Error']

export function DebugTab() {
  const logEntries = useAppStore((state) => state.logEntries)
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [levelFilter, setLevelFilter] = useState('All')
  const [pauseScroll, setPauseScroll] = useState(false)
  const [expandedRows, setExpandedRows] = useState(new Set())
  const listEndRef = useRef(null)

  // Auto-scroll to bottom unless paused
  useEffect(() => {
    if (!pauseScroll && listEndRef.current) {
      listEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logEntries, pauseScroll])

  const filtered = logEntries.filter((entry) => {
    const catMatch =
      categoryFilter === 'All' || entry.category.toLowerCase() === categoryFilter.toLowerCase()
    const levelMatch =
      levelFilter === 'All' || entry.level.toLowerCase() === levelFilter.toLowerCase()
    return catMatch && levelMatch
  })

  const toggleExpand = (index) => {
    const newExpanded = new Set(expandedRows)
    if (newExpanded.has(index)) {
      newExpanded.delete(index)
    } else {
      newExpanded.add(index)
    }
    setExpandedRows(newExpanded)
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

  const getCategoryColor = (category) => {
    const colors = {
      download: 'bg-green-50 border-l-4 border-green-500',
      classify: 'bg-purple-50 border-l-4 border-purple-500',
      summarize: 'bg-orange-50 border-l-4 border-orange-500',
      notes: 'bg-blue-50 border-l-4 border-blue-500',
      app: 'bg-gray-50 border-l-4 border-gray-500'
    }
    return colors[category] || 'bg-gray-50'
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Toolbar */}
      <div className="bg-white border-b border-gray-200 p-4 space-y-3">
        {/* Category Filter */}
        <div className="flex gap-2 flex-wrap">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                categoryFilter === cat
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Level Filter */}
        <div className="flex gap-2 flex-wrap">
          {LEVELS.map((level) => (
            <button
              key={level}
              onClick={() => setLevelFilter(level)}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                levelFilter === level
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {level}
            </button>
          ))}
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

      {/* Log List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {filtered.length === 0 ? (
          <div className="text-center text-gray-500 py-8">No log entries</div>
        ) : (
          filtered.map((entry, idx) => (
            <div
              key={idx}
              className={`p-3 rounded border cursor-pointer transition-all ${getCategoryColor(
                entry.category
              )}`}
              onClick={() => toggleExpand(idx)}
            >
              {/* Log row */}
              <div className="flex items-start gap-2">
                <span className="text-xs text-gray-500 flex-shrink-0 font-mono">
                  {new Date(entry.ts).toLocaleTimeString()}
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-xs font-bold flex-shrink-0 ${getLevelColor(
                    entry.level
                  )}`}
                >
                  {entry.level.toUpperCase()}
                </span>
                <span className="px-2 py-0.5 bg-gray-200 text-gray-800 rounded text-xs font-medium flex-shrink-0">
                  {entry.category}
                </span>
                <span className="text-sm flex-1">{entry.message}</span>
              </div>

              {/* Expanded meta */}
              {expandedRows.has(idx) && entry.meta && (
                <div className="mt-2 ml-24 pt-2 border-t border-gray-300">
                  <pre className="text-xs bg-gray-800 text-gray-100 p-2 rounded overflow-auto">
                    {JSON.stringify(entry.meta, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ))
        )}
        <div ref={listEndRef} />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/DebugTab.jsx
git commit -m "feat: create DebugTab component with filtering and expand"
```

---

## Task 11: Add DebugTab to App Shell

**Files:**

- Modify: `src/renderer/src/App.jsx`

- [ ] **Step 1: Read App.jsx structure**

Find where other tabs are lazily imported and rendered.

- [ ] **Step 2: Add lazy import for DebugTab**

At the top with other lazy imports, add:

```javascript
const DebugTab = React.lazy(() =>
  import('./components/DebugTab').then((m) => ({ default: m.DebugTab }))
)
```

- [ ] **Step 3: Add DebugTab render conditional**

In the tab rendering section, add after the Notes tab:

```jsx
<div className={activeTab === 'debug' ? 'h-full overflow-hidden' : 'hidden'}>
  <DebugTab />
</div>
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/App.jsx
git commit -m "feat: add lazy-loaded DebugTab to app shell"
```

---

## Task 12: Add Logging to Download Manager

**Files:**

- Modify: `src/main/download-manager.js`

- [ ] **Step 1: Import logger at top of file**

```javascript
import { logger } from './logger.js' // assumes singleton export from logger.js
```

Or if using createLogger pattern, you'll need to pass it in or get it from global. For now, assume a singleton.

- [ ] **Step 2: Add logging to \_start() method**

In the `_start()` method, around where a download begins:

```javascript
// When download starts:
logger.info('download', `Started: ${path.basename(item.filePath)}`, {
  url: item.url,
  outputPath: item.filePath
})

// On completion (calculate duration):
const duration = (Date.now() - startTime) / 1000
const fileSize = fs.statSync(item.filePath).size
logger.info('download', `Completed: ${path.basename(item.filePath)}`, {
  url: item.url,
  duration: `${duration.toFixed(2)}s`,
  fileSize: `${(fileSize / 1024 / 1024).toFixed(2)}MB`
})

// On error:
logger.error('download', `Failed: ${path.basename(item.filePath)}`, {
  url: item.url,
  error: error.message
})
```

- [ ] **Step 3: Add progress milestone logging**

In the progress callback from ytdlp-runner, log at 25/50/75/100%:

```javascript
const percent = (currentSize / totalSize) * 100
if ([25, 50, 75, 100].some((p) => Math.abs(percent - p) < 1)) {
  logger.info('download', `Progress: ${item.filename} ${Math.round(percent)}%`, {
    url: item.url,
    percent: Math.round(percent)
  })
}
```

- [ ] **Step 4: Commit**

```bash
git add src/main/download-manager.js
git commit -m "feat: add logging to download manager"
```

---

## Task 13: Add Logging to yt-dlp Runner

**Files:**

- Modify: `src/main/ytdlp-runner.js`

- [ ] **Step 1: Import logger**

```javascript
import { logger } from './logger.js'
```

- [ ] **Step 2: Add binary check logging**

When binary is confirmed:

```javascript
logger.info('app', 'yt-dlp binary confirmed', { binaryPath })
```

- [ ] **Step 3: Add process lifecycle logging**

When spawning:

```javascript
logger.info('app', 'yt-dlp process spawned', { url, pid: process.pid })
```

When exiting:

```javascript
logger.info('app', `yt-dlp process exited`, { url, exitCode })
```

On error:

```javascript
logger.error('app', 'yt-dlp process error', { error: err.message })
```

- [ ] **Step 4: Commit**

```bash
git add src/main/ytdlp-runner.js
git commit -m "feat: add logging to yt-dlp runner"
```

---

## Task 14: Add Logging to Auto Classifier

**Files:**

- Modify: `src/main/auto-classifier.js`

- [ ] **Step 1: Import logger**

```javascript
import { logger } from './logger.js'
```

- [ ] **Step 2: Log classification start**

At the beginning of `classifyVideo()`:

```javascript
logger.info('classify', `Started: ${videoEntry.filename}`, {
  filename: videoEntry.filename
})
```

- [ ] **Step 3: Log tier resolution**

After each tier (keyword, embedding, LLM):

```javascript
// If keyword matched:
logger.info('classify', `Classified by keyword: ${videoEntry.filename}`, {
  filename: videoEntry.filename,
  tier: 'keyword',
  folder: resultFolder
})

// If embedding matched:
logger.info('classify', `Classified by embedding: ${videoEntry.filename}`, {
  filename: videoEntry.filename,
  tier: 'embedding',
  folder: resultFolder,
  similarity: score.toFixed(3)
})

// If LLM matched:
logger.info('classify', `Classified by LLM: ${videoEntry.filename}`, {
  filename: videoEntry.filename,
  tier: 'llm',
  folder: resultFolder,
  provider: config.autoClassifyProvider
})

// If none matched:
logger.info('classify', `No classification: ${videoEntry.filename}`, {
  filename: videoEntry.filename,
  folder: 'none'
})
```

- [ ] **Step 4: Commit**

```bash
git add src/main/auto-classifier.js
git commit -m "feat: add logging to auto-classifier"
```

---

## Task 15: Add Logging to AI Summarizer

**Files:**

- Modify: `src/main/ai-summarizer.js`

- [ ] **Step 1: Import logger**

```javascript
import { logger } from './logger.js'
```

- [ ] **Step 2: Log summarization start**

At the beginning of `generateSummary()`:

```javascript
const startTime = Date.now()
logger.info('summarize', `Started: ${path.basename(filePath)}`, {
  filename: path.basename(filePath),
  provider: config.aiProvider,
  model: config.aiModel
})
```

- [ ] **Step 3: Log completion**

After summary is generated:

```javascript
const duration = (Date.now() - startTime) / 1000
logger.info('summarize', `Completed: ${path.basename(filePath)}`, {
  filename: path.basename(filePath),
  provider: config.aiProvider,
  model: config.aiModel,
  duration: `${duration.toFixed(2)}s`
})
```

- [ ] **Step 4: Log errors**

In catch block:

```javascript
logger.error('summarize', `Failed: ${path.basename(filePath)}`, {
  filename: path.basename(filePath),
  error: error.message
})
```

- [ ] **Step 5: Commit**

```bash
git add src/main/ai-summarizer.js
git commit -m "feat: add logging to AI summarizer"
```

---

## Task 16: Add Logging to Notes Store

**Files:**

- Modify: `src/main/notes-store.js`

- [ ] **Step 1: Import logger**

```javascript
import { logger } from './logger.js'
```

- [ ] **Step 2: Log chapter initialization**

In `initChapter()`:

```javascript
logger.info('notes', `Chapter initialized: ${path.basename(filePath)}`, {
  filename: path.basename(filePath),
  videoTitle: metadata.title
})
```

- [ ] **Step 3: Log section updates**

In `writeSummarySection()`:

```javascript
logger.info('notes', `Summary written: ${path.basename(filePath)}`, {
  filename: path.basename(filePath)
})
```

In `writeBulletsSection()`:

```javascript
logger.info('notes', `Bullets updated: ${path.basename(filePath)}`, {
  filename: path.basename(filePath),
  bulletCount: bullets.length
})
```

- [ ] **Step 4: Log chapter moves**

In `moveChapter()`:

```javascript
logger.info('notes', `Chapter moved`, {
  oldFile: path.basename(oldFilePath),
  newFile: path.basename(newFilePath),
  oldFolder: path.dirname(oldFilePath),
  newFolder: path.dirname(newFilePath)
})
```

- [ ] **Step 5: Commit**

```bash
git add src/main/notes-store.js
git commit -m "feat: add logging to notes store"
```

---

## Task 17: Fix Import Issues and Test End-to-End

**Files:**

- All previous modules (fix any import issues)

- [ ] **Step 1: Fix logger singleton/import pattern**

Ensure `logger.js` is either:

1. A singleton exported once and re-imported everywhere, OR
2. Created once in `index.js` and passed to all modules

Option 1 (singleton) is simplest. Make sure `logger.js` exports a default instance:

```javascript
// At the end of logger.js
const logDir = path.join(app?.getPath?.('userData') || process.cwd(), '.log')
export default createLogger(logDir)
```

Then all modules do:

```javascript
import logger from './logger.js'
```

- [ ] **Step 2: Run the full test suite**

```bash
npm run test:all
```

Expected: All tests pass (including new logger tests)

- [ ] **Step 3: Run dev mode and test manually**

```bash
npm run dev
```

- Enable Debug Mode in Settings
- Debug tab should appear in tab bar
- Start a download
- Log entries should appear in Debug tab in real-time
- Verify filters work (category, level)
- Verify expand/collapse of meta
- Check `~/Library/Application Support/Pully/.log/YYYY-MM-DD.log` exists with JSON Lines

- [ ] **Step 4: Commit**

```bash
git add src/main/*.js src/renderer/src/**/*.js
git commit -m "fix: finalize logger integration across all modules"
```

---

## Task 18: Test Cleanup and Edge Cases

**Files:**

- Test files for cleanup behavior

- [ ] **Step 1: Write test for auto-cleanup**

Add to `tests/main/logger.test.js`:

```javascript
it('should clean up logs older than 3 days', () => {
  const logger = createLogger(tempDir)

  // Create old log files
  const oldDate = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000)
  const oldFileName = oldDate.toISOString().split('T')[0] + '.log'
  const oldFilePath = path.join(tempDir, oldFileName)
  fs.writeFileSync(oldFilePath, '{}')

  // Create a recent file
  const today = new Date().toISOString().split('T')[0]
  const todayPath = path.join(tempDir, `${today}.log`)
  fs.writeFileSync(todayPath, '{}')

  // Trigger cleanup via setDebugMode
  logger.setDebugMode(true)

  // Old file should be deleted
  expect(fs.existsSync(oldFilePath)).toBe(false)
  // Recent file should exist
  expect(fs.existsSync(todayPath)).toBe(true)
})
```

- [ ] **Step 2: Run test**

```bash
npm run test -- tests/main/logger.test.js
```

Expected: PASS

- [ ] **Step 3: Test max entries cap in Zustand**

Verify in `DebugTab.jsx` that only 1000 entries are kept:

```javascript
// Manual test: add >1000 log entries and verify list doesn't grow beyond 1000
```

- [ ] **Step 4: Test debugMode toggle doesn't affect disk logging**

- Disable Debug Mode in Settings
- Start a download
- Debug tab should disappear from tab bar
- Check that log file still exists and contains entries

- [ ] **Step 5: Commit tests**

```bash
git add tests/main/logger.test.js
git commit -m "test: add edge case tests for logger cleanup"
```

---

## Verification Checklist

After all tasks are complete, verify the full spec:

- [ ] 1. Enable Debug Mode in Settings → Debug tab appears in tab bar
- [ ] 2. Start a download → log entries appear in real-time in Debug tab under "download" category
- [ ] 3. Trigger auto-classify → entries appear under "classify" category showing which tier resolved
- [ ] 4. Generate a summary → entries appear under "summarize" category with provider/model and duration
- [ ] 5. Add/edit notes bullets → entries appear under "notes" category
- [ ] 6. Check `userData/.log/YYYY-MM-DD.log` in Finder — confirm JSON Lines format
- [ ] 7. (Manual) Verify cleanup removes files older than 3 days
- [ ] 8. Disable Debug Mode → Debug tab disappears from tab bar; logging to file continues
- [ ] 9. Category and level filters work correctly in the Debug tab
- [ ] 10. In-memory list is capped at 1000 entries
