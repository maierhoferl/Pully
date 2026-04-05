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
import { initVault, getNotePath, scanFolderNotes, parseFrontmatter } from './obsidian-store.js'
import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'

// ---------------------------------------------------------------------------
// Helper: which filenames are sidecar / system files to exclude from library
// ---------------------------------------------------------------------------

function isHelperFile(fileName) {
  if (fileName === '.pully.json') return true
  if (fileName === '.gitignore') return true
  if (/\.thumb(\.[a-z]+)?$/i.test(fileName)) return true // thumbnails
  if (/\.nfo$/i.test(fileName)) return true // info files
  return false
}

/**
 * Return true if a .md file is a companion note for a media file in the same folder.
 * A companion note has `file:` in its frontmatter pointing to a real media file.
 */
function isCompanionNote(mdFilePath) {
  try {
    const content = fs.readFileSync(mdFilePath, 'utf8')
    const { frontmatter } = parseFrontmatter(content)
    if (!frontmatter.file) return false
    const mediaPath = path.join(path.dirname(mdFilePath), frontmatter.file)
    return fs.existsSync(mediaPath)
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// library:list helpers
// ---------------------------------------------------------------------------

function thumbnailSrc(filePath) {
  const thumbPath = filePath.replace(/\.[^.]+$/, '.thumb.jpg')
  return fs.existsSync(thumbPath) ? toPullyUrl(thumbPath) : null
}

/**
 * Build a library entry from a .md note.
 * If the note has a `file:` frontmatter field, the entry represents the media file.
 * Otherwise, the entry represents a reference or saved page (the note IS the item).
 */
function entryFromNote(notePath, frontmatter, mtime, folder) {
  const mediaFile = frontmatter.file
  const mediaPath = mediaFile ? path.join(path.dirname(notePath), mediaFile) : null

  let size = 0
  let effectiveMtime = mtime
  let videoUrl = null
  let name

  if (mediaPath && fs.existsSync(mediaPath)) {
    try {
      const stat = fs.statSync(mediaPath)
      size = stat.size
      effectiveMtime = stat.mtime.toISOString()
    } catch {
      // use note mtime
    }
    videoUrl = toPullyUrl(mediaPath)
    name = mediaFile
  } else if (mediaFile) {
    // Media file referenced but not on disk → treat as reference
    name = path.basename(notePath)
    videoUrl = null
  } else {
    // Standalone note (reference or page)
    name = path.basename(notePath)
    videoUrl = toPullyUrl(notePath)
  }

  const isReference = frontmatter.type === 'reference'
  const thumbPath = (mediaPath || notePath).replace(/\.[^.]+$/, '.thumb.jpg')
  const thumbSrc = fs.existsSync(thumbPath) ? toPullyUrl(thumbPath) : null

  return {
    name,
    path: mediaPath && fs.existsSync(mediaPath) ? mediaPath : notePath,
    notePath,
    folder,
    size,
    mtime: effectiveMtime,
    title: frontmatter.title || null,
    uploader: frontmatter.uploader || null,
    description: frontmatter.description || null,
    thumbnailUrl: thumbSrc || frontmatter.thumbnail_url || null,
    videoUrl,
    url: frontmatter.url || null,
    downloadedAt: frontmatter.downloaded_at || frontmatter.saved_at || null,
    contentType: frontmatter.content_type || 'video',
    isReference
  }
}

// ---------------------------------------------------------------------------
// registerIpcHandlers
// ---------------------------------------------------------------------------

export function registerIpcHandlers(downloadManager, logger, getMainWindow) {
  const sendToRenderer = (channel, ...args) => {
    const mainWindow = getMainWindow()
    if (mainWindow) mainWindow.webContents.send(channel, ...args)
  }

  const notesEmitter = new EventEmitter()
  setNotesEventEmitter(notesEmitter)
  notesEmitter.on('notes:chapter-updated', (data) => sendToRenderer('notes:chapter-updated', data))

  // Initialise Obsidian vault whenever config is loaded
  const cfg0 = readConfig()
  if (cfg0.outputFolder) initVault(cfg0.outputFolder)

  // -------------------------------------------------------------------------
  ipcMain.handle('log:renderer', (_, { level, category, message, meta }) => {
    const fn = logger[level] ?? logger.info
    fn.call(logger, category, message, meta)
  })

  ipcMain.handle('config:read', () => readConfig())
  ipcMain.handle('config:write', (_, data) => {
    writeConfig(data)
    const updated = readConfig()
    logger.setDebugMode(updated.debugMode)
    // Initialise vault whenever the output folder changes
    if (updated.outputFolder) initVault(updated.outputFolder)
    return updated
  })

  ipcMain.handle('devtools:toggle', () => {
    const win = getMainWindow()
    if (!win) return
    if (win.webContents.isDevToolsOpened()) win.webContents.closeDevTools()
    else win.webContents.openDevTools()
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

  // -------------------------------------------------------------------------
  // library:remember — create an Obsidian reference note
  // -------------------------------------------------------------------------
  ipcMain.handle(
    'library:remember',
    async (_, { title, uploader, description, thumbnailUrl, url, contentType = 'video', page }) => {
      const cfg = readConfig()
      const { outputFolder } = cfg
      if (!outputFolder || !fs.existsSync(outputFolder))
        throw new Error('No output folder configured')

      // Check for duplicate reference
      const index = readMetadataIndex(outputFolder)
      const existing = Object.entries(index).find(
        ([, m]) => m.isReference && m.url === url
      )
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

      // createReferenceFile now creates a .md note
      const refPath = await createReferenceFile(outputFolder, {
        title,
        uploader,
        description,
        thumbnailUrl,
        url,
        contentType
      })

      // Classify + summarize pipeline
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

  // -------------------------------------------------------------------------
  // library:savePage — save page markdown as an Obsidian note
  // -------------------------------------------------------------------------
  ipcMain.handle(
    'library:savePage',
    async (_, { title, siteName, url, markdown, contentType = 'page' }) => {
      const cfg = readConfig()
      const { outputFolder } = cfg
      if (!outputFolder || !fs.existsSync(outputFolder))
        throw new Error('No output folder configured')

      const sanitized = title
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .slice(0, 50)
      const dateStr = new Date().toISOString().slice(0, 10)
      const fileName = `${sanitized}-${dateStr}.md`
      const filePath = path.join(outputFolder, fileName)

      const downloadedAt = new Date().toISOString()

      // Write as an Obsidian note: frontmatter + page body + ## AI Summary + ## My Notes
      const { writeNote } = await import('./obsidian-store.js')
      writeNote(filePath, {
        frontmatter: {
          title,
          url,
          uploader: siteName || null,
          downloaded_at: downloadedAt,
          content_type: contentType,
          tags: []
        },
        pageContent: markdown
      })

      const metadata = {
        title,
        uploader: siteName,
        url,
        contentType,
        downloadedAt
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

      sendToRenderer('library:changed')

      try {
        const stat = fs.statSync(filePath)
        return {
          name: fileName,
          path: filePath,
          notePath: filePath,
          folder: null,
          size: stat.size,
          mtime: stat.mtime.toISOString(),
          title,
          uploader: siteName,
          description: null,
          thumbnailUrl: null,
          videoUrl: toPullyUrl(filePath),
          url,
          downloadedAt: metadata.downloadedAt,
          contentType
        }
      } catch {
        return { name: fileName, path: filePath }
      }
    }
  )

  // -------------------------------------------------------------------------
  // library:list — note-centric listing
  // -------------------------------------------------------------------------
  ipcMain.handle('library:list', () => {
    const { outputFolder } = readConfig()
    if (!outputFolder || !fs.existsSync(outputFolder)) return []

    const entries = []

    function processFolder(folderPath, folderName) {
      const notes = scanFolderNotes(folderPath)
      // Build a set of media stems covered by notes (to avoid duplicates)
      const coveredStems = new Set()
      for (const { notePath, frontmatter, mtime } of notes) {
        const entry = entryFromNote(notePath, frontmatter, mtime, folderName)
        entries.push(entry)
        if (frontmatter.file) {
          coveredStems.add(path.basename(frontmatter.file, path.extname(frontmatter.file)))
        }
      }

      // Include any media files that don't yet have a companion note (legacy)
      try {
        for (const f of fs.readdirSync(folderPath)) {
          if (f.startsWith('.') || isHelperFile(f) || f.endsWith('.md')) continue
          const stem = path.basename(f, path.extname(f))
          if (coveredStems.has(stem)) continue
          const fullPath = path.join(folderPath, f)
          try {
            const stat = fs.statSync(fullPath)
            if (stat.isDirectory()) continue
            entries.push({
              name: f,
              path: fullPath,
              notePath: null,
              folder: folderName,
              size: stat.size,
              mtime: stat.mtime.toISOString(),
              title: null,
              uploader: null,
              description: null,
              thumbnailUrl: thumbnailSrc(fullPath),
              videoUrl: toPullyUrl(fullPath),
              url: null,
              downloadedAt: null,
              contentType: 'video'
            })
          } catch {
            // skip
          }
        }
      } catch {
        // skip
      }
    }

    // Root
    processFolder(outputFolder, null)

    // One level of subdirectories
    try {
      for (const dir of fs.readdirSync(outputFolder)) {
        if (dir.startsWith('.')) continue
        const dirPath = path.join(outputFolder, dir)
        try {
          if (fs.statSync(dirPath).isDirectory()) processFolder(dirPath, dir)
        } catch {
          // skip
        }
      }
    } catch {
      return []
    }

    // Backfill: download thumbnails that are missing
    for (const entry of entries) {
      if (entry.thumbnailUrl || !entry.url) continue
      const basePath = entry.path
      const thumbPath = basePath.replace(/\.[^.]+$/, '.thumb.jpg')
      if (!fs.existsSync(thumbPath)) {
        // We'd need thumbnailUrl from note frontmatter — handled in entryFromNote via thumbnail_url
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
    fs.renameSync(oldDir, newDir) // .md notes move with the folder automatically
    renameFolderInIndex(oldDir, newDir) // no-op in Obsidian mode
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
        if (/\.thumb(\.[a-z]+)?$/i.test(path.basename(fp))) continue
        if (fp.endsWith('.md')) continue // companion notes will move via moveMetadataEntry
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
        moveMetadataEntry(fp, dest) // also moves companion .md note
        moveThumbnailSidecar(fp, dest)
        try {
          moveChapter(fp, dest, outputFolder)
        } catch {}
      }
      fs.rmSync(dirPath, { recursive: true })
    } else {
      for (const fp of filePaths) {
        if (fp.endsWith('.md') && isCompanionNote(fp)) continue // deleted with media file
        const thumbPath = fp.replace(/\.[^.]+$/, '.thumb.jpg')
        const notePath = fp.endsWith('.md') ? null : getNotePath(fp)
        await shell.trashItem(fp)
        if (fs.existsSync(thumbPath)) await shell.trashItem(thumbPath)
        if (notePath && fs.existsSync(notePath)) await shell.trashItem(notePath)
        deleteMetadataEntry(fp)
      }
      deleteFolderFromIndex(dirPath) // no-op in Obsidian mode
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
      moveMetadataEntry(filePath, newPath) // moves companion .md note
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

    const index = readMetadataIndex(outputFolder)
    const rootFiles = fs
      .readdirSync(outputFolder)
      .filter(
        (f) =>
          !f.startsWith('.') && !fs.statSync(path.join(outputFolder, f)).isDirectory()
      )

    const moved = []
    let skipped = 0
    for (const file of rootFiles) {
      if (isHelperFile(file)) continue
      if (file.endsWith('.md') && isCompanionNote(path.join(outputFolder, file))) continue
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

  // -------------------------------------------------------------------------
  // Notes handlers
  // -------------------------------------------------------------------------
  ipcMain.handle('notes:read', (_e, folderName) => {
    const cfg = readConfig()
    return readFolderNotes(folderName, cfg.outputFolder)
  })

  ipcMain.handle('notes:init-chapter', (_e, filePath) => {
    const cfg = readConfig()
    const index = readMetadataIndex(cfg.outputFolder)
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
    const index = readMetadataIndex(cfg.outputFolder)
    const metadata = index[filePath] || {}
    const summary = await generateSummary(filePath, metadata, cfg)
    return { summary }
  })

  ipcMain.handle('adblock:setEnabled', (_, isEnabled) => {
    if (isEnabled) enableAdblock(session.defaultSession)
    else disableAdblock(session.defaultSession)
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
    const notePath = getNotePath(filePath)
    await shell.trashItem(filePath)
    if (fs.existsSync(thumbPath)) await shell.trashItem(thumbPath)
    if (notePath !== filePath && fs.existsSync(notePath)) await shell.trashItem(notePath)
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
      logger[level]('curation', `${result.task}: ${result.status}`, {
        task: result.task,
        details: result.details
      })
    }
    return results
  })

  // Bookmarks
  ipcMain.handle('bookmarks:list', () => listBookmarks())
  ipcMain.handle('bookmarks:add', (_, data) => addBookmark(data))
  ipcMain.handle('bookmarks:remove', (_, url) => removeBookmark(url))

  // History
  ipcMain.handle('history:list', () => listHistory())
  ipcMain.handle('history:upsert', (_, data) => upsertHistory(data))

  // Download manager events
  downloadManager.on('queue-updated', (q) => sendToRenderer('download:queue-updated', q))
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

  // -------------------------------------------------------------------------
  // File Browser Handlers
  // -------------------------------------------------------------------------
  ipcMain.handle('files:listRoots', async () => {
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
        '.docx', '.doc', '.docm', '.odt', '.rtf',
        '.xlsx', '.xls', '.xlsm', '.ods',
        '.pptx', '.ppt', '.pptm', '.odp'
      ].includes(ext)
    )
      return 'document'
    if (
      [
        '.jpg', '.jpeg', '.png', '.gif', '.webp',
        '.bmp', '.svg', '.tiff', '.heic', '.ico', '.avif'
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

      const destPath = path.join(outputFolder, fileName)
      let finalPath = destPath
      let counter = 1
      if (fs.existsSync(finalPath)) {
        const ext = path.extname(fileName)
        const stem = path.basename(fileName, ext)
        while (fs.existsSync(finalPath)) {
          finalPath = path.join(outputFolder, `${stem} (${counter})${ext}`)
          counter++
        }
      }

      fs.copyFileSync(filePath, finalPath)

      const title = path.parse(fileName).name
      const contentType = getFileType(fileName)
      const metadataEntry = {
        title,
        contentType,
        originalPath: filePath,
        downloadedAt: new Date().toISOString()
      }

      writeMetadataEntry(finalPath, metadataEntry)

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
          if (entry.isDirectory()) await walk(fullPath)
          else files.push(fullPath)
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
      const { outputFolder } = readConfig()
      const notePath = getNotePath(filePath)
      // A file is remembered if a companion note exists in the vault
      const remembered = fs.existsSync(notePath) && notePath.startsWith(outputFolder)
      return { remembered }
    } catch {
      return { remembered: false }
    }
  })

  ipcMain.handle('files:checkOriginalExists', async (event, originalPath) => {
    try {
      return { exists: fs.existsSync(originalPath) }
    } catch {
      return { exists: false }
    }
  })

  ipcMain.handle('file:read', async (event, filePath) => {
    try {
      const content = await fs.promises.readFile(filePath, 'utf-8')
      return { content }
    } catch (error) {
      return { error: error.message }
    }
  })
}
