import { pipeline as hfPipeline } from '@huggingface/transformers'

let embeddingPipeline = null

// --- Tier 1: Keyword matching ---

function tokenize(str) {
  return str.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t.length > 1)
}

function classifyByKeyword(videoEntry, folderNames) {
  const blob = [
    videoEntry.title || '',
    videoEntry.uploader || '',
    (videoEntry.description || '').slice(0, 300),
    videoEntry.url || ''
  ].join(' ').toLowerCase()

  const scores = folderNames
    .map(name => ({ folder: name, score: tokenize(name).filter(token => blob.includes(token)).length }))
    .sort((a, b) => b.score - a.score)

  if (!scores.length) return null
  const [best, second] = scores
  if (best.score >= 2) return best.folder
  if (best.score >= 1 && (!second || second.score === 0 || best.score >= second.score * 2)) return best.folder
  return null
}

// --- Tier 2: Embedding similarity (stub — filled in Task 3) ---

async function classifyByEmbedding(videoEntry, folderNames) {
  return null
}

// --- Tier 3: LLM (stub — filled in Task 4) ---

async function classifyByLLM(videoEntry, folderNames, config) {
  return null
}

// --- Public API ---

export async function classifyVideo(videoEntry, folderNames, config = {}) {
  if (!folderNames || folderNames.length === 0) return { folder: null, tier: 'none' }

  const keyword = classifyByKeyword(videoEntry, folderNames)
  if (keyword) return { folder: keyword, tier: 'keyword' }

  try {
    const embedding = await classifyByEmbedding(videoEntry, folderNames)
    if (embedding) return { folder: embedding, tier: 'embedding' }
  } catch { /* fall through */ }

  if (config.autoClassifyProvider && config.autoClassifyProvider !== 'local' && config.autoClassifyApiKey) {
    try {
      const llm = await classifyByLLM(videoEntry, folderNames, config)
      if (llm) return { folder: llm, tier: 'llm' }
    } catch { /* fall through */ }
  }

  return { folder: null, tier: 'none' }
}

export async function fetchProviderModels(provider, apiKey) {
  return []
}
