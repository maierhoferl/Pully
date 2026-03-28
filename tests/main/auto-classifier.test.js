import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@huggingface/transformers', () => ({
  pipeline: vi.fn()
}))

global.fetch = vi.fn()

import { pipeline } from '@huggingface/transformers'
import { classifyVideo, _resetEmbeddingCache } from '../../src/main/auto-classifier.js'

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
