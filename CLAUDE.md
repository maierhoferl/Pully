# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # Install deps + download yt-dlp binary (postinstall hook)
npm run dev          # Start dev mode with hot reload
npm run build        # Compile to out/
npm run package      # Full build + package for current OS
npm run test         # Run main process tests
npm run test:renderer # Run renderer tests
npm run test:all     # Run all tests
npm run lint         # ESLint
npm run format       # Prettier
```

Run a single test file: `npx vitest run tests/main/download-manager.test.js`

## Architecture

**Pully** is an Electron desktop app that downloads videos via yt-dlp. It uses Electron's standard multi-process model:

- **Main process** (`src/main/`) — Node.js backend: app lifecycle, IPC handlers, download orchestration, yt-dlp binary management
- **Preload** (`src/preload/index.js`) — Context bridge exposing `window.api` to renderer (config, downloads, library, yt-dlp extraction)
- **Renderer** (`src/renderer/`) — React 19 + Tailwind + Zustand frontend with 3 tabs: Browser, Downloads, Library

### Download Flow

1. User navigates in the built-in webview browser (`BrowserTab.jsx`)
2. `MediaPanel.jsx` triggers yt-dlp format detection via IPC
3. User queues download → `download:add` IPC → `DownloadManager` → `ytdlp-runner.js`
4. `ytdlp-runner.js` spawns yt-dlp as child process, parses progress stdout
5. Progress events flow back to renderer via IPC; completed files appear in Library tab

### Key Modules

| File | Responsibility |
|------|---------------|
| `src/main/download-manager.js` | Queue management, concurrency control |
| `src/main/ytdlp-runner.js` | Spawn yt-dlp processes, parse output, manage binary path |
| `src/main/ipc-handlers.js` | Register all IPC handlers |
| `src/main/config-store.js` | Persist config to userData folder |
| `src/renderer/src/store/app-store.js` | Zustand global state (downloads, UI, library) |
| `src/renderer/src/hooks/useIpcEvents.js` | Subscribe to IPC progress/completion events |

### State Management

Zustand (`app-store.js`) is the single source of truth for renderer state. IPC events from main are subscribed via `useIpcEvents.js` and push updates into the store.

### Tests

- Main process tests: `tests/main/` (Node env via `vitest.main.config.js`)
- Renderer tests: `tests/renderer/` (JSDOM env via `vitest.renderer.config.js`)

### yt-dlp Binary

The binary is downloaded to `resources/yt-dlp` at install time (`scripts/download-ytdlp.js`). At runtime, the main process copies it to the user's data directory. Currently macOS only.
