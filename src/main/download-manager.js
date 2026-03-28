import { EventEmitter } from 'events'
import fs from 'fs'
import path from 'path'
import { startDownload } from './ytdlp-runner.js'
import { readConfig } from './config-store.js'
import { writeMetadataEntry, downloadAndStoreThumbnail, moveMetadataEntry } from './metadata-store.js'
import { classifyVideo } from './auto-classifier.js'

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
        if (cfg.autoClassifyEnabled && actualPath) {
          try {
            const folderNames = fs.readdirSync(cfg.outputFolder)
              .filter(f => !f.startsWith('.') && fs.statSync(path.join(cfg.outputFolder, f)).isDirectory())
            if (folderNames.length > 0) {
              classifyVideo(
                { title: item.metadata.title, uploader: item.metadata.uploader, description: item.metadata.description, url: item.metadata.url },
                folderNames,
                cfg
              ).then(({ folder }) => {
                if (folder) {
                  const newPath = path.join(cfg.outputFolder, folder, path.basename(actualPath))
                  fs.renameSync(actualPath, newPath)
                  moveMetadataEntry(actualPath, newPath)
                }
              }).catch(() => {})
            }
          } catch { /* don't block completion on classify errors */ }
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
