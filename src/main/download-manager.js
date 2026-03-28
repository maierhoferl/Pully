import { EventEmitter } from 'events'
import fs from 'fs'
import path from 'path'
import { startDownload } from './ytdlp-runner.js'
import { readConfig } from './config-store.js'
import { writeMetadataEntry, downloadAndStoreThumbnail, moveMetadataEntry } from './metadata-store.js'
import { classifyVideo } from './auto-classifier.js'
import { initChapter, moveChapter, writeSummarySection } from './notes-store.js'
import { generateSummary } from './ai-summarizer.js'

export class DownloadManager extends EventEmitter {
  constructor() {
    super()
    this.queue = []
    this.active = new Map()
  }

  add(url, formatId, title, metadata = null) {
    const id = crypto.randomUUID()
    this.queue.push({ id, url, formatId, title, metadata, status: 'queued', percent: 0, speed: '', eta: '', error: undefined })
    this.emit('queue-updated', this.getAll())
    this._tick()
    return id
  }

  retry(id) {
    const item = this.queue.find(d => d.id === id)
    if (!item || item.status !== 'failed') return
    item.status = 'queued'
    item.percent = 0
    item.error = undefined
    this.emit('queue-updated', this.getAll())
    this._tick()
  }

  cancel(id) {
    const idx = this.queue.findIndex(d => d.id === id)
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
    return this.queue.map(d => ({ ...d }))
  }

  _tick() {
    const { maxConcurrent, outputFolder } = readConfig()
    const slots = Math.max(0, maxConcurrent - this.active.size)
    const queued = this.queue.filter(d => d.status === 'queued')
    for (const item of queued.slice(0, slots)) {
      this._start(item, outputFolder)
    }
  }

  _start(item, outputFolder) {
    item.status = 'downloading'
    const proc = startDownload(
      item.url, item.formatId, outputFolder,
      progress => {
        Object.assign(item, progress)
        this.emit('progress', { id: item.id, ...progress })
      },
      (actualPath) => {
        item.status = 'done'
        this.active.delete(item.id)
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
            initChapter(actualPath, { ...item.metadata, downloadedAt: new Date().toISOString() }, cfg.outputFolder)
          } catch { /* don't block on notes errors */ }
        }

        // Classify + summarize pipeline
        if (cfg.autoClassifyEnabled && actualPath && item.metadata) {
          try {
            const folderNames = fs.readdirSync(cfg.outputFolder)
              .filter(f => !f.startsWith('.') && fs.statSync(path.join(cfg.outputFolder, f)).isDirectory())
            if (folderNames.length > 0) {
              classifyVideo(
                { title: item.metadata.title, uploader: item.metadata.uploader, description: item.metadata.description, url: item.metadata.url },
                folderNames,
                cfg
              ).then(({ folder }) => {
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
                    moveChapter(actualPath, newPath, cfg.outputFolder)
                    finalPath = newPath
                  } catch { /* skip if move fails */ }
                }
                if (cfg.autoSummarizeEnabled && cfg.aiApiKey && item.metadata) {
                  generateSummary(finalPath, { ...item.metadata, url: item.metadata.url }, cfg)
                    .then(summary => writeSummarySection(finalPath, summary, cfg.outputFolder))
                    .catch(() => {})
                }
              }).catch(() => {})
            }
          } catch { /* don't block completion on classify errors */ }
        } else if (cfg.autoSummarizeEnabled && cfg.aiApiKey && actualPath && item.metadata) {
          generateSummary(actualPath, { ...item.metadata, url: item.metadata.url }, cfg)
            .then(summary => writeSummarySection(actualPath, summary, cfg.outputFolder))
            .catch(() => {})
        }
        this.emit('completed', { id: item.id })
        this.emit('queue-updated', this.getAll())
        this._tick()
      },
      err => {
        item.status = 'failed'
        item.error = err.message
        this.active.delete(item.id)
        this.emit('failed', { id: item.id, error: err.message })
        this.emit('queue-updated', this.getAll())
        this._tick()
      }
    )
    this.active.set(item.id, proc)
    this.emit('queue-updated', this.getAll())
  }
}
