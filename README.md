# Pully

A macOS desktop app for downloading videos from YouTube and other sites. Built with Electron, React, and yt-dlp.

## Features

- **Built-in browser** — navigate to any site without leaving the app
- **Automatic video detection** — scans each page for downloadable media as it loads
- **Format selection** — choose resolution and format (MP4, WebM, audio-only, etc.) per video
- **Download queue** — concurrent downloads with live progress shown inline
- **Library** — browse downloaded files and reveal them in Finder

## Getting Started

**Prerequisites:** Node.js 18+, macOS (Windows/Linux builds are possible but untested)

```bash
npm install      # installs deps and downloads the yt-dlp binary automatically
npm run dev      # start in development mode with hot reload
```

## Building

```bash
npm run build:mac     # produces dist/Pully-1.0.0-universal.dmg (arm64 + x86_64)
npm run build:win     # Windows
npm run build:linux   # Linux
```

The DMG is signed with your local Apple Development certificate if one is available. Notarization is not configured.

## Development

```bash
npm run dev           # Electron + Vite dev server with hot reload
npm run test          # main process unit tests
npm run test:all      # main + renderer tests
npm run lint          # ESLint
npm run format        # Prettier
```

Run a single test file:
```bash
npx vitest run tests/main/download-manager.test.js
```

## Architecture

Pully follows Electron's standard multi-process model:

| Process | Location | Role |
|---------|----------|------|
| Main | `src/main/` | App lifecycle, IPC handlers, download orchestration, yt-dlp management |
| Preload | `src/preload/index.js` | Context bridge — exposes `window.api` to the renderer |
| Renderer | `src/renderer/` | React + Tailwind UI (Browser / Downloads / Library tabs) |

**Download flow:** page loads in webview → yt-dlp scans for media → user selects format and clicks Download → `DownloadManager` queues and runs yt-dlp as a child process → progress streamed back to the UI via IPC events.

State is managed with Zustand (`src/renderer/src/store/app-store.js`). IPC events from the main process are subscribed in `useIpcEvents.js` and pushed into the store.

## Configuration

On first launch the output folder defaults to `~/Downloads`. Settings (output folder, max concurrent downloads) are persisted to `~/Library/Application Support/Pully/config.json`.

## yt-dlp

The yt-dlp binary is downloaded automatically during `npm install` via `scripts/download-ytdlp.js` and stored in `resources/yt-dlp`. At runtime it is copied to the app's userData directory. To update yt-dlp, delete the binary and re-run `npm install`.
