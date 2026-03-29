import { EventEmitter } from 'events'
import fs from 'fs'
import path from 'path'
import { startDownload } from './ytdlp-runner.js'
import { readConfig } from './config-store.js'
import {
  writeMetadataEntry,
  downloadAndStoreThumbnail,
  moveMetadataEntry,
  moveThumbnailSidecar
} from './metadata-store.js'
import { classifyVideo } from './auto-classifier.js'
import { initChapter, moveChapter } from './notes-store.js'
import { generateSummary } from './ai-summarizer.js'
import logger from './logger.js'

export class DownloadManager extends EventEmitter {
  constructor() {
    super()
    this.queue = []
    this.active = new Map()
  }

  add(url, formatId, title, metadata = null) {
    const id = crypto.randomUUID()
    this.queue.push({
      id,
      url,
      formatId,
      title,
      metadata,
      status: 'queued',
      percent: 0,
      speed: '',
      eta: '',
      error: undefined
    })

    // Create notes stub immediately with URL as key so Notes panel displays right away
    const cfg = readConfig()
    if (metadata) {
      try {
        initChapter(
          url,
          {
            ...metadata,
            downloadedAt: new Date().toISOString().split('T')[0]
          },
          cfg.outputFolder
        )
      } catch {
        /* don't block on notes errors */
      }
    }

    this.emit('queue-updated', this.getAll())
    this._tick()
    return id
  }

  retry(id) {
    const item = this.queue.find((d) => d.id === id)
    if (!item || item.status !== 'failed') return
    item.status = 'queued'
    item.percent = 0
    item.error = undefined
    this.emit('queue-updated', this.getAll())
    this._tick()
  }

  cancel(id) {
    const idx = this.queue.findIndex((d) => d.id === id)
    if (idx === -1) return
    const item = this.queue[idx]
    if (item.status !== 'queued' && item.status !== 'downloading') return
    this.queue.splice(idx, 1)
    if (item.status === 'downloading') {
      const proc = this.active.get(id)
      if (proc) proc.kill()
      this.active.delete(id)
    }
    this.emit('queue-updated', this.getAll())
  }

  getAll() {
    return this.queue.map((d) => ({ ...d }))
  }

  _tick() {
    const { maxConcurrent, outputFolder } = readConfig()
    const slots = Math.max(0, maxConcurrent - this.active.size)
    const queued = this.queue.filter((d) => d.status === 'queued')
    for (const item of queued.slice(0, slots)) {
      this._start(item, outputFolder)
    }
  }

  _start(item, outputFolder) {
    item.status = 'downloading'
    const startTime = Date.now()
    const lastProgressLogTime = {}

    // Log download start
    logger.info('download', `Started: ${path.basename(item.filePath || item.title)}`, {
      url: item.url,
      outputPath: outputFolder
    })

    const proc = startDownload(
      item.url,
      item.formatId,
      outputFolder,
      (progress) => {
        Object.assign(item, progress)
        this.emit('progress', { id: item.id, ...progress })

        // Log progress milestones at 25%, 50%, 75%, 100%
        const percent = progress.percent
        const milestones = [25, 50, 75, 100]
        for (const milestone of milestones) {
          if (Math.abs(percent - milestone) < 1 && !lastProgressLogTime[milestone]) {
            lastProgressLogTime[milestone] = true
            logger.info('download', `Progress: ${item.title} ${Math.round(percent)}%`, {
              url: item.url,
              percent: Math.round(percent)
            })
          }
        }
      },
      (actualPath) => {
        item.status = 'done'
        this.active.delete(item.id)

        // Log download completion with duration and file size
        if (actualPath) {
          try {
            const duration = (Date.now() - startTime) / 1000
            const fileSize = fs.statSync(actualPath).size
            logger.info('download', `Completed: ${path.basename(actualPath)}`, {
              url: item.url,
              duration: `${duration.toFixed(2)}s`,
              fileSize: `${(fileSize / 1024 / 1024).toFixed(2)}MB`
            })
          } catch {
            // If we can't get file stats, log without them
            logger.info('download', `Completed: ${actualPath}`, { url: item.url })
          }
        }

        if (actualPath && item.metadata) {
          writeMetadataEntry(actualPath, {
            ...item.metadata,
            downloadedAt: new Date().toISOString()
          })
          if (item.metadata.thumbnailUrl) {
            downloadAndStoreThumbnail(item.metadata.thumbnailUrl, actualPath).catch(() => {})
          }
        }
        const cfg = readConfig()

        // Notes: init chapter stub
        if (actualPath && item.metadata) {
          try {
            initChapter(
              actualPath,
              { ...item.metadata, downloadedAt: new Date().toISOString() },
              cfg.outputFolder
            )
          } catch {
            /* don't block on notes errors */
          }
        }

        // Classify + summarize pipeline
        if (cfg.autoClassifyEnabled && actualPath && item.metadata) {
          try {
            const folderNames = fs
              .readdirSync(cfg.outputFolder)
              .filter(
                (f) =>
                  !f.startsWith('.') && fs.statSync(path.join(cfg.outputFolder, f)).isDirectory()
              )
            if (folderNames.length > 0) {
              classifyVideo(
                {
                  title: item.metadata.title,
                  uploader: item.metadata.uploader,
                  description: item.metadata.description,
                  url: item.metadata.url
                },
                folderNames,
                cfg
              )
                .then(({ folder }) => {
                  let finalPath = actualPath
                  if (folder) {
                    const base = path.basename(actualPath)
                    const ext = path.extname(base)
                    const stem = path.basename(base, ext)
                    let newPath = path.join(cfg.outputFolder, folder, base)
                    let counter = 1
                    while (fs.existsSync(newPath)) {
                      newPath = path.join(cfg.outputFolder, folder, `${stem} (${counter})${ext}`)
                      counter++
                    }
                    try {
                      fs.renameSync(actualPath, newPath)
                      moveMetadataEntry(actualPath, newPath)
                      moveThumbnailSidecar(actualPath, newPath)
                      moveChapter(actualPath, newPath, cfg.outputFolder)
                      finalPath = newPath
                    } catch {
                      /* skip if move fails */
                    }
                  }
                  if (cfg.autoSummarizeEnabled && cfg.aiApiKey && item.metadata) {
                    generateSummary(
                      finalPath,
                      { ...item.metadata, url: item.metadata.url },
                      cfg
                    ).catch(() => {})
                  }
                })
                .catch(() => {})
            }
          } catch {
            /* don't block completion on classify errors */
          }
        } else if (cfg.autoSummarizeEnabled && cfg.aiApiKey && actualPath && item.metadata) {
          generateSummary(actualPath, { ...item.metadata, url: item.metadata.url }, cfg).catch(
            () => {}
          )
        }
        this.emit('completed', { id: item.id })
        this.emit('queue-updated', this.getAll())
        this._tick()
      },
      (err) => {
        item.status = 'failed'
        item.error = err.message
        this.active.delete(item.id)

        // Extract stderr and exit code from error message if present
        const errorLines = err.message.split('\n')
        const firstLine = errorLines[0]
        const stderr = errorLines.slice(1).join('\n').trim()
        const exitCodeMatch = firstLine.match(/yt-dlp exited (\d+)/)
        const exitCode = exitCodeMatch ? parseInt(exitCodeMatch[1]) : null

        // Log download failure with details
        logger.error('download', `Failed: ${path.basename(item.filePath || item.title)}`, {
          url: item.url,
          exitCode,
          stderr: stderr.slice(0, 1000),
          error: err.message
        })

        this.emit('failed', { id: item.id, error: err.message })
        this.emit('queue-updated', this.getAll())
        this._tick()
      }
    )
    this.active.set(item.id, proc)
    this.emit('queue-updated', this.getAll())
  }
}
