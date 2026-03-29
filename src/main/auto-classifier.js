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

  if (!scores.length) {
    logger.info('classify', `Tier 1 (keyword): no folders to classify`, {
      tier: 'keyword',
      decision: 'no_folders'
    })
    return null
  }
  const [best, second] = scores

  // Log all candidate scores for debugging
  logger.info('classify', `Tier 1 (keyword) scores`, {
    tier: 'keyword',
    candidates: scores.slice(0, 5).map(s => `${s.folder}:${s.score}`).join(', ')
  })

  if (best.score >= 2) {
    logger.info('classify', `Tier 1 (keyword) match: score >= 2`, {
      tier: 'keyword',
      decision: 'match',
      folder: best.folder,
      score: best.score
    })
    return best.folder
  }
  if (best.score >= 1 && (!second || second.score === 0 || best.score >= second.score * 2)) {
    logger.info('classify', `Tier 1 (keyword) match: unambiguous`, {
      tier: 'keyword',
      decision: 'match',
      folder: best.folder,
      score: best.score,
      secondScore: second?.score || 0
    })
    return best.folder
  }
  logger.info('classify', `Tier 1 (keyword) no match`, {
    tier: 'keyword',
    decision: 'no_match',
    bestScore: best.score,
    secondScore: second?.score || 0
  })
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
  const similarities = []
  for (const folder of folderNames) {
    const out = await pipe(folder, { pooling: 'mean', normalize: true })
    const sim = cosineSimilarity(videoVec, Array.from(out.data))
    similarities.push({ folder, similarity: sim })
    if (sim > bestSim) { bestSim = sim; bestFolder = folder }
  }

  // Log similarity scores
  similarities.sort((a, b) => b.similarity - a.similarity)
  logger.info('classify', `Tier 2 (embedding) scores`, {
    tier: 'embedding',
    topScores: similarities.slice(0, 3).map(s => `${s.folder}:${s.similarity.toFixed(3)}`).join(', ')
  })

  if (bestSim >= 0.45) {
    logger.info('classify', `Tier 2 (embedding) match: score >= 0.45`, {
      tier: 'embedding',
      decision: 'match',
      folder: bestFolder,
      similarity: bestSim.toFixed(3)
    })
    return bestFolder
  }

  logger.info('classify', `Tier 2 (embedding) no match`, {
    tier: 'embedding',
    decision: 'no_match',
    topSimilarity: bestSim.toFixed(3)
  })
  return null
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

  logger.info('classify', `Tier 3 (LLM) started`, {
    tier: 'llm',
    provider: autoClassifyProvider,
    model: model
  })

  let raw = null
  try {
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

    logger.info('classify', `Tier 3 (LLM) response received`, {
      tier: 'llm',
      promptPreview: prompt.slice(0, 100),
      response: raw ? raw.slice(0, 100) : 'empty'
    })

    if (!raw || raw.toLowerCase() === 'none') {
      logger.info('classify', `Tier 3 (LLM) no match`, {
        tier: 'llm',
        decision: 'no_match',
        response: raw || 'empty'
      })
      return null
    }
    const matched = folderNames.find(f => f.toLowerCase() === raw.toLowerCase())
    if (matched) {
      logger.info('classify', `Tier 3 (LLM) match`, {
        tier: 'llm',
        decision: 'match',
        response: raw,
        folder: matched
      })
    } else {
      logger.info('classify', `Tier 3 (LLM) invalid response`, {
        tier: 'llm',
        decision: 'invalid',
        response: raw,
        validFolders: folderNames.join(', ')
      })
    }
    return matched || null
  } catch (err) {
    logger.error('classify', `Tier 3 (LLM) error`, {
      tier: 'llm',
      error: err.message
    })
    throw err
  }
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
  } catch (err) {
    logger.error('classify', `Tier 2 (embedding) error: ${err.message}`, {
      tier: 'embedding',
      error: err.message
    })
  }

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
    } catch (err) {
      logger.error('classify', `Tier 3 (LLM) error: ${err.message}`, {
        tier: 'llm',
        error: err.message
      })
    }
  } else if (config.autoClassifyProvider) {
    logger.info('classify', `Tier 3 (LLM) skipped`, {
      tier: 'llm',
      reason: config.autoClassifyProvider === 'local' ? 'provider_is_local' : 'no_api_key'
    })
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
