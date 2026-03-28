# GitHub Release Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add cross-platform GitHub Actions release workflow (macOS/Windows/Linux) with signed+notarized macOS builds, SHA-256 checksums, and an updated README download section.

**Architecture:** Update the yt-dlp download script and runtime binary path to be cross-platform; extend `electron-builder.yml` with Windows (NSIS) and Linux (AppImage) targets; create a GitHub Actions workflow triggered on `v*` tags that builds all three platforms in parallel, then publishes to a GitHub Release with `SHA256SUMS.txt`.

**Tech Stack:** GitHub Actions, electron-builder v26, @electron/notarize, softprops/action-gh-release@v2

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `scripts/download-ytdlp.js` | Modify | Cross-platform binary download (macOS/Windows/Linux) |
| `src/main/ytdlp-runner.js` | Modify | Platform-aware `getDefaultBinaryPath()` and `ensureBinary()` |
| `src/main/index.js` | Modify | Platform-aware dest filename when copying binary to userData |
| `electron-builder.yml` | Modify | Add Windows/Linux targets, artifact naming, per-platform extraResources, afterSign |
| `scripts/notarize.js` | Create | macOS notarization afterSign hook |
| `.github/workflows/release.yml` | Create | CI release workflow |
| `README.md` | Modify | Prominent download section at top, all three platforms |

---

### Task 1: Update download-ytdlp.js for cross-platform

**Files:**
- Modify: `scripts/download-ytdlp.js`

- [ ] **Step 1: Replace scripts/download-ytdlp.js**

Write the following as the complete file content:

```javascript
const https = require('https')
const fs = require('fs')
const path = require('path')

const BINARIES = {
  darwin: {
    url: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos',
    dest: path.join(__dirname, '..', 'resources', 'yt-dlp'),
    executable: true
  },
  win32: {
    url: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe',
    dest: path.join(__dirname, '..', 'resources', 'yt-dlp.exe'),
    executable: false
  },
  linux: {
    url: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux',
    dest: path.join(__dirname, '..', 'resources', 'yt-dlp'),
    executable: true
  }
}

const info = BINARIES[process.platform]

if (!info) {
  console.log(`Unsupported platform: ${process.platform}, skipping yt-dlp download`)
  process.exit(0)
}

if (fs.existsSync(info.dest)) {
  console.log('yt-dlp already present, skipping')
  process.exit(0)
}

fs.mkdirSync(path.dirname(info.dest), { recursive: true })

function download(url, dest, executable, hops = 0) {
  if (hops > 5) { console.error('Too many redirects'); process.exit(1) }
  https.get(url, res => {
    if (res.statusCode === 301 || res.statusCode === 302) {
      return download(res.headers.location, dest, executable, hops + 1)
    }
    if (res.statusCode < 200 || res.statusCode >= 300) {
      res.resume()
      console.error('Unexpected HTTP status:', res.statusCode)
      process.exit(1)
    }
    const file = fs.createWriteStream(dest)
    res.pipe(file)
    file.on('finish', () => {
      file.close()
      if (executable) fs.chmodSync(dest, 0o755)
      console.log('yt-dlp downloaded to', dest)
    })
  }).on('error', err => {
    fs.unlink(dest, () => {})
    console.error('Download failed:', err.message)
    process.exit(1)
  })
}

download(info.url, info.dest, info.executable)
```

- [ ] **Step 2: Commit**

```bash
git add scripts/download-ytdlp.js
git commit -m "feat: cross-platform yt-dlp binary download (Windows + Linux)"
```

---

### Task 2: Fix ytdlp-runner.js for Windows binary name and chmod

**Files:**
- Modify: `src/main/ytdlp-runner.js`
- Modify: `tests/main/ytdlp-runner.test.js`

- [ ] **Step 1: Add failing tests for getDefaultBinaryPath**

In `tests/main/ytdlp-runner.test.js`, add `getDefaultBinaryPath` to the existing import line:

```javascript
import { extractInfo, startDownload, getDefaultBinaryPath } from '../../src/main/ytdlp-runner.js'
```

Then add this `describe` block after the `beforeEach` line and before `describe('extractInfo', ...)`:

```javascript
describe('getDefaultBinaryPath', () => {
  it('returns yt-dlp.exe on win32', () => {
    const orig = Object.getOwnPropertyDescriptor(process, 'platform')
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
    expect(getDefaultBinaryPath()).toMatch(/yt-dlp\.exe$/)
    Object.defineProperty(process, 'platform', orig)
  })

  it('returns yt-dlp (no .exe) on darwin', () => {
    const orig = Object.getOwnPropertyDescriptor(process, 'platform')
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
    const p = getDefaultBinaryPath()
    expect(p).toMatch(/yt-dlp$/)
    expect(p).not.toMatch(/\.exe$/)
    Object.defineProperty(process, 'platform', orig)
  })

  it('returns yt-dlp (no .exe) on linux', () => {
    const orig = Object.getOwnPropertyDescriptor(process, 'platform')
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true })
    const p = getDefaultBinaryPath()
    expect(p).toMatch(/yt-dlp$/)
    expect(p).not.toMatch(/\.exe$/)
    Object.defineProperty(process, 'platform', orig)
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx vitest run tests/main/ytdlp-runner.test.js
```

Expected: FAIL — `getDefaultBinaryPath` always returns `yt-dlp` (no `.exe`)

- [ ] **Step 3: Update getDefaultBinaryPath and ensureBinary in ytdlp-runner.js**

Replace:

```javascript
export function getDefaultBinaryPath() {
  const base = process.resourcesPath || path.join(process.cwd(), 'resources')
  return path.join(base, 'yt-dlp')
}

export function ensureBinary(src, dest) {
  if (fs.existsSync(dest)) return
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.copyFileSync(src, dest)
  fs.chmodSync(dest, 0o755)
}
```

With:

```javascript
export function getDefaultBinaryPath() {
  const base = process.resourcesPath || path.join(process.cwd(), 'resources')
  const name = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'
  return path.join(base, name)
}

export function ensureBinary(src, dest) {
  if (fs.existsSync(dest)) return
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.copyFileSync(src, dest)
  if (process.platform !== 'win32') fs.chmodSync(dest, 0o755)
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run tests/main/ytdlp-runner.test.js
```

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/ytdlp-runner.js tests/main/ytdlp-runner.test.js
git commit -m "fix: platform-aware binary path and skip chmod on Windows"
```

---

### Task 3: Fix binary copy destination path in index.js

**Files:**
- Modify: `src/main/index.js`

- [ ] **Step 1: Update binary dest to use .exe on Windows**

In `src/main/index.js`, inside `createWindow()`, replace:

```javascript
    const src = getDefaultBinaryPath()
    const dest = path.join(app.getPath('userData'), 'yt-dlp')
    ensureBinary(src, dest)
```

With:

```javascript
    const src = getDefaultBinaryPath()
    const binaryName = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'
    const dest = path.join(app.getPath('userData'), binaryName)
    ensureBinary(src, dest)
```

- [ ] **Step 2: Commit**

```bash
git add src/main/index.js
git commit -m "fix: use correct binary filename when copying to userData on Windows"
```

---

### Task 4: Update electron-builder.yml for all platforms

**Files:**
- Modify: `electron-builder.yml`

- [ ] **Step 1: Replace electron-builder.yml**

Write the following as the complete file:

```yaml
appId: com.pully.app
productName: Pully
directories:
  output: dist
files:
  - "!**/.vscode"
  - "!src/**"
  - "!tests/**"
  - "!docs/**"
  - "!scripts/**"
afterSign: scripts/notarize.js
mac:
  target:
    - target: dmg
      arch:
        - universal
  category: public.app-category.utilities
  extraResources:
    - from: resources/yt-dlp
      to: yt-dlp
  artifactName: "${productName}-${version}-mac-${arch}.${ext}"
dmg:
  title: Pully
win:
  target:
    - target: nsis
      arch:
        - x64
  extraResources:
    - from: resources/yt-dlp.exe
      to: yt-dlp.exe
  artifactName: "${productName}-${version}-win-${arch}-setup.${ext}"
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
linux:
  target:
    - target: AppImage
      arch:
        - x64
  category: Network
  extraResources:
    - from: resources/yt-dlp
      to: yt-dlp
  artifactName: "${productName}-${version}-linux-${arch}.${ext}"
```

- [ ] **Step 2: Commit**

```bash
git add electron-builder.yml
git commit -m "feat: add Windows NSIS and Linux AppImage targets to electron-builder"
```

---

### Task 5: Add notarize script and @electron/notarize

**Files:**
- Create: `scripts/notarize.js`
- Modify: `package.json` (via npm install)

- [ ] **Step 1: Install @electron/notarize as devDependency**

```bash
npm install --save-dev @electron/notarize
```

Expected: package.json and package-lock.json updated with `@electron/notarize`.

- [ ] **Step 2: Create scripts/notarize.js**

```javascript
// Called by electron-builder as afterSign hook.
// Notarizes the macOS app when APPLE_ID env var is set.
// Silently skips on other platforms or when secrets are absent.
const path = require('path')

exports.default = async function notarizing(context) {
  if (context.electronPlatformName !== 'darwin') return
  if (!process.env.APPLE_ID) {
    console.log('Notarization skipped: APPLE_ID not set')
    return
  }

  const { notarize } = require('@electron/notarize')
  const appName = context.packager.appInfo.productFilename
  const appPath = path.join(context.appOutDir, `${appName}.app`)

  console.log(`Notarizing ${appPath}...`)
  return notarize({
    appBundleId: 'com.pully.app',
    appPath,
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_ID_PASSWORD,
    teamId: process.env.APPLE_TEAM_ID,
  })
}
```

- [ ] **Step 3: Commit**

```bash
git add scripts/notarize.js package.json package-lock.json
git commit -m "feat: add macOS notarization afterSign script"
```

---

### Task 6: Create GitHub Actions release workflow

**Files:**
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Create .github/workflows/release.yml**

Write the following as the complete file:

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

permissions:
  contents: write

jobs:
  build-mac:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Import signing certificate
        env:
          MACOS_CERTIFICATE: ${{ secrets.MACOS_CERTIFICATE }}
          MACOS_CERTIFICATE_PASSWORD: ${{ secrets.MACOS_CERTIFICATE_PASSWORD }}
          KEYCHAIN_PASSWORD: ${{ secrets.KEYCHAIN_PASSWORD }}
        run: |
          if [ -z "$MACOS_CERTIFICATE" ]; then
            echo "No certificate configured, skipping signing setup"
            exit 0
          fi
          echo "$MACOS_CERTIFICATE" | base64 --decode > certificate.p12
          security create-keychain -p "$KEYCHAIN_PASSWORD" build.keychain
          security default-keychain -s build.keychain
          security unlock-keychain -p "$KEYCHAIN_PASSWORD" build.keychain
          security import certificate.p12 -k build.keychain -P "$MACOS_CERTIFICATE_PASSWORD" -T /usr/bin/codesign
          security set-key-partition-list -S apple-tool:,apple: -s -k "$KEYCHAIN_PASSWORD" build.keychain
          rm -f certificate.p12

      - name: Build macOS
        env:
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_ID_PASSWORD: ${{ secrets.APPLE_ID_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
        run: npm run build:mac

      - uses: actions/upload-artifact@v4
        with:
          name: mac-build
          path: dist/*.dmg
          if-no-files-found: error

  build-win:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Build Windows
        run: npm run build:win

      - uses: actions/upload-artifact@v4
        with:
          name: win-build
          path: dist/*.exe
          if-no-files-found: error

  build-linux:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Build Linux
        run: npm run build:linux

      - uses: actions/upload-artifact@v4
        with:
          name: linux-build
          path: dist/*.AppImage
          if-no-files-found: error

  release:
    needs: [build-mac, build-win, build-linux]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v4
        with:
          path: artifacts
          merge-multiple: true

      - name: Generate SHA256SUMS.txt
        run: |
          cd artifacts
          sha256sum * | tee SHA256SUMS.txt

      - name: Publish GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          generate_release_notes: true
          files: artifacts/*
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "feat: GitHub Actions release workflow for macOS, Windows, and Linux"
```

---

### Task 7: Update README.md

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace README.md**

Write the following as the complete file:

```markdown
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
- **Automatic video detection** — scans each page for downloadable media as it loads
- **Format selection** — choose resolution and format (MP4, WebM, audio-only, etc.) per video
- **Download queue** — concurrent downloads with live progress shown inline
- **Library** — browse downloaded files and reveal them in Finder / Explorer / file manager

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
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add prominent download section and update platform support"
```

---

## Post-implementation: GitHub Secrets

Configure these in **Settings → Secrets and variables → Actions**:

| Secret | How to get it |
|--------|---------------|
| `MACOS_CERTIFICATE` | `base64 -i YourCert.p12` — export .p12 from Keychain Access |
| `MACOS_CERTIFICATE_PASSWORD` | Password used when exporting the .p12 |
| `KEYCHAIN_PASSWORD` | Any random string (e.g. `openssl rand -hex 16`) |
| `APPLE_ID` | Your Apple ID email |
| `APPLE_ID_PASSWORD` | App-specific password from appleid.apple.com |
| `APPLE_TEAM_ID` | 10-character Team ID from developer.apple.com |

## Triggering a Release

```bash
git tag v1.0.1
git push origin v1.0.1
```

The workflow builds all three platforms in parallel, then publishes a GitHub Release with all artifacts and `SHA256SUMS.txt`.
