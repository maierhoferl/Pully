import { app, BrowserWindow, session, protocol } from 'electron'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { DownloadManager } from './download-manager.js'
import { registerIpcHandlers } from './ipc-handlers.js'
import { ensureBinary, getDefaultBinaryPath, getDefaultFfmpegPath } from './ytdlp-runner.js'
import { readConfig } from './config-store.js'
import { initAdblock, enableAdblock, startBackgroundUpdates } from './adblock-manager.js'
import { initializeLogger } from './logger.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isDev = process.env.NODE_ENV === 'development'

// Create logger instance (in userData/.log/)
const logDir = path.join(app.getPath('userData'), '.log')
const logger = initializeLogger(logDir)

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
  {
    scheme: 'pully',
    privileges: { standard: true, secure: true, corsEnabled: true, bypassCSP: true }
  }
])

app.setName('Pully')

let mainWindow = null
let downloadManager = null
let ipcHandlersRegistered = false

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
      webviewTag: true
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

  mainWindow = win
  logger.setWindow(mainWindow)

  if (process.env.NODE_ENV === 'development') {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  logger.info('app', 'Application started', { isDev })
  return win
}

app.whenReady().then(() => {
  // Serve local files via pully:// — replaces file:// which is blocked
  // from http://localhost origins in dev mode.
  // Supports range requests so HTML5 <video> can seek/stream video files.
  protocol.handle('pully', (req) => {
    const filePath = fileURLToPath(req.url.replace(/^pully:/, 'file:'))
    try {
      const stat = fs.statSync(filePath)
      const ext = path.extname(filePath).toLowerCase().slice(1)
      const mimeTypes = {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        webp: 'image/webp',
        png: 'image/png',
        mp4: 'video/mp4',
        webm: 'video/webm',
        mov: 'video/quicktime',
        mkv: 'video/x-matroska',
        m4v: 'video/mp4',
        avi: 'video/x-msvideo'
      }
      const contentType = mimeTypes[ext] || 'application/octet-stream'

      const rangeHeader = req.headers.get('range')
      if (rangeHeader) {
        const [rawStart, rawEnd] = rangeHeader.replace('bytes=', '').split('-')
        const chunkStart = rawStart ? parseInt(rawStart, 10) : 0
        const chunkEnd = rawEnd ? Math.min(parseInt(rawEnd, 10), stat.size - 1) : stat.size - 1
        const chunkLength = chunkEnd - chunkStart + 1
        const buffer = Buffer.alloc(chunkLength)
        const fd = fs.openSync(filePath, 'r')
        fs.readSync(fd, buffer, 0, chunkLength, chunkStart)
        fs.closeSync(fd)
        return new Response(buffer, {
          status: 206,
          headers: {
            'Content-Type': contentType,
            'Content-Range': `bytes ${chunkStart}-${chunkEnd}/${stat.size}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': String(chunkLength)
          }
        })
      }

      const data = fs.readFileSync(filePath)
      return new Response(data, {
        headers: {
          'Content-Type': contentType,
          'Accept-Ranges': 'bytes',
          'Content-Length': String(stat.size)
        }
      })
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

  // Initialize download manager and register IPC handlers BEFORE creating the window
  // (the renderer immediately calls window.api methods on mount)
  if (!ipcHandlersRegistered) {
    downloadManager = new DownloadManager()
    // Pass a getter function so handlers can access mainWindow when it's ready
    registerIpcHandlers(downloadManager, logger, () => mainWindow)
    ipcHandlersRegistered = true
  }

  createWindow()

  // Init adblock after window is created; enables once filter lists are ready
  initAdblock()
    .then(() => {
      if (config.adblockEnabled !== false) {
        enableAdblock(session.defaultSession)
      }
      startBackgroundUpdates(session.defaultSession)
    })
    .catch((err) => logger.error('app', 'Adblock init failed', { error: err.message }))

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
