import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'events'

vi.mock('child_process', () => ({ spawn: vi.fn() }))

import { spawn } from 'child_process'
import { extractInfo, startDownload } from '../../src/main/ytdlp-runner.js'

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
    startDownload('https://x.com', 'mp4', '/out', onProgress, onDone, onError, '/bin/yt-dlp')
    return new Promise(r => setTimeout(() => {
      expect(onProgress).toHaveBeenCalledWith({ percent: 45.3, speed: '1.23MiB/s', eta: '00:05' })
      expect(onDone).toHaveBeenCalled()
      r()
    }, 50))
  })

  it('calls onError on non-zero exit', () => {
    spawn.mockReturnValue(mockProc('', 1))
    const onProgress = vi.fn(), onDone = vi.fn(), onError = vi.fn()
    startDownload('https://x.com', 'mp4', '/out', onProgress, onDone, onError, '/bin/yt-dlp')
    return new Promise(r => setTimeout(() => {
      expect(onError).toHaveBeenCalled()
      expect(onDone).not.toHaveBeenCalled()
      r()
    }, 50))
  })
})
