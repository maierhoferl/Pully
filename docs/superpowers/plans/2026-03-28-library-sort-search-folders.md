# Library Sort, Search & Folder Management — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add sort (by name/date/folder), search/filter, and right-click folder management (rename, delete) to the Library tab.

**Architecture:** Pure renderer-side sort/search using a `useMemo` over the existing `libraryFiles` Zustand state; two new main-process IPC handlers (`library:renameFolder`, `library:deleteFolder`) that operate on the filesystem and metadata index.

**Tech Stack:** React 19, Zustand, Tailwind, Electron IPC, Vitest (main process tests)

---

## File Map

| File                                             | Action | What changes                                                                                           |
| ------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------ |
| `src/main/metadata-store.js`                     | Modify | Add `renameFolderInIndex(oldDir, newDir, indexPath?)` and `deleteFolderFromIndex(dirPath, indexPath?)` |
| `tests/main/metadata-store.test.js`              | Modify | Add tests for the two new helpers                                                                      |
| `src/main/ipc-handlers.js`                       | Modify | Add `library:renameFolder` and `library:deleteFolder` handlers; import new helpers                     |
| `src/preload/index.js`                           | Modify | Expose `renameFolder` and `deleteFolder` on `window.api`                                               |
| `src/renderer/src/store/app-store.js`            | Modify | Add `librarySort`, `librarySearch`, `setLibrarySort`, `setLibrarySearch`                               |
| `src/renderer/src/components/LibraryToolbar.jsx` | Create | Search input + cycling sort button                                                                     |
| `src/renderer/src/components/LibraryTab.jsx`     | Modify | Wire toolbar, replace groups build with `useMemo`, add context menu + rename input + delete dialog     |

---

## Task 1: Extend metadata-store.js — folder index helpers

**Files:**

- Modify: `src/main/metadata-store.js`
- Test: `tests/main/metadata-store.test.js`

- [ ] **Step 1: Write failing tests**

Add to `tests/main/metadata-store.test.js` below the existing `writeMetadataEntry` describe block:

```js
import {
  readMetadataIndex,
  writeMetadataEntry,
  renameFolderInIndex,
  deleteFolderFromIndex
} from '../../src/main/metadata-store.js'

// (existing imports and tmp setup are already in the file — add only the new describes below)

describe('renameFolderInIndex', () => {
  it('updates all metadata keys under the old directory path', () => {
    const p = path.join(tmp, 'meta.json')
    writeMetadataEntry(
      '/out/Japan/v1.mp4',
      { title: 'V1', uploader: null, description: null, thumbnailUrl: null, downloadedAt: null },
      p
    )
    writeMetadataEntry(
      '/out/Japan/v2.mp4',
      { title: 'V2', uploader: null, description: null, thumbnailUrl: null, downloadedAt: null },
      p
    )
    writeMetadataEntry(
      '/out/other.mp4',
      { title: 'Other', uploader: null, description: null, thumbnailUrl: null, downloadedAt: null },
      p
    )
    renameFolderInIndex('/out/Japan', '/out/JapanTrip', p)
    const idx = readMetadataIndex(p)
    expect(idx['/out/JapanTrip/v1.mp4']?.title).toBe('V1')
    expect(idx['/out/JapanTrip/v2.mp4']?.title).toBe('V2')
    expect(idx['/out/Japan/v1.mp4']).toBeUndefined()
    expect(idx['/out/Japan/v2.mp4']).toBeUndefined()
    expect(idx['/out/other.mp4']?.title).toBe('Other')
  })

  it('is a no-op when no entries match', () => {
    const p = path.join(tmp, 'meta.json')
    writeMetadataEntry(
      '/out/other.mp4',
      { title: 'Other', uploader: null, description: null, thumbnailUrl: null, downloadedAt: null },
      p
    )
    renameFolderInIndex('/out/Japan', '/out/JapanTrip', p)
    const idx = readMetadataIndex(p)
    expect(idx['/out/other.mp4']?.title).toBe('Other')
  })
})

describe('deleteFolderFromIndex', () => {
  it('removes all metadata entries under the directory', () => {
    const p = path.join(tmp, 'meta.json')
    writeMetadataEntry(
      '/out/Japan/v1.mp4',
      { title: 'V1', uploader: null, description: null, thumbnailUrl: null, downloadedAt: null },
      p
    )
    writeMetadataEntry(
      '/out/Japan/v2.mp4',
      { title: 'V2', uploader: null, description: null, thumbnailUrl: null, downloadedAt: null },
      p
    )
    writeMetadataEntry(
      '/out/other.mp4',
      { title: 'Other', uploader: null, description: null, thumbnailUrl: null, downloadedAt: null },
      p
    )
    deleteFolderFromIndex('/out/Japan', p)
    const idx = readMetadataIndex(p)
    expect(idx['/out/Japan/v1.mp4']).toBeUndefined()
    expect(idx['/out/Japan/v2.mp4']).toBeUndefined()
    expect(idx['/out/other.mp4']?.title).toBe('Other')
  })

  it('is a no-op when no entries match', () => {
    const p = path.join(tmp, 'meta.json')
    writeMetadataEntry(
      '/out/other.mp4',
      { title: 'Other', uploader: null, description: null, thumbnailUrl: null, downloadedAt: null },
      p
    )
    deleteFolderFromIndex('/out/Japan', p)
    const idx = readMetadataIndex(p)
    expect(idx['/out/other.mp4']?.title).toBe('Other')
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL (functions not exported yet)**

```bash
npx vitest run tests/main/metadata-store.test.js
```

Expected: failures referencing `renameFolderInIndex` and `deleteFolderFromIndex` not being exported.

- [ ] **Step 3: Implement the two helpers in metadata-store.js**

Add at the end of `src/main/metadata-store.js` (after the `downloadAndStoreThumbnail` function):

```js
export function renameFolderInIndex(oldDirPath, newDirPath, indexPath) {
  const p = indexPath || defaultPath()
  const index = readMetadataIndex(p)
  const sep = path.sep
  const prefix = oldDirPath + sep
  const updated = {}
  for (const [fp, meta] of Object.entries(index)) {
    if (fp.startsWith(prefix)) {
      updated[newDirPath + sep + fp.slice(prefix.length)] = meta
    } else {
      updated[fp] = meta
    }
  }
  fs.writeFileSync(p, JSON.stringify(updated, null, 2))
}

export function deleteFolderFromIndex(dirPath, indexPath) {
  const p = indexPath || defaultPath()
  const index = readMetadataIndex(p)
  const prefix = dirPath + path.sep
  for (const fp of Object.keys(index)) {
    if (fp.startsWith(prefix)) delete index[fp]
  }
  fs.writeFileSync(p, JSON.stringify(index, null, 2))
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx vitest run tests/main/metadata-store.test.js
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/main/metadata-store.js tests/main/metadata-store.test.js
git commit -m "feat: add renameFolderInIndex and deleteFolderFromIndex to metadata-store"
```

---

## Task 2: IPC handlers + preload for renameFolder / deleteFolder

**Files:**

- Modify: `src/main/ipc-handlers.js`
- Modify: `src/preload/index.js`

- [ ] **Step 1: Import new helpers in ipc-handlers.js**

In `src/main/ipc-handlers.js`, update the metadata-store import line (line 5) to add the two new helpers:

```js
import {
  readMetadataIndex,
  deleteMetadataEntry,
  moveMetadataEntry,
  toPullyUrl,
  downloadAndStoreThumbnail,
  renameFolderInIndex,
  deleteFolderFromIndex
} from './metadata-store.js'
```

- [ ] **Step 2: Add the two IPC handlers**

In `src/main/ipc-handlers.js`, add after the `library:createFolder` handler (after line 96):

```js
ipcMain.handle('library:renameFolder', (_, { from, to }) => {
  const { outputFolder } = readConfig()
  const oldDir = path.join(outputFolder, from)
  const newDir = path.join(outputFolder, to)
  if (!fs.existsSync(oldDir)) return null
  fs.renameSync(oldDir, newDir)
  renameFolderInIndex(oldDir, newDir)
  return to
})

ipcMain.handle('library:deleteFolder', async (_, { folder, strategy }) => {
  const { outputFolder } = readConfig()
  const dirPath = path.join(outputFolder, folder)
  if (!fs.existsSync(dirPath)) return null
  const fileNames = fs.readdirSync(dirPath).filter((f) => !f.startsWith('.'))
  const filePaths = fileNames.map((f) => path.join(dirPath, f))
  if (strategy === 'unassign') {
    for (const fp of filePaths) {
      const dest = path.join(outputFolder, path.basename(fp))
      fs.renameSync(fp, dest)
      moveMetadataEntry(fp, dest)
    }
    fs.rmdirSync(dirPath)
  } else {
    const index = readMetadataIndex()
    for (const fp of filePaths) {
      const thumbPath = index[fp]?.thumbnailLocalPath
      await shell.trashItem(fp)
      if (thumbPath && fs.existsSync(thumbPath)) await shell.trashItem(thumbPath)
      deleteMetadataEntry(fp)
    }
    deleteFolderFromIndex(dirPath)
    if (fs.existsSync(dirPath)) fs.rmdirSync(dirPath)
  }
  return null
})
```

- [ ] **Step 3: Expose on window.api in preload/index.js**

In `src/preload/index.js`, add after the `moveFile` line (after line 20):

```js
  renameFolder: (from, to) => ipcRenderer.invoke('library:renameFolder', { from, to }),
  deleteFolder: (folder, strategy) => ipcRenderer.invoke('library:deleteFolder', { folder, strategy }),
```

- [ ] **Step 4: Smoke-test with dev server**

```bash
npm run dev
```

Open DevTools console in the renderer and verify no import errors. Close dev server.

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc-handlers.js src/preload/index.js
git commit -m "feat: add library:renameFolder and library:deleteFolder IPC handlers"
```

---

## Task 3: Add sort/search state to Zustand store

**Files:**

- Modify: `src/renderer/src/store/app-store.js`

- [ ] **Step 1: Add librarySort and librarySearch**

Replace the current `setLibraryFiles` line and closing of the store in `src/renderer/src/store/app-store.js` so the full file reads:

```js
import { create } from 'zustand'

export const useAppStore = create((set) => ({
  activeTab: 'browser',
  setActiveTab: (tab) => set({ activeTab: tab }),

  settingsOpen: false,
  setSettingsOpen: (open) => set({ settingsOpen: open }),

  config: { outputFolder: '', maxConcurrent: 3 },
  setConfig: (config) => set({ config }),

  downloads: [],
  setDownloads: (downloads) => set({ downloads }),
  updateDownloadProgress: ({ id, percent, speed, eta }) =>
    set((state) => ({
      downloads: state.downloads.map((d) => (d.id === id ? { ...d, percent, speed, eta } : d))
    })),
  removeDownloadByUrl: (url) =>
    set((state) => ({
      downloads: state.downloads.filter((d) => d.url !== url)
    })),

  currentBrowserUrl: null,
  setCurrentBrowserUrl: (url) => set({ currentBrowserUrl: url }),

  mediaScanResults: null,
  mediaScanLoading: false,
  startMediaScan: () => set({ mediaScanLoading: true, mediaScanResults: null }),
  setMediaScanResults: (results) => set({ mediaScanResults: results, mediaScanLoading: false }),

  libraryFiles: [],
  setLibraryFiles: (files) => set({ libraryFiles: files }),

  librarySort: { field: 'date', direction: 'desc' },
  setLibrarySort: (field, direction) => set({ librarySort: { field, direction } }),

  librarySearch: '',
  setLibrarySearch: (query) => set({ librarySearch: query })
}))
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/store/app-store.js
git commit -m "feat: add librarySort and librarySearch state to app-store"
```

---

## Task 4: Create LibraryToolbar.jsx

**Files:**

- Create: `src/renderer/src/components/LibraryToolbar.jsx`

- [ ] **Step 1: Create the component**

```jsx
import React from 'react'

export const SORT_CYCLE = [
  { field: 'date', direction: 'desc', label: 'Date ↓' },
  { field: 'date', direction: 'asc', label: 'Date ↑' },
  { field: 'name', direction: 'asc', label: 'Name ↑' },
  { field: 'name', direction: 'desc', label: 'Name ↓' },
  { field: 'folder', direction: 'asc', label: 'Folder A–Z' },
  { field: 'folder', direction: 'desc', label: 'Folder Z–A' }
]

export default function LibraryToolbar({
  sort,
  search,
  onSortChange,
  onSearchChange,
  resultCount
}) {
  const idx = SORT_CYCLE.findIndex((s) => s.field === sort.field && s.direction === sort.direction)
  const isDefault = sort.field === 'date' && sort.direction === 'desc'
  const label = idx >= 0 ? SORT_CYCLE[idx].label : 'Date ↓'

  function cycleSort() {
    const next = SORT_CYCLE[(idx + 1) % SORT_CYCLE.length]
    onSortChange(next.field, next.direction)
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-800 flex-shrink-0">
      <div
        className={`flex flex-1 items-center gap-2 bg-gray-900 rounded-md px-2.5 py-1.5 border ${search ? 'border-indigo-500' : 'border-gray-700'}`}
      >
        <svg
          className={`w-3.5 h-3.5 flex-shrink-0 ${search ? 'text-indigo-400' : 'text-gray-500'}`}
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search title, uploader, description…"
          className="flex-1 bg-transparent text-sm text-white placeholder-gray-600 focus:outline-none min-w-0"
        />
        {search && (
          <>
            <span className="text-xs text-gray-500 flex-shrink-0 tabular-nums">
              {resultCount} result{resultCount !== 1 ? 's' : ''}
            </span>
            <button
              onClick={() => onSearchChange('')}
              className="text-gray-500 hover:text-gray-300 text-xs flex-shrink-0 leading-none"
            >
              ✕
            </button>
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
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/LibraryToolbar.jsx
git commit -m "feat: add LibraryToolbar component with search and cycling sort button"
```

---

## Task 5: Wire sort/search into LibraryTab — useMemo groups

**Files:**

- Modify: `src/renderer/src/components/LibraryTab.jsx`

- [ ] **Step 1: Update imports and store destructuring**

Replace line 1 of `src/renderer/src/components/LibraryTab.jsx`:

```js
import React, { useEffect, useMemo, useRef, useState } from 'react'
```

Replace the `useAppStore` destructuring line (line 24):

```js
const {
  libraryFiles,
  setLibraryFiles,
  config,
  downloads,
  removeDownloadByUrl,
  librarySort,
  librarySearch,
  setLibrarySort,
  setLibrarySearch
} = useAppStore()
```

Add the LibraryToolbar import after line 3 (after the LibraryDetailPanel import):

```js
import LibraryToolbar from './LibraryToolbar.jsx'
```

- [ ] **Step 2: Replace groups construction with useMemo**

In `src/renderer/src/components/LibraryTab.jsx`, remove these lines (currently lines 67–74):

```js
// Group files by folder; derive complete folder list
const groups = {}
for (const file of visibleFiles) {
  const key = file.folder || '__root'
  if (!groups[key]) groups[key] = []
  groups[key].push(file)
}
const namedFolders = [
  ...new Set([...allFolders, ...visibleFiles.filter((f) => f.folder).map((f) => f.folder)])
].sort()
const groupKeys = ['__root', ...namedFolders]
```

Replace them with:

```js
const { groups, groupKeys, totalResults } = useMemo(() => {
  const query = librarySearch.toLowerCase().trim()
  const filtered = query
    ? visibleFiles.filter((f) =>
        [f.title, f.uploader, f.description, f.url, f.name, f.folder].some(
          (v) => v && v.toLowerCase().includes(query)
        )
      )
    : visibleFiles

  const groups = {}
  for (const file of filtered) {
    const key = file.folder || '__root'
    if (!groups[key]) groups[key] = []
    groups[key].push(file)
  }

  const { field, direction } = librarySort
  for (const files of Object.values(groups)) {
    files.sort((a, b) => {
      if (field === 'date') {
        return direction === 'desc'
          ? new Date(b.mtime) - new Date(a.mtime)
          : new Date(a.mtime) - new Date(b.mtime)
      }
      const ta = (a.title || a.name).toLowerCase()
      const tb = (b.title || b.name).toLowerCase()
      return direction === 'asc' ? ta.localeCompare(tb) : tb.localeCompare(ta)
    })
  }

  const namedFolders = [
    ...new Set([...allFolders, ...visibleFiles.filter((f) => f.folder).map((f) => f.folder)])
  ]

  let namedKeys = query ? namedFolders.filter((k) => groups[k]?.length > 0) : namedFolders

  namedKeys.sort((a, b) => {
    if (field === 'date') {
      const aT = groups[a]?.length
        ? Math.max(...groups[a].map((f) => new Date(f.mtime).getTime()))
        : 0
      const bT = groups[b]?.length
        ? Math.max(...groups[b].map((f) => new Date(f.mtime).getTime()))
        : 0
      return direction === 'desc' ? bT - aT : aT - bT
    }
    if (field === 'name') {
      const aLabel = groups[a]?.[0]
        ? (groups[a][0].title || groups[a][0].name).toLowerCase()
        : a.toLowerCase()
      const bLabel = groups[b]?.[0]
        ? (groups[b][0].title || groups[b][0].name).toLowerCase()
        : b.toLowerCase()
      return direction === 'asc' ? aLabel.localeCompare(bLabel) : bLabel.localeCompare(aLabel)
    }
    return direction === 'asc'
      ? a.toLowerCase().localeCompare(b.toLowerCase())
      : b.toLowerCase().localeCompare(a.toLowerCase())
  })

  const showRoot = !query || groups['__root']?.length > 0
  const groupKeys = [...(showRoot ? ['__root'] : []), ...namedKeys]

  return { groups, groupKeys, totalResults: filtered.length }
}, [visibleFiles, librarySort, librarySearch, allFolders])
```

- [ ] **Step 3: Wrap the file-list div to accommodate toolbar**

In `src/renderer/src/components/LibraryTab.jsx`, find the return statement's outer structure:

```jsx
  return (
    <div className="flex h-full overflow-hidden">
      {/* File list with folder groups */}
      <div className="flex-1 overflow-y-auto">
```

Replace with:

```jsx
  return (
    <div className="flex h-full overflow-hidden">
      {/* File list with folder groups */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <LibraryToolbar
          sort={librarySort}
          search={librarySearch}
          onSortChange={setLibrarySort}
          onSearchChange={setLibrarySearch}
          resultCount={totalResults}
        />
        <div className="flex-1 overflow-y-auto">
```

And close the extra `<div>` before `{selected && <LibraryDetailPanel ...`:

```jsx
        </div>  {/* end scroll area */}
      </div>  {/* end flex-col */}

      {selected && (
```

- [ ] **Step 4: Remove the old "New Folder" bottom button section**

Find and remove this block (currently near the bottom of the scroll area, after the `groupKeys.map` closing):

```jsx
{
  /* New folder control */
}
;<div className="px-3 py-3 border-t border-gray-800 mt-1">
  {creating ? (
    <div className="flex gap-2">
      <input
        ref={inputRef}
        value={newFolderInput}
        onChange={(e) => setNewFolderInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleCreateFolder()
          if (e.key === 'Escape') {
            setCreating(false)
            setNewFolderInput('')
          }
        }}
        placeholder="Folder name…"
        className="flex-1 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500"
      />
      <button
        onClick={handleCreateFolder}
        className="text-sm text-indigo-400 hover:text-indigo-300 px-2 py-1"
      >
        Create
      </button>
      <button
        onClick={() => {
          setCreating(false)
          setNewFolderInput('')
        }}
        className="text-sm text-gray-500 hover:text-gray-400 px-2 py-1"
      >
        Cancel
      </button>
    </div>
  ) : (
    <button
      onClick={() => setCreating(true)}
      className="text-xs text-gray-500 hover:text-gray-400 flex items-center gap-1.5 transition-colors"
    >
      <span className="text-base leading-none">＋</span> New Folder
    </button>
  )}
</div>
```

Replace it with just the inline input (no outer wrapper button — it will be triggered by the context menu in Task 6):

```jsx
{
  /* Inline new folder input (triggered from context menu) */
}
{
  creating && (
    <div className="px-3 py-3 border-t border-gray-800 mt-1 flex gap-2">
      <input
        ref={inputRef}
        value={newFolderInput}
        onChange={(e) => setNewFolderInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleCreateFolder()
          if (e.key === 'Escape') {
            setCreating(false)
            setNewFolderInput('')
          }
        }}
        placeholder="Folder name…"
        className="flex-1 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500"
      />
      <button
        onClick={handleCreateFolder}
        className="text-sm text-indigo-400 hover:text-indigo-300 px-2 py-1"
      >
        Create
      </button>
      <button
        onClick={() => {
          setCreating(false)
          setNewFolderInput('')
        }}
        className="text-sm text-gray-500 hover:text-gray-400 px-2 py-1"
      >
        Cancel
      </button>
    </div>
  )
}
```

- [ ] **Step 5: Smoke-test in dev**

```bash
npm run dev
```

Navigate to Library tab. Verify toolbar renders above the file list, search filters results as you type, sort button cycles labels, groups reorder correctly. Close dev server.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/LibraryTab.jsx
git commit -m "feat: add sort and search to LibraryTab via useMemo filtered groups"
```

---

## Task 6: Folder right-click context menu, rename, delete dialog

**Files:**

- Modify: `src/renderer/src/components/LibraryTab.jsx`

- [ ] **Step 1: Add new state variables**

In `src/renderer/src/components/LibraryTab.jsx`, add these state declarations after the existing `useState` declarations (after `newFolderInput` line):

```js
const [contextMenu, setContextMenu] = useState(null) // { x, y, folder: string|null }
const [renamingFolder, setRenamingFolder] = useState(null) // folder name being renamed
const [renameInput, setRenameInput] = useState('')
const renameInputRef = useRef(null)
const [deletingFolder, setDeletingFolder] = useState(null) // { name, count }
```

- [ ] **Step 2: Add useEffect to close context menu on outside click / Escape**

Add after the existing `useEffect` blocks (after line 51):

```js
useEffect(() => {
  if (!contextMenu) return
  function close() {
    setContextMenu(null)
  }
  function onKey(e) {
    if (e.key === 'Escape') close()
  }
  document.addEventListener('mousedown', close)
  document.addEventListener('keydown', onKey)
  return () => {
    document.removeEventListener('mousedown', close)
    document.removeEventListener('keydown', onKey)
  }
}, [contextMenu])

useEffect(() => {
  if (renamingFolder) renameInputRef.current?.focus()
}, [renamingFolder])
```

- [ ] **Step 3: Add folder action handlers**

Add after `handleCreateFolder` function (after line 115):

```js
async function handleRenameFolder() {
  const name = renameInput.trim()
  setRenamingFolder(null)
  setRenameInput('')
  if (!name || name === renamingFolder) return
  await window.api.renameFolder(renamingFolder, name)
  await refresh()
}

async function handleDeleteFolder(strategy) {
  const name = deletingFolder.name
  setDeletingFolder(null)
  await window.api.deleteFolder(name, strategy)
  await refresh()
}
```

- [ ] **Step 4: Add onContextMenu to folder group headers**

In the folder header `<div>` (the one with `onClick={() => toggleCollapse(key)}`), add an `onContextMenu` prop:

```jsx
                onContextMenu={e => {
                  e.preventDefault()
                  setContextMenu({ x: e.clientX, y: e.clientY, folder: isRoot ? null : key })
                }}
```

Also add `onContextMenu` to the scroll area container (the `<div className="flex-1 overflow-y-auto">`) to handle right-clicks on blank space:

```jsx
          onContextMenu={e => {
            if (e.target === e.currentTarget) {
              e.preventDefault()
              setContextMenu({ x: e.clientX, y: e.clientY, folder: null })
            }
          }}
```

- [ ] **Step 5: Replace folder name span with conditional rename input**

Inside the folder header, find the folder name `<span>`:

```jsx
<span
  className={`text-xs font-semibold uppercase tracking-wide ${isRoot ? 'text-gray-400' : color.text}`}
>
  {isRoot ? 'Uncategorized' : key}
</span>
```

Replace with:

```jsx
{
  !isRoot && renamingFolder === key ? (
    <input
      ref={renameInputRef}
      value={renameInput}
      onChange={(e) => setRenameInput(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') handleRenameFolder()
        if (e.key === 'Escape') {
          setRenamingFolder(null)
          setRenameInput('')
        }
      }}
      onBlur={handleRenameFolder}
      onClick={(e) => e.stopPropagation()}
      className={`flex-1 bg-transparent border-b border-indigo-500 text-xs font-semibold uppercase tracking-wide focus:outline-none ${color.text}`}
    />
  ) : (
    <span
      className={`text-xs font-semibold uppercase tracking-wide ${isRoot ? 'text-gray-400' : color.text}`}
    >
      {isRoot ? 'Uncategorized' : key}
    </span>
  )
}
```

- [ ] **Step 6: Add context menu overlay and delete dialog**

Just before the closing `</div>` of the component's outermost return div (before `{selected && <LibraryDetailPanel`), add:

```jsx
{
  /* Context menu */
}
{
  contextMenu && (
    <div
      style={{ position: 'fixed', top: contextMenu.y, left: contextMenu.x, zIndex: 1000 }}
      className="bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1 min-w-[148px]"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        onClick={() => {
          setContextMenu(null)
          setCreating(true)
        }}
        className="w-full text-left px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-700 transition-colors"
      >
        New Folder
      </button>
      {contextMenu.folder && (
        <>
          <div className="border-t border-gray-700 my-1" />
          <button
            onClick={() => {
              setRenameInput(contextMenu.folder)
              setRenamingFolder(contextMenu.folder)
              setContextMenu(null)
            }}
            className="w-full text-left px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-700 transition-colors"
          >
            Rename
          </button>
          <button
            onClick={() => {
              setDeletingFolder({
                name: contextMenu.folder,
                count: groups[contextMenu.folder]?.length ?? 0
              })
              setContextMenu(null)
            }}
            className="w-full text-left px-3 py-1.5 text-sm text-red-400 hover:bg-red-950/40 transition-colors"
          >
            Delete
          </button>
        </>
      )}
    </div>
  )
}

{
  /* Delete folder dialog */
}
{
  deletingFolder && (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onMouseDown={() => setDeletingFolder(null)}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h3 className="text-white font-semibold mb-2">Delete "{deletingFolder.name}"</h3>
        <p className="text-gray-400 text-sm mb-5">
          What should happen to the {deletingFolder.count} file
          {deletingFolder.count !== 1 ? 's' : ''} in this folder?
        </p>
        <div className="flex flex-col gap-2">
          <button
            onClick={() => handleDeleteFolder('unassign')}
            className="px-4 py-2 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors text-left"
          >
            Move to Uncategorized
          </button>
          <button
            onClick={() => handleDeleteFolder('delete')}
            className="px-4 py-2 text-sm bg-red-950/60 hover:bg-red-900/60 text-red-300 border border-red-800 rounded-lg transition-colors text-left"
          >
            Delete files permanently
          </button>
          <button
            onClick={() => setDeletingFolder(null)}
            className="px-4 py-2 text-sm text-gray-500 hover:text-gray-400 transition-colors text-left"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Final smoke-test**

```bash
npm run dev
```

Verify:

1. Right-clicking a folder header shows context menu with New Folder, Rename, Delete
2. Right-clicking blank space shows only New Folder
3. Rename replaces the folder label with an input; Enter confirms, Escape cancels, and the list refreshes
4. Delete opens the modal with correct file count; "Move to Uncategorized" moves files; "Delete files permanently" removes them
5. New Folder from context menu shows the inline input at the bottom

Close dev server.

- [ ] **Step 8: Run all tests**

```bash
npm run test:all
```

Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/src/components/LibraryTab.jsx
git commit -m "feat: add folder right-click context menu with rename and delete to LibraryTab"
```

---

## Verification Checklist

After all tasks are complete, run `npm run dev` and verify:

- [ ] Sort cycles Date ↓ → Date ↑ → Name ↑ → Name ↓ → Folder A–Z → Folder Z–A → Date ↓
- [ ] Sort button highlighted (indigo) when not on default Date ↓
- [ ] Sorting by name: groups reorder A–Z, items within groups reorder A–Z
- [ ] Sorting by date: newest-file group appears first, items in each group newest-first
- [ ] Sorting by folder: folder group headers alphabetical, items within groups alphabetical by title
- [ ] Search filters groups in place (non-matching groups hidden, matching groups show only matched items)
- [ ] Search shows result count and ✕ clear button
- [ ] Clearing search restores full grouped view; active sort is preserved
- [ ] Right-click on folder header → New Folder / Rename / Delete
- [ ] Right-click on blank list area → New Folder only
- [ ] Rename: inline input, Enter confirms, Escape cancels, list refreshes
- [ ] Delete → "Move to Uncategorized": files move to root group, folder disappears
- [ ] Delete → "Delete files permanently": files gone from list and disk
- [ ] `npm run test:all` passes
