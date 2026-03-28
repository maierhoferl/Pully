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
  getNotesPath,
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
    const metadata = { title: 'My Video', url: 'https://youtube.com/watch?v=abc', downloadedAt: '2026-03-28T00:00:00.000Z' }
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
    initChapter(filePath, { title: 'Trip', url: '', downloadedAt: '2026-03-28T00:00:00.000Z' }, tmpDir)
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
    fs.writeFileSync(notesPath, `# Library\n\n---\n\n## My Video\n<!-- pully:file:video.mp4 -->\n<!-- pully:url:https://yt.com/1 -->\n<!-- pully:downloaded:2026-03-28 -->\n\n### AI Summary\nGreat video about stuff.\n\n### My Notes\n- point one\n- point two\n\n---\n`)
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
    initChapter(filePath, { title: 'Vid', url: '', downloadedAt: '2026-03-28T00:00:00.000Z' }, tmpDir)
    writeSummarySection(filePath, 'This is the AI summary.', tmpDir)
    const content = fs.readFileSync(path.join(tmpDir, 'notes.md'), 'utf8')
    expect(content).toContain('This is the AI summary.')
  })

  it('replaces existing summary without touching My Notes', () => {
    const filePath = path.join(tmpDir, 'video.mp4')
    initChapter(filePath, { title: 'Vid', url: '', downloadedAt: '2026-03-28T00:00:00.000Z' }, tmpDir)
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
    initChapter(filePath, { title: 'Vid', url: '', downloadedAt: '2026-03-28T00:00:00.000Z' }, tmpDir)
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
    initChapter(oldPath, { title: 'Trip', url: 'https://yt.com/2', downloadedAt: '2026-03-28T00:00:00.000Z' }, tmpDir)
    moveChapter(oldPath, newPath, tmpDir)
    const rootContent = fs.readFileSync(path.join(tmpDir, 'notes.md'), 'utf8')
    const travelContent = fs.readFileSync(path.join(tmpDir, 'Travel', 'notes.md'), 'utf8')
    expect(rootContent).not.toContain('<!-- pully:file:trip.mp4 -->')
    expect(travelContent).toContain('<!-- pully:file:trip.mp4 -->')
  })
})
