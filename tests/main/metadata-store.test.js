/**
 * metadata-store tests — Obsidian note-backed storage.
 *
 * The vault is a real temp directory; each writeMetadataEntry creates a .md note.
 * readMetadataIndex scans the vault and rebuilds the index from frontmatter.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  readMetadataIndex,
  writeMetadataEntry,
  renameFolderInIndex,
  deleteFolderFromIndex
} from '../../src/main/metadata-store.js'

let vault
beforeEach(() => {
  vault = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-meta-'))
})
afterEach(() => {
  fs.rmSync(vault, { recursive: true })
})

describe('readMetadataIndex', () => {
  it('returns empty object when vault has no notes', () => {
    expect(readMetadataIndex(vault)).toEqual({})
  })

  it('returns entries parsed from .md notes', () => {
    const mediaPath = path.join(vault, 'video.mp4')
    writeMetadataEntry(mediaPath, {
      title: 'Test',
      uploader: 'Author',
      description: 'Desc',
      thumbnailUrl: 'http://t',
      downloadedAt: '2026-01-01T00:00:00.000Z'
    })
    const index = readMetadataIndex(vault)
    expect(index[mediaPath]).toBeDefined()
    expect(index[mediaPath].title).toBe('Test')
    expect(index[mediaPath].uploader).toBe('Author')
  })
})

describe('writeMetadataEntry', () => {
  it('creates a companion .md note and makes the entry readable', () => {
    const mediaPath = path.join(vault, 'video.mp4')
    writeMetadataEntry(mediaPath, {
      title: 'Hello',
      uploader: 'Bob',
      description: 'X',
      thumbnailUrl: null,
      downloadedAt: '2026-01-01T00:00:00.000Z'
    })
    expect(fs.existsSync(path.join(vault, 'video.md'))).toBe(true)
    const index = readMetadataIndex(vault)
    expect(index[mediaPath].title).toBe('Hello')
  })

  it('creates notes for multiple entries independently', () => {
    const pathA = path.join(vault, 'a.mp4')
    const pathB = path.join(vault, 'b.mp4')
    writeMetadataEntry(pathA, {
      title: 'A',
      uploader: null,
      description: null,
      thumbnailUrl: null,
      downloadedAt: '2026-01-01T00:00:00.000Z'
    })
    writeMetadataEntry(pathB, {
      title: 'B',
      uploader: null,
      description: null,
      thumbnailUrl: null,
      downloadedAt: '2026-01-02T00:00:00.000Z'
    })
    const index = readMetadataIndex(vault)
    expect(index[pathA].title).toBe('A')
    expect(index[pathB].title).toBe('B')
  })
})

describe('renameFolderInIndex', () => {
  it('entries are accessible under new path after folder is renamed on disk', () => {
    const japanDir = path.join(vault, 'Japan')
    fs.mkdirSync(japanDir)
    writeMetadataEntry(path.join(japanDir, 'v1.mp4'), {
      title: 'V1', uploader: null, description: null, thumbnailUrl: null, downloadedAt: null
    })
    writeMetadataEntry(path.join(japanDir, 'v2.mp4'), {
      title: 'V2', uploader: null, description: null, thumbnailUrl: null, downloadedAt: null
    })
    writeMetadataEntry(path.join(vault, 'other.mp4'), {
      title: 'Other', uploader: null, description: null, thumbnailUrl: null, downloadedAt: null
    })

    // Rename folder on disk (notes move with it automatically)
    const tripDir = path.join(vault, 'JapanTrip')
    fs.renameSync(japanDir, tripDir)

    // renameFolderInIndex is a no-op in Obsidian mode — notes already moved with folder
    renameFolderInIndex(japanDir, tripDir)

    const idx = readMetadataIndex(vault)
    expect(idx[path.join(tripDir, 'v1.mp4')]?.title).toBe('V1')
    expect(idx[path.join(tripDir, 'v2.mp4')]?.title).toBe('V2')
    expect(idx[path.join(japanDir, 'v1.mp4')]).toBeUndefined()
    expect(idx[path.join(vault, 'other.mp4')]?.title).toBe('Other')
  })

  it('is a no-op when no entries match', () => {
    writeMetadataEntry(path.join(vault, 'other.mp4'), {
      title: 'Other', uploader: null, description: null, thumbnailUrl: null, downloadedAt: null
    })
    renameFolderInIndex(path.join(vault, 'Japan'), path.join(vault, 'JapanTrip'))
    const idx = readMetadataIndex(vault)
    expect(idx[path.join(vault, 'other.mp4')]?.title).toBe('Other')
  })
})

describe('deleteFolderFromIndex', () => {
  it('entries are gone after folder and its notes are deleted from disk', () => {
    const japanDir = path.join(vault, 'Japan')
    fs.mkdirSync(japanDir)
    writeMetadataEntry(path.join(japanDir, 'v1.mp4'), {
      title: 'V1', uploader: null, description: null, thumbnailUrl: null, downloadedAt: null
    })
    writeMetadataEntry(path.join(vault, 'other.mp4'), {
      title: 'Other', uploader: null, description: null, thumbnailUrl: null, downloadedAt: null
    })

    // Delete folder (and its .md notes) from disk, then call the no-op helper
    fs.rmSync(japanDir, { recursive: true })
    deleteFolderFromIndex(japanDir)

    const idx = readMetadataIndex(vault)
    expect(idx[path.join(japanDir, 'v1.mp4')]).toBeUndefined()
    expect(idx[path.join(vault, 'other.mp4')]?.title).toBe('Other')
  })

  it('is a no-op when no entries match', () => {
    writeMetadataEntry(path.join(vault, 'other.mp4'), {
      title: 'Other', uploader: null, description: null, thumbnailUrl: null, downloadedAt: null
    })
    deleteFolderFromIndex(path.join(vault, 'Japan'))
    const idx = readMetadataIndex(vault)
    expect(idx[path.join(vault, 'other.mp4')]?.title).toBe('Other')
  })
})
