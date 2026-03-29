# Auto-Classification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 3-tier hybrid auto-classification feature that automatically moves downloaded videos into matching library folders.

**Architecture:** A new `auto-classifier.js` main-process module runs Tier 1 keyword matching, Tier 2 semantic embeddings via `@huggingface/transformers` (`all-MiniLM-L6-v2`), and Tier 3 cloud LLM (Claude/Gemini/OpenAI) in sequence, stopping at the first confident result. Classification fires after each download (opt-in) and on demand via a Library toolbar button.

**Tech Stack:** `@huggingface/transformers` v3 (ONNX CPU, lazy-loaded), native `fetch` for LLM APIs, Vitest for tests, React state for UI, Zustand config flow (already in place).

---

## File Map

| Action | Path                                             |
| ------ | ------------------------------------------------ |
| Create | `src/main/auto-classifier.js`                    |
| Create | `tests/main/auto-classifier.test.js`             |
| Modify | `src/main/config-store.js`                       |
| Modify | `tests/main/config-store.test.js`                |
| Modify | `src/main/ipc-handlers.js`                       |
| Modify | `src/main/download-manager.js`                   |
| Modify | `tests/main/download-manager.test.js`            |
| Modify | `src/preload/index.js`                           |
| Modify | `src/renderer/src/components/SettingsPanel.jsx`  |
| Modify | `src/renderer/src/components/LibraryToolbar.jsx` |
| Modify | `src/renderer/src/components/LibraryTab.jsx`     |
| Modify | `electron-builder.yml`                           |
| Modify | `package.json`                                   |

---

## Task 1: Install `@huggingface/transformers`

**Files:**

- Modify: `package.json`
- Modify: `electron-builder.yml`

- [ ] **Step 1: Add dependency and install**

Run:

```bash
npm install @huggingface/transformers
```

Expected: package added to `dependencies` in `package.json`, `node_modules/@huggingface/transformers` exists.

- [ ] **Step 2: Add asarUnpack for onnx native binaries**

In `electron-builder.yml`, add after the `files:` block:

```yaml
asarUnpack:
  - 'node_modules/@huggingface/transformers/**'
  - 'node_modules/onnxruntime-node/**'
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json electron-builder.yml
git commit -m "chore: add @huggingface/transformers for local video classification"
```

---

## Task 2: `auto-classifier.js` — Tier 1 keyword matching

**Files:**

- Create: `src/main/auto-classifier.js`
- Create: `tests/main/auto-classifier.test.js`

- [ ] **Step 1: Write failing tests for keyword tier**

Create `tests/main/auto-classifier.test.js`:

```javascript
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
    const result = await classifyVideo(
      { title: 'test', uploader: '', description: '', url: '' },
      [],
      {}
    )
    expect(result).toEqual({ folder: null, tier: 'none' })
  })

  it('assigns folder when single token appears with clear lead', async () => {
    // "Music" → token "music" matches in title; "Gaming" → token "gaming" absent
    const video = { title: 'Guitar music practice', uploader: '', description: '', url: '' }
    const result = await classifyVideo(video, ['Music', 'Gaming'], {})
    expect(result).toEqual({ folder: 'Music', tier: 'keyword' })
  })

  it('assigns folder when multi-token folder scores >= 2', async () => {
    // "Cooking and Food" → tokens ["cooking","food"] both match title
    const video = {
      title: 'Homemade cooking with fresh food',
      uploader: '',
      description: '',
      url: ''
    }
    const result = await classifyVideo(video, ['Cooking and Food', 'Gaming'], {})
    expect(result).toEqual({ folder: 'Cooking and Food', tier: 'keyword' })
  })

  it('falls through keyword when tied (both score 1)', async () => {
    // Both "Music" and "Gaming" each have 1 token hit — tie, no clear lead
    // Mock embedding to return zero vectors so embedding also misses
    const mockPipe = vi.fn().mockResolvedValue({ data: new Float32Array(3).fill(0) })
    pipeline.mockResolvedValue(mockPipe)

    const video = { title: 'music gaming video', uploader: '', description: '', url: '' }
    const result = await classifyVideo(video, ['Music', 'Gaming'], {})
    // keyword: tied (no assignment), embedding: cosine(zeros, zeros) = NaN < 0.45, no LLM
    expect(result).toEqual({ folder: null, tier: 'none' })
  })

  it('matches token in uploader field', async () => {
    const video = { title: 'Episode 42', uploader: 'Cooking Channel', description: '', url: '' }
    const result = await classifyVideo(video, ['Cooking', 'Travel'], {})
    expect(result).toEqual({ folder: 'Cooking', tier: 'keyword' })
  })

  it('matches token in description field', async () => {
    const video = {
      title: 'Weekly update',
      uploader: '',
      description: 'This week in gaming highlights',
      url: ''
    }
    const result = await classifyVideo(video, ['Gaming', 'Music'], {})
    expect(result).toEqual({ folder: 'Gaming', tier: 'keyword' })
  })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run tests/main/auto-classifier.test.js
```

Expected: FAIL — `Cannot find module '../../src/main/auto-classifier.js'`

- [ ] **Step 3: Create `src/main/auto-classifier.js` with Tier 1 only**

```javascript
// src/main/auto-classifier.js
import { pipeline as hfPipeline } from '@huggingface/transformers'

let embeddingPipeline = null

// --- Tier 1: Keyword matching ---

function tokenize(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1)
}

function classifyByKeyword(videoEntry, folderNames) {
  const blob = [
    videoEntry.title || '',
    videoEntry.uploader || '',
    (videoEntry.description || '').slice(0, 300),
    videoEntry.url || ''
  ]
    .join(' ')
    .toLowerCase()

  const scores = folderNames
    .map((name) => ({
      folder: name,
      score: tokenize(name).filter((token) => blob.includes(token)).length
    }))
    .sort((a, b) => b.score - a.score)

  if (!scores.length) return null
  const [best, second] = scores
  if (best.score >= 2) return best.folder
  if (best.score >= 1 && (!second || second.score === 0 || best.score >= second.score * 2))
    return best.folder
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
  } catch {
    /* fall through */
  }

  if (
    config.autoClassifyProvider &&
    config.autoClassifyProvider !== 'local' &&
    config.autoClassifyApiKey
  ) {
    try {
      const llm = await classifyByLLM(videoEntry, folderNames, config)
      if (llm) return { folder: llm, tier: 'llm' }
    } catch {
      /* fall through */
    }
  }

  return { folder: null, tier: 'none' }
}

export async function fetchProviderModels(provider, apiKey) {
  return []
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/main/auto-classifier.test.js
```

Expected: All 6 keyword tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/auto-classifier.js tests/main/auto-classifier.test.js
git commit -m "feat: add auto-classifier Tier 1 keyword matching"
```

---

## Task 3: `auto-classifier.js` — Tier 2 embedding similarity

**Files:**

- Modify: `src/main/auto-classifier.js`
- Modify: `tests/main/auto-classifier.test.js`

- [ ] **Step 1: Add failing embedding tests**

Append to `tests/main/auto-classifier.test.js`:

```javascript
describe('classifyVideo — Tier 2 embedding', () => {
  it('assigns folder when cosine similarity >= 0.45', async () => {
    // No keyword match: "Anime" has no tokens in title "Attack on Titan S4E12"
    // Mock pipeline to return high similarity for "Anime", low for "Music"
    const mockPipe = vi.fn().mockImplementation(async (text) => ({
      data: text.toLowerCase().includes('anime')
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
    // Keyword matches, so pipeline should never be called
    pipeline.mockResolvedValue(vi.fn())

    const video = { title: 'Guitar music practice', uploader: '', description: '', url: '' }
    await classifyVideo(video, ['Music', 'Gaming'], {})
    expect(pipeline).not.toHaveBeenCalled()
  })

  it('returns none when best similarity is below 0.45', async () => {
    const mockPipe = vi.fn().mockResolvedValue({ data: new Float32Array([1, 0, 0]) })
    pipeline.mockResolvedValue(mockPipe)

    // All embeddings identical → cosine sim = 1.0... but wait that would PASS
    // Use different vectors with low similarity
    let callCount = 0
    const mockPipe2 = vi.fn().mockImplementation(async () => {
      callCount++
      // video: [1,0,0], folders: [0,1,0] — cosine sim = 0 < 0.45
      return { data: callCount === 1 ? new Float32Array([1, 0, 0]) : new Float32Array([0, 1, 0]) }
    })
    pipeline.mockResolvedValue(mockPipe2)

    const video = { title: 'Obscure content xyz', uploader: '', description: '', url: '' }
    const result = await classifyVideo(video, ['Music'], {})
    expect(result).toEqual({ folder: null, tier: 'none' })
  })
})
```

- [ ] **Step 2: Run to see tests fail**

```bash
npx vitest run tests/main/auto-classifier.test.js
```

Expected: embedding tests FAIL (current `classifyByEmbedding` returns null always).

- [ ] **Step 3: Implement Tier 2 in `src/main/auto-classifier.js`**

Replace the `classifyByEmbedding` stub function:

```javascript
function cosineSimilarity(a, b) {
  let dot = 0,
    magA = 0,
    magB = 0
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
    embeddingPipeline = await hfPipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
      device: 'cpu'
    })
  }
  return embeddingPipeline
}

async function classifyByEmbedding(videoEntry, folderNames) {
  const pipe = await getEmbeddingPipeline()
  const videoText = `${videoEntry.title || ''} by ${videoEntry.uploader || ''}. ${(videoEntry.description || '').slice(0, 200)}`
  const videoOutput = await pipe(videoText, { pooling: 'mean', normalize: true })
  const videoVec = Array.from(videoOutput.data)

  let bestFolder = null
  let bestSim = -1
  for (const folder of folderNames) {
    const out = await pipe(folder, { pooling: 'mean', normalize: true })
    const sim = cosineSimilarity(videoVec, Array.from(out.data))
    if (sim > bestSim) {
      bestSim = sim
      bestFolder = folder
    }
  }

  return bestSim >= 0.45 ? bestFolder : null
}
```

Also add a test-only reset export at the bottom of the file (before `fetchProviderModels`):

```javascript
// Allows tests to reset the cached pipeline between test suites
export function _resetEmbeddingCache() {
  embeddingPipeline = null
}
```

In the test file, replace the existing `import { classifyVideo } from ...` line and the existing `beforeEach` with:

```javascript
import { classifyVideo, _resetEmbeddingCache } from '../../src/main/auto-classifier.js'

beforeEach(() => {
  vi.clearAllMocks()
  _resetEmbeddingCache()
})
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/main/auto-classifier.test.js
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/auto-classifier.js tests/main/auto-classifier.test.js
git commit -m "feat: add auto-classifier Tier 2 semantic embedding similarity"
```

---

## Task 4: `auto-classifier.js` — Tier 3 LLM + `fetchProviderModels`

**Files:**

- Modify: `src/main/auto-classifier.js`
- Modify: `tests/main/auto-classifier.test.js`

- [ ] **Step 1: Add failing LLM and fetchProviderModels tests**

Append to `tests/main/auto-classifier.test.js`:

```javascript
import { fetchProviderModels } from '../../src/main/auto-classifier.js'

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
    const config = {
      autoClassifyProvider: 'claude',
      autoClassifyApiKey: 'sk-test',
      autoClassifyModel: ''
    }
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
    const config = {
      autoClassifyProvider: 'gemini',
      autoClassifyApiKey: 'key-test',
      autoClassifyModel: ''
    }
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
    const config = {
      autoClassifyProvider: 'openai',
      autoClassifyApiKey: 'sk-open',
      autoClassifyModel: 'gpt-5-nano'
    }
    const result = await classifyVideo(
      { title: 'Baking bread tutorial', uploader: '', description: '', url: '' },
      ['Cooking', 'Gaming'],
      config
    )
    expect(result).toEqual({ folder: 'Cooking', tier: 'llm' })
  })

  it('returns none when LLM responds "none"', async () => {
    global.fetch.mockResolvedValue({ json: async () => ({ content: [{ text: 'none' }] }) })
    const config = {
      autoClassifyProvider: 'claude',
      autoClassifyApiKey: 'sk-test',
      autoClassifyModel: ''
    }
    const result = await classifyVideo(
      { title: 'Unclassifiable content', uploader: '', description: '', url: '' },
      ['Cooking', 'Gaming'],
      config
    )
    expect(result).toEqual({ folder: null, tier: 'none' })
  })

  it('returns none when LLM response is not in folder list', async () => {
    global.fetch.mockResolvedValue({ json: async () => ({ content: [{ text: 'Sports' }] }) })
    const config = {
      autoClassifyProvider: 'claude',
      autoClassifyApiKey: 'sk-test',
      autoClassifyModel: ''
    }
    const result = await classifyVideo(
      { title: 'Soccer match', uploader: '', description: '', url: '' },
      ['Cooking', 'Gaming'],
      config
    )
    expect(result).toEqual({ folder: null, tier: 'none' })
  })

  it('skips LLM when provider is "local"', async () => {
    const config = { autoClassifyProvider: 'local', autoClassifyApiKey: '' }
    await classifyVideo(
      { title: 'test', uploader: '', description: '', url: '' },
      ['Cooking'],
      config
    )
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
```

- [ ] **Step 2: Run to see tests fail**

```bash
npx vitest run tests/main/auto-classifier.test.js
```

Expected: LLM and fetchProviderModels tests FAIL.

- [ ] **Step 3: Implement Tier 3 and `fetchProviderModels` in `src/main/auto-classifier.js`**

Add these constants and functions before the `classifyVideo` export:

```javascript
const DEFAULT_MODELS = {
  claude: 'claude-haiku-4-6',
  gemini: 'gemini-3.1-flash-lite',
  openai: 'gpt-5-nano'
}

function buildLLMPrompt(videoEntry, folderNames) {
  const desc = videoEntry.description
    ? '. Description: ' + videoEntry.description.slice(0, 100)
    : ''
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
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': autoClassifyApiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({ model, max_tokens: 50, messages: [{ role: 'user', content: prompt }] })
    })
    const data = await resp.json()
    raw = data.content?.[0]?.text?.trim() || null
  } else if (autoClassifyProvider === 'gemini') {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${autoClassifyApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      }
    )
    const data = await resp.json()
    raw = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null
  } else if (autoClassifyProvider === 'openai') {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${autoClassifyApiKey}`
      },
      body: JSON.stringify({ model, max_tokens: 50, messages: [{ role: 'user', content: prompt }] })
    })
    const data = await resp.json()
    raw = data.choices?.[0]?.message?.content?.trim() || null
  }

  if (!raw || raw.toLowerCase() === 'none') return null
  return folderNames.find((f) => f.toLowerCase() === raw.toLowerCase()) || null
}
```

Replace the `fetchProviderModels` stub:

```javascript
export async function fetchProviderModels(provider, apiKey) {
  try {
    if (provider === 'claude') {
      const resp = await fetch('https://api.anthropic.com/v1/models', {
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
      })
      const data = await resp.json()
      return (data.data || []).map((m) => m.id)
    }
    if (provider === 'gemini') {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
      )
      const data = await resp.json()
      return (data.models || []).map((m) => m.name.replace('models/', ''))
    }
    if (provider === 'openai') {
      const resp = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` }
      })
      const data = await resp.json()
      return (data.data || []).map((m) => m.id).sort()
    }
  } catch {
    /* network error */
  }
  return []
}
```

- [ ] **Step 4: Run all auto-classifier tests**

```bash
npx vitest run tests/main/auto-classifier.test.js
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/auto-classifier.js tests/main/auto-classifier.test.js
git commit -m "feat: add auto-classifier Tier 3 LLM and fetchProviderModels"
```

---

## Task 5: Config store — add 4 new fields

**Files:**

- Modify: `src/main/config-store.js`
- Modify: `tests/main/config-store.test.js`

- [ ] **Step 1: Update the defaults test to include new fields**

In `tests/main/config-store.test.js`, update the "returns defaults" test:

```javascript
it('returns defaults when no file exists', () => {
  const cfg = readConfig(path.join(tmp, 'cfg.json'))
  expect(cfg.maxConcurrent).toBe(3)
  expect(cfg.autoClassifyEnabled).toBe(false)
  expect(cfg.autoClassifyProvider).toBe('local')
  expect(cfg.autoClassifyApiKey).toBe('')
  expect(cfg.autoClassifyModel).toBe('')
})
```

- [ ] **Step 2: Run to see test fail**

```bash
npx vitest run tests/main/config-store.test.js
```

Expected: FAIL — `autoClassifyEnabled` is undefined.

- [ ] **Step 3: Add new fields to `getDefaults()` in `src/main/config-store.js`**

Replace the `getDefaults` function:

```javascript
function getDefaults() {
  const { app } = _require('electron')
  return {
    outputFolder: app.getPath('downloads'),
    maxConcurrent: 3,
    adblockEnabled: true,
    confirmDelete: true,
    autoClassifyEnabled: false,
    autoClassifyProvider: 'local',
    autoClassifyApiKey: '',
    autoClassifyModel: ''
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/main/config-store.test.js
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/config-store.js tests/main/config-store.test.js
git commit -m "feat: add autoClassify config fields to config-store"
```

---

## Task 6: IPC handlers — `library:autoClassify` and `classify:fetchModels`

**Files:**

- Modify: `src/main/ipc-handlers.js`

- [ ] **Step 1: Add imports and two new handlers to `src/main/ipc-handlers.js`**

Add to the imports at the top of the file:

```javascript
import { classifyVideo, fetchProviderModels } from './auto-classifier.js'
```

Add these two handlers inside `registerIpcHandlers`, after the `library:moveFile` handler:

```javascript
ipcMain.handle('library:autoClassify', async () => {
  const config = readConfig()
  const { outputFolder } = config
  if (!outputFolder || !fs.existsSync(outputFolder)) return { moved: [], skipped: 0 }

  const folderNames = fs
    .readdirSync(outputFolder)
    .filter((f) => !f.startsWith('.') && fs.statSync(path.join(outputFolder, f)).isDirectory())
  if (folderNames.length === 0) return { moved: [], skipped: 0 }

  const index = readMetadataIndex()
  const rootFiles = fs
    .readdirSync(outputFolder)
    .filter((f) => !f.startsWith('.') && !fs.statSync(path.join(outputFolder, f)).isDirectory())

  const moved = []
  let skipped = 0
  for (const file of rootFiles) {
    const filePath = path.join(outputFolder, file)
    const meta = index[filePath] || {}
    const { folder } = await classifyVideo(
      { title: meta.title, uploader: meta.uploader, description: meta.description, url: meta.url },
      folderNames,
      config
    )
    if (folder) {
      const newPath = path.join(outputFolder, folder, file)
      fs.renameSync(filePath, newPath)
      moveMetadataEntry(filePath, newPath)
      moved.push({ file, toFolder: folder })
    } else {
      skipped++
    }
  }
  return { moved, skipped }
})

ipcMain.handle('classify:fetchModels', (_, { provider, apiKey }) =>
  fetchProviderModels(provider, apiKey)
)
```

- [ ] **Step 2: Run full main test suite to verify no regressions**

```bash
npm run test
```

Expected: All existing tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/main/ipc-handlers.js
git commit -m "feat: add library:autoClassify and classify:fetchModels IPC handlers"
```

---

## Task 7: Preload bridge — expose new APIs

**Files:**

- Modify: `src/preload/index.js`

- [ ] **Step 1: Add two new entries to the context bridge**

In `src/preload/index.js`, add after the `deleteFolder` line inside the `contextBridge.exposeInMainWorld` call:

```javascript
  autoClassify: () => ipcRenderer.invoke('library:autoClassify'),
  fetchClassifyModels: (provider, apiKey) => ipcRenderer.invoke('classify:fetchModels', { provider, apiKey }),
```

- [ ] **Step 2: Verify app starts without errors**

```bash
npm run dev
```

Expected: App launches, no console errors. Ctrl-C to stop.

- [ ] **Step 3: Commit**

```bash
git add src/preload/index.js
git commit -m "feat: expose autoClassify and fetchClassifyModels on window.api"
```

---

## Task 8: Download manager — auto-classify on download completion

**Files:**

- Modify: `src/main/download-manager.js`
- Modify: `tests/main/download-manager.test.js`

- [ ] **Step 1: Add a failing test for auto-classify on completion**

In `tests/main/download-manager.test.js`, add these mocks at the top (after existing mocks):

```javascript
vi.mock('../../src/main/auto-classifier.js', () => ({
  classifyVideo: vi.fn().mockResolvedValue({ folder: null, tier: 'none' })
}))

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    default: {
      ...actual,
      readdirSync: vi.fn(() => ['Music']),
      statSync: vi.fn(() => ({ isDirectory: () => true })),
      renameSync: vi.fn()
    }
  }
})

vi.mock('path', async (importOriginal) => importOriginal())
```

Add these imports after the existing imports:

```javascript
import { classifyVideo } from '../../src/main/auto-classifier.js'
import { moveMetadataEntry } from '../../src/main/metadata-store.js'
```

Update the `config-store.js` mock to include new fields, and update the `metadata-store.js` mock to also export `moveMetadataEntry`:

```javascript
vi.mock('../../src/main/config-store.js', () => ({
  readConfig: vi.fn(() => ({
    outputFolder: '/tmp/vids',
    maxConcurrent: 2,
    autoClassifyEnabled: false,
    autoClassifyProvider: 'local',
    autoClassifyApiKey: '',
    autoClassifyModel: ''
  }))
}))
// Replace the existing metadata-store mock (already at top of file) with:
vi.mock('../../src/main/metadata-store.js', () => ({
  writeMetadataEntry: vi.fn(),
  downloadAndStoreThumbnail: vi.fn().mockResolvedValue(undefined),
  moveMetadataEntry: vi.fn()
}))
```

Add these tests:

```javascript
describe('auto-classify on download completion', () => {
  it('does not call classifyVideo when autoClassifyEnabled is false', async () => {
    let onDone
    startDownload.mockImplementation((url, fmt, dir, onProg, done) => {
      onDone = done
      return { kill: vi.fn() }
    })
    const dm = new DownloadManager()
    dm.add('https://a.com', 'mp4', 'V1', {
      title: 'Guitar music',
      uploader: '',
      description: '',
      thumbnailUrl: null,
      url: ''
    })
    onDone('/tmp/vids/video.mp4')
    // Wait for async operations
    await new Promise((r) => setTimeout(r, 10))
    expect(classifyVideo).not.toHaveBeenCalled()
  })

  it('calls classifyVideo and moves file when autoClassifyEnabled is true and folder matches', async () => {
    const { readConfig } = await import('../../src/main/config-store.js')
    readConfig.mockReturnValue({
      outputFolder: '/tmp/vids',
      maxConcurrent: 2,
      autoClassifyEnabled: true,
      autoClassifyProvider: 'local',
      autoClassifyApiKey: '',
      autoClassifyModel: ''
    })
    classifyVideo.mockResolvedValue({ folder: 'Music', tier: 'keyword' })

    let onDone
    startDownload.mockImplementation((url, fmt, dir, onProg, done) => {
      onDone = done
      return { kill: vi.fn() }
    })
    const dm = new DownloadManager()
    dm.add('https://a.com', 'mp4', 'Guitar music', {
      title: 'Guitar music',
      uploader: '',
      description: '',
      thumbnailUrl: null,
      url: ''
    })
    onDone('/tmp/vids/guitar-music.mp4')
    await new Promise((r) => setTimeout(r, 20))
    expect(classifyVideo).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Guitar music' }),
      ['Music'],
      expect.objectContaining({ autoClassifyEnabled: true })
    )
    expect(moveMetadataEntry).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to see tests fail**

```bash
npx vitest run tests/main/download-manager.test.js
```

Expected: new tests FAIL.

- [ ] **Step 3: Update `src/main/download-manager.js`**

Add imports at the top:

```javascript
import fs from 'fs'
import path from 'path'
import { classifyVideo } from './auto-classifier.js'
import {
  writeMetadataEntry,
  downloadAndStoreThumbnail,
  moveMetadataEntry
} from './metadata-store.js'
```

Replace the existing `import { writeMetadataEntry, downloadAndStoreThumbnail } from './metadata-store.js'` line with the one above.

In `_start`, after the `writeMetadataEntry(...)` call and the `downloadAndStoreThumbnail` call, add:

```javascript
const cfg = readConfig()
if (cfg.autoClassifyEnabled && actualPath) {
  try {
    const folderNames = fs
      .readdirSync(cfg.outputFolder)
      .filter(
        (f) => !f.startsWith('.') && fs.statSync(path.join(cfg.outputFolder, f)).isDirectory()
      )
    if (folderNames.length > 0) {
      classifyVideo(
        {
          title: item.metadata.title,
          uploader: item.metadata.uploader,
          description: item.metadata.description,
          url: item.metadata.url
        },
        folderNames,
        cfg
      )
        .then(({ folder }) => {
          if (folder) {
            const newPath = path.join(cfg.outputFolder, folder, path.basename(actualPath))
            fs.renameSync(actualPath, newPath)
            moveMetadataEntry(actualPath, newPath)
          }
        })
        .catch(() => {})
    }
  } catch {
    /* don't block completion on classify errors */
  }
}
```

- [ ] **Step 4: Run all main tests**

```bash
npm run test
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/download-manager.js tests/main/download-manager.test.js
git commit -m "feat: auto-classify video into folder after download completes"
```

---

## Task 9: Settings panel — auto-classify section

**Files:**

- Modify: `src/renderer/src/components/SettingsPanel.jsx`

- [ ] **Step 1: Add auto-classify section to `SettingsPanel.jsx`**

Replace the full contents of `src/renderer/src/components/SettingsPanel.jsx`:

```jsx
import React, { useState } from 'react'
import { useAppStore } from '../store/app-store.js'

const DEFAULT_MODELS = {
  claude: 'claude-haiku-4-6',
  gemini: 'gemini-3.1-flash-lite',
  openai: 'gpt-5-nano'
}

export function SettingsPanel() {
  const { config, setConfig, setSettingsOpen } = useAppStore()
  const [local, setLocal] = useState({ ...config })
  const [folderError, setFolderError] = useState('')
  const [availableModels, setAvailableModels] = useState([])
  const [modelsFetching, setModelsFetching] = useState(false)

  async function handleBrowse() {
    const folder = await window.api.openFolder()
    if (folder) {
      setLocal((c) => ({ ...c, outputFolder: folder }))
      setFolderError('')
    }
  }

  async function handleFetchModels() {
    const provider = local.autoClassifyProvider
    const apiKey = local.autoClassifyApiKey
    if (!provider || provider === 'local' || !apiKey) return
    setModelsFetching(true)
    try {
      const models = await window.api.fetchClassifyModels(provider, apiKey)
      setAvailableModels(models)
      if (models.length > 0 && !local.autoClassifyModel) {
        const def = DEFAULT_MODELS[provider]
        setLocal((c) => ({ ...c, autoClassifyModel: models.includes(def) ? def : models[0] }))
      }
    } catch {
      setAvailableModels([])
    } finally {
      setModelsFetching(false)
    }
  }

  async function handleSave() {
    if (!local.outputFolder) {
      setFolderError('Please select an output folder.')
      return
    }
    const saved = await window.api.writeConfig(local)
    setConfig(saved)
    setSettingsOpen(false)
  }

  const isCloudProvider = local.autoClassifyProvider && local.autoClassifyProvider !== 'local'

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold text-white mb-4">Settings</h2>

        <div className="mb-4">
          <label className="block text-sm text-gray-400 mb-1">Download folder</label>
          <div className="flex gap-2">
            <input
              readOnly
              value={local.outputFolder || ''}
              placeholder="No folder selected"
              className={`flex-1 bg-gray-800 text-sm text-white px-3 py-2 rounded border cursor-default ${
                folderError ? 'border-red-500' : 'border-gray-600'
              }`}
            />
            <button
              onClick={handleBrowse}
              className="bg-gray-700 hover:bg-gray-600 text-white text-sm px-3 py-2 rounded border border-gray-600"
            >
              Browse…
            </button>
          </div>
          {folderError && <p className="text-red-400 text-xs mt-1">{folderError}</p>}
        </div>

        <div className="mb-4">
          <label className="block text-sm text-gray-400 mb-1">Max concurrent downloads</label>
          <input
            type="number"
            min={1}
            max={5}
            value={local.maxConcurrent}
            onChange={(e) =>
              setLocal((c) => ({ ...c, maxConcurrent: Math.max(1, parseInt(e.target.value) || 1) }))
            }
            className="w-24 bg-gray-800 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="mb-6 border-t border-gray-700 pt-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-gray-400">Auto-classify new downloads</span>
            <button
              onClick={() =>
                setLocal((c) => ({ ...c, autoClassifyEnabled: !c.autoClassifyEnabled }))
              }
              className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${
                local.autoClassifyEnabled ? 'bg-blue-600' : 'bg-gray-600'
              }`}
            >
              <span
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                  local.autoClassifyEnabled ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          <div className="mb-2">
            <label className="block text-xs text-gray-500 mb-1">Provider</label>
            <select
              value={local.autoClassifyProvider || 'local'}
              onChange={(e) => {
                setLocal((c) => ({
                  ...c,
                  autoClassifyProvider: e.target.value,
                  autoClassifyApiKey: '',
                  autoClassifyModel: ''
                }))
                setAvailableModels([])
              }}
              className="w-full bg-gray-800 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:outline-none focus:border-blue-500"
            >
              <option value="local">Local only</option>
              <option value="claude">Claude</option>
              <option value="gemini">Gemini</option>
              <option value="openai">OpenAI</option>
            </select>
          </div>

          {isCloudProvider && (
            <>
              <div className="mb-2">
                <label className="block text-xs text-gray-500 mb-1">API Key</label>
                <input
                  type="password"
                  value={local.autoClassifyApiKey || ''}
                  onChange={(e) => setLocal((c) => ({ ...c, autoClassifyApiKey: e.target.value }))}
                  onBlur={handleFetchModels}
                  placeholder="Enter API key…"
                  className="w-full bg-gray-800 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Model</label>
                {availableModels.length > 0 ? (
                  <select
                    value={
                      local.autoClassifyModel || DEFAULT_MODELS[local.autoClassifyProvider] || ''
                    }
                    onChange={(e) => setLocal((c) => ({ ...c, autoClassifyModel: e.target.value }))}
                    className="w-full bg-gray-800 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:outline-none focus:border-blue-500"
                  >
                    {availableModels.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={local.autoClassifyModel || ''}
                    onChange={(e) => setLocal((c) => ({ ...c, autoClassifyModel: e.target.value }))}
                    placeholder={
                      modelsFetching
                        ? 'Loading models…'
                        : DEFAULT_MODELS[local.autoClassifyProvider] || 'Model name'
                    }
                    className="w-full bg-gray-800 text-white text-sm px-3 py-2 rounded border border-gray-600 focus:outline-none focus:border-blue-500"
                  />
                )}
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={() => setSettingsOpen(false)}
            className="text-sm text-gray-400 hover:text-white px-4 py-2 rounded hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="text-sm bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded font-medium"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify settings panel renders and saves correctly**

```bash
npm run dev
```

Open Settings. Verify: auto-classify toggle visible, provider dropdown shows 4 options, API key + model inputs appear when Claude/Gemini/OpenAI selected. Save works. Ctrl-C.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/SettingsPanel.jsx
git commit -m "feat: add auto-classify settings section to SettingsPanel"
```

---

## Task 10: Library — auto-classify button and status

**Files:**

- Modify: `src/renderer/src/components/LibraryToolbar.jsx`
- Modify: `src/renderer/src/components/LibraryTab.jsx`

- [ ] **Step 1: Add auto-classify props to `LibraryToolbar.jsx`**

Replace the full contents of `src/renderer/src/components/LibraryToolbar.jsx`:

```jsx
import React from 'react'

export const SORT_CYCLE = [
  { field: 'date', direction: 'desc', label: 'Date ↓' },
  { field: 'date', direction: 'asc', label: 'Date ↑' },
  { field: 'name', direction: 'asc', label: 'Name ↑' },
  { field: 'name', direction: 'desc', label: 'Name ↓' },
  { field: 'folder', direction: 'asc', label: 'Folder A–Z' },
  { field: 'folder', direction: 'desc', label: 'Folder Z–A' }
]

export default function LibraryToolbar({
  sort,
  search,
  onSortChange,
  onSearchChange,
  resultCount,
  onAutoClassify,
  classifyStatus,
  hasUncategorized
}) {
  const idx = SORT_CYCLE.findIndex((s) => s.field === sort.field && s.direction === sort.direction)
  const isDefault = sort.field === 'date' && sort.direction === 'desc'
  const label = idx >= 0 ? SORT_CYCLE[idx].label : 'Date ↓'

  function cycleSort() {
    const next = SORT_CYCLE[(idx + 1) % SORT_CYCLE.length]
    onSortChange(next.field, next.direction)
  }

  const classifyRunning = classifyStatus === 'running'
  const classifyDisabled = !hasUncategorized || classifyRunning

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-800 flex-shrink-0">
      <div
        className={`flex flex-1 items-center gap-2 bg-gray-900 rounded-md px-2.5 py-1.5 border ${search ? 'border-indigo-500' : 'border-gray-700'}`}
      >
        <svg
          className={`w-3.5 h-3.5 flex-shrink-0 ${search ? 'text-indigo-400' : 'text-gray-500'}`}
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search title, uploader, description…"
          className="flex-1 bg-transparent text-sm text-white placeholder-gray-600 focus:outline-none min-w-0"
        />
        {search && (
          <>
            <span className="text-xs text-gray-500 flex-shrink-0 tabular-nums">
              {resultCount} result{resultCount !== 1 ? 's' : ''}
            </span>
            <button
              onClick={() => onSearchChange('')}
              className="text-gray-500 hover:text-gray-300 text-xs flex-shrink-0 leading-none"
            >
              ✕
            </button>
          </>
        )}
      </div>
      <button
        onClick={cycleSort}
        className={`flex-shrink-0 text-xs px-2.5 py-1.5 rounded-md border transition-colors whitespace-nowrap ${
          isDefault
            ? 'border-gray-700 text-gray-400 bg-gray-900 hover:border-gray-600'
            : 'border-indigo-600 text-indigo-300 bg-indigo-950/60 hover:bg-indigo-900/60'
        }`}
      >
        {label}
      </button>
      {onAutoClassify && (
        <button
          onClick={onAutoClassify}
          disabled={classifyDisabled}
          title="Auto-classify uncategorized videos into folders"
          className={`flex-shrink-0 text-xs px-2.5 py-1.5 rounded-md border transition-colors whitespace-nowrap ${
            classifyDisabled
              ? 'border-gray-700 text-gray-600 bg-gray-900 cursor-not-allowed'
              : 'border-gray-700 text-gray-400 bg-gray-900 hover:border-gray-600 hover:text-white'
          }`}
        >
          {classifyRunning ? 'Classifying…' : classifyStatus || 'Auto-classify'}
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Add auto-classify state and handler to `LibraryTab.jsx`**

In `LibraryTab.jsx`:

After the existing state declarations (after the `deletingFolder` state line), add:

```jsx
const [classifyStatus, setClassifyStatus] = useState(null) // null | 'running' | string
```

After the `refresh` function, add:

```jsx
async function handleAutoClassify() {
  setClassifyStatus('running')
  try {
    const result = await window.api.autoClassify()
    await refresh()
    setClassifyStatus(`Moved ${result.moved.length} · ${result.skipped} skipped`)
    setTimeout(() => setClassifyStatus(null), 3000)
  } catch {
    setClassifyStatus(null)
  }
}
```

After the `activeUrls` useMemo, add:

```jsx
const hasUncategorized = useMemo(() => visibleFiles.some((f) => !f.folder), [visibleFiles])
```

Update the `<LibraryToolbar` JSX call to pass the new props:

```jsx
<LibraryToolbar
  sort={librarySort}
  search={librarySearch}
  onSortChange={setLibrarySort}
  onSearchChange={setLibrarySearch}
  resultCount={totalResults}
  onAutoClassify={handleAutoClassify}
  classifyStatus={classifyStatus}
  hasUncategorized={hasUncategorized}
/>
```

- [ ] **Step 3: Run the app and verify end-to-end**

```bash
npm run dev
```

1. Open Library tab — verify "Auto-classify" button appears in toolbar
2. With no uncategorized videos: button should be disabled (grayed out)
3. Create folders "Music" and "Gaming"
4. Add a video file with title containing "music" to the output folder root (simulating a download)
5. Click "Auto-classify" — verify the video moves to the Music folder and the button shows "Moved 1 · 0 skipped" briefly
6. Open Settings — verify toggle, provider dropdown, API key field all visible and functional

Ctrl-C to stop.

- [ ] **Step 4: Run full test suite**

```bash
npm run test:all
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/LibraryToolbar.jsx src/renderer/src/components/LibraryTab.jsx
git commit -m "feat: add auto-classify button and status to Library toolbar"
```

---

## Verification Checklist (from spec)

- [ ] **Keyword tier**: Create "Music" folder. Manually place a file with metadata title "Guitar Solo Practice" in the output root. Click Auto-classify. File moves to Music — no API calls made.
- [ ] **Embedding tier**: Create "Anime" folder. Manually place file with title "Attack on Titan Season 4 Episode 3". Click Auto-classify. File moves to Anime (no keyword match, embedding match).
- [ ] **LLM tier**: Create "Cooking" folder. Configure Claude/Gemini/OpenAI in Settings. Place file with title "The perfect carbonara". Click Auto-classify. File moves to Cooking.
- [ ] **No match**: Create "Travel" folder. Place file with title "Advanced calculus lecture 7". Click Auto-classify. File stays uncategorized, skipped count = 1.
- [ ] **Auto on download**: Enable "Auto-classify new downloads" in Settings. Download a video. Verify it automatically moves to the matching folder without pressing Auto-classify.
- [ ] **Batch button disabled**: With no uncategorized files, Auto-classify button is grayed out.
- [ ] **Model fetch**: Enter valid API key for any provider in Settings — model dropdown populates.
- [ ] **No folders**: With no folders created, Auto-classify returns immediately, button stays disabled.
