import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFetch = vi.fn()
global.fetch = mockFetch

const { callLLM, callLLMWithVideo, fetchProviderModels } = await import('../../src/main/ai-client.js')

beforeEach(() => vi.clearAllMocks())

describe('callLLM - gemini', () => {
  it('calls Gemini REST endpoint and returns text', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'Summary text' }] } }] }),
    })
    const result = await callLLM('gemini', 'key123', 'gemini-2.0-flash', [{ role: 'user', content: 'Summarize' }])
    expect(result).toBe('Summary text')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('generativelanguage.googleapis.com'),
      expect.objectContaining({ method: 'POST' })
    )
  })
})

describe('callLLM - claude', () => {
  it('calls Anthropic messages endpoint and returns text', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ content: [{ text: 'Claude summary' }] }),
    })
    const result = await callLLM('claude', 'key456', 'claude-haiku-4-6', [{ role: 'user', content: 'Summarize' }])
    expect(result).toBe('Claude summary')
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({ method: 'POST' })
    )
  })
})

describe('callLLM - openai', () => {
  it('calls OpenAI chat completions endpoint and returns text', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'OpenAI summary' } }] }),
    })
    const result = await callLLM('openai', 'key789', 'gpt-4o-mini', [{ role: 'user', content: 'Summarize' }])
    expect(result).toBe('OpenAI summary')
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.objectContaining({ method: 'POST' })
    )
  })
})

describe('callLLMWithVideo', () => {
  it('calls Gemini with fileData part for YouTube URL', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'Video summary' }] } }] }),
    })
    const result = await callLLMWithVideo('gemini', 'key', 'gemini-2.0-flash', 'Summarize', 'https://youtube.com/watch?v=abc')
    expect(result).toBe('Video summary')
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.contents[0].parts[0]).toMatchObject({ fileData: { fileUri: 'https://youtube.com/watch?v=abc' } })
  })

  it('falls back to callLLM for non-Gemini providers', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ content: [{ text: 'fallback' }] }),
    })
    const result = await callLLMWithVideo('claude', 'key', 'claude-haiku-4-6', 'Summarize', 'https://youtube.com/watch?v=abc')
    expect(result).toBe('fallback')
  })
})

describe('fetchProviderModels', () => {
  it('returns model names for Gemini', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        models: [
          { name: 'models/gemini-2.0-flash', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/embedding-001', supportedGenerationMethods: ['embedContent'] },
        ]
      }),
    })
    const models = await fetchProviderModels('gemini', 'key')
    expect(models).toContain('gemini-2.0-flash')
    expect(models).not.toContain('embedding-001')
  })
})
