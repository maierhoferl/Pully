import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@huggingface/transformers', () => ({
  pipeline: vi.fn()
}))

global.fetch = vi.fn()

import { pipeline } from '@huggingface/transformers'
import { classifyVideo, _resetEmbeddingCache, fetchProviderModels } from '../../src/main/auto-classifier.js'

beforeEach(() => {
  vi.clearAllMocks()
  _resetEmbeddingCache()
})

describe('classifyVideo — Tier 1 keyword', () => {
  it('returns none when folder list is empty', async () => {
    const result = await classifyVideo({ title: 'test', uploader: '', description: '', url: '' }, [], {})
    expect(result).toEqual({ folder: null, tier: 'none' })
  })

  it('assigns folder when single token appears with clear lead', async () => {
    const video = { title: 'Guitar music practice', uploader: '', description: '', url: '' }
    const result = await classifyVideo(video, ['Music', 'Gaming'], {})
    expect(result).toEqual({ folder: 'Music', tier: 'keyword' })
  })

  it('assigns folder when multi-token folder scores >= 2', async () => {
    const video = { title: 'Homemade cooking with fresh food', uploader: '', description: '', url: '' }
    const result = await classifyVideo(video, ['Cooking and Food', 'Gaming'], {})
    expect(result).toEqual({ folder: 'Cooking and Food', tier: 'keyword' })
  })

  it('falls through keyword when tied (both score 1)', async () => {
    const mockPipe = vi.fn().mockResolvedValue({ data: new Float32Array(3).fill(0) })
    pipeline.mockResolvedValue(mockPipe)

    const video = { title: 'music gaming video', uploader: '', description: '', url: '' }
    const result = await classifyVideo(video, ['Music', 'Gaming'], {})
    expect(result).toEqual({ folder: null, tier: 'none' })
  })

  it('matches token in uploader field', async () => {
    const video = { title: 'Episode 42', uploader: 'Cooking Channel', description: '', url: '' }
    const result = await classifyVideo(video, ['Cooking', 'Travel'], {})
    expect(result).toEqual({ folder: 'Cooking', tier: 'keyword' })
  })

  it('matches token in description field', async () => {
    const video = { title: 'Weekly update', uploader: '', description: 'This week in gaming highlights', url: '' }
    const result = await classifyVideo(video, ['Gaming', 'Music'], {})
    expect(result).toEqual({ folder: 'Gaming', tier: 'keyword' })
  })
})

describe('classifyVideo — Tier 2 embedding', () => {
  it('assigns folder when cosine similarity >= 0.45', async () => {
    const mockPipe = vi.fn().mockImplementation(async (text) => ({
      data: (text.toLowerCase().includes('anime') || text.toLowerCase().includes('attack on titan'))
        ? new Float32Array([1, 0, 0])
        : new Float32Array([0.3, 0.9, 0.1])
    }))
    pipeline.mockResolvedValue(mockPipe)

    const video = { title: 'Attack on Titan S4E12', uploader: '', description: '', url: '' }
    const result = await classifyVideo(video, ['Anime', 'Music'], {})
    expect(result.tier).toBe('embedding')
    expect(result.folder).toBe('Anime')
  })

  it('skips embedding when keyword already matched', async () => {
    pipeline.mockResolvedValue(vi.fn())

    const video = { title: 'Guitar music practice', uploader: '', description: '', url: '' }
    await classifyVideo(video, ['Music', 'Gaming'], {})
    expect(pipeline).not.toHaveBeenCalled()
  })

  it('returns none when best similarity is below 0.45', async () => {
    let callCount = 0
    const mockPipe2 = vi.fn().mockImplementation(async () => {
      callCount++
      return { data: callCount === 1 ? new Float32Array([1, 0, 0]) : new Float32Array([0, 1, 0]) }
    })
    pipeline.mockResolvedValue(mockPipe2)

    const video = { title: 'Obscure content xyz', uploader: '', description: '', url: '' }
    const result = await classifyVideo(video, ['Music'], {})
    expect(result).toEqual({ folder: null, tier: 'none' })
  })
})

describe('classifyVideo — Tier 3 LLM', () => {
  beforeEach(() => {
    // Make embedding return low similarity so LLM tier is reached
    let call = 0
    const mockPipe = vi.fn().mockImplementation(async () => {
      call++
      return { data: call === 1 ? new Float32Array([1, 0, 0]) : new Float32Array([0, 1, 0]) }
    })
    pipeline.mockResolvedValue(mockPipe)
    _resetEmbeddingCache()
  })

  it('assigns folder from Claude response', async () => {
    global.fetch.mockResolvedValue({
      json: async () => ({ content: [{ text: 'Cooking' }] })
    })
    const config = { autoClassifyProvider: 'claude', autoClassifyApiKey: 'sk-test', autoClassifyModel: '' }
    const result = await classifyVideo(
      { title: 'Perfect carbonara recipe', uploader: '', description: '', url: '' },
      ['Cooking', 'Gaming'],
      config
    )
    expect(result).toEqual({ folder: 'Cooking', tier: 'llm' })
  })

  it('assigns folder from Gemini response', async () => {
    global.fetch.mockResolvedValue({
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'Gaming' }] } }] })
    })
    const config = { autoClassifyProvider: 'gemini', autoClassifyApiKey: 'key-test', autoClassifyModel: '' }
    const result = await classifyVideo(
      { title: 'Speedrun world record', uploader: '', description: '', url: '' },
      ['Cooking', 'Gaming'],
      config
    )
    expect(result).toEqual({ folder: 'Gaming', tier: 'llm' })
  })

  it('assigns folder from OpenAI response', async () => {
    global.fetch.mockResolvedValue({
      json: async () => ({ choices: [{ message: { content: 'Cooking' } }] })
    })
    const config = { autoClassifyProvider: 'openai', autoClassifyApiKey: 'sk-open', autoClassifyModel: 'gpt-5-nano' }
    const result = await classifyVideo(
      { title: 'Baking bread tutorial', uploader: '', description: '', url: '' },
      ['Cooking', 'Gaming'],
      config
    )
    expect(result).toEqual({ folder: 'Cooking', tier: 'llm' })
  })

  it('returns none when LLM responds "none"', async () => {
    global.fetch.mockResolvedValue({ json: async () => ({ content: [{ text: 'none' }] }) })
    const config = { autoClassifyProvider: 'claude', autoClassifyApiKey: 'sk-test', autoClassifyModel: '' }
    const result = await classifyVideo(
      { title: 'Unclassifiable content', uploader: '', description: '', url: '' },
      ['Cooking', 'Gaming'],
      config
    )
    expect(result).toEqual({ folder: null, tier: 'none' })
  })

  it('returns none when LLM response is not in folder list', async () => {
    global.fetch.mockResolvedValue({ json: async () => ({ content: [{ text: 'Sports' }] }) })
    const config = { autoClassifyProvider: 'claude', autoClassifyApiKey: 'sk-test', autoClassifyModel: '' }
    const result = await classifyVideo(
      { title: 'Soccer match', uploader: '', description: '', url: '' },
      ['Cooking', 'Gaming'],
      config
    )
    expect(result).toEqual({ folder: null, tier: 'none' })
  })

  it('skips LLM when provider is "local"', async () => {
    const config = { autoClassifyProvider: 'local', autoClassifyApiKey: '' }
    await classifyVideo({ title: 'test', uploader: '', description: '', url: '' }, ['Cooking'], config)
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('fetchProviderModels', () => {
  it('returns model ids from Claude', async () => {
    global.fetch.mockResolvedValue({
      json: async () => ({ data: [{ id: 'claude-haiku-4-6' }, { id: 'claude-opus-4-6' }] })
    })
    const models = await fetchProviderModels('claude', 'sk-test')
    expect(models).toEqual(['claude-haiku-4-6', 'claude-opus-4-6'])
  })

  it('returns model names from Gemini (strips "models/" prefix)', async () => {
    global.fetch.mockResolvedValue({
      json: async () => ({ models: [{ name: 'models/gemini-3.1-flash-lite' }] })
    })
    const models = await fetchProviderModels('gemini', 'key')
    expect(models).toEqual(['gemini-3.1-flash-lite'])
  })

  it('returns sorted model ids from OpenAI', async () => {
    global.fetch.mockResolvedValue({
      json: async () => ({ data: [{ id: 'gpt-5-nano' }, { id: 'gpt-4o' }] })
    })
    const models = await fetchProviderModels('openai', 'sk')
    expect(models).toEqual(['gpt-4o', 'gpt-5-nano'])
  })

  it('returns empty array on fetch failure', async () => {
    global.fetch.mockRejectedValue(new Error('network error'))
    const models = await fetchProviderModels('claude', 'sk-test')
    expect(models).toEqual([])
  })
})
