import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'events'

vi.mock('child_process', () => ({ spawn: vi.fn() }))

import { spawn } from 'child_process'
import { extractInfo, startDownload, getDefaultBinaryPath, getDefaultFfmpegPath } from '../../src/main/ytdlp-runner.js'

function mockProc(stdout, exitCode = 0) {
  const p = new EventEmitter()
  p.stdout = new EventEmitter()
  p.stderr = new EventEmitter()
  p.kill = vi.fn()
  setTimeout(() => {
    if (stdout) p.stdout.emit('data', Buffer.from(stdout))
    p.emit('close', exitCode)
  }, 0)
  return p
}

beforeEach(() => vi.clearAllMocks())

describe('getDefaultBinaryPath', () => {
  it('returns yt-dlp.exe on win32', () => {
    const orig = Object.getOwnPropertyDescriptor(process, 'platform')
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
    expect(getDefaultBinaryPath()).toMatch(/yt-dlp\.exe$/)
    Object.defineProperty(process, 'platform', orig)
  })

  it('returns yt-dlp (no .exe) on darwin', () => {
    const orig = Object.getOwnPropertyDescriptor(process, 'platform')
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
    const p = getDefaultBinaryPath()
    expect(p).toMatch(/yt-dlp$/)
    expect(p).not.toMatch(/\.exe$/)
    Object.defineProperty(process, 'platform', orig)
  })

  it('returns yt-dlp (no .exe) on linux', () => {
    const orig = Object.getOwnPropertyDescriptor(process, 'platform')
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true })
    const p = getDefaultBinaryPath()
    expect(p).toMatch(/yt-dlp$/)
    expect(p).not.toMatch(/\.exe$/)
    Object.defineProperty(process, 'platform', orig)
  })
})

describe('getDefaultFfmpegPath', () => {
  it('returns ffmpeg.exe on win32', () => {
    const orig = Object.getOwnPropertyDescriptor(process, 'platform')
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
    expect(getDefaultFfmpegPath()).toMatch(/ffmpeg\.exe$/)
    Object.defineProperty(process, 'platform', orig)
  })

  it('returns ffmpeg (no .exe) on darwin', () => {
    const orig = Object.getOwnPropertyDescriptor(process, 'platform')
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
    const p = getDefaultFfmpegPath()
    expect(p).toMatch(/ffmpeg$/)
    expect(p).not.toMatch(/\.exe$/)
    Object.defineProperty(process, 'platform', orig)
  })
})

describe('extractInfo', () => {
  it('parses JSON lines into entries', async () => {
    const entry = { id: 'abc', title: 'Test', formats: [] }
    spawn.mockReturnValue(mockProc(JSON.stringify(entry) + '\n'))
    const results = await extractInfo('https://example.com', '/bin/yt-dlp')
    expect(results).toHaveLength(1)
    expect(results[0].title).toBe('Test')
  })

  it('returns [] on non-zero exit', async () => {
    spawn.mockReturnValue(mockProc('', 1))
    expect(await extractInfo('https://example.com', '/bin/yt-dlp')).toEqual([])
  })

  it('returns [] on malformed JSON', async () => {
    spawn.mockReturnValue(mockProc('not json\n'))
    expect(await extractInfo('https://example.com', '/bin/yt-dlp')).toEqual([])
  })
})

describe('startDownload', () => {
  it('parses progress and calls onProgress', () => {
    spawn.mockReturnValue(mockProc('[download]  45.3% of 10.00MiB at 1.23MiB/s ETA 00:05\n'))
    const onProgress = vi.fn(), onDone = vi.fn(), onError = vi.fn()
    startDownload('https://x.com', 'mp4', '/out', onProgress, onDone, onError, '/bin/yt-dlp', '/bin/ffmpeg')
    return new Promise(r => setTimeout(() => {
      expect(onProgress).toHaveBeenCalledWith({ percent: 45.3, speed: '1.23MiB/s', eta: '00:05' })
      expect(onDone).toHaveBeenCalled()
      r()
    }, 50))
  })

  it('calls onError on non-zero exit', () => {
    spawn.mockReturnValue(mockProc('', 1))
    const onProgress = vi.fn(), onDone = vi.fn(), onError = vi.fn()
    startDownload('https://x.com', 'mp4', '/out', onProgress, onDone, onError, '/bin/yt-dlp', '/bin/ffmpeg')
    return new Promise(r => setTimeout(() => {
      expect(onError).toHaveBeenCalled()
      expect(onDone).not.toHaveBeenCalled()
      r()
    }, 50))
  })

  it('passes actual output path to onDone', () => {
    spawn.mockReturnValue(mockProc(
      '[download]  100% of 10.00MiB at 1.23MiB/s ETA 00:00\n/out/My Video.mp4\n'
    ))
    const onDone = vi.fn()
    startDownload('https://x.com', 'mp4', '/out', vi.fn(), onDone, vi.fn(), '/bin/yt-dlp', '/bin/ffmpeg')
    return new Promise(r => setTimeout(() => {
      expect(onDone).toHaveBeenCalledWith('/out/My Video.mp4')
      r()
    }, 50))
  })

  it('passes null path to onDone when no path line in output', () => {
    spawn.mockReturnValue(mockProc('[download]  100% of 10.00MiB at 1.23MiB/s ETA 00:00\n'))
    const onDone = vi.fn()
    startDownload('https://x.com', 'mp4', '/out', vi.fn(), onDone, vi.fn(), '/bin/yt-dlp', '/bin/ffmpeg')
    return new Promise(r => setTimeout(() => {
      expect(onDone).toHaveBeenCalledWith(null)
      r()
    }, 50))
  })
})
