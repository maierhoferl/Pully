import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'

vi.mock('../../src/main/ai-client.js', () => ({
  callLLM: vi.fn(async () => 'text summary'),
  callLLMWithVideo: vi.fn(async () => 'video summary')
}))

const { callLLM, callLLMWithVideo } = await import('../../src/main/ai-client.js')
const { generateSummary } = await import('../../src/main/ai-summarizer.js')

let tmpDir
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pully-ai-test-'))
  vi.clearAllMocks()
})
afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }))

const baseConfig = {
  aiProvider: 'gemini',
  aiApiKey: 'key',
  aiModel: '',
  defaultSummaryPrompt: 'Summarize this.'
}

describe('generateSummary', () => {
  it('uses callLLMWithVideo for Gemini + YouTube URL', async () => {
    const filePath = path.join(tmpDir, 'video.mp4')
    const metadata = {
      title: 'Vid',
      url: 'https://youtube.com/watch?v=abc',
      description: 'desc',
      uploader: 'Chan'
    }
    const result = await generateSummary(filePath, metadata, baseConfig)
    expect(callLLMWithVideo).toHaveBeenCalledWith(
      'gemini',
      'key',
      '',
      'Summarize this.',
      'https://youtube.com/watch?v=abc'
    )
    expect(result).toBe('video summary')
  })

  it('uses callLLM for Claude (text path)', async () => {
    const filePath = path.join(tmpDir, 'video.mp4')
    const metadata = {
      title: 'Vid',
      url: 'https://youtube.com/watch?v=abc',
      description: 'desc',
      uploader: 'Chan'
    }
    const result = await generateSummary(filePath, metadata, {
      ...baseConfig,
      aiProvider: 'claude'
    })
    expect(callLLM).toHaveBeenCalled()
    expect(result).toBe('text summary')
  })

  it('uses callLLM for Gemini with non-YouTube URL', async () => {
    const filePath = path.join(tmpDir, 'video.mp4')
    const metadata = {
      title: 'Vid',
      url: 'https://vimeo.com/123',
      description: 'desc',
      uploader: 'Chan'
    }
    await generateSummary(filePath, metadata, baseConfig)
    expect(callLLM).toHaveBeenCalled()
    expect(callLLMWithVideo).not.toHaveBeenCalled()
  })

  it('uses custom summary-prompt.md when present in folder', async () => {
    const filePath = path.join(tmpDir, 'video.mp4')
    fs.writeFileSync(path.join(tmpDir, 'summary-prompt.md'), 'Custom prompt text.')
    const metadata = { title: 'Vid', url: '', description: '', uploader: '' }
    await generateSummary(filePath, metadata, baseConfig)
    const callArgs = callLLM.mock.calls[0]
    expect(callArgs[3][0].content).toContain('Custom prompt text.')
  })

  it('falls back to defaultSummaryPrompt when no summary-prompt.md', async () => {
    const filePath = path.join(tmpDir, 'video.mp4')
    const metadata = { title: 'Vid', url: '', description: '', uploader: '' }
    await generateSummary(filePath, metadata, baseConfig)
    const callArgs = callLLM.mock.calls[0]
    expect(callArgs[3][0].content).toContain('Summarize this.')
  })

  it('uses callLLM for Gemini + YouTube URL when page content is present', async () => {
    const filePath = path.join(tmpDir, 'page.ref')
    const metadata = {
      title: 'Page Title',
      url: 'https://example.com',
      description: 'desc',
      uploader: 'Site',
      page: 'Extracted page content here'
    }
    await generateSummary(filePath, metadata, baseConfig)
    expect(callLLM).toHaveBeenCalled()
    const callArgs = callLLM.mock.calls[0]
    expect(callArgs[3][0].content).toContain('Extracted page content here')
  })
})
