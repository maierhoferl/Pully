# Pully

A desktop app for downloading videos from YouTube and other sites. Built with Electron, React, and yt-dlp.

## Download

Go to the **[Releases page](../../releases/latest)** to download the latest version.

| Platform | File | Requirements |
|----------|------|--------------|
| macOS (Apple Silicon + Intel) | `Pully-{version}-mac-universal.dmg` | macOS 11+ |
| Windows | `Pully-{version}-win-x64-setup.exe` | Windows 10+ (64-bit) |
| Linux | `Pully-{version}-linux-x64.AppImage` | x86_64 |

### Verify your download (SHA-256)

Each release includes `SHA256SUMS.txt`. To verify:

**macOS / Linux:**
```bash
sha256sum -c SHA256SUMS.txt --ignore-missing
```

**Windows (PowerShell):**
```powershell
(Get-FileHash "Pully-*-win-x64-setup.exe" -Algorithm SHA256).Hash
```
Compare the output against the matching line in `SHA256SUMS.txt`.

### Platform notes

**macOS** — the app is signed and notarized. If macOS shows a security prompt on first launch, right-click the app → Open.

**Linux** — make the AppImage executable before running:
```bash
chmod +x Pully-*.AppImage
./Pully-*.AppImage
```

---

## Features

- **Built-in browser** — navigate to any site without leaving the app
- **Adblock** — network-level ad blocking powered by EasyList/EasyPrivacy + YouTube-specific cosmetic filters; toggle on/off with the shield icon in the tab bar; state persists across restarts; filter lists update automatically in the background every 24 hours
- **Automatic video detection** — scans each page for downloadable media as it loads
- **Format selection** — choose resolution and format (MP4, WebM, audio-only, etc.) per video
- **Download queue** — concurrent downloads with live progress shown inline
- **Library** — browse downloaded files with thumbnails and metadata; reveal in Finder / Explorer / file manager

## Getting Started (development)

**Prerequisites:** Node.js 18+

```bash
npm install      # installs deps and downloads the yt-dlp binary automatically
npm run dev      # start in development mode with hot reload
```

## Building

```bash
npm run build:mac     # macOS universal DMG (must run on macOS)
npm run build:win     # Windows NSIS installer
npm run build:linux   # Linux AppImage
```

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

On first launch the output folder defaults to `~/Downloads`. Settings are persisted to the app's userData directory.

## yt-dlp

The yt-dlp binary is downloaded automatically during `npm install` and stored in `resources/`. At runtime it is copied to the app's userData directory. To update yt-dlp, delete the binary and re-run `npm install`.
