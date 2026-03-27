# Video Downloader App — Design Spec

**Date:** 2026-03-27

## Overview

A standalone macOS desktop app built with Electron + React that lets users browse any website in an embedded browser, automatically detects downloadable video/audio content on each page load using `yt-dlp`, and saves selected media to a configured local folder. Downloads run concurrently (up to 3 at once) with real-time progress. A Library tab shows all previously downloaded files.

---

## Architecture

### Process Structure

- **Renderer process (React):** All UI — tab bar, browser view, download queue, library, settings panel
- **Main process (Node.js):** Download orchestration, `yt-dlp` child process management, file system access, IPC bridge
- **`<webview>` tag:** Sandboxed embedded browser in the Browser tab for navigating external sites

### yt-dlp Bundling

A prebuilt `yt-dlp` binary for macOS (universal) is bundled into `resources/`. On first launch, main process copies it to a writable location in Electron's `userData` directory and sets the executable bit. All invocations use this bundled binary — never `$PATH`.

On startup, main verifies the binary is present and executable. If not, an error is logged to console.

### IPC Communication

```
Renderer → ipcRenderer.invoke → Main → yt-dlp subprocess
Main → webContents.send → Renderer (progress events, scan results, queue state)
```

All download queue state is owned by the main process. The renderer derives its display state from IPC events — no local state drift.

### Key Data Flows

1. **Auto-scan:** `<webview>` fires `did-finish-load` → renderer sends current URL via IPC → main spawns `yt-dlp --dump-json --flat-playlist --playlist-items 1-20 <url>` → returns stream list → media panel updates automatically
2. **Download:** User selects stream → added to queue → main spawns up to 3 concurrent `yt-dlp` processes → each streams stdout progress → main parses and forwards `download:progress { id, percent, speed, eta }` to renderer
3. **Completion:** Main emits `download:complete` → Library tab re-reads configured output directory

### Config Persistence

A JSON config file in Electron `userData` stores:
- `outputFolder` — absolute path to download directory
- `maxConcurrent` — number of simultaneous downloads (1–5, default 3)

---

## UI Layout

### Tab Bar

`Browser` | `Downloads` | `Library` + ⚙ gear icon (right-aligned) for settings

### Browser Tab

- **Toolbar:** Back, Forward buttons + editable URL bar showing current webview URL
- **`<webview>`:** Fills remaining vertical space; navigates external sites
- **Available Media Panel** (slide-up drawer below webview): Appears automatically after each page load
  - Spinner while scanning
  - "No downloadable media found" if yt-dlp returns nothing (panel hidden)
  - Each detected stream row: thumbnail (if available), title, format/quality dropdown, "Add to Queue" button

### Downloads Tab

- List of active + queued + recently completed downloads
- Each row: title, source site, progress bar, speed, ETA, status badge (`queued` / `downloading` / `done` / `failed`)
- Failed rows show yt-dlp error on expand, with a Retry button
- Up to 3 active simultaneously; remainder shown as queued

### Library Tab

- Grid or list view of files in the configured output folder
- Each item: filename, file size, download date, thumbnail placeholder
- Click → reveal in Finder

### Settings Panel (modal/drawer)

- **Output folder:** Current path display + "Browse…" button (native folder picker dialog)
- **Max concurrent downloads:** Number input, range 1–5
- Changes save on click of Save button to the JSON config file

---

## Error Handling

| Scenario | Behavior |
|---|---|
| yt-dlp can't extract from URL | Panel hidden (no results, no loading) — no error dialog |
| extractInfo throws | Panel resets to empty — no error dialog |
| Download fails | Red "Failed" badge; error detail on expand; Retry button |
| yt-dlp binary missing/corrupt | Error logged to console on startup |
| Output folder not set / inaccessible | Library tab shows "configure folder" prompt; downloads blocked until valid path set |
| webview navigation error (404, offline) | Standard browser error page inside webview — no special handling |

---

## Tech Stack

| Layer | Choice |
|---|---|
| App shell | Electron (latest stable) |
| UI framework | React 18 |
| Build tool | electron-vite |
| Styling | Tailwind CSS 3 |
| State management | Zustand 4 |
| IPC | Electron ipcMain / ipcRenderer (contextBridge) |
| Download engine | yt-dlp (bundled prebuilt binary) |
| Config storage | JSON file in `app.getPath('userData')` |
| Testing | Vitest (separate configs for main/renderer) |
| Packaging | electron-builder (macOS universal DMG) |

---

## Out of Scope

- Format conversion (ffmpeg transcoding) — files saved in native format only
- Windows / Linux support (macOS only for now)
- Authentication / login for paywalled content
- Playlist bulk-download UI (yt-dlp handles playlists naturally but no special UI)
