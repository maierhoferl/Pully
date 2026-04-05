/**
 * notes-store tests — individual Obsidian note per content item.
 *
 * Each file gets its own .md note instead of a shared notes.md per folder.
 */
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
  it('returns a .md path with the same stem as the media file', () => {
    const filePath = path.join(tmpDir, 'video.mp4')
    expect(getNotesPath(filePath, tmpDir)).toBe(path.join(tmpDir, 'video.md'))
  })

  it('returns a .md path in the same subfolder', () => {
    const filePath = path.join(tmpDir, 'Travel', 'trip.mp4')
    expect(getNotesPath(filePath, tmpDir)).toBe(path.join(tmpDir, 'Travel', 'trip.md'))
  })
})

describe('initChapter', () => {
  it('creates a companion .md note with frontmatter and sections', () => {
    const filePath = path.join(tmpDir, 'video.mp4')
    const metadata = {
      title: 'My Video',
      url: 'https://youtube.com/watch?v=abc',
      downloadedAt: '2026-03-28T00:00:00.000Z'
    }
    initChapter(filePath, metadata, tmpDir)

    const notePath = path.join(tmpDir, 'video.md')
    expect(fs.existsSync(notePath)).toBe(true)
    const content = fs.readFileSync(notePath, 'utf8')
    expect(content).toContain('title: My Video')
    expect(content).toContain('youtube.com/watch?v=abc') // URL is YAML-quoted due to ':'
    expect(content).toContain('file: video.mp4')
    expect(content).toContain('## AI Summary')
    expect(content).toContain('## My Notes')
  })

  it('creates parent directory for note if it does not exist', () => {
    const filePath = path.join(tmpDir, 'Travel', 'trip.mp4')
    fs.mkdirSync(path.join(tmpDir, 'Travel'))
    initChapter(
      filePath,
      { title: 'Trip', url: '', downloadedAt: '2026-03-28T00:00:00.000Z' },
      tmpDir
    )
    expect(fs.existsSync(path.join(tmpDir, 'Travel', 'trip.md'))).toBe(true)
  })

  it('does not create a duplicate note if one already exists', () => {
    const filePath = path.join(tmpDir, 'video.mp4')
    const metadata = { title: 'My Video', url: '', downloadedAt: '2026-03-28T00:00:00.000Z' }
    initChapter(filePath, metadata, tmpDir)
    initChapter(filePath, metadata, tmpDir)

    const notePath = path.join(tmpDir, 'video.md')
    // Should have exactly one frontmatter block
    const content = fs.readFileSync(notePath, 'utf8')
    expect((content.match(/^---$/gm) || []).length).toBe(2) // opening + closing ---
  })

  it('adopts an existing note created by URL when real filename becomes available', () => {
    const metadata1 = {
      title: 'My Video',
      url: 'https://example.com/video',
      downloadedAt: '2026-03-29'
    }
    // First call: URL stub (no file on disk yet)
    initChapter('https://example.com/video', metadata1, tmpDir)

    // The URL stub note lives at tmpDir/My Video.md (or similar)
    // Second call: real filename available
    const videoPath = path.join(tmpDir, 'video.mp4')
    initChapter(videoPath, { ...metadata1 }, tmpDir)

    // The video.md note should now exist and contain the file reference
    const notePath = path.join(tmpDir, 'video.md')
    expect(fs.existsSync(notePath)).toBe(true)
    const content = fs.readFileSync(notePath, 'utf8')
    expect(content).toContain('file: video.mp4')
  })
})

describe('readFolderNotes', () => {
  it('returns empty chapters array when no notes exist', () => {
    const result = readFolderNotes(null, tmpDir)
    expect(result.chapters).toEqual([])
  })

  it('parses chapters from .md notes in the folder', () => {
    const filePath = path.join(tmpDir, 'video.mp4')
    initChapter(
      filePath,
      {
        title: 'My Video',
        url: 'https://yt.com/1',
        downloadedAt: '2026-03-28'
      },
      tmpDir
    )
    writeSummarySection(filePath, 'Great video about stuff.', tmpDir)
    writeBulletsSection(filePath, ['point one', 'point two'], tmpDir)

    const result = readFolderNotes(null, tmpDir)
    expect(result.chapters).toHaveLength(1)
    expect(result.chapters[0].filePath).toBe('video.mp4')
    expect(result.chapters[0].url).toBe('https://yt.com/1')
    expect(result.chapters[0].summary).toBe('Great video about stuff.')
    expect(result.chapters[0].bullets).toEqual(['point one', 'point two'])
  })
})

describe('writeSummarySection', () => {
  it('writes summary into the ## AI Summary section of the companion note', () => {
    const filePath = path.join(tmpDir, 'video.mp4')
    initChapter(
      filePath,
      { title: 'Vid', url: '', downloadedAt: '2026-03-28T00:00:00.000Z' },
      tmpDir
    )
    writeSummarySection(filePath, 'This is the AI summary.', tmpDir)
    const content = fs.readFileSync(path.join(tmpDir, 'video.md'), 'utf8')
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
    const content = fs.readFileSync(path.join(tmpDir, 'video.md'), 'utf8')
    expect(content).toContain('Replaced summary.')
    expect(content).not.toContain('First summary.')
    expect(content).toContain('- my note')
  })
})

describe('writeBulletsSection', () => {
  it('writes bullets into the ## My Notes section', () => {
    const filePath = path.join(tmpDir, 'video.mp4')
    initChapter(
      filePath,
      { title: 'Vid', url: '', downloadedAt: '2026-03-28T00:00:00.000Z' },
      tmpDir
    )
    writeBulletsSection(filePath, ['bullet one', 'bullet two'], tmpDir)
    const content = fs.readFileSync(path.join(tmpDir, 'video.md'), 'utf8')
    expect(content).toContain('- bullet one')
    expect(content).toContain('- bullet two')
  })
})

describe('moveChapter', () => {
  it('moves the companion note from root to a subfolder', () => {
    fs.mkdirSync(path.join(tmpDir, 'Travel'))
    const oldPath = path.join(tmpDir, 'trip.mp4')
    const newPath = path.join(tmpDir, 'Travel', 'trip.mp4')
    initChapter(
      oldPath,
      { title: 'Trip', url: 'https://yt.com/2', downloadedAt: '2026-03-28T00:00:00.000Z' },
      tmpDir
    )
    moveChapter(oldPath, newPath, tmpDir)

    expect(fs.existsSync(path.join(tmpDir, 'trip.md'))).toBe(false)
    expect(fs.existsSync(path.join(tmpDir, 'Travel', 'trip.md'))).toBe(true)

    const travelContent = fs.readFileSync(path.join(tmpDir, 'Travel', 'trip.md'), 'utf8')
    expect(travelContent).toContain('file: trip.mp4')
  })
})
