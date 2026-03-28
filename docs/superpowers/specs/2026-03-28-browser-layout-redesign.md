# Browser Tab Layout Redesign

**Date:** 2026-03-28
**Status:** Approved

## Summary

Reorganise the Browser tab from a vertical stack (webview + bottom media panel) into a two-column layout with a resizable right panel. Move the Downloads tab content into that right panel as a "Progress" section. Remove the Downloads tab entirely.

## Layout

### Before
```
┌─────────────────────────────┐
│ Nav bar                     │
├─────────────────────────────┤
│                             │
│         Webview             │
│                             │
├─────────────────────────────┤
│  MediaPanel (bottom strip)  │
└─────────────────────────────┘
```

### After
```
┌─────────────────────────────┬──────────────┐
│ Nav bar (full width)        │              │
├─────────────────────────────┤              │
│                             │  MediaPanel  │
│         Webview             │   (70%)      │
│                             ├──────────────┤
│                             │  Progress    │
│                             │   (30%)      │
└─────────────────────────────┴──────────────┘
         ↕ drag handle              ↕ drag handle
```

## Components

### New: `SidePanel.jsx`
- Owns vertical split state (default 70% MediaPanel / 30% Progress)
- Renders `MediaPanel` on top, `ProgressPanel` on bottom
- Vertical drag handle between them, clamped 20%–80%

### New: `ProgressPanel.jsx`
- Sticky "Progress" header
- Lists `DownloadRow` items: active (queued/downloading) first, then done/failed
- Empty state: small muted text "No downloads yet" (no hero image)
- Reads `downloads` from Zustand store directly

### Modified: `BrowserTab.jsx`
- Horizontal split: webview (flex-1) + `SidePanel` (default 320px)
- Horizontal drag handle between them, clamped 200px–600px
- Removes `<MediaPanel />` from bottom

### Modified: `TabBar.jsx`
- Remove `downloads` entry from `TABS` array

### Modified: `App.jsx`
- Remove `DownloadsTab` lazy import and render

### Deleted: `DownloadsTab.jsx`

## Drag Handle Implementation

Both handles use the same mouse-drag pattern:

1. `onMouseDown` on the handle `div` sets a dragging flag and records the start position
2. `mousemove` listener added to `window` computes delta and updates size state
3. `mouseup` listener on `window` cleans up
4. Cleanup also runs on component unmount

**Horizontal handle** (webview ↔ right panel):
- Updates right panel width in pixels
- Clamped: min 200px, max 600px
- Cursor: `col-resize`

**Vertical handle** (MediaPanel ↔ Progress):
- Updates split as percentage of panel height
- Clamped: min 20%, max 80%
- Default: 70% / 30%
- Cursor: `row-resize`

Handle styling: 4px wide/tall, subtle grey with a short line indicator, highlights on hover.

## What Is Removed

- `DownloadsTab.jsx` — deleted
- "Downloads" tab button in `TabBar.jsx`
- `DownloadsTab` render in `App.jsx`
- The empty-state hero image that was shown when no downloads existed

## What Is Unchanged

- `DownloadRow.jsx` — reused as-is in `ProgressPanel`
- `MediaPanel.jsx` — reused as-is, internal logic untouched
- All IPC, store, and download logic
