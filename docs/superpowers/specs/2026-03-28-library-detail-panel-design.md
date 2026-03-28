# Library Detail Panel — Design Spec

**Date:** 2026-03-28

## Problem

The Library tab currently shows only filename, size, and modified date in a grid layout with a placeholder emoji. There is no way to see video metadata (title, author, description) or play a video without opening Finder.

## Goal

Add thumbnail previews and a slide-in detail panel to the Library tab. Embed metadata into downloaded video files so they are self-contained and portable, and maintain a fast-read index in userData for UI rendering.

---

## Architecture

### Download Pipeline Changes

**`src/main/ytdlp-runner.js`**
- Add `--embed-thumbnail`, `--embed-metadata`, and `--ffmpeg-location <path>` to the download command

**`src/renderer/src/components/MediaPanel.jsx`** + **`src/preload/index.js`**
- When the user clicks Download, include the already-fetched metadata (title, uploader, description, thumbnailUrl) in the `download:add` IPC payload — this data is available in renderer state from the prior `--dump-json` extraction

**`src/main/download-manager.js`**
- Accept metadata in the download job object
- On download completion, write a metadata entry to `metadata-index.json` in userData (via `metadata-store.js`)
- Entry keyed by absolute file path

**`src/main/metadata-store.js`** _(new)_
- Thin wrapper around a JSON file in `app.getPath('userData')/metadata-index.json`
- Methods: `set(filePath, metadata)`, `get(filePath)`, `getAll()`
- Shape per entry:
  ```json
  {
    "title": "Bohemian Rhapsody",
    "uploader": "Queen",
    "description": "Full YouTube description text...",
    "thumbnailUrl": "https://i.ytimg.com/vi/...",
    "downloadedAt": "2026-03-27T14:32:00.000Z"
  }
  ```

### ffmpeg Bundling

**`scripts/download-ytdlp.js`**
- Add a second download step for the platform-appropriate ffmpeg static binary
- Save to `resources/ffmpeg` (same directory as `resources/yt-dlp`)

**`src/main/ytdlp-runner.js`**
- Resolve ffmpeg binary path the same way yt-dlp is resolved (resourcesPath in prod, `resources/` in dev)
- Pass to yt-dlp via `--ffmpeg-location`

### IPC

**`src/main/ipc-handlers.js`**
- Replace `library:list` handler with `library:list` returning merged data: filesystem stats + metadata index entry per file
- Response shape per item: `{ name, path, size, mtime, title, uploader, description, thumbnailUrl, downloadedAt }` — metadata fields are `null` if not found (graceful fallback)

**`src/preload/index.js`**
- No change needed if `listLibrary` already maps to `library:list`

### Renderer State

**`src/renderer/src/store/app-store.js`**
- `libraryFiles` entries gain nullable fields: `title`, `uploader`, `description`, `thumbnailUrl`, `downloadedAt`

---

## UI

### Library Tab (`src/renderer/src/components/LibraryTab.jsx`)

Replace the current grid with a **list view**:
- Each row: small thumbnail (16:9, ~64px wide, grey placeholder if no URL), video title (fallback: filename without extension), author (fallback: `—`)
- Clicking a row highlights it and slides in the detail panel; clicking again closes it
- The list width shrinks when the panel is open

### Detail Panel (`src/renderer/src/components/LibraryDetailPanel.jsx`) _(new)_

Layout (option B — title first):
1. **Title** (bold, full text)
2. **Subtitle line**: `Author · Mar 27, 2026 · 14:32` (fallback: `— · date`)
3. **Thumbnail** with `▶ PLAY` button overlaid in center — `shell.openPath(filePath)` on click
4. **Description** — scrollable, full text (fallback: `—`)
5. **X / close button** in top-right corner

Graceful fallback for pre-existing downloads (no metadata entry):
- Title: filename without extension
- Author, description: `—`
- Thumbnail: grey placeholder
- Play button: still functional

---

## Verification

1. `npm install` — confirm ffmpeg downloads to `resources/ffmpeg`
2. `npm run dev` — download a YouTube video
3. Verify embedding: `ffprobe -v quiet -print_format json -show_format <file>` shows title/artist tags and embedded artwork
4. Open Library tab — video appears as a list row with thumbnail and author
5. Click a row — detail panel slides in with title, author, date, description, and Play button
6. Click Play — file opens in system default video player
7. Click the row again (or X) — panel closes
8. Test an old download (no metadata) — shows filename, dashes for missing fields, Play works
