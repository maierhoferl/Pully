import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@huggingface/transformers', () => ({
  pipeline: vi.fn()
}))

global.fetch = vi.fn()

import { pipeline } from '@huggingface/transformers'
import { classifyVideo } from '../../src/main/auto-classifier.js'

beforeEach(() => vi.clearAllMocks())

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
