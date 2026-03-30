import { ipcMain, dialog, shell, session, BrowserWindow, app } from 'electron'
import { EventEmitter } from 'events'
import os from 'os'
import { readConfig, writeConfig } from './config-store.js'
import { listBookmarks, addBookmark, removeBookmark } from './bookmarks-store.js'
import { listHistory, upsertHistory } from './history-store.js'
import { runCuration } from './folder-curator.js'
import { enableAdblock, disableAdblock } from './adblock-manager.js'
import { extractInfo, getDefaultBinaryPath } from './ytdlp-runner.js'
import {
  readMetadataIndex,
  writeMetadataEntry,
  deleteMetadataEntry,
  moveMetadataEntry,
  moveThumbnailSidecar,
  toPullyUrl,
  downloadAndStoreThumbnail,
  renameFolderInIndex,
  deleteFolderFromIndex,
  createReferenceFile
} from './metadata-store.js'
import { classifyVideo } from './auto-classifier.js'
import {
  initChapter,
  moveChapter,
  readFolderNotes,
  writeBulletsSection,
  setNotesEventEmitter
} from './notes-store.js'
import { generateSummary } from './ai-summarizer.js'
import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'

// Helper files to exclude from library and classification logic
function isHelperFile(fileName) {
  // Exclude folder-level notes file, metadata, and sidecars
  if (fileName === 'notes.md') return true // Folder-level notes file
  if (fileName === '.pully.json') return true
  if (fileName === '.gitignore') return true
  if (/\.thumb(\.[a-z]+)?$/i.test(fileName)) return true // Thumbnails
  if (/\.nfo$/i.test(fileName)) return true // Info files
  return false
}

export function registerIpcHandlers(downloadManager, logger, getMainWindow) {
  // Helper to send IPC events to renderer (safe if mainWindow not ready)
  const sendToRenderer = (channel, ...args) => {
    const mainWindow = getMainWindow()
    if (mainWindow) {
      mainWindow.webContents.send(channel, ...args)
    }
  }

  // Create event emitter for notes events
  const notesEmitter = new EventEmitter()
  setNotesEventEmitter(notesEmitter)

  // Forward notes events to renderer
  notesEmitter.on('notes:chapter-updated', (data) => {
    sendToRenderer('notes:chapter-updated', data)
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
    const mainWindow = getMainWindow()
    if (!mainWindow) throw new Error('Main window not available')
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    })
    return canceled ? null : filePaths[0]
  })

  ipcMain.handle('ytdlp:extractInfo', (_, url) => extractInfo(url))

  ipcMain.handle('download:add', (_, { url, formatId, title, metadata }) =>
    downloadManager.add(url, formatId, title, metadata)
  )
  ipcMain.handle('download:retry', (_, id) => downloadManager.retry(id))
  ipcMain.handle('download:cancel', (_, id) => downloadManager.cancel(id))
  ipcMain.handle('download:getAll', () => downloadManager.getAll())

  ipcMain.handle(
    'library:remember',
    async (_, { title, uploader, description, thumbnailUrl, url, contentType = 'video', page }) => {
      const cfg = readConfig()
      const { outputFolder } = cfg
      if (!outputFolder || !fs.existsSync(outputFolder))
        throw new Error('No output folder configured')
      const index = readMetadataIndex()
      const existing = Object.entries(index).find(([, m]) => m.isReference && m.url === url)
      if (existing) return { refPath: existing[0], alreadyExists: true }
      const metadata = {
        title,
        uploader,
        description,
        thumbnailUrl,
        url,
        contentType,
        page,
        downloadedAt: new Date().toISOString()
      }
      const refPath = await createReferenceFile(outputFolder, {
        title,
        uploader,
        description,
        thumbnailUrl,
        url,
        contentType
      })

      // Notes: init chapter stub
      try {
        initChapter(refPath, metadata, outputFolder)
      } catch {
        /* don't block on notes errors */
      }

      // Classify + summarize pipeline (mirrors download completion)
      if (cfg.autoClassifyEnabled) {
        try {
          const folderNames = fs
            .readdirSync(outputFolder)
            .filter(
              (f) => !f.startsWith('.') && fs.statSync(path.join(outputFolder, f)).isDirectory()
            )
          if (folderNames.length > 0) {
            classifyVideo({ title, uploader, description, url }, folderNames, cfg)
              .then(({ folder }) => {
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
                  } catch {
                    /* skip if move fails */
                  }
                }
                if (cfg.autoSummarizeEnabled && cfg.aiApiKey) {
                  generateSummary(finalPath, { ...metadata, url }, cfg).catch(() => {})
                }
              })
              .catch(() => {})
          }
        } catch {
          /* don't block on classify errors */
        }
      } else if (cfg.autoSummarizeEnabled && cfg.aiApiKey) {
        generateSummary(refPath, { ...metadata, url }, cfg).catch(() => {})
      }

      return { refPath, alreadyExists: false }
    }
  )

  ipcMain.handle(
    'library:savePage',
    async (_, { title, siteName, url, markdown, contentType = 'page' }) => {
      const cfg = readConfig()
      const { outputFolder } = cfg
      if (!outputFolder || !fs.existsSync(outputFolder))
        throw new Error('No output folder configured')

      // Sanitize title to create filename
      const sanitized = title
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .slice(0, 50)
      const dateStr = new Date().toISOString().slice(0, 10)
      const fileName = `${sanitized}-${dateStr}.md`
      const filePath = path.join(outputFolder, fileName)

      // Write markdown to file
      fs.writeFileSync(filePath, markdown, 'utf8')

      // Write metadata
      const metadata = {
        title,
        uploader: siteName,
        url,
        contentType,
        downloadedAt: new Date().toISOString()
      }
      writeMetadataEntry(filePath, metadata)

      // Init notes chapter
      try {
        initChapter(filePath, metadata, outputFolder)
      } catch {
        /* don't block on notes errors */
      }

      // Trigger classification if enabled
      if (cfg.autoClassifyEnabled) {
        try {
          const folderNames = fs
            .readdirSync(outputFolder)
            .filter(
              (f) => !f.startsWith('.') && fs.statSync(path.join(outputFolder, f)).isDirectory()
            )
          if (folderNames.length > 0) {
            classifyVideo({ title, uploader: siteName, url }, folderNames, cfg)
              .then(({ folder }) => {
                if (folder) {
                  const ext = '.md'
                  const stem = sanitized
                  let newPath = path.join(outputFolder, folder, fileName)
                  let counter = 1
                  while (fs.existsSync(newPath)) {
                    newPath = path.join(outputFolder, folder, `${stem} (${counter})${ext}`)
                    counter++
                  }
                  try {
                    fs.renameSync(filePath, newPath)
                    moveMetadataEntry(filePath, newPath)
                    moveChapter(filePath, newPath, outputFolder)
                  } catch {
                    /* skip if move fails */
                  }
                }
                if (cfg.autoSummarizeEnabled && cfg.aiApiKey) {
                  generateSummary(filePath, metadata, cfg).catch(() => {})
                }
              })
              .catch(() => {})
          }
        } catch {
          /* don't block on classify errors */
        }
      } else if (cfg.autoSummarizeEnabled && cfg.aiApiKey) {
        generateSummary(filePath, metadata, cfg).catch(() => {})
      }

      // Emit library:changed event so renderer refreshes
      sendToRenderer('library:changed')

      // Return the new file entry
      return {
        name: fileName,
        path: filePath,
        folder: null,
        size: Buffer.byteLength(markdown, 'utf8'),
        mtime: new Date().toISOString(),
        title,
        uploader: siteName,
        description: null,
        thumbnailUrl: null,
        videoUrl: toPullyUrl(filePath),
        url,
        downloadedAt: metadata.downloadedAt,
        contentType
      }
    }
  )

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
        name: fileName,
        path: fullPath,
        folder,
        size: stat.size,
        mtime: stat.mtime.toISOString(),
        title: meta.title || null,
        uploader: meta.uploader || null,
        description: meta.description || null,
        thumbnailUrl: thumbnailSrc(fullPath) || meta.thumbnailUrl || null,
        videoUrl: toPullyUrl(fullPath),
        url: meta.url || null,
        downloadedAt: meta.downloadedAt || null,
        contentType: meta.contentType || 'video'
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
      return fs
        .readdirSync(outputFolder)
        .filter((f) => {
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
    const fileNames = fs.readdirSync(dirPath).filter((f) => !f.startsWith('.'))
    const filePaths = fileNames.map((f) => path.join(dirPath, f))
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

    const folderNames = fs
      .readdirSync(outputFolder)
      .filter((f) => !f.startsWith('.') && fs.statSync(path.join(outputFolder, f)).isDirectory())
    if (folderNames.length === 0) return { moved: [], skipped: 0 }

    const index = readMetadataIndex()
    const rootFiles = fs
      .readdirSync(outputFolder)
      .filter((f) => !f.startsWith('.') && !fs.statSync(path.join(outputFolder, f)).isDirectory())

    const moved = []
    let skipped = 0
    for (const file of rootFiles) {
      if (isHelperFile(file)) continue
      const filePath = path.join(outputFolder, file)
      const meta = index[filePath] || {}
      const { folder } = await classifyVideo(
        {
          title: meta.title,
          uploader: meta.uploader,
          description: meta.description,
          url: meta.url
        },
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
      proc.stdout.on('data', (d) => {
        out += d.toString()
      })
      proc.on('close', (code) => {
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

  ipcMain.handle('library:runCuration', async () => {
    const { outputFolder } = readConfig()
    if (!outputFolder || !fs.existsSync(outputFolder)) {
      logger.warn('curation', 'Curation skipped: no output folder configured')
      return []
    }
    const results = await runCuration(outputFolder, app.getPath('userData'))
    for (const result of results) {
      const level = result.status === 'error' ? 'error' : 'info'
      const msg = `${result.task}: ${result.status}`
      logger[level]('curation', msg, { task: result.task, details: result.details })
    }
    return results
  })

  // Bookmarks handlers
  ipcMain.handle('bookmarks:list', () => listBookmarks())
  ipcMain.handle('bookmarks:add', (_, data) => addBookmark(data))
  ipcMain.handle('bookmarks:remove', (_, url) => removeBookmark(url))

  // History handlers
  ipcMain.handle('history:list', () => listHistory())
  ipcMain.handle('history:upsert', (_, data) => upsertHistory(data))

  // Forward download manager events to renderer
  downloadManager.on('queue-updated', (q) =>
    sendToRenderer('download:queue-updated', q)
  )
  downloadManager.on('progress', (d) => sendToRenderer('download:progress', d))
  downloadManager.on('completed', (d) => sendToRenderer('download:completed', d))
  downloadManager.on('failed', (d) => sendToRenderer('download:failed', d))

  // Browser tabs persistence
  ipcMain.handle('browser-tabs:read', async () => {
    const cfg = await readConfig()
    return cfg.browserTabs || null
  })

  ipcMain.handle('browser-tabs:write', async (_, data) => {
    const cfg = await readConfig()
    await writeConfig({ ...cfg, browserTabs: data })
  })

  // Log entries are pushed to renderer via sendToRenderer('log:entry', entry)
  // No handler needed — logger.js handles sending when debugMode is enabled

  // File Browser Handlers

  ipcMain.handle('files:listRoots', async () => {
    // Return filesystem roots
    if (process.platform === 'win32') {
      const drives = []
      for (let i = 65; i <= 90; i++) {
        const drive = String.fromCharCode(i) + ':'
        if (fs.existsSync(drive + '\\')) drives.push(drive)
      }
      return drives
    }
    return ['/']
  })

  ipcMain.handle('files:listDir', async (event, dirPath) => {
    try {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true })
      const items = entries
        .filter((e) => !e.name.startsWith('.'))
        .map((e) => ({
          name: e.name,
          path: path.join(dirPath, e.name),
          isDirectory: e.isDirectory(),
          type: getFileType(e.name)
        }))
        .sort((a, b) => {
          if (a.isDirectory && !b.isDirectory) return -1
          if (!a.isDirectory && b.isDirectory) return 1
          return a.name.localeCompare(b.name)
        })

      return items
    } catch (error) {
      return { error: error.message }
    }
  })

  ipcMain.handle('files:getLastDir', async () => {
    const config = await readConfig()
    return config.filesLastDir || os.homedir()
  })

  ipcMain.handle('files:setLastDir', async (event, dirPath) => {
    const config = await readConfig()
    config.filesLastDir = dirPath
    await writeConfig(config)
    return true
  })

  function getFileType(fileName) {
    const ext = fileName.slice(fileName.lastIndexOf('.')).toLowerCase()
    if (['.pdf'].includes(ext)) return 'pdf'
    if (
      [
        '.docx',
        '.doc',
        '.docm',
        '.odt',
        '.rtf',
        '.xlsx',
        '.xls',
        '.xlsm',
        '.ods',
        '.pptx',
        '.ppt',
        '.pptm',
        '.odp'
      ].includes(ext)
    )
      return 'document'
    if (
      [
        '.jpg',
        '.jpeg',
        '.png',
        '.gif',
        '.webp',
        '.bmp',
        '.svg',
        '.tiff',
        '.heic',
        '.ico',
        '.avif'
      ].includes(ext)
    )
      return 'image'
    if (['.txt', '.csv', '.json', '.xml', '.yaml', '.md', '.html', '.htm'].includes(ext))
      return 'text'
    return 'other'
  }

  ipcMain.handle('files:rememberFile', async (event, filePath) => {
    try {
      const fileName = path.basename(filePath)
      const config = await readConfig()
      const outputFolder = config.outputFolder

      if (!outputFolder || !fs.existsSync(outputFolder)) {
        throw new Error('No output folder configured')
      }

      // Copy file to output folder
      const destPath = path.join(outputFolder, fileName)
      let finalPath = destPath
      let counter = 1

      // Handle name collisions
      if (fs.existsSync(finalPath)) {
        const ext = path.extname(fileName)
        const stem = path.basename(fileName, ext)
        while (fs.existsSync(finalPath)) {
          finalPath = path.join(outputFolder, `${stem} (${counter})${ext}`)
          counter++
        }
      }

      // Copy the file
      fs.copyFileSync(filePath, finalPath)

      const title = path.parse(fileName).name
      const contentType = getFileType(fileName)

      // Write metadata
      const metadataEntry = {
        title,
        contentType,
        originalPath: filePath,
        downloadedAt: new Date().toISOString()
      }

      writeMetadataEntry(finalPath, metadataEntry)

      // Init notes chapter
      try {
        initChapter(finalPath, metadataEntry, outputFolder)
      } catch {
        /* don't block on notes errors */
      }

      sendToRenderer('library:changed')

      return { success: true, title, contentType, outputPath: finalPath }
    } catch (error) {
      return { error: error.message }
    }
  })

  ipcMain.handle('files:rememberFolder', async (event, folderPath) => {
    try {
      const files = []

      async function walk(dir) {
        const entries = await fs.promises.readdir(dir, { withFileTypes: true })
        for (const entry of entries) {
          if (entry.name.startsWith('.')) continue
          const fullPath = path.join(dir, entry.name)
          if (entry.isDirectory()) {
            await walk(fullPath)
          } else {
            files.push(fullPath)
          }
        }
      }

      await walk(folderPath)
      return { count: files.length, files }
    } catch (error) {
      return { error: error.message }
    }
  })

  ipcMain.handle('files:isFileRemembered', async (event, filePath) => {
    try {
      const index = readMetadataIndex()
      const entry = index[filePath]
      return { remembered: !!entry }
    } catch {
      return { remembered: false }
    }
  })

  ipcMain.handle('files:checkOriginalExists', async (event, originalPath) => {
    try {
      const exists = fs.existsSync(originalPath)
      return { exists }
    } catch {
      return { exists: false }
    }
  })
}
