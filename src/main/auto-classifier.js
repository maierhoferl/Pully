import logger from './logger.js'

let embeddingPipeline = null
let _hfPipeline = null

async function getHfPipelineFn() {
  if (!_hfPipeline) {
    const mod = await import('@huggingface/transformers')
    _hfPipeline = mod.pipeline
  }
  return _hfPipeline
}

// --- Tier 1: Keyword matching ---

function tokenize(str) {
  return str.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t.length > 1)
}

function classifyByKeyword(videoEntry, folderNames) {
  const blob = [
    videoEntry.title || '',
    videoEntry.uploader || '',
    videoEntry.description || '',
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

// --- Tier 2: Embedding similarity ---

function cosineSimilarity(a, b) {
  let dot = 0, magA = 0, magB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    magA += a[i] * a[i]
    magB += b[i] * b[i]
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB)
  return denom === 0 ? 0 : dot / denom
}

async function getEmbeddingPipeline() {
  if (!embeddingPipeline) {
    const pipelineFn = await getHfPipelineFn()
    embeddingPipeline = await pipelineFn('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { device: 'cpu' })
  }
  return embeddingPipeline
}

async function classifyByEmbedding(videoEntry, folderNames) {
  const pipe = await getEmbeddingPipeline()
  const videoText = `${videoEntry.title || ''} by ${videoEntry.uploader || ''}. ${videoEntry.description || ''}`
  const videoOutput = await pipe(videoText, { pooling: 'mean', normalize: true })
  const videoVec = Array.from(videoOutput.data)

  let bestFolder = null
  let bestSim = -1
  for (const folder of folderNames) {
    const out = await pipe(folder, { pooling: 'mean', normalize: true })
    const sim = cosineSimilarity(videoVec, Array.from(out.data))
    if (sim > bestSim) { bestSim = sim; bestFolder = folder }
  }

  return bestSim >= 0.45 ? bestFolder : null
}

// --- Tier 3: LLM classification ---

const DEFAULT_MODELS = {
  claude: 'claude-haiku-4-6',
  gemini: 'gemini-3.1-flash-lite',
  openai: 'gpt-5-nano',
}

function buildLLMPrompt(videoEntry, folderNames) {
  const desc = videoEntry.description ? '. Description: ' + videoEntry.description : ''
  return `Folders: ${folderNames.join(', ')}\nVideo: "${videoEntry.title || ''}" by "${videoEntry.uploader || ''}"${desc}\nReply with exactly one folder name from the list, or "none".`
}

async function classifyByLLM(videoEntry, folderNames, config) {
  const { autoClassifyProvider, autoClassifyApiKey, autoClassifyModel } = config
  const model = autoClassifyModel || DEFAULT_MODELS[autoClassifyProvider]
  const prompt = buildLLMPrompt(videoEntry, folderNames)

  let raw = null
  if (autoClassifyProvider === 'claude') {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': autoClassifyApiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: 50, messages: [{ role: 'user', content: prompt }] })
    })
    const data = await resp.json()
    raw = data.content?.[0]?.text?.trim() || null
  } else if (autoClassifyProvider === 'gemini') {
    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${autoClassifyApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    })
    const data = await resp.json()
    raw = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null
  } else if (autoClassifyProvider === 'openai') {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${autoClassifyApiKey}` },
      body: JSON.stringify({ model, max_tokens: 50, messages: [{ role: 'user', content: prompt }] })
    })
    const data = await resp.json()
    raw = data.choices?.[0]?.message?.content?.trim() || null
  }

  if (!raw || raw.toLowerCase() === 'none') return null
  return folderNames.find(f => f.toLowerCase() === raw.toLowerCase()) || null
}

// --- Public API ---

export async function classifyVideo(videoEntry, folderNames, config = {}) {
  logger.info('classify', `Started: ${videoEntry.filename}`, {
    filename: videoEntry.filename
  })

  if (!folderNames || folderNames.length === 0) return { folder: null, tier: 'none' }

  const keyword = classifyByKeyword(videoEntry, folderNames)
  if (keyword) {
    logger.info('classify', `Classified by keyword: ${videoEntry.filename}`, {
      filename: videoEntry.filename,
      tier: 'keyword',
      folder: keyword
    })
    return { folder: keyword, tier: 'keyword' }
  }

  try {
    const embedding = await classifyByEmbedding(videoEntry, folderNames)
    if (embedding) {
      const pipe = await getEmbeddingPipeline()
      const videoText = `${videoEntry.title || ''} by ${videoEntry.uploader || ''}. ${videoEntry.description || ''}`
      const videoOutput = await pipe(videoText, { pooling: 'mean', normalize: true })
      const videoVec = Array.from(videoOutput.data)
      const out = await pipe(embedding, { pooling: 'mean', normalize: true })
      const similarity = cosineSimilarity(videoVec, Array.from(out.data))

      logger.info('classify', `Classified by embedding: ${videoEntry.filename}`, {
        filename: videoEntry.filename,
        tier: 'embedding',
        folder: embedding,
        similarity: similarity.toFixed(3)
      })
      return { folder: embedding, tier: 'embedding' }
    }
  } catch { /* fall through */ }

  if (config.autoClassifyProvider && config.autoClassifyProvider !== 'local' && config.autoClassifyApiKey) {
    try {
      const llm = await classifyByLLM(videoEntry, folderNames, config)
      if (llm) {
        logger.info('classify', `Classified by LLM: ${videoEntry.filename}`, {
          filename: videoEntry.filename,
          tier: 'llm',
          folder: llm,
          provider: config.autoClassifyProvider
        })
        return { folder: llm, tier: 'llm' }
      }
    } catch { /* fall through */ }
  }

  logger.info('classify', `No classification: ${videoEntry.filename}`, {
    filename: videoEntry.filename,
    folder: 'none'
  })
  return { folder: null, tier: 'none' }
}

// Allows tests to reset the cached pipeline between test suites
export function _resetEmbeddingCache() { embeddingPipeline = null }

export async function fetchProviderModels(provider, apiKey) {
  try {
    if (provider === 'claude') {
      const resp = await fetch('https://api.anthropic.com/v1/models', {
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
      })
      const data = await resp.json()
      return (data.data || []).map(m => m.id)
    }
    if (provider === 'gemini') {
      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`)
      const data = await resp.json()
      return (data.models || []).map(m => m.name.replace('models/', ''))
    }
    if (provider === 'openai') {
      const resp = await fetch('https://api.openai.com/v1/models', {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      })
      const data = await resp.json()
      return (data.data || []).map(m => m.id).sort()
    }
  } catch { /* network error */ }
  return []
}
