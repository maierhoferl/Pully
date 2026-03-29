# AI Notes & Video Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-video AI summaries and user notes stored as folder-scoped markdown files, with a dedicated Notes tab and bidirectional Library↔Notes navigation.

**Architecture:** A shared `ai-client.js` handles all LLM API calls (Gemini/Claude/OpenAI); `notes-store.js` surgically reads/writes per-folder `notes.md` files using HTML comment anchors as stable chapter identifiers. The download pipeline runs: init chapter stub → classify (if enabled) → move chapter → generate summary (if enabled), ensuring summaries always use the final folder's custom prompt.

**Tech Stack:** Electron main process (Node.js, fs), React 19 + Zustand + Tailwind, Vitest, native fetch for AI APIs.

---

## File Map

**New — main process:**

- `src/main/notes-store.js` — read/write/parse `notes.md` per folder
- `src/main/ai-client.js` — shared LLM API caller (Gemini/Claude/OpenAI) + model listing
- `src/main/ai-summarizer.js` — builds prompts, calls ai-client, prefers YouTube URL for Gemini

**New — renderer:**

- `src/renderer/src/components/NotesTab.jsx` — two-panel Notes tab container
- `src/renderer/src/components/NotesFolderList.jsx` — left panel: folder list
- `src/renderer/src/components/NotesChapterView.jsx` — right panel: chapter rendering + editing

**New — tests:**

- `tests/main/notes-store.test.js`
- `tests/main/ai-client.test.js`
- `tests/main/ai-summarizer.test.js`
- `tests/renderer/NotesTab.test.jsx`

**Modified:**

- `src/main/config-store.js` — add AI + notes config fields
- `src/main/ipc-handlers.js` — add notes IPC channels
- `src/main/download-manager.js` — add notes pipeline after download completion
- `src/preload/index.js` — expose notes APIs on window.api
- `src/renderer/src/store/app-store.js` — add activeNotesFolder, activeNotesChapter
- `src/renderer/src/components/SettingsPanel.jsx` — add AI settings section
- `src/renderer/src/components/LibraryDetailPanel.jsx` — add "View Notes" button
- `src/renderer/src/components/App.jsx` — add Notes tab panel
- `src/renderer/src/components/TabBar.jsx` — add Notes tab entry

---

## Task 1: Add AI & Notes Config Fields

**Files:**

- Modify: `src/main/config-store.js`

- [ ] **Step 1: Write failing test**

Add to a new test file `tests/main/config-store.test.js`:

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => '/tmp/userdata' } }))
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn()
  }
}))

const { readConfig } = await import('../../src/main/config-store.js')

describe('config-store defaults', () => {
  it('includes AI and notes config defaults', () => {
    const cfg = readConfig()
    expect(cfg.aiProvider).toBe('gemini')
    expect(cfg.aiApiKey).toBe('')
    expect(cfg.aiModel).toBe('')
    expect(cfg.autoSummarizeEnabled).toBe(false)
    expect(cfg.defaultSummaryPrompt).toContain('Summarize this video')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/main/config-store.test.js
```

Expected: FAIL — fields are undefined.

- [ ] **Step 3: Add defaults to config-store.js**

Open `src/main/config-store.js`. Find the `getDefaults()` function (or wherever defaults are defined) and add:

```javascript
function getDefaults() {
  return {
    outputFolder: app.getPath('downloads'),
    maxConcurrent: 3,
    adblockEnabled: true,
    confirmDelete: true,
    // AI shared config
    aiProvider: 'gemini',
    aiApiKey: '',
    aiModel: '',
    // Auto-classify (from auto-classify spec — unified here)
    autoClassifyEnabled: false,
    autoClassifyProvider: undefined, // deprecated, use aiProvider
    autoClassifyApiKey: undefined, // deprecated, use aiApiKey
    autoClassifyModel: undefined, // deprecated, use aiModel
    // Notes & summary
    autoSummarizeEnabled: false,
    defaultSummaryPrompt:
      'Summarize this video in 3-5 sentences. Highlight the main topic, key points covered, and anything particularly useful or actionable for the viewer.'
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/main/config-store.test.js
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/config-store.js tests/main/config-store.test.js
git commit -m "feat: add AI and notes config fields to config-store"
```

---

## Task 2: Build notes-store.js

**Files:**

- Create: `src/main/notes-store.js`
- Create: `tests/main/notes-store.test.js`

- [ ] **Step 1: Write failing tests**

Create `tests/main/notes-store.test.js`:

```javascript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import {
  initChapter,
  readFolderNotes,
  writeSummarySection,
  writeBulletsSection,
  moveChapter,
  getNotesPath
} from '../../src/main/notes-store.js'

let tmpDir

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pully-notes-test-'))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('getNotesPath', () => {
  it('returns root notes.md for root-level file', () => {
    const filePath = path.join(tmpDir, 'video.mp4')
    expect(getNotesPath(filePath, tmpDir)).toBe(path.join(tmpDir, 'notes.md'))
  })

  it('returns folder notes.md for file in subfolder', () => {
    const filePath = path.join(tmpDir, 'Travel', 'trip.mp4')
    expect(getNotesPath(filePath, tmpDir)).toBe(path.join(tmpDir, 'Travel', 'notes.md'))
  })
})

describe('initChapter', () => {
  it('creates notes.md with chapter stub for a new file', () => {
    const filePath = path.join(tmpDir, 'video.mp4')
    const metadata = {
      title: 'My Video',
      url: 'https://youtube.com/watch?v=abc',
      downloadedAt: '2026-03-28T00:00:00.000Z'
    }
    initChapter(filePath, metadata, tmpDir)
    const content = fs.readFileSync(path.join(tmpDir, 'notes.md'), 'utf8')
    expect(content).toContain('## My Video')
    expect(content).toContain('<!-- pully:file:video.mp4 -->')
    expect(content).toContain('<!-- pully:url:https://youtube.com/watch?v=abc -->')
    expect(content).toContain('### AI Summary')
    expect(content).toContain('### My Notes')
  })

  it('creates folder if it does not exist', () => {
    const filePath = path.join(tmpDir, 'Travel', 'trip.mp4')
    fs.mkdirSync(path.join(tmpDir, 'Travel'))
    initChapter(
      filePath,
      { title: 'Trip', url: '', downloadedAt: '2026-03-28T00:00:00.000Z' },
      tmpDir
    )
    expect(fs.existsSync(path.join(tmpDir, 'Travel', 'notes.md'))).toBe(true)
  })

  it('does not duplicate chapter if already present', () => {
    const filePath = path.join(tmpDir, 'video.mp4')
    const metadata = { title: 'My Video', url: '', downloadedAt: '2026-03-28T00:00:00.000Z' }
    initChapter(filePath, metadata, tmpDir)
    initChapter(filePath, metadata, tmpDir)
    const content = fs.readFileSync(path.join(tmpDir, 'notes.md'), 'utf8')
    const count = (content.match(/<!-- pully:file:video\.mp4 -->/g) || []).length
    expect(count).toBe(1)
  })
})

describe('readFolderNotes', () => {
  it('returns empty chapters array when no notes.md exists', () => {
    const result = readFolderNotes(null, tmpDir)
    expect(result.chapters).toEqual([])
  })

  it('parses chapters from existing notes.md', () => {
    const notesPath = path.join(tmpDir, 'notes.md')
    fs.writeFileSync(
      notesPath,
      `# Library\n\n---\n\n## My Video\n<!-- pully:file:video.mp4 -->\n<!-- pully:url:https://yt.com/1 -->\n<!-- pully:downloaded:2026-03-28 -->\n\n### AI Summary\nGreat video about stuff.\n\n### My Notes\n- point one\n- point two\n\n---\n`
    )
    const result = readFolderNotes(null, tmpDir)
    expect(result.chapters).toHaveLength(1)
    expect(result.chapters[0].file).toBe('video.mp4')
    expect(result.chapters[0].url).toBe('https://yt.com/1')
    expect(result.chapters[0].summary).toBe('Great video about stuff.')
    expect(result.chapters[0].bullets).toEqual(['point one', 'point two'])
  })
})

describe('writeSummarySection', () => {
  it('writes summary into the correct chapter', () => {
    const filePath = path.join(tmpDir, 'video.mp4')
    initChapter(
      filePath,
      { title: 'Vid', url: '', downloadedAt: '2026-03-28T00:00:00.000Z' },
      tmpDir
    )
    writeSummarySection(filePath, 'This is the AI summary.', tmpDir)
    const content = fs.readFileSync(path.join(tmpDir, 'notes.md'), 'utf8')
    expect(content).toContain('This is the AI summary.')
  })

  it('replaces existing summary without touching My Notes', () => {
    const filePath = path.join(tmpDir, 'video.mp4')
    initChapter(
      filePath,
      { title: 'Vid', url: '', downloadedAt: '2026-03-28T00:00:00.000Z' },
      tmpDir
    )
    writeSummarySection(filePath, 'First summary.', tmpDir)
    writeBulletsSection(filePath, ['my note'], tmpDir)
    writeSummarySection(filePath, 'Replaced summary.', tmpDir)
    const content = fs.readFileSync(path.join(tmpDir, 'notes.md'), 'utf8')
    expect(content).toContain('Replaced summary.')
    expect(content).not.toContain('First summary.')
    expect(content).toContain('- my note')
  })
})

describe('writeBulletsSection', () => {
  it('writes bullets into the My Notes section', () => {
    const filePath = path.join(tmpDir, 'video.mp4')
    initChapter(
      filePath,
      { title: 'Vid', url: '', downloadedAt: '2026-03-28T00:00:00.000Z' },
      tmpDir
    )
    writeBulletsSection(filePath, ['bullet one', 'bullet two'], tmpDir)
    const content = fs.readFileSync(path.join(tmpDir, 'notes.md'), 'utf8')
    expect(content).toContain('- bullet one')
    expect(content).toContain('- bullet two')
  })
})

describe('moveChapter', () => {
  it('moves chapter from root notes.md to folder notes.md', () => {
    fs.mkdirSync(path.join(tmpDir, 'Travel'))
    const oldPath = path.join(tmpDir, 'trip.mp4')
    const newPath = path.join(tmpDir, 'Travel', 'trip.mp4')
    initChapter(
      oldPath,
      { title: 'Trip', url: 'https://yt.com/2', downloadedAt: '2026-03-28T00:00:00.000Z' },
      tmpDir
    )
    moveChapter(oldPath, newPath, tmpDir)
    const rootContent = fs.readFileSync(path.join(tmpDir, 'notes.md'), 'utf8')
    const travelContent = fs.readFileSync(path.join(tmpDir, 'Travel', 'notes.md'), 'utf8')
    expect(rootContent).not.toContain('<!-- pully:file:trip.mp4 -->')
    expect(travelContent).toContain('<!-- pully:file:trip.mp4 -->')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/main/notes-store.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement notes-store.js**

Create `src/main/notes-store.js`:

```javascript
import fs from 'fs'
import path from 'path'

/** Returns absolute path to the notes.md for the folder containing filePath. */
export function getNotesPath(filePath, outputFolder) {
  const rel = path.relative(outputFolder, filePath)
  const parts = rel.split(path.sep)
  if (parts.length <= 1) {
    return path.join(outputFolder, 'notes.md')
  }
  return path.join(outputFolder, parts[0], 'notes.md')
}

function getFolderTitle(notesPath, outputFolder) {
  const rel = path.relative(outputFolder, path.dirname(notesPath))
  if (rel === '.') return 'Library'
  return rel
}

function readFile(notesPath) {
  if (!fs.existsSync(notesPath)) return ''
  return fs.readFileSync(notesPath, 'utf8')
}

function buildChapterStub(fileBasename, metadata) {
  const title = metadata.title || fileBasename
  const url = metadata.url || ''
  const date = metadata.downloadedAt
    ? metadata.downloadedAt.slice(0, 10)
    : new Date().toISOString().slice(0, 10)
  return [
    `## ${title}`,
    `<!-- pully:file:${fileBasename} -->`,
    `<!-- pully:url:${url} -->`,
    `<!-- pully:downloaded:${date} -->`,
    '',
    '### AI Summary',
    '',
    '### My Notes',
    ''
  ].join('\n')
}

/** Creates a chapter stub in the folder's notes.md. No-op if chapter already exists. */
export function initChapter(filePath, metadata, outputFolder) {
  const notesPath = getNotesPath(filePath, outputFolder)
  const fileBasename = path.basename(filePath)
  let content = readFile(notesPath)
  if (content.includes(`<!-- pully:file:${fileBasename} -->`)) return
  if (!content) {
    const title = getFolderTitle(notesPath, outputFolder)
    content = `# ${title}\n\n`
  }
  const stub = buildChapterStub(fileBasename, metadata)
  content = content.trimEnd() + '\n\n---\n\n' + stub + '\n---\n'
  fs.mkdirSync(path.dirname(notesPath), { recursive: true })
  fs.writeFileSync(notesPath, content, 'utf8')
}

/** Parse notes.md into structured chapters. folderName null = root. */
export function readFolderNotes(folderName, outputFolder) {
  const notesPath = folderName
    ? path.join(outputFolder, folderName, 'notes.md')
    : path.join(outputFolder, 'notes.md')
  const content = readFile(notesPath)
  if (!content) return { title: folderName || 'Library', chapters: [] }

  const lines = content.split('\n')
  const chapters = []
  let current = null
  let section = null

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (current) chapters.push(finalizeChapter(current))
      current = {
        heading: line.slice(3),
        file: null,
        url: null,
        downloadedAt: null,
        _summary: [],
        _bullets: []
      }
      section = null
    } else if (current) {
      const fm = line.match(/<!--\s*pully:file:(.*?)\s*-->/)
      const um = line.match(/<!--\s*pully:url:(.*?)\s*-->/)
      const dm = line.match(/<!--\s*pully:downloaded:(.*?)\s*-->/)
      if (fm) current.file = fm[1].trim()
      if (um) current.url = um[1].trim()
      if (dm) current.downloadedAt = dm[1].trim()
      if (line === '### AI Summary') {
        section = 'summary'
        continue
      }
      if (line === '### My Notes') {
        section = 'notes'
        continue
      }
      if (line.startsWith('### ') || line === '---') {
        section = null
        continue
      }
      if (section === 'summary' && line.trim()) current._summary.push(line)
      if (section === 'notes' && line.startsWith('- ')) current._bullets.push(line.slice(2).trim())
    }
  }
  if (current) chapters.push(finalizeChapter(current))

  const titleLine = lines.find((l) => l.startsWith('# '))
  const title = titleLine ? titleLine.slice(2).trim() : folderName || 'Library'
  return { title, chapters }
}

function finalizeChapter(c) {
  return {
    file: c.file,
    url: c.url,
    downloadedAt: c.downloadedAt,
    heading: c.heading,
    summary: c._summary.join('\n').trim() || null,
    bullets: c._bullets
  }
}

/** Surgically replace content under a named section heading (### X) for the chapter identified by fileBasename. */
function updateSection(notesPath, fileBasename, sectionHeading, newBody) {
  const content = readFile(notesPath)
  if (!content.includes(`<!-- pully:file:${fileBasename} -->`)) return
  const lines = content.split('\n')
  let inChapter = false
  let sectionStart = -1
  let sectionEnd = -1

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(`<!-- pully:file:${fileBasename} -->`)) inChapter = true
    if (!inChapter) continue
    if (lines[i] === sectionHeading) {
      sectionStart = i + 1
      continue
    }
    if (sectionStart !== -1 && sectionEnd === -1) {
      if (lines[i].startsWith('### ') || lines[i] === '---' || lines[i].startsWith('## ')) {
        sectionEnd = i
        break
      }
    }
  }
  if (sectionStart === -1) return
  if (sectionEnd === -1) sectionEnd = lines.length

  // Trim trailing blank lines before sectionEnd
  while (sectionEnd > sectionStart && lines[sectionEnd - 1].trim() === '') sectionEnd--

  const bodyLines = newBody ? newBody.split('\n') : []
  const result = [...lines.slice(0, sectionStart), ...bodyLines, '', ...lines.slice(sectionEnd)]
  fs.writeFileSync(notesPath, result.join('\n'), 'utf8')
}

export function writeSummarySection(filePath, summary, outputFolder) {
  const notesPath = getNotesPath(filePath, outputFolder)
  updateSection(notesPath, path.basename(filePath), '### AI Summary', summary)
}

export function writeBulletsSection(filePath, bullets, outputFolder) {
  const notesPath = getNotesPath(filePath, outputFolder)
  const body = bullets.map((b) => `- ${b}`).join('\n')
  updateSection(notesPath, path.basename(filePath), '### My Notes', body)
}

/** Extracts a chapter block from content. Returns { chapterContent, remaining }. */
function extractChapter(content, fileBasename) {
  const lines = content.split('\n')
  let chapterStart = -1
  let chapterEnd = lines.length

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(`<!-- pully:file:${fileBasename} -->`)) {
      // Walk back to find the ## heading
      for (let j = i; j >= 0; j--) {
        if (lines[j].startsWith('## ')) {
          chapterStart = j
          break
        }
      }
      // Walk forward to find the closing --- or next ##
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j] === '---' || lines[j].startsWith('## ')) {
          chapterEnd = lines[j] === '---' ? j + 1 : j
          break
        }
      }
      break
    }
  }
  if (chapterStart === -1) return { chapterContent: null, remaining: content }

  const chapterLines = lines.slice(chapterStart, chapterEnd)
  const remainingLines = [...lines.slice(0, chapterStart), ...lines.slice(chapterEnd)]
  const remaining =
    remainingLines
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trimEnd() + '\n'
  return { chapterContent: chapterLines.join('\n'), remaining }
}

/** Moves a chapter from oldFilePath's notes.md to newFilePath's notes.md. */
export function moveChapter(oldFilePath, newFilePath, outputFolder) {
  const oldNotesPath = getNotesPath(oldFilePath, outputFolder)
  const newNotesPath = getNotesPath(newFilePath, outputFolder)
  if (oldNotesPath === newNotesPath) return

  const oldBasename = path.basename(oldFilePath)
  const newBasename = path.basename(newFilePath)
  const oldContent = readFile(oldNotesPath)
  const { chapterContent, remaining } = extractChapter(oldContent, oldBasename)
  if (!chapterContent) return

  const updatedChapter = chapterContent.replace(
    `<!-- pully:file:${oldBasename} -->`,
    `<!-- pully:file:${newBasename} -->`
  )

  fs.writeFileSync(oldNotesPath, remaining, 'utf8')

  let newContent = readFile(newNotesPath)
  if (!newContent) {
    const title = getFolderTitle(newNotesPath, outputFolder)
    newContent = `# ${title}\n\n`
  }
  newContent = newContent.trimEnd() + '\n\n---\n\n' + updatedChapter.trimEnd() + '\n---\n'
  fs.mkdirSync(path.dirname(newNotesPath), { recursive: true })
  fs.writeFileSync(newNotesPath, newContent, 'utf8')
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/main/notes-store.test.js
```

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/notes-store.js tests/main/notes-store.test.js
git commit -m "feat: add notes-store for per-folder markdown notes management"
```

---

## Task 3: Build ai-client.js

**Files:**

- Create: `src/main/ai-client.js`
- Create: `tests/main/ai-client.test.js`

- [ ] **Step 1: Write failing tests**

Create `tests/main/ai-client.test.js`:

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFetch = vi.fn()
global.fetch = mockFetch

const { callLLM, callLLMWithVideo, fetchProviderModels } =
  await import('../../src/main/ai-client.js')

beforeEach(() => vi.clearAllMocks())

describe('callLLM - gemini', () => {
  it('calls Gemini REST endpoint and returns text', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'Summary text' }] } }] })
    })
    const result = await callLLM('gemini', 'key123', 'gemini-2.0-flash', [
      { role: 'user', content: 'Summarize' }
    ])
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
      json: async () => ({ content: [{ text: 'Claude summary' }] })
    })
    const result = await callLLM('claude', 'key456', 'claude-haiku-4-6', [
      { role: 'user', content: 'Summarize' }
    ])
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
      json: async () => ({ choices: [{ message: { content: 'OpenAI summary' } }] })
    })
    const result = await callLLM('openai', 'key789', 'gpt-4o-mini', [
      { role: 'user', content: 'Summarize' }
    ])
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
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'Video summary' }] } }] })
    })
    const result = await callLLMWithVideo(
      'gemini',
      'key',
      'gemini-2.0-flash',
      'Summarize',
      'https://youtube.com/watch?v=abc'
    )
    expect(result).toBe('Video summary')
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.contents[0].parts[0]).toMatchObject({
      fileData: { fileUri: 'https://youtube.com/watch?v=abc' }
    })
  })

  it('falls back to callLLM for non-Gemini providers', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ content: [{ text: 'fallback' }] })
    })
    const result = await callLLMWithVideo(
      'claude',
      'key',
      'claude-haiku-4-6',
      'Summarize',
      'https://youtube.com/watch?v=abc'
    )
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
          { name: 'models/embedding-001', supportedGenerationMethods: ['embedContent'] }
        ]
      })
    })
    const models = await fetchProviderModels('gemini', 'key')
    expect(models).toContain('gemini-2.0-flash')
    expect(models).not.toContain('embedding-001')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/main/ai-client.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement ai-client.js**

Create `src/main/ai-client.js`:

```javascript
const DEFAULT_MODELS = {
  gemini: 'gemini-2.0-flash',
  claude: 'claude-haiku-4-6',
  openai: 'gpt-4o-mini'
}

/** Call an LLM with a messages array. Returns the response text string. */
export async function callLLM(provider, apiKey, model, messages) {
  const m = model || DEFAULT_MODELS[provider]
  if (provider === 'gemini') return _callGemini(apiKey, m, messages)
  if (provider === 'claude') return _callClaude(apiKey, m, messages)
  if (provider === 'openai') return _callOpenAI(apiKey, m, messages)
  throw new Error(`Unknown AI provider: ${provider}`)
}

/** Call Gemini with a video URL in the request (YouTube native understanding). Falls back to text for non-Gemini. */
export async function callLLMWithVideo(provider, apiKey, model, prompt, videoUrl) {
  const m = model || DEFAULT_MODELS[provider]
  if (provider !== 'gemini') {
    return callLLM(provider, apiKey, m, [{ role: 'user', content: prompt }])
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`
  const body = {
    contents: [
      {
        parts: [{ fileData: { mimeType: 'video/mp4', fileUri: videoUrl } }, { text: prompt }]
      }
    ]
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok) throw new Error(`Gemini video API error: ${res.status}`)
  const data = await res.json()
  return data.candidates[0].content.parts[0].text
}

/** Fetch available model names for a provider. Returns string[]. */
export async function fetchProviderModels(provider, apiKey) {
  if (provider === 'gemini') {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`)
    if (!res.ok) throw new Error(`Gemini models fetch error: ${res.status}`)
    const data = await res.json()
    return (data.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m) => m.name.replace('models/', ''))
  }
  if (provider === 'claude') {
    const res = await fetch('https://api.anthropic.com/v1/models', {
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
    })
    if (!res.ok) throw new Error(`Claude models fetch error: ${res.status}`)
    const data = await res.json()
    return (data.data || []).map((m) => m.id)
  }
  if (provider === 'openai') {
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` }
    })
    if (!res.ok) throw new Error(`OpenAI models fetch error: ${res.status}`)
    const data = await res.json()
    return (data.data || [])
      .map((m) => m.id)
      .filter((id) => id.startsWith('gpt-'))
      .sort()
  }
  throw new Error(`Unknown provider: ${provider}`)
}

async function _callGemini(apiKey, model, messages) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }))
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents })
  })
  if (!res.ok) throw new Error(`Gemini API error: ${res.status}`)
  const data = await res.json()
  return data.candidates[0].content.parts[0].text
}

async function _callClaude(apiKey, model, messages) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({ model, max_tokens: 1024, messages })
  })
  if (!res.ok) throw new Error(`Claude API error: ${res.status}`)
  const data = await res.json()
  return data.content[0].text
}

async function _callOpenAI(apiKey, model, messages) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ model, messages })
  })
  if (!res.ok) throw new Error(`OpenAI API error: ${res.status}`)
  const data = await res.json()
  return data.choices[0].message.content
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/main/ai-client.test.js
```

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/ai-client.js tests/main/ai-client.test.js
git commit -m "feat: add ai-client for shared Gemini/Claude/OpenAI calling"
```

---

## Task 4: Build ai-summarizer.js

**Files:**

- Create: `src/main/ai-summarizer.js`
- Create: `tests/main/ai-summarizer.test.js`

- [ ] **Step 1: Write failing tests**

Create `tests/main/ai-summarizer.test.js`:

```javascript
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
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/main/ai-summarizer.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement ai-summarizer.js**

Create `src/main/ai-summarizer.js`:

```javascript
import fs from 'fs'
import path from 'path'
import { callLLM, callLLMWithVideo } from './ai-client.js'

const YOUTUBE_RE = /youtube\.com|youtu\.be/

/** Generate a summary for a video. Returns the summary string. */
export async function generateSummary(filePath, metadata, config) {
  const { aiProvider, aiApiKey, aiModel, defaultSummaryPrompt } = config
  const folderPath = path.dirname(filePath)
  const customPromptPath = path.join(folderPath, 'summary-prompt.md')

  let prompt = defaultSummaryPrompt || 'Summarize this video in 3-5 sentences.'
  if (fs.existsSync(customPromptPath)) {
    const custom = fs.readFileSync(customPromptPath, 'utf8').trim()
    if (custom) prompt = custom
  }

  const isYouTube = metadata.url && YOUTUBE_RE.test(metadata.url)

  if (aiProvider === 'gemini' && isYouTube) {
    return callLLMWithVideo(aiProvider, aiApiKey, aiModel || '', prompt, metadata.url)
  }

  // Text metadata path for all other cases
  const titleLine = `Title: ${metadata.title || 'Unknown'}`
  const uploaderLine = `Uploader: ${metadata.uploader || 'Unknown'}`
  const descLine = `Description: ${(metadata.description || '').slice(0, 500)}`
  const userContent = `${prompt}\n\n${titleLine}\n${uploaderLine}\n${descLine}`

  return callLLM(aiProvider, aiApiKey, aiModel || '', [{ role: 'user', content: userContent }])
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/main/ai-summarizer.test.js
```

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/ai-summarizer.js tests/main/ai-summarizer.test.js
git commit -m "feat: add ai-summarizer with Gemini YouTube URL and text fallback paths"
```

---

## Task 5: Add Notes IPC Handlers & Preload Bridge

**Files:**

- Modify: `src/main/ipc-handlers.js`
- Modify: `src/preload/index.js`

- [ ] **Step 1: Add IPC handlers to ipc-handlers.js**

Open `src/main/ipc-handlers.js`. Add the following imports at the top alongside existing imports:

```javascript
import {
  initChapter,
  readFolderNotes,
  writeSummarySection,
  writeBulletsSection
} from './notes-store.js'
import { generateSummary } from './ai-summarizer.js'
```

Then, inside the function that registers all IPC handlers, add:

```javascript
// Notes handlers
ipcMain.handle('notes:read', (_e, folderName) => {
  const cfg = readConfig()
  return readFolderNotes(folderName, cfg.outputFolder)
})

ipcMain.handle('notes:init-chapter', (_e, filePath) => {
  const cfg = readConfig()
  // Look up metadata from index to populate the chapter
  const index = readMetadataIndex()
  const metadata = index[filePath] || {}
  initChapter(filePath, metadata, cfg.outputFolder)
})

ipcMain.handle('notes:update-bullets', (_e, filePath, bullets) => {
  const cfg = readConfig()
  writeBulletsSection(filePath, bullets, cfg.outputFolder)
})

ipcMain.handle('notes:generate-summary', async (_e, filePath) => {
  const cfg = readConfig()
  const index = readMetadataIndex()
  const metadata = index[filePath] || {}
  if (!cfg.aiApiKey) throw new Error('No AI API key configured. Please add one in Settings.')
  const summary = await generateSummary(filePath, metadata, cfg)
  writeSummarySection(filePath, summary, cfg.outputFolder)
  return { summary }
})

ipcMain.handle('classify:fetchModels', async (_e, provider, apiKey) => {
  const { fetchProviderModels } = await import('./ai-client.js')
  return fetchProviderModels(provider, apiKey)
})
```

Note: `readMetadataIndex` is already imported in ipc-handlers.js — confirm with `grep readMetadataIndex src/main/ipc-handlers.js` and add the import if missing.

- [ ] **Step 2: Expose notes APIs in preload**

Open `src/preload/index.js`. In the `contextBridge.exposeInMainWorld('api', { ... })` block, add:

```javascript
// Notes
readNotes: (folderName) => ipcRenderer.invoke('notes:read', folderName),
initChapter: (filePath) => ipcRenderer.invoke('notes:init-chapter', filePath),
updateBullets: (filePath, bullets) => ipcRenderer.invoke('notes:update-bullets', filePath, bullets),
generateSummary: (filePath) => ipcRenderer.invoke('notes:generate-summary', filePath),
fetchAiModels: (provider, apiKey) => ipcRenderer.invoke('classify:fetchModels', provider, apiKey),
```

- [ ] **Step 3: Smoke test — start the app and verify no startup errors**

```bash
npm run dev
```

Expected: app starts without errors in the console. No changes visible yet.

- [ ] **Step 4: Commit**

```bash
git add src/main/ipc-handlers.js src/preload/index.js
git commit -m "feat: add notes IPC handlers and preload bridge"
```

---

## Task 6: Integrate Notes Pipeline in Download Manager

**Files:**

- Modify: `src/main/download-manager.js`

- [ ] **Step 1: Write failing test**

Open `tests/main/download-manager.test.js`. Add at the top of the mock section:

```javascript
vi.mock('../src/main/notes-store.js', () => ({
  initChapter: vi.fn(),
  moveChapter: vi.fn(),
  writeSummarySection: vi.fn()
}))
vi.mock('../src/main/ai-summarizer.js', () => ({
  generateSummary: vi.fn(async () => 'Auto summary')
}))
```

Then add test cases:

```javascript
import { initChapter, moveChapter, writeSummarySection } from '../src/main/notes-store.js'
import { generateSummary } from '../src/main/ai-summarizer.js'

it('calls initChapter after successful download', () => {
  let onDone
  startDownload.mockImplementation((_u, _f, _d, _p, done) => {
    onDone = done
    return { kill: vi.fn() }
  })
  readConfig.mockReturnValue({
    outputFolder: '/out',
    maxConcurrent: 1,
    autoClassifyEnabled: false,
    autoSummarizeEnabled: false
  })
  const dm = new DownloadManager()
  dm.add('https://yt.com/v=1', 'mp4', 'Title', { title: 'Title', url: 'https://yt.com/v=1' })
  onDone('/out/Title.mp4')
  expect(initChapter).toHaveBeenCalledWith(
    '/out/Title.mp4',
    expect.objectContaining({ title: 'Title' }),
    '/out'
  )
})

it('calls generateSummary when autoSummarizeEnabled and no classify', async () => {
  let onDone
  startDownload.mockImplementation((_u, _f, _d, _p, done) => {
    onDone = done
    return { kill: vi.fn() }
  })
  readConfig.mockReturnValue({
    outputFolder: '/out',
    maxConcurrent: 1,
    autoClassifyEnabled: false,
    autoSummarizeEnabled: true,
    aiApiKey: 'k',
    aiProvider: 'gemini',
    aiModel: ''
  })
  const dm = new DownloadManager()
  dm.add('https://yt.com/v=1', 'mp4', 'Title', { title: 'Title', url: 'https://yt.com/v=1' })
  onDone('/out/Title.mp4')
  await new Promise((r) => setTimeout(r, 10))
  expect(generateSummary).toHaveBeenCalledWith(
    '/out/Title.mp4',
    expect.any(Object),
    expect.objectContaining({ aiProvider: 'gemini' })
  )
  expect(writeSummarySection).toHaveBeenCalledWith('/out/Title.mp4', 'Auto summary', '/out')
})
```

- [ ] **Step 2: Run new tests to verify they fail**

```bash
npx vitest run tests/main/download-manager.test.js -t "initChapter\|generateSummary"
```

Expected: FAIL

- [ ] **Step 3: Add notes pipeline to download-manager.js**

Open `src/main/download-manager.js`. Add imports at the top:

```javascript
import { initChapter, moveChapter, writeSummarySection } from './notes-store.js'
import { generateSummary } from './ai-summarizer.js'
```

In the download completion callback (the `(actualPath) => { ... }` arrow function inside `_start()`), add the notes pipeline. Insert **after** the `writeMetadataEntry` block and **before** (or integrated with) the existing classify block:

```javascript
// Notes: init chapter stub
if (actualPath && item.metadata) {
  try {
    initChapter(
      actualPath,
      { ...item.metadata, downloadedAt: new Date().toISOString() },
      cfg.outputFolder
    )
  } catch {
    /* don't block on notes errors */
  }
}

// Classify + summarize pipeline
if (cfg.autoClassifyEnabled && actualPath && item.metadata) {
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
          let finalPath = actualPath
          if (folder) {
            const dest = path.join(cfg.outputFolder, folder, path.basename(actualPath))
            try {
              fs.renameSync(actualPath, dest)
              moveMetadataEntry(actualPath, dest)
              moveChapter(actualPath, dest, cfg.outputFolder)
              finalPath = dest
            } catch {
              /* skip if move fails */
            }
          }
          if (cfg.autoSummarizeEnabled && item.metadata) {
            generateSummary(finalPath, { ...item.metadata, url: item.metadata.url }, cfg)
              .then((summary) => writeSummarySection(finalPath, summary, cfg.outputFolder))
              .catch(() => {})
          }
        })
        .catch(() => {})
    }
  } catch {
    /* don't block completion on classify errors */
  }
} else if (cfg.autoSummarizeEnabled && actualPath && item.metadata) {
  generateSummary(actualPath, { ...item.metadata, url: item.metadata.url }, cfg)
    .then((summary) => writeSummarySection(actualPath, summary, cfg.outputFolder))
    .catch(() => {})
}
```

**Important:** Remove or replace the original classify block (the existing `if (cfg.autoClassifyEnabled ...)` block) with the version above, since we're integrating notes into it.

- [ ] **Step 4: Run all main tests**

```bash
npm run test
```

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/download-manager.js
git commit -m "feat: integrate notes init and AI summary into download completion pipeline"
```

---

## Task 7: Renderer State & Settings UI

**Files:**

- Modify: `src/renderer/src/store/app-store.js`
- Modify: `src/renderer/src/components/SettingsPanel.jsx`

- [ ] **Step 1: Add notes state to app-store.js**

Open `src/renderer/src/store/app-store.js`. Inside the `create(...)` call, add to the initial state:

```javascript
activeNotesFolder: null,      // string | null — currently selected folder in Notes tab
activeNotesChapter: null,     // string | null — file basename to scroll to
librarySelectedFile: null,    // string | null — file basename to select when switching to Library tab
```

And add setters in the actions section:

```javascript
setActiveNotesFolder: (folder) => set({ activeNotesFolder: folder }),
setActiveNotesChapter: (chapter) => set({ activeNotesChapter: chapter }),
setLibrarySelectedFile: (name) => set({ librarySelectedFile: name }),
```

- [ ] **Step 2: Make LibraryTab respond to librarySelectedFile from store**

Open `src/renderer/src/components/LibraryTab.jsx`. Find the `selectedFile` local state and add a `useEffect` that reads from the store when the tab becomes active:

```javascript
const librarySelectedFile = useAppStore((s) => s.librarySelectedFile)
const setLibrarySelectedFile = useAppStore((s) => s.setLibrarySelectedFile)

useEffect(() => {
  if (librarySelectedFile) {
    // Find the matching file object by basename
    const match = libraryFiles.find((f) => f.name === librarySelectedFile)
    if (match) setSelectedFile(match)
    setLibrarySelectedFile(null) // consume the request
  }
}, [librarySelectedFile])
```

`libraryFiles` is already available in the store — use `useAppStore(s => s.libraryFiles)` if not already subscribed.

- [ ] **Step 2: Add AI settings section to SettingsPanel.jsx**

Open `src/renderer/src/components/SettingsPanel.jsx`. It uses a `handleConfigChange(key, value)` helper that calls `window.api.writeConfig({ [key]: value })` and updates local config state — verify this pattern exists and use it. Add a new "AI" section after the last existing section divider. Insert:

```jsx
{
  /* AI Settings */
}
;<div className="border-t border-gray-700 pt-4">
  <h3 className="text-sm font-semibold text-gray-300 mb-3">AI Summary</h3>

  <div className="mb-3">
    <label className="block text-xs text-gray-400 mb-1">Provider</label>
    <select
      value={config.aiProvider || 'gemini'}
      onChange={(e) => handleConfigChange('aiProvider', e.target.value)}
      className="w-full bg-gray-700 text-white text-sm rounded px-2 py-1 border border-gray-600"
    >
      <option value="gemini">Gemini (Google)</option>
      <option value="claude">Claude (Anthropic)</option>
      <option value="openai">OpenAI</option>
    </select>
  </div>

  <div className="mb-3">
    <label className="block text-xs text-gray-400 mb-1">API Key</label>
    <input
      type="password"
      value={config.aiApiKey || ''}
      onChange={(e) => handleConfigChange('aiApiKey', e.target.value)}
      placeholder="Paste your API key"
      className="w-full bg-gray-700 text-white text-sm rounded px-2 py-1 border border-gray-600"
    />
  </div>

  <div className="mb-3">
    <label className="block text-xs text-gray-400 mb-1">
      Model{' '}
      {config.aiApiKey && (
        <button
          onClick={handleFetchModels}
          className="text-blue-400 hover:text-blue-300 text-xs ml-1"
        >
          (load models)
        </button>
      )}
    </label>
    {availableModels.length > 0 ? (
      <select
        value={config.aiModel || ''}
        onChange={(e) => handleConfigChange('aiModel', e.target.value)}
        className="w-full bg-gray-700 text-white text-sm rounded px-2 py-1 border border-gray-600"
      >
        <option value="">Default</option>
        {availableModels.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
    ) : (
      <input
        type="text"
        value={config.aiModel || ''}
        onChange={(e) => handleConfigChange('aiModel', e.target.value)}
        placeholder="Leave blank for default"
        className="w-full bg-gray-700 text-white text-sm rounded px-2 py-1 border border-gray-600"
      />
    )}
  </div>

  <div className="mb-3 flex items-center justify-between">
    <label className="text-xs text-gray-400">Auto-summarize new downloads</label>
    <button
      onClick={() => handleConfigChange('autoSummarizeEnabled', !config.autoSummarizeEnabled)}
      className={`w-10 h-5 rounded-full transition-colors ${config.autoSummarizeEnabled ? 'bg-blue-500' : 'bg-gray-600'}`}
    >
      <span
        className={`block w-4 h-4 bg-white rounded-full mx-0.5 transition-transform ${config.autoSummarizeEnabled ? 'translate-x-5' : 'translate-x-0'}`}
      />
    </button>
  </div>

  <div className="mb-1">
    <label className="block text-xs text-gray-400 mb-1">Default summary prompt</label>
    <textarea
      value={config.defaultSummaryPrompt || ''}
      onChange={(e) => handleConfigChange('defaultSummaryPrompt', e.target.value)}
      rows={3}
      className="w-full bg-gray-700 text-white text-xs rounded px-2 py-1 border border-gray-600 resize-none"
    />
    <p className="text-xs text-gray-500 mt-1">
      Override per folder by adding a <code>summary-prompt.md</code> file inside that folder.
    </p>
  </div>
</div>
```

Add `availableModels` state and `handleFetchModels` to the SettingsPanel component:

```javascript
const [availableModels, setAvailableModels] = useState([])

const handleFetchModels = async () => {
  try {
    const models = await window.api.fetchAiModels(config.aiProvider || 'gemini', config.aiApiKey)
    setAvailableModels(models)
  } catch {
    setAvailableModels([])
  }
}
```

Ensure `useState` is imported at the top if not already.

- [ ] **Step 3: Smoke test settings**

```bash
npm run dev
```

Open Settings. Verify the AI section renders with provider dropdown, API key field, model input, toggle, and prompt textarea.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/store/app-store.js src/renderer/src/components/SettingsPanel.jsx
git commit -m "feat: add activeNotes state to store and AI settings section to SettingsPanel"
```

---

## Task 8: Build NotesFolderList and NotesChapterView

**Files:**

- Create: `src/renderer/src/components/NotesFolderList.jsx`
- Create: `src/renderer/src/components/NotesChapterView.jsx`

- [ ] **Step 1: Create NotesFolderList.jsx**

```jsx
// src/renderer/src/components/NotesFolderList.jsx
export default function NotesFolderList({ folders, activeFolder, onSelect }) {
  return (
    <div className="flex flex-col gap-0.5 p-2">
      {[null, ...folders].map((folder) => (
        <button
          key={folder ?? '__root__'}
          onClick={() => onSelect(folder)}
          className={`text-left text-sm px-3 py-1.5 rounded truncate transition-colors ${
            activeFolder === folder
              ? 'bg-gray-600 text-white'
              : 'text-gray-400 hover:bg-gray-700 hover:text-white'
          }`}
        >
          {folder ?? '(Library)'}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Create NotesChapterView.jsx**

```jsx
// src/renderer/src/components/NotesChapterView.jsx
import { useState, useRef, useEffect } from 'react'
import { useAppStore } from '../store/app-store.js'

function ChapterCard({ chapter, onGenerateSummary, onUpdateBullets, onPlayInLibrary }) {
  const [editingBullets, setEditingBullets] = useState(false)
  const [bulletText, setBulletText] = useState(chapter.bullets.join('\n'))
  const [summarizing, setSummarizing] = useState(false)
  const [summaryError, setSummaryError] = useState(null)
  const [localSummary, setLocalSummary] = useState(chapter.summary)

  const handleSaveBullets = () => {
    const bullets = bulletText
      .split('\n')
      .map((b) => b.replace(/^-\s*/, '').trim())
      .filter(Boolean)
    onUpdateBullets(chapter.file, bullets)
    setEditingBullets(false)
  }

  const handleGenerate = async () => {
    setSummarizing(true)
    setSummaryError(null)
    try {
      const { summary } = await onGenerateSummary(chapter.file)
      setLocalSummary(summary)
    } catch (e) {
      setSummaryError(e.message || 'Failed to generate summary')
    } finally {
      setSummarizing(false)
    }
  }

  return (
    <div className="mb-6 last:mb-0">
      <div className="flex items-start justify-between mb-2">
        <h2 className="text-base font-semibold text-white">{chapter.heading}</h2>
        <button
          onClick={() => onPlayInLibrary(chapter.file)}
          className="text-xs text-blue-400 hover:text-blue-300 whitespace-nowrap ml-4 shrink-0"
        >
          ▶ Play in Library
        </button>
      </div>
      <div className="text-xs text-gray-500 mb-3 flex gap-3">
        <span>📁 {chapter.file}</span>
        {chapter.url && (
          <span>
            🔗{' '}
            <a
              href={chapter.url}
              target="_blank"
              rel="noreferrer"
              className="text-blue-400 hover:underline"
            >
              {new URL(chapter.url).hostname}
            </a>
          </span>
        )}
        {chapter.downloadedAt && <span>📅 {chapter.downloadedAt}</span>}
      </div>

      {/* AI Summary */}
      <div className="mb-3">
        <div className="text-xs font-medium text-gray-400 mb-1">AI Summary</div>
        {localSummary ? (
          <div className="text-sm text-gray-300 leading-relaxed">{localSummary}</div>
        ) : (
          <div className="text-xs text-gray-500 italic">No summary yet.</div>
        )}
        {summarizing ? (
          <div className="text-xs text-gray-400 mt-1 animate-pulse">Generating…</div>
        ) : summaryError ? (
          <div className="mt-1 flex gap-2 items-center">
            <span className="text-xs text-red-400">{summaryError}</span>
            <button onClick={handleGenerate} className="text-xs text-blue-400 hover:text-blue-300">
              Retry
            </button>
          </div>
        ) : (
          <button
            onClick={handleGenerate}
            className="mt-1 text-xs text-blue-400 hover:text-blue-300"
          >
            {localSummary ? '↻ Regenerate' : 'Generate Summary'}
          </button>
        )}
      </div>

      {/* My Notes */}
      <div>
        <div className="text-xs font-medium text-gray-400 mb-1">My Notes</div>
        {editingBullets ? (
          <div>
            <textarea
              value={bulletText}
              onChange={(e) => setBulletText(e.target.value)}
              rows={4}
              className="w-full bg-gray-700 text-white text-sm rounded px-2 py-1 border border-gray-600 resize-none"
              placeholder="One note per line"
            />
            <div className="flex gap-2 mt-1">
              <button
                onClick={handleSaveBullets}
                className="text-xs text-green-400 hover:text-green-300"
              >
                Save
              </button>
              <button
                onClick={() => {
                  setBulletText(chapter.bullets.join('\n'))
                  setEditingBullets(false)
                }}
                className="text-xs text-gray-400 hover:text-gray-300"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div>
            {chapter.bullets.length > 0 ? (
              <ul className="text-sm text-gray-300 space-y-0.5 mb-1">
                {chapter.bullets.map((b, i) => (
                  <li key={i} className="before:content-['•'] before:mr-2 before:text-gray-500">
                    {b}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-xs text-gray-500 italic mb-1">No notes yet.</div>
            )}
            <button
              onClick={() => setEditingBullets(true)}
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              ✎ Edit
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function NotesChapterView({ folderName, activeChapter }) {
  const [chapters, setChapters] = useState([])
  const [loading, setLoading] = useState(false)
  const chapterRefs = useRef({})

  useEffect(() => {
    setLoading(true)
    window.api
      .readNotes(folderName)
      .then((data) => setChapters(data.chapters))
      .finally(() => setLoading(false))
  }, [folderName])

  useEffect(() => {
    if (activeChapter && chapterRefs.current[activeChapter]) {
      chapterRefs.current[activeChapter].scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [activeChapter, chapters])

  const setActiveTab = useAppStore((s) => s.setActiveTab)
  const setLibrarySelectedFile = useAppStore((s) => s.setLibrarySelectedFile)

  const handlePlayInLibrary = (fileBasename) => {
    setActiveTab('library')
    // LibraryTab reads selectedFile from store; set by basename for matching
    setLibrarySelectedFile(fileBasename)
  }

  const handleGenerateSummary = async (fileBasename) => {
    // Resolve full path via library files
    const files = useAppStore.getState().libraryFiles
    const file = files.find(
      (f) => f.name === fileBasename && (folderName ? f.folder === folderName : !f.folder)
    )
    if (!file) throw new Error('File not found in library')
    return window.api.generateSummary(file.path)
  }

  const handleUpdateBullets = (fileBasename, bullets) => {
    const files = useAppStore.getState().libraryFiles
    const file = files.find(
      (f) => f.name === fileBasename && (folderName ? f.folder === folderName : !f.folder)
    )
    if (!file) return
    window.api.updateBullets(file.path, bullets)
    setChapters((prev) => prev.map((c) => (c.file === fileBasename ? { ...c, bullets } : c)))
  }

  if (loading) return <div className="p-4 text-sm text-gray-400">Loading…</div>
  if (chapters.length === 0)
    return (
      <div className="p-4 text-sm text-gray-500">
        No notes yet. Download a video to get started.
      </div>
    )

  return (
    <div className="p-4 overflow-y-auto h-full">
      {chapters.map((chapter) => (
        <div
          key={chapter.file}
          ref={(el) => {
            chapterRefs.current[chapter.file] = el
          }}
          className="border-b border-gray-700 pb-5 mb-5 last:border-0"
        >
          <ChapterCard
            chapter={chapter}
            onGenerateSummary={handleGenerateSummary}
            onUpdateBullets={handleUpdateBullets}
            onPlayInLibrary={handlePlayInLibrary}
          />
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/NotesFolderList.jsx src/renderer/src/components/NotesChapterView.jsx
git commit -m "feat: add NotesFolderList and NotesChapterView components"
```

---

## Task 9: Build NotesTab and Wire Up Navigation

**Files:**

- Create: `src/renderer/src/components/NotesTab.jsx`
- Modify: `src/renderer/src/components/TabBar.jsx`
- Modify: `src/renderer/src/components/App.jsx`
- Modify: `src/renderer/src/components/LibraryDetailPanel.jsx`

- [ ] **Step 1: Create NotesTab.jsx**

```jsx
// src/renderer/src/components/NotesTab.jsx
import { useState, useEffect } from 'react'
import NotesFolderList from './NotesFolderList.jsx'
import NotesChapterView from './NotesChapterView.jsx'
import { useAppStore } from '../store/app-store.js'

export default function NotesTab() {
  const [folders, setFolders] = useState([])
  const activeNotesFolder = useAppStore((s) => s.activeNotesFolder)
  const activeNotesChapter = useAppStore((s) => s.activeNotesChapter)
  const setActiveNotesFolder = useAppStore((s) => s.setActiveNotesFolder)

  useEffect(() => {
    window.api.listFolders().then(setFolders)
  }, [])

  const selectedFolder = activeNotesFolder !== undefined ? activeNotesFolder : null

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left sidebar — folder list */}
      <div className="w-44 shrink-0 border-r border-gray-700 overflow-y-auto">
        <div className="px-3 pt-3 pb-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Folders
        </div>
        <NotesFolderList
          folders={folders}
          activeFolder={selectedFolder}
          onSelect={setActiveNotesFolder}
        />
      </div>

      {/* Right panel — chapter view */}
      <div className="flex-1 overflow-hidden">
        <NotesChapterView folderName={selectedFolder} activeChapter={activeNotesChapter} />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add Notes tab to TabBar.jsx**

Open `src/renderer/src/components/TabBar.jsx`. Find the `TABS` array and add the Notes entry:

```javascript
const TABS = [
  { id: 'browser', label: 'Browser' },
  { id: 'library', label: 'Library' },
  { id: 'notes', label: 'Notes' }
]
```

- [ ] **Step 3: Add Notes tab panel to App.jsx**

Open `src/renderer/src/components/App.jsx`. Add import:

```javascript
import NotesTab from './NotesTab.jsx'
```

Then add the conditional panel alongside the existing ones:

```jsx
<div className={activeTab === 'notes' ? 'h-full overflow-hidden' : 'hidden'}>
  <NotesTab />
</div>
```

- [ ] **Step 4: Add "View Notes" button to LibraryDetailPanel.jsx**

Open `src/renderer/src/components/LibraryDetailPanel.jsx`. Add this import at the top:

```javascript
import { useAppStore } from '../store/app-store.js'
```

Inside the component, add:

```javascript
const setActiveTab = useAppStore((s) => s.setActiveTab)
const setActiveNotesFolder = useAppStore((s) => s.setActiveNotesFolder)
const setActiveNotesChapter = useAppStore((s) => s.setActiveNotesChapter)

const handleViewNotes = () => {
  setActiveNotesFolder(file.folder ?? null)
  setActiveNotesChapter(file.name)
  setActiveTab('notes')
}
```

Then, in the header section (near the Delete button), add the "View Notes" button:

```jsx
<button
  onClick={handleViewNotes}
  className="text-blue-400 hover:text-blue-300 text-xs px-2 py-1 rounded hover:bg-blue-950 transition-colors"
  title="View in Notes tab"
>
  📝 Notes
</button>
```

- [ ] **Step 5: Smoke test the full feature**

```bash
npm run dev
```

1. Click the **Notes** tab — verify it shows with folder list and "(Library)" root entry
2. Download a test video — verify a chapter stub appears in Notes after download completes
3. Click **Generate Summary** on a chapter — verify summary populates (requires valid API key in Settings)
4. Click **✎ Edit** on My Notes — add a bullet, Save — verify it saves and `notes.md` file is updated on disk
5. In Library tab, select a file, click **📝 Notes** — verify Notes tab opens and scrolls to that chapter
6. In Notes tab, click **▶ Play in Library** — verify Library tab opens and selects the file

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/NotesTab.jsx src/renderer/src/components/NotesFolderList.jsx src/renderer/src/components/NotesChapterView.jsx src/renderer/src/components/TabBar.jsx src/renderer/src/components/App.jsx src/renderer/src/components/LibraryDetailPanel.jsx
git commit -m "feat: add Notes tab with bidirectional Library navigation and chapter view"
```

---

## Task 10: Renderer Tests

**Files:**

- Create: `tests/renderer/NotesTab.test.jsx`

- [ ] **Step 1: Write renderer tests**

Create `tests/renderer/NotesTab.test.jsx`:

```jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/renderer/src/store/app-store.js', () => {
  const state = {
    activeNotesFolder: null,
    activeNotesChapter: null,
    libraryFiles: [],
    setActiveNotesFolder: vi.fn(),
    setActiveNotesChapter: vi.fn(),
    setActiveTab: vi.fn(),
    setLibrarySelectedFile: vi.fn()
  }
  return { useAppStore: vi.fn((selector) => (selector ? selector(state) : state)) }
})

const mockApi = {
  listFolders: vi.fn(async () => ['Travel', 'Cooking']),
  readNotes: vi.fn(async () => ({
    title: 'Library',
    chapters: [
      {
        file: 'video.mp4',
        url: 'https://youtube.com/watch?v=1',
        downloadedAt: '2026-03-28',
        heading: 'My Video',
        summary: 'Great content.',
        bullets: ['key point']
      }
    ]
  })),
  generateSummary: vi.fn(async () => ({ summary: 'New summary' })),
  updateBullets: vi.fn()
}
global.window = { ...global.window, api: mockApi }

import NotesTab from '../../src/renderer/src/components/NotesTab.jsx'

beforeEach(() => vi.clearAllMocks())

describe('NotesTab', () => {
  it('renders folder list and root entry', async () => {
    render(<NotesTab />)
    await waitFor(() => expect(screen.getByText('(Library)')).toBeTruthy())
    expect(screen.getByText('Travel')).toBeTruthy()
    expect(screen.getByText('Cooking')).toBeTruthy()
  })

  it('renders chapter heading and summary', async () => {
    render(<NotesTab />)
    await waitFor(() => expect(screen.getByText('My Video')).toBeTruthy())
    expect(screen.getByText('Great content.')).toBeTruthy()
  })

  it('renders bullet points', async () => {
    render(<NotesTab />)
    await waitFor(() => expect(screen.getByText('key point')).toBeTruthy())
  })

  it('shows Edit button and textarea on click', async () => {
    render(<NotesTab />)
    await waitFor(() => screen.getByText('✎ Edit'))
    fireEvent.click(screen.getByText('✎ Edit'))
    expect(screen.getByRole('textbox')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run renderer tests**

```bash
npm run test:renderer
```

Expected: all PASS

- [ ] **Step 3: Run full test suite**

```bash
npm run test:all
```

Expected: all PASS

- [ ] **Step 4: Final commit**

```bash
git add tests/renderer/NotesTab.test.jsx
git commit -m "test: add NotesTab renderer tests"
```
