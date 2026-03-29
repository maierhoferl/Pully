# Browser Notes Panel — Design Spec

**Date:** 2026-03-29

## Context

Currently, notes.md entries are only created after a download completes or a "Remember" action fully resolves — meaning there is a window where no notes entry exists. Users also have no way to view or edit notes from the Browser tab without switching to the Library tab. This spec addresses both gaps: immediate stub creation on button click, and a live Notes panel embedded in the Browser tab's side panel.

---

## Goals

1. A notes.md chapter stub is created **the moment** "Remember" or "Download" is clicked — with whatever data is available (title, URL, date).
2. The Browser tab shows a **Notes panel** (default) alongside the existing Progress panel via tabs.
3. The Notes panel updates in real-time as classification, file resolution, and AI summarizing complete asynchronously.
4. Async operations never clobber in-progress user edits.

---

## Immediate Stub Creation

### Remember
`initChapter` is already called synchronously before the async classify chain in `ipc-handlers.js`. No change needed to the timing — the stub exists before classify runs.

### Download
`initChapter` is currently called only after yt-dlp finishes. Change: call `initChapter` at `downloadManager.add()` time with the data available at click (title, URL, outputFolder). The `pully:file:` anchor is initially omitted or left as a URL-based placeholder; it is written/updated when the download completes and the real filename is known.

If `initChapter` is called again on completion (with the real `filePath`), it must detect the existing URL-keyed entry and update the `pully:file:` anchor rather than creating a duplicate chapter. Logic: on init, if no `pully:file:` anchor exists but a matching `pully:url:` anchor exists, adopt the existing chapter.

---

## Conflict Prevention

- Async operations (`classifyVideo`, `generateSummary`, `resolveFilename`) only write to `### AI Summary` and structural anchors (`pully:file:`, `pully:url:`).
- `### My Notes` (bullets) is **never touched by async operations** — only by explicit user saves.
- When a `notes:chapter-updated` IPC event arrives in the renderer, if the user has an active edit in progress (textarea is focused / dirty), the incoming update is applied to the backing store but the textarea is not replaced until the user saves or blurs.

---

## IPC Push Architecture

### New event: `notes:chapter-updated`

**Emitted by main in four cases:**
1. Stub created on "Remember" or "Download" click
2. `moveChapter` completes after classification moves the file
3. `writeSummarySection` completes after AI summarizing
4. Real filename resolved after download completes

**Payload:**
```js
{
  notesPath: string,   // absolute path to the notes.md file
  chapter: {
    filePath: string,  // basename (may be null until download completes)
    title: string,
    url: string,
    downloadedAt: string,
    summary: string,
    bullets: string[]
  }
}
```

**Subscribed by:** `useIpcEvents.js` → writes to `browserActiveChapter` in Zustand.

---

## State

### New Zustand slice in `app-store.js`

```js
browserActiveChapter: null,
// { notesPath: string, chapter: ChapterObject }

setBrowserActiveChapter: (data) => set({ browserActiveChapter: data }),
```

Set whenever a `notes:chapter-updated` event arrives. Replaced (not merged) on each update so the panel always reflects the latest server state.

---

## UI Layout

### SidePanel (bottom pane)

Current: `ProgressPanel` fills the bottom pane entirely.

New:
```
Bottom pane
  ├── Tab bar: [Notes (default)] [Progress]
  ├── BrowserNotesPanel  (visible when Notes tab active)
  └── ProgressPanel      (visible when Progress tab active)
```

`MediaPanel` in the top pane is unchanged.

Tab switching is local state in `SidePanel.jsx` (`useState('notes')`). No persistence needed.

---

## Components

### Extract: `ChapterCard.jsx`

`ChapterCard` is currently defined inline in `NotesChapterView.jsx`. Extract it to `src/renderer/src/components/ChapterCard.jsx` with no behavior changes. Both `NotesChapterView` and `BrowserNotesPanel` import it.

### New: `BrowserNotesPanel.jsx`

- Reads `browserActiveChapter` from Zustand
- **Empty state** (no chapter): "Click Remember or Download to start notes" — subtle, centered, no action needed
- **Active state**: renders a single `<ChapterCard>` with the chapter data
- Does not fetch from disk — fully driven by the `browserActiveChapter` Zustand slice
- Passes an `onBulletsChange` handler that calls `window.api.updateBullets` on save (same as Library Notes view)
- Passes an `onGenerateSummary` handler that calls `window.api.generateSummary` on click

### Modified: `SidePanel.jsx`

- Add `activeTab` local state (`'notes'` | `'progress'`)
- Render tab bar above the bottom pane
- Conditionally render `BrowserNotesPanel` or `ProgressPanel`

### Modified: `useIpcEvents.js`

- Add subscription: `window.api.on('notes:chapter-updated', (data) => setBrowserActiveChapter(data))`

---

## Files Changed

| File | Change |
|------|--------|
| `src/main/notes-store.js` | Stub creation without filename; adopt-by-URL logic; emit `notes:chapter-updated` after every write |
| `src/main/download-manager.js` | Call `initChapter` at add-time; resolve filename anchor on completion |
| `src/main/ipc-handlers.js` | Ensure `initChapter` fires before async classify on Remember |
| `src/main/auto-classifier.js` | Emit `notes:chapter-updated` after `moveChapter` |
| `src/main/ai-summarizer.js` | Emit `notes:chapter-updated` after `writeSummarySection` |
| `src/renderer/src/store/app-store.js` | Add `browserActiveChapter` slice |
| `src/renderer/src/hooks/useIpcEvents.js` | Subscribe to `notes:chapter-updated` |
| `src/renderer/src/components/NotesChapterView.jsx` | Extract `ChapterCard` |
| `src/renderer/src/components/ChapterCard.jsx` | New — extracted component |
| `src/renderer/src/components/BrowserNotesPanel.jsx` | New — notes panel for Browser tab |
| `src/renderer/src/components/SidePanel.jsx` | Add tab bar, conditional panel rendering |

---

## Verification

1. **Immediate stub**: Click Download — switch to Library Notes before download finishes — chapter entry exists with title + URL.
2. **Immediate editing**: Click Download — switch to Notes tab in Browser — type bullets and save — bullets persist in notes.md.
3. **Real-time classify**: Download a video that gets classified to a subfolder — watch the Notes panel update (title/path) without any UX interruption.
4. **Real-time summary**: Trigger AI summary — Notes panel `### AI Summary` section updates without losing any user-typed bullets.
5. **No conflict**: Start typing bullets — while typing, trigger a summary (via Library tab) — textarea is not replaced.
6. **Remember flow**: Click Remember — Notes tab shows chapter immediately.
7. **Progress tab**: Click Progress tab — existing `ProgressPanel` renders correctly.
8. **Library compatibility**: Verify `NotesChapterView` still renders correctly after `ChapterCard` extraction.
