# Browser Media Entry Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Relayout the `MediaEntry` component in the Browser tab side panel to use a compact vertical hierarchy with Library-consistent border styling.

**Architecture:** Single file change in `MediaPanel.jsx` — restructure the `MediaEntry` JSX from a flat horizontal row to a title → metadata-line (type indicator + quality selector) → thumbnail + buttons layout. Playlist detection uses `entry.playlist_id` from yt-dlp output.

**Tech Stack:** React 19, Tailwind CSS, Vitest + @testing-library/react

---

### Task 1: Write failing tests for MediaEntry

**Files:**
- Create: `tests/renderer/MediaPanel.test.jsx`

- [ ] **Step 1: Create the test file**

```jsx
import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.hoisted ensures mockState is available inside the vi.mock factory
const mockState = vi.hoisted(() => ({
  mediaScanResults: null,
  mediaScanLoading: false,
  currentBrowserUrl: 'https://example.com',
  startMediaScan: vi.fn(),
  setMediaScanResults: vi.fn(),
  downloads: [],
}))

vi.mock('@renderer/store/app-store.js', () => ({
  useAppStore: vi.fn(selector => selector ? selector(mockState) : mockState),
}))

window.api = {
  addDownload: vi.fn(async () => 'dl-1'),
  rememberMedia: vi.fn(async () => ({ alreadyExists: false })),
}

import { MediaPanel } from '@renderer/components/MediaPanel.jsx'

const baseEntry = {
  id: 'vid1',
  title: 'My Video Title',
  url: 'https://example.com/vid1',
  webpage_url: 'https://example.com/vid1',
  formats: [
    { format_id: 'f1', height: 1080, ext: 'mp4', filesize: null },
    { format_id: 'f2', height: 720, ext: 'mp4', filesize: null },
  ],
}

beforeEach(() => vi.clearAllMocks())

describe('MediaEntry type indicator', () => {
  it('shows "Single video" when playlist_id is absent', () => {
    mockState.mediaScanResults = [baseEntry]
    render(<MediaPanel />)
    expect(screen.getByText('Single video')).toBeTruthy()
  })

  it('shows "Playlist" when playlist_id is present', () => {
    mockState.mediaScanResults = [{ ...baseEntry, playlist_id: 'PL123', playlist_title: 'My Playlist' }]
    render(<MediaPanel />)
    expect(screen.getByText('Playlist')).toBeTruthy()
  })

  it('renders entry title', () => {
    mockState.mediaScanResults = [baseEntry]
    render(<MediaPanel />)
    expect(screen.getByText('My Video Title')).toBeTruthy()
  })

  it('renders quality options from formats', () => {
    mockState.mediaScanResults = [baseEntry]
    render(<MediaPanel />)
    expect(screen.getByText('1080p mp4')).toBeTruthy()
    expect(screen.getByText('720p mp4')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run the tests and confirm they fail**

```bash
npx vitest run tests/renderer/MediaPanel.test.jsx --reporter=verbose
```

Expected: 4 failing tests — "Single video", "Playlist", title, and format options are not rendered with the current layout being tested via mock structure.

> **Note:** Tests may fail with import/mock errors at this stage — that's expected. The goal is to confirm the test file runs and the assertions fail correctly once the mocks are wired. If you get module resolution errors, verify `@renderer` alias resolves via `vitest.renderer.config.js`.

- [ ] **Step 3: Commit the failing tests**

```bash
git add tests/renderer/MediaPanel.test.jsx
git commit -m "test: add failing tests for MediaEntry type indicator and layout"
```

---

### Task 2: Implement the new MediaEntry layout

**Files:**
- Modify: `src/renderer/src/components/MediaPanel.jsx`

- [ ] **Step 1: Update `DownloadButton` to compact sizing**

Find the `DownloadButton` component (lines 33–59) and change the button's class from `text-sm font-semibold px-4 py-1.5 rounded flex-shrink-0 min-w-[90px] text-center` to `text-xs font-semibold px-2 py-1 rounded flex-shrink-0 transition-colors text-center`:

```jsx
function DownloadButton({ downloadId }) {
  const downloads = useAppStore(s => s.downloads)
  const dl = downloads.find(d => d.id === downloadId)

  if (!dl) return null

  let label = 'Queued'
  let style = 'bg-gray-600 text-gray-300 cursor-not-allowed'

  if (dl.status === 'downloading') {
    const pct = typeof dl.percent === 'number' ? dl.percent : 0
    label = `${Math.round(pct)}%`
    style = 'bg-blue-700 text-white cursor-not-allowed'
  } else if (dl.status === 'done') {
    label = 'Done ✓'
    style = 'bg-green-700 text-white cursor-not-allowed'
  } else if (dl.status === 'failed') {
    label = 'Failed'
    style = 'bg-red-700 text-white cursor-not-allowed'
  }

  return (
    <button disabled className={`text-xs font-semibold px-2 py-1 rounded flex-shrink-0 transition-colors text-center ${style}`}>
      {label}
    </button>
  )
}
```

- [ ] **Step 2: Update `rememberStyle` idle state to green**

In the `MediaEntry` component, find the `rememberStyle` object and change the `idle` entry from gray to green:

```js
const rememberStyle = {
  idle: 'bg-green-700 hover:bg-green-600 text-white cursor-pointer',
  pending: 'bg-gray-600 text-gray-400 cursor-not-allowed',
  done: 'bg-purple-800 text-purple-200 cursor-default',
  exists: 'bg-gray-700 text-gray-400 cursor-default',
  error: 'bg-red-800 text-red-200 cursor-default',
}[rememberState]
```

- [ ] **Step 3: Replace the `MediaEntry` return JSX with the new layout**

Replace the entire `return (...)` block in `MediaEntry` (lines 111–144) with:

```jsx
  const isPlaylist = Boolean(entry.playlist_id)

  return (
    <div className="bg-gray-800 hover:bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 transition-colors">
      {/* Title */}
      <p className="text-sm font-medium text-white truncate leading-snug" title={entry.title}>
        {entry.title || entry.id}
      </p>
      {/* Metadata line: type indicator + quality selector */}
      <div className="flex items-center gap-3 mt-0.5">
        <span className="text-[0.65rem] text-gray-400 flex-shrink-0">
          {isPlaylist ? 'Playlist' : 'Single video'}
        </span>
        <select
          value={selected}
          onChange={e => setSelected(e.target.value)}
          className="text-[0.7rem] bg-gray-700 border border-gray-600 rounded px-1.5 py-0.5 text-gray-300"
        >
          {formats.map(f => <option key={f.format_id} value={f.format_id}>{f.label}</option>)}
        </select>
      </div>
      {/* Thumbnail + action buttons */}
      <div className="flex gap-3 mt-2">
        {entry.thumbnail && (
          <img
            src={entry.thumbnail}
            alt=""
            className="w-24 h-14 object-cover rounded-md flex-shrink-0 shadow"
            onError={e => { e.target.style.display = 'none' }}
          />
        )}
        <div className="flex flex-col gap-1.5">
          <button
            onClick={handleRemember}
            disabled={rememberState !== 'idle'}
            title={rememberState === 'exists' ? 'Already in library' : 'Save reference without downloading'}
            className={`text-xs font-semibold px-2 py-1 rounded flex-shrink-0 transition-colors ${rememberStyle}`}
          >
            {rememberLabel}
          </button>
          {downloadId
            ? <DownloadButton downloadId={downloadId} />
            : (
              <button
                onClick={handleDownload}
                className="text-xs font-semibold bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white px-2 py-1 rounded flex-shrink-0 transition-colors"
              >
                Download
              </button>
            )
          }
        </div>
      </div>
    </div>
  )
```

Note: add `const isPlaylist = Boolean(entry.playlist_id)` just before the `return` statement, inside `MediaEntry`.

- [ ] **Step 4: Run the renderer tests**

```bash
npm run test:renderer
```

Expected: All tests pass including the 4 new tests in `MediaPanel.test.jsx`.

- [ ] **Step 5: Commit the implementation**

```bash
git add src/renderer/src/components/MediaPanel.jsx
git commit -m "feat: redesign MediaEntry with compact layout and Library-consistent styling"
```

---

### Task 3: Visual verification

**Files:** (no changes)

- [ ] **Step 1: Start the app in dev mode**

```bash
npm run dev
```

- [ ] **Step 2: Navigate to a single video URL in the browser tab**

Open e.g. `https://www.youtube.com/watch?v=dQw4w9WgXcQ`

Expected:
- Side panel shows the entry with Library-style border (`rounded-lg`, dark background, gray border)
- Title on first line, "Single video" + quality selector on second line (same row)
- Thumbnail on left, green Remember button above blue Download button on right
- Hover changes background slightly

- [ ] **Step 3: Navigate to a playlist URL**

Open e.g. `https://www.youtube.com/playlist?list=PLbpi6ZahtOH6Ar_3GPy3workspaceVid`

Expected:
- Each entry shows "Playlist" instead of "Single video" on the metadata line

- [ ] **Step 4: Run the full test suite to check for regressions**

```bash
npm run test:all
```

Expected: All tests pass.
