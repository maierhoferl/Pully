import { app, BrowserWindow, session, protocol } from 'electron'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { DownloadManager } from './download-manager.js'
import { registerIpcHandlers } from './ipc-handlers.js'
import { ensureBinary, getDefaultBinaryPath, getDefaultFfmpegPath } from './ytdlp-runner.js'
import { readConfig } from './config-store.js'
import { initAdblock, enableAdblock, startBackgroundUpdates } from './adblock-manager.js'
import { createLogger } from './logger.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isDev = process.env.NODE_ENV === 'development'

// Create logger instance (in userData/.log/)
const logDir = path.join(app.getPath('userData'), '.log')
const logger = createLogger(logDir)

// Set initial debug mode from config
const config = readConfig()
logger.setDebugMode(config.debugMode)

// Suppress MaxListenersExceededWarning from Electron's internal webContents listeners
// (e.g., when navigating pages, webContents may add multiple 'did-stop-loading' listeners)
if (process.defaultMaxListeners < 20) {
  process.setMaxListeners(20)
}

// Register pully:// scheme so the renderer can load local thumbnail files
// regardless of whether the page is served from file:// or http://localhost.
// Must be called before app.ready.
protocol.registerSchemesAsPrivileged([
  { scheme: 'pully', privileges: { standard: true, secure: true, corsEnabled: true, bypassCSP: true } }
])

app.setName('Pully')

let mainWindow = null
let downloadManager = null

// Increase max listeners for webContents to prevent warning spam during navigation
app.on('web-contents-created', (_, webContents) => {
  webContents.setMaxListeners(30)
})

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
    logger.error('app', 'Failed to initialize binaries', { error: err.message })
  }

  downloadManager = new DownloadManager()
  registerIpcHandlers(downloadManager, win)

  if (process.env.NODE_ENV === 'development') {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow = win
  logger.setWindow(mainWindow)
  logger.info('app', 'Application started', { isDev })
  return win
}

app.whenReady().then(() => {
  // Serve local thumbnail files via pully:// — replaces file:// which is blocked
  // from http://localhost origins in dev mode.
  protocol.handle('pully', req => {
    const filePath = fileURLToPath(req.url.replace(/^pully:/, 'file:'))
    try {
      const data = fs.readFileSync(filePath)
      const ext = path.extname(filePath).toLowerCase().slice(1)
      const mime = { jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', png: 'image/png' }
      return new Response(data, { headers: { 'Content-Type': mime[ext] || 'application/octet-stream' } })
    } catch {
      return new Response(null, { status: 404 })
    }
  })

  // Relax CSP so webview can load external sites
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': ["default-src * blob: data: 'unsafe-inline' 'unsafe-eval'"]
      }
    })
  })

  createWindow()

  // Init adblock after window is created; enables once filter lists are ready
  initAdblock()
    .then(() => {
      if (config.adblockEnabled !== false) {
        enableAdblock(session.defaultSession)
      }
      startBackgroundUpdates(session.defaultSession)
    })
    .catch(err => logger.error('app', 'Adblock init failed', { error: err.message }))

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Graceful shutdown: clean up resources before quitting
app.on('before-quit', () => {
  // Clear all IPC listeners and stop accepting IPC requests
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.removeAllListeners()
  }
  // Stop the download manager from processing new downloads
  if (downloadManager) {
    downloadManager.removeAllListeners()
  }
})
