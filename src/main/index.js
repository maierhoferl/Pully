import { app, BrowserWindow, session, protocol, net } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { DownloadManager } from './download-manager.js'
import { registerIpcHandlers } from './ipc-handlers.js'
import { ensureBinary, getDefaultBinaryPath, getDefaultFfmpegPath } from './ytdlp-runner.js'
import { readConfig } from './config-store.js'
import { initAdblock, enableAdblock, startBackgroundUpdates } from './adblock-manager.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Register pully:// scheme so the renderer can load local thumbnail files
// regardless of whether the page is served from file:// or http://localhost.
// Must be called before app.ready.
protocol.registerSchemesAsPrivileged([
  { scheme: 'pully', privileges: { standard: true, secure: true, corsEnabled: true, bypassCSP: true } }
])

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true,
    }
  })

  // Copy bundled binaries to writable userData location
  try {
    const binaryName = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'
    ensureBinary(getDefaultBinaryPath(), path.join(app.getPath('userData'), binaryName))
    const ffmpegName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
    ensureBinary(getDefaultFfmpegPath(), path.join(app.getPath('userData'), ffmpegName))
  } catch (err) {
    console.error('Failed to initialize binaries:', err)
  }

  const downloadManager = new DownloadManager()
  registerIpcHandlers(downloadManager, win)

  if (process.env.NODE_ENV === 'development') {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  return win
}

app.whenReady().then(() => {
  // Serve local thumbnail files via pully:// — replaces file:// which is blocked
  // from http://localhost origins in dev mode.
  protocol.handle('pully', req => net.fetch(req.url.replace('pully:', 'file:')))

  // Relax CSP so webview can load external sites
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': ["default-src * blob: data: 'unsafe-inline' 'unsafe-eval'"]
      }
    })
  })

  const config = readConfig()
  createWindow()

  // Init adblock after window is created; enables once filter lists are ready
  initAdblock()
    .then(() => {
      if (config.adblockEnabled !== false) {
        enableAdblock(session.defaultSession)
      }
      startBackgroundUpdates(session.defaultSession)
    })
    .catch(err => console.error('Adblock init failed:', err))

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
