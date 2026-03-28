import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/main/ytdlp-runner.js', () => ({ startDownload: vi.fn() }))
vi.mock('../../src/main/config-store.js', () => ({
  readConfig: vi.fn(() => ({ outputFolder: '/tmp/vids', maxConcurrent: 2 }))
}))
vi.mock('../../src/main/metadata-store.js', () => ({ writeMetadataEntry: vi.fn(), downloadAndStoreThumbnail: vi.fn().mockResolvedValue(undefined) }))

import { startDownload } from '../../src/main/ytdlp-runner.js'
import { DownloadManager } from '../../src/main/download-manager.js'
import { writeMetadataEntry } from '../../src/main/metadata-store.js'

beforeEach(() => vi.clearAllMocks())

describe('DownloadManager', () => {
  it('adds item with status queued', () => {
    startDownload.mockReturnValue({ kill: vi.fn() })
    const dm = new DownloadManager()
    const id = dm.add('https://a.com', 'mp4', 'Video 1')
    expect(dm.getAll()[0]).toMatchObject({ id, title: 'Video 1' })
  })

  it('starts immediately when under concurrency limit', () => {
    startDownload.mockReturnValue({ kill: vi.fn() })
    const dm = new DownloadManager()
    dm.add('https://a.com', 'mp4', 'V1')
    expect(startDownload).toHaveBeenCalledTimes(1)
  })

  it('holds in queue when at limit', () => {
    startDownload.mockReturnValue({ kill: vi.fn() })
    const dm = new DownloadManager()
    dm.add('https://a.com', 'mp4', 'V1')
    dm.add('https://b.com', 'mp4', 'V2')
    dm.add('https://c.com', 'mp4', 'V3')
    expect(startDownload).toHaveBeenCalledTimes(2)
    expect(dm.getAll()[2].status).toBe('queued')
  })

  it('starts next item when one completes', () => {
    let onDone
    startDownload.mockImplementation((url, fmt, dir, onProg, done) => {
      if (url === 'https://a.com') onDone = done
      return { kill: vi.fn() }
    })
    const dm = new DownloadManager()
    dm.add('https://a.com', 'mp4', 'V1')
    dm.add('https://b.com', 'mp4', 'V2')
    dm.add('https://c.com', 'mp4', 'V3')
    onDone()
    expect(startDownload).toHaveBeenCalledTimes(3)
  })

  it('emits progress events', () => {
    let onProg
    startDownload.mockImplementation((url, fmt, dir, prog) => { onProg = prog; return { kill: vi.fn() } })
    const dm = new DownloadManager()
    const id = dm.add('https://a.com', 'mp4', 'V1')
    const handler = vi.fn()
    dm.on('progress', handler)
    onProg({ percent: 50, speed: '1MiB/s', eta: '00:10' })
    expect(handler).toHaveBeenCalledWith({ id, percent: 50, speed: '1MiB/s', eta: '00:10' })
  })

  it('marks failed and starts next on error', () => {
    let onError
    startDownload.mockImplementation((url, fmt, dir, onProg, onDone, err) => {
      if (url === 'https://a.com') onError = err
      return { kill: vi.fn() }
    })
    const dm = new DownloadManager()
    dm.add('https://a.com', 'mp4', 'V1')
    dm.add('https://b.com', 'mp4', 'V2')
    dm.add('https://c.com', 'mp4', 'V3')
    onError(new Error('net fail'))
    expect(dm.getAll()[0]).toMatchObject({ status: 'failed', error: 'net fail' })
    expect(startDownload).toHaveBeenCalledTimes(3)
  })

  it('retries a failed download', () => {
    let onError
    startDownload.mockImplementation((url, fmt, dir, onProg, onDone, err) => {
      onError = err; return { kill: vi.fn() }
    })
    const dm = new DownloadManager()
    const id = dm.add('https://a.com', 'mp4', 'V1')
    onError(new Error('fail'))
    startDownload.mockClear()
    dm.retry(id)
    expect(startDownload).toHaveBeenCalledTimes(1)
    expect(dm.getAll()[0].status).toBe('downloading')
  })

  it('writes metadata entry on completion when path and metadata are provided', () => {
    const actualPath = '/out/My Video.mp4'
    let onDone
    startDownload.mockImplementation((url, fmt, dir, onProg, done) => {
      onDone = done
      return { kill: vi.fn() }
    })
    const dm = new DownloadManager()
    const metadata = { title: 'My Video', uploader: 'Author', description: 'Desc', thumbnailUrl: 'http://t' }
    dm.add('https://a.com', 'mp4', 'My Video', metadata)
    onDone(actualPath)
    expect(writeMetadataEntry).toHaveBeenCalledWith(
      actualPath,
      expect.objectContaining({ title: 'My Video', uploader: 'Author', downloadedAt: expect.any(String) })
    )
  })
})
