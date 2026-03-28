import { EventEmitter } from 'events'
import { startDownload } from './ytdlp-runner.js'
import { readConfig } from './config-store.js'
import { writeMetadataEntry } from './metadata-store.js'

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
