import { app, BrowserWindow, session } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { DownloadManager } from './download-manager.js'
import { registerIpcHandlers } from './ipc-handlers.js'
import { ensureBinary, getDefaultBinaryPath } from './ytdlp-runner.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

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

  // Copy bundled yt-dlp binary to writable userData location
  try {
    const src = getDefaultBinaryPath()
    const dest = path.join(app.getPath('userData'), 'yt-dlp')
    ensureBinary(src, dest)
  } catch (err) {
    console.error('Failed to initialize yt-dlp binary:', err)
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
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
