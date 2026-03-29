import { ipcMain, dialog, shell, session, BrowserWindow } from 'electron'
import { EventEmitter } from 'events'
import { readConfig, writeConfig } from './config-store.js'
import { enableAdblock, disableAdblock } from './adblock-manager.js'
import { extractInfo, getDefaultBinaryPath } from './ytdlp-runner.js'
import { readMetadataIndex, deleteMetadataEntry, moveMetadataEntry, moveThumbnailSidecar, toPullyUrl, downloadAndStoreThumbnail, renameFolderInIndex, deleteFolderFromIndex, createReferenceFile } from './metadata-store.js'
import { classifyVideo } from './auto-classifier.js'
import { initChapter, moveChapter, readFolderNotes, writeBulletsSection, setNotesEventEmitter } from './notes-store.js'
import { generateSummary } from './ai-summarizer.js'
import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'

// Helper files to exclude from library and classification logic
function isHelperFile(fileName) {
  // Exclude markdown notes, text metadata files, and thumbnail sidecars
  return /\.(md|txt|nfo)$/i.test(fileName) || /\.thumb(\.[a-z]+)?$/i.test(fileName)
}

export function registerIpcHandlers(downloadManager, mainWindow, logger) {
  // Create event emitter for notes events
  const notesEmitter = new EventEmitter()
  setNotesEventEmitter(notesEmitter)

  // Forward notes events to renderer
  notesEmitter.on('notes:chapter-updated', (data) => {
    mainWindow.webContents.send('notes:chapter-updated', data)
  })

  ipcMain.handle('log:renderer', (_, { level, category, message, meta }) => {
    const fn = logger[level] ?? logger.info
    fn.call(logger, category, message, meta)
  })

  ipcMain.handle('config:read', () => readConfig())
  ipcMain.handle('config:write', (_, data) => {
    writeConfig(data)
    const updated = readConfig()
    logger.setDebugMode(updated.debugMode)
    return updated
  })

  ipcMain.handle('dialog:openFolder', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] })
    return canceled ? null : filePaths[0]
  })

  ipcMain.handle('ytdlp:extractInfo', (_, url) => extractInfo(url))

  ipcMain.handle('download:add', (_, { url, formatId, title, metadata }) => downloadManager.add(url, formatId, title, metadata))
  ipcMain.handle('download:retry', (_, id) => downloadManager.retry(id))
  ipcMain.handle('download:cancel', (_, id) => downloadManager.cancel(id))
  ipcMain.handle('download:getAll', () => downloadManager.getAll())

  ipcMain.handle('library:remember', async (_, { title, uploader, description, thumbnailUrl, url }) => {
    const cfg = readConfig()
    const { outputFolder } = cfg
    if (!outputFolder || !fs.existsSync(outputFolder)) throw new Error('No output folder configured')
    const index = readMetadataIndex()
    const existing = Object.entries(index).find(([, m]) => m.isReference && m.url === url)
    if (existing) return { refPath: existing[0], alreadyExists: true }
    const metadata = { title, uploader, description, thumbnailUrl, url, downloadedAt: new Date().toISOString() }
    const refPath = await createReferenceFile(outputFolder, { title, uploader, description, thumbnailUrl, url })

    // Notes: init chapter stub
    try {
      initChapter(refPath, metadata, outputFolder)
    } catch { /* don't block on notes errors */ }

    // Classify + summarize pipeline (mirrors download completion)
    if (cfg.autoClassifyEnabled) {
      try {
        const folderNames = fs.readdirSync(outputFolder)
          .filter(f => !f.startsWith('.') && fs.statSync(path.join(outputFolder, f)).isDirectory())
        if (folderNames.length > 0) {
          classifyVideo({ title, uploader, description, url }, folderNames, cfg).then(({ folder }) => {
            let finalPath = refPath
            if (folder) {
              const base = path.basename(refPath)
              const ext = path.extname(base)
              const stem = path.basename(base, ext)
              let newPath = path.join(outputFolder, folder, base)
              let counter = 1
              while (fs.existsSync(newPath)) {
                newPath = path.join(outputFolder, folder, `${stem} (${counter})${ext}`)
                counter++
              }
              try {
                fs.renameSync(refPath, newPath)
                moveMetadataEntry(refPath, newPath)
                moveThumbnailSidecar(refPath, newPath)
                moveChapter(refPath, newPath, outputFolder)
                finalPath = newPath
              } catch { /* skip if move fails */ }
            }
            if (cfg.autoSummarizeEnabled && cfg.aiApiKey) {
              generateSummary(finalPath, { ...metadata, url }, cfg)
                .catch(() => {})
            }
          }).catch(() => {})
        }
      } catch { /* don't block on classify errors */ }
    } else if (cfg.autoSummarizeEnabled && cfg.aiApiKey) {
      generateSummary(refPath, { ...metadata, url }, cfg)
        .catch(() => {})
    }

    return { refPath, alreadyExists: false }
  })

  ipcMain.handle('library:list', () => {
    const { outputFolder } = readConfig()
    if (!outputFolder || !fs.existsSync(outputFolder)) return []
    const index = readMetadataIndex()

    function thumbnailSrc(videoPath) {
      const thumbPath = videoPath.replace(/\.[^.]+$/, '.thumb.jpg')
      return fs.existsSync(thumbPath) ? toPullyUrl(thumbPath) : null
    }

    function makeEntry(fileName, fullPath, stat, meta, folder) {
      return {
        name: fileName, path: fullPath, folder,
        size: stat.size, mtime: stat.mtime.toISOString(),
        title: meta.title || null,
        uploader: meta.uploader || null,
        description: meta.description || null,
        thumbnailUrl: thumbnailSrc(fullPath) || meta.thumbnailUrl || null,
        videoUrl: toPullyUrl(fullPath),
        url: meta.url || null,
        downloadedAt: meta.downloadedAt || null,
      }
    }

    const entries = []
    try {
      const rootItems = fs.readdirSync(outputFolder)
      for (const f of rootItems) {
        if (f.startsWith('.') || isHelperFile(f)) continue
        const full = path.join(outputFolder, f)
        try {
          const stat = fs.statSync(full)
          if (stat.isDirectory()) continue
          entries.push(makeEntry(f, full, stat, index[full] || {}, null))
        } catch {
          // Skip files we can't stat
        }
      }
      for (const dir of rootItems) {
        if (dir.startsWith('.')) continue
        const dirPath = path.join(outputFolder, dir)
        try {
          if (!fs.statSync(dirPath).isDirectory()) continue
          for (const f of fs.readdirSync(dirPath)) {
            if (f.startsWith('.') || isHelperFile(f)) continue
            const full = path.join(dirPath, f)
            try {
              const stat = fs.statSync(full)
              if (stat.isDirectory()) continue
              entries.push(makeEntry(f, full, stat, index[full] || {}, dir))
            } catch {
              // Skip files we can't stat
            }
          }
        } catch {
          // Skip directories we can't read
        }
      }
    } catch {
      // Return empty if we can't read the root folder
      return []
    }

    // Backfill: download .thumb.jpg if missing and we have a remote URL.
    for (const [videoPath, meta] of Object.entries(index)) {
      if (!meta.thumbnailUrl) continue
      const thumbPath = videoPath.replace(/\.[^.]+$/, '.thumb.jpg')
      if (!fs.existsSync(thumbPath)) {
        downloadAndStoreThumbnail(meta.thumbnailUrl, videoPath).catch(() => {})
      }
    }

    return entries.sort((a, b) => new Date(b.mtime) - new Date(a.mtime))
  })

  ipcMain.handle('library:listFolders', () => {
    const { outputFolder } = readConfig()
    if (!outputFolder || !fs.existsSync(outputFolder)) return []
    try {
      return fs.readdirSync(outputFolder)
        .filter(f => {
          if (f.startsWith('.')) return false
          try {
            return fs.statSync(path.join(outputFolder, f)).isDirectory()
          } catch {
            return false
          }
        })
        .sort()
    } catch {
      return []
    }
  })

  ipcMain.handle('library:createFolder', (_, name) => {
    const { outputFolder } = readConfig()
    const folderPath = path.join(outputFolder, name)
    if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath)
    return name
  })

  ipcMain.handle('library:renameFolder', (_, { from, to }) => {
    const { outputFolder } = readConfig()
    const oldDir = path.join(outputFolder, from)
    const newDir = path.join(outputFolder, to)
    if (!fs.existsSync(oldDir)) return null
    if (fs.existsSync(newDir)) return null
    fs.renameSync(oldDir, newDir)
    renameFolderInIndex(oldDir, newDir)
    return to
  })

  ipcMain.handle('library:deleteFolder', async (_, { folder, strategy }) => {
    const { outputFolder } = readConfig()
    const dirPath = path.join(outputFolder, folder)
    if (!fs.existsSync(dirPath)) return null
    const fileNames = fs.readdirSync(dirPath).filter(f => !f.startsWith('.'))
    const filePaths = fileNames.map(f => path.join(dirPath, f))
    if (strategy === 'unassign') {
      for (const fp of filePaths) {
        // Skip sidecar files — moveThumbnailSidecar will relocate them alongside the video
        if (/\.thumb(\.[a-z]+)?$/i.test(path.basename(fp))) continue
        const base = path.basename(fp)
        const ext = path.extname(base)
        const stem = path.basename(base, ext)
        let dest = path.join(outputFolder, base)
        let counter = 1
        while (fs.existsSync(dest)) {
          dest = path.join(outputFolder, `${stem} (${counter})${ext}`)
          counter++
        }
        fs.renameSync(fp, dest)
        moveMetadataEntry(fp, dest)
        moveThumbnailSidecar(fp, dest)
        try {
          moveChapter(fp, dest, outputFolder)
        } catch {}
      }
      fs.rmSync(dirPath, { recursive: true })
    } else {
      for (const fp of filePaths) {
        const thumbPath = fp.replace(/\.[^.]+$/, '.thumb.jpg')
        await shell.trashItem(fp)
        if (fs.existsSync(thumbPath)) await shell.trashItem(thumbPath)
        deleteMetadataEntry(fp)
      }
      deleteFolderFromIndex(dirPath)
      if (fs.existsSync(dirPath)) fs.rmSync(dirPath, { recursive: true })
    }
    return null
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
      moveThumbnailSidecar(filePath, newPath)
      try {
        moveChapter(filePath, newPath, outputFolder)
      } catch {}
    }
    return newPath
  })

  ipcMain.handle('library:autoClassify', async () => {
    const config = readConfig()
    const { outputFolder } = config
    if (!outputFolder || !fs.existsSync(outputFolder)) return { moved: [], skipped: 0 }

    const folderNames = fs.readdirSync(outputFolder)
      .filter(f => !f.startsWith('.') && fs.statSync(path.join(outputFolder, f)).isDirectory())
    if (folderNames.length === 0) return { moved: [], skipped: 0 }

    const index = readMetadataIndex()
    const rootFiles = fs.readdirSync(outputFolder)
      .filter(f => !f.startsWith('.') && !fs.statSync(path.join(outputFolder, f)).isDirectory())

    const moved = []
    let skipped = 0
    for (const file of rootFiles) {
      if (isHelperFile(file)) continue
      const filePath = path.join(outputFolder, file)
      const meta = index[filePath] || {}
      const { folder } = await classifyVideo(
        { title: meta.title, uploader: meta.uploader, description: meta.description, url: meta.url },
        folderNames,
        config
      )
      if (folder) {
        const ext = path.extname(file)
        const stem = path.basename(file, ext)
        let newPath = path.join(outputFolder, folder, file)
        let counter = 1
        while (fs.existsSync(newPath)) {
          newPath = path.join(outputFolder, folder, `${stem} (${counter})${ext}`)
          counter++
        }
        fs.renameSync(filePath, newPath)
        moveMetadataEntry(filePath, newPath)
        moveThumbnailSidecar(filePath, newPath)
        try {
          moveChapter(filePath, newPath, outputFolder)
        } catch {}
        moved.push({ file, toFolder: folder })
      } else {
        skipped++
      }
    }
    return { moved, skipped }
  })

  ipcMain.handle('classify:fetchModels', async (_e, provider, apiKey) => {
    const { fetchProviderModels } = await import('./ai-client.js')
    return fetchProviderModels(provider, apiKey)
  })

  // Notes handlers
  ipcMain.handle('notes:read', (_e, folderName) => {
    const cfg = readConfig()
    return readFolderNotes(folderName, cfg.outputFolder)
  })

  ipcMain.handle('notes:init-chapter', (_e, filePath) => {
    const cfg = readConfig()
    const index = readMetadataIndex()
    const metadata = index[filePath] || {}
    initChapter(filePath, metadata, cfg.outputFolder)
  })

  ipcMain.handle('notes:update-bullets', (_e, filePath, bullets) => {
    const cfg = readConfig()
    writeBulletsSection(filePath, bullets, cfg.outputFolder)
  })

  ipcMain.handle('notes:generate-summary', async (_e, filePath) => {
    const cfg = readConfig()
    if (!cfg.aiApiKey) throw new Error('No AI API key configured. Please add one in Settings.')
    const index = readMetadataIndex()
    const metadata = index[filePath] || {}
    const summary = await generateSummary(filePath, metadata, cfg)
    return { summary }
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

  ipcMain.handle('media:resolveStream', (_, url) => {
    return new Promise((resolve, reject) => {
      const proc = spawn(getDefaultBinaryPath(), ['--get-url', '--no-warnings', url])
      let out = ''
      proc.stdout.on('data', d => { out += d.toString() })
      proc.on('close', code => {
        if (code === 0) resolve(out.trim().split('\n')[0])
        else reject(new Error(`yt-dlp exited with code ${code}`))
      })
    })
  })
  ipcMain.handle('shell:openUrl', (_, url) => shell.openExternal(url))

  ipcMain.handle('library:delete', async (_, filePath) => {
    const thumbPath = filePath.replace(/\.[^.]+$/, '.thumb.jpg')
    await shell.trashItem(filePath)
    if (fs.existsSync(thumbPath)) await shell.trashItem(thumbPath)
    deleteMetadataEntry(filePath)
  })

  // Forward download manager events to renderer
  downloadManager.on('queue-updated', q => mainWindow.webContents.send('download:queue-updated', q))
  downloadManager.on('progress', d => mainWindow.webContents.send('download:progress', d))
  downloadManager.on('completed', d => mainWindow.webContents.send('download:completed', d))
  downloadManager.on('failed', d => mainWindow.webContents.send('download:failed', d))

  // Log entries are pushed to renderer via mainWindow.webContents.send('log:entry', entry)
  // No handler needed — logger.js handles sending when debugMode is enabled
}
