import { ipcMain, dialog, shell } from 'electron'
import { readConfig, writeConfig } from './config-store.js'
import { extractInfo } from './ytdlp-runner.js'
import fs from 'fs'
import path from 'path'

export function registerIpcHandlers(downloadManager, mainWindow) {
  ipcMain.handle('config:read', () => readConfig())
  ipcMain.handle('config:write', (_, data) => { writeConfig(data); return readConfig() })

  ipcMain.handle('dialog:openFolder', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] })
    return canceled ? null : filePaths[0]
  })

  ipcMain.handle('ytdlp:extractInfo', (_, url) => extractInfo(url))

  ipcMain.handle('download:add', (_, { url, formatId, title }) => downloadManager.add(url, formatId, title))
  ipcMain.handle('download:retry', (_, id) => downloadManager.retry(id))
  ipcMain.handle('download:getAll', () => downloadManager.getAll())

  ipcMain.handle('library:list', () => {
    const { outputFolder } = readConfig()
    if (!outputFolder || !fs.existsSync(outputFolder)) return []
    return fs.readdirSync(outputFolder)
      .filter(f => !f.startsWith('.'))
      .map(f => {
        const full = path.join(outputFolder, f)
        const stat = fs.statSync(full)
        return { name: f, path: full, size: stat.size, mtime: stat.mtime.toISOString() }
      })
      .sort((a, b) => new Date(b.mtime) - new Date(a.mtime))
  })

  ipcMain.handle('library:reveal', (_, filePath) => shell.showItemInFolder(filePath))

  // Forward download manager events to renderer
  downloadManager.on('queue-updated', q => mainWindow.webContents.send('download:queue-updated', q))
  downloadManager.on('progress', d => mainWindow.webContents.send('download:progress', d))
  downloadManager.on('completed', d => mainWindow.webContents.send('download:completed', d))
  downloadManager.on('failed', d => mainWindow.webContents.send('download:failed', d))
}
