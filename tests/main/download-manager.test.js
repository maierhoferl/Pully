import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/main/ytdlp-runner.js', () => ({ startDownload: vi.fn() }))
vi.mock('../../src/main/config-store.js', () => ({
  readConfig: vi.fn(() => ({
    outputFolder: '/tmp/vids',
    maxConcurrent: 2,
    autoClassifyEnabled: false,
    autoClassifyProvider: 'local',
    autoClassifyApiKey: '',
    autoClassifyModel: '',
  }))
}))
vi.mock('../../src/main/metadata-store.js', () => ({
  writeMetadataEntry: vi.fn(),
  downloadAndStoreThumbnail: vi.fn().mockResolvedValue(undefined),
  moveMetadataEntry: vi.fn(),
}))
vi.mock('../../src/main/auto-classifier.js', () => ({
  classifyVideo: vi.fn().mockResolvedValue({ folder: null, tier: 'none' })
}))
vi.mock('../../src/main/notes-store.js', () => ({
  initChapter: vi.fn(),
  moveChapter: vi.fn(),
  writeSummarySection: vi.fn(),
}))
vi.mock('../../src/main/ai-summarizer.js', () => ({
  generateSummary: vi.fn(async () => 'Auto summary'),
}))

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    default: {
      ...actual,
      readdirSync: vi.fn(() => ['Music']),
      statSync: vi.fn(() => ({ isDirectory: () => true })),
      renameSync: vi.fn(),
    }
  }
})

import { startDownload } from '../../src/main/ytdlp-runner.js'
import { readConfig } from '../../src/main/config-store.js'
import { DownloadManager } from '../../src/main/download-manager.js'
import { writeMetadataEntry } from '../../src/main/metadata-store.js'
import { classifyVideo } from '../../src/main/auto-classifier.js'
import { moveMetadataEntry } from '../../src/main/metadata-store.js'
import { initChapter, moveChapter, writeSummarySection } from '../../src/main/notes-store.js'
import { generateSummary } from '../../src/main/ai-summarizer.js'

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

describe('auto-classify on download completion', () => {
  it('does not call classifyVideo when autoClassifyEnabled is false', async () => {
    let onDone
    startDownload.mockImplementation((url, fmt, dir, onProg, done) => { onDone = done; return { kill: vi.fn() } })
    const dm = new DownloadManager()
    dm.add('https://a.com', 'mp4', 'V1', { title: 'Guitar music', uploader: '', description: '', thumbnailUrl: null, url: '' })
    onDone('/tmp/vids/video.mp4')
    await new Promise(r => setTimeout(r, 10))
    expect(classifyVideo).not.toHaveBeenCalled()
  })

  it('calls classifyVideo and moves file when autoClassifyEnabled is true and folder matches', async () => {
    const { readConfig } = await import('../../src/main/config-store.js')
    readConfig.mockReturnValue({
      outputFolder: '/tmp/vids',
      maxConcurrent: 2,
      autoClassifyEnabled: true,
      autoClassifyProvider: 'local',
      autoClassifyApiKey: '',
      autoClassifyModel: '',
    })
    classifyVideo.mockResolvedValue({ folder: 'Music', tier: 'keyword' })

    let onDone
    startDownload.mockImplementation((url, fmt, dir, onProg, done) => { onDone = done; return { kill: vi.fn() } })
    const dm = new DownloadManager()
    dm.add('https://a.com', 'mp4', 'Guitar music', { title: 'Guitar music', uploader: '', description: '', thumbnailUrl: null, url: '' })
    onDone('/tmp/vids/guitar-music.mp4')
    await new Promise(r => setTimeout(r, 20))
    expect(classifyVideo).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Guitar music' }),
      ['Music'],
      expect.objectContaining({ autoClassifyEnabled: true })
    )
    expect(moveMetadataEntry).toHaveBeenCalled()
  })
})

describe('notes + summarize pipeline on download completion', () => {
  it('calls initChapter after successful download', () => {
    let onDone
    startDownload.mockImplementation((_u, _f, _d, _p, done) => { onDone = done; return { kill: vi.fn() } })
    readConfig.mockReturnValue({ outputFolder: '/out', maxConcurrent: 1, autoClassifyEnabled: false, autoSummarizeEnabled: false })
    const dm = new DownloadManager()
    dm.add('https://yt.com/v=1', 'mp4', 'Title', { title: 'Title', url: 'https://yt.com/v=1', thumbnailUrl: null })
    onDone('/out/Title.mp4')
    expect(initChapter).toHaveBeenCalledWith('/out/Title.mp4', expect.objectContaining({ title: 'Title' }), '/out')
  })

  it('calls generateSummary when autoSummarizeEnabled and no classify', async () => {
    let onDone
    startDownload.mockImplementation((_u, _f, _d, _p, done) => { onDone = done; return { kill: vi.fn() } })
    readConfig.mockReturnValue({ outputFolder: '/out', maxConcurrent: 1, autoClassifyEnabled: false, autoSummarizeEnabled: true, aiApiKey: 'k', aiProvider: 'gemini', aiModel: '' })
    const dm = new DownloadManager()
    dm.add('https://yt.com/v=1', 'mp4', 'Title', { title: 'Title', url: 'https://yt.com/v=1', thumbnailUrl: null })
    onDone('/out/Title.mp4')
    await new Promise(r => setTimeout(r, 20))
    expect(generateSummary).toHaveBeenCalledWith('/out/Title.mp4', expect.any(Object), expect.objectContaining({ aiProvider: 'gemini' }))
    expect(writeSummarySection).toHaveBeenCalledWith('/out/Title.mp4', 'Auto summary', '/out')
  })
})
