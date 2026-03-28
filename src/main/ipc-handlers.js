import { ipcMain, dialog, shell, session } from 'electron'
import { readConfig, writeConfig } from './config-store.js'
import { enableAdblock, disableAdblock } from './adblock-manager.js'
import { extractInfo } from './ytdlp-runner.js'
import { readMetadataIndex, deleteMetadataEntry, moveMetadataEntry } from './metadata-store.js'
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

  ipcMain.handle('download:add', (_, { url, formatId, title, metadata }) => downloadManager.add(url, formatId, title, metadata))
  ipcMain.handle('download:retry', (_, id) => downloadManager.retry(id))
  ipcMain.handle('download:getAll', () => downloadManager.getAll())

  ipcMain.handle('library:list', () => {
    const { outputFolder } = readConfig()
    if (!outputFolder || !fs.existsSync(outputFolder)) return []
    const index = readMetadataIndex()

    function makeEntry(fileName, fullPath, stat, meta, folder) {
      return {
        name: fileName, path: fullPath, folder,
        size: stat.size, mtime: stat.mtime.toISOString(),
        title: meta.title || null,
        uploader: meta.uploader || null,
        description: meta.description || null,
        thumbnailUrl: meta.thumbnailUrl || null,
        url: meta.url || null,
        downloadedAt: meta.downloadedAt || null,
      }
    }

    const entries = []
    const rootItems = fs.readdirSync(outputFolder)
    for (const f of rootItems) {
      if (f.startsWith('.')) continue
      const full = path.join(outputFolder, f)
      const stat = fs.statSync(full)
      if (stat.isDirectory()) continue
      entries.push(makeEntry(f, full, stat, index[full] || {}, null))
    }
    for (const dir of rootItems) {
      if (dir.startsWith('.')) continue
      const dirPath = path.join(outputFolder, dir)
      if (!fs.statSync(dirPath).isDirectory()) continue
      for (const f of fs.readdirSync(dirPath)) {
        if (f.startsWith('.')) continue
        const full = path.join(dirPath, f)
        const stat = fs.statSync(full)
        if (stat.isDirectory()) continue
        entries.push(makeEntry(f, full, stat, index[full] || {}, dir))
      }
    }
    return entries.sort((a, b) => new Date(b.mtime) - new Date(a.mtime))
  })

  ipcMain.handle('library:listFolders', () => {
    const { outputFolder } = readConfig()
    if (!outputFolder || !fs.existsSync(outputFolder)) return []
    return fs.readdirSync(outputFolder)
      .filter(f => !f.startsWith('.') && fs.statSync(path.join(outputFolder, f)).isDirectory())
      .sort()
  })

  ipcMain.handle('library:createFolder', (_, name) => {
    const { outputFolder } = readConfig()
    const folderPath = path.join(outputFolder, name)
    if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath)
    return name
  })

  ipcMain.handle('library:moveFile', (_, { filePath, targetFolder }) => {
    const { outputFolder } = readConfig()
    const fileName = path.basename(filePath)
    const newPath = targetFolder
      ? path.join(outputFolder, targetFolder, fileName)
      : path.join(outputFolder, fileName)
    if (filePath !== newPath) {
      fs.renameSync(filePath, newPath)
      moveMetadataEntry(filePath, newPath)
    }
    return newPath
  })

  ipcMain.handle('adblock:setEnabled', (_, isEnabled) => {
    if (isEnabled) {
      enableAdblock(session.defaultSession)
    } else {
      disableAdblock(session.defaultSession)
    }
    writeConfig({ adblockEnabled: isEnabled })
    return isEnabled
  })

  ipcMain.handle('library:reveal', (_, filePath) => shell.showItemInFolder(filePath))
  ipcMain.handle('library:play', (_, filePath) => shell.openPath(filePath))
  ipcMain.handle('shell:openUrl', (_, url) => shell.openExternal(url))

  ipcMain.handle('library:delete', async (_, filePath) => {
    await shell.trashItem(filePath)
    deleteMetadataEntry(filePath)
  })

  // Forward download manager events to renderer
  downloadManager.on('queue-updated', q => mainWindow.webContents.send('download:queue-updated', q))
  downloadManager.on('progress', d => mainWindow.webContents.send('download:progress', d))
  downloadManager.on('completed', d => mainWindow.webContents.send('download:completed', d))
  downloadManager.on('failed', d => mainWindow.webContents.send('download:failed', d))
}
