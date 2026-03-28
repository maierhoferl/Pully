import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { readMetadataIndex, writeMetadataEntry } from '../../src/main/metadata-store.js'

let tmp
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-meta-')) })
afterEach(() => { fs.rmSync(tmp, { recursive: true }) })

describe('readMetadataIndex', () => {
  it('returns empty object when no file exists', () => {
    expect(readMetadataIndex(path.join(tmp, 'meta.json'))).toEqual({})
  })

  it('returns parsed object when file exists', () => {
    const p = path.join(tmp, 'meta.json')
    const entry = { title: 'Test', uploader: 'Author', description: 'Desc', thumbnailUrl: 'http://t', downloadedAt: '2026-01-01T00:00:00.000Z' }
    fs.writeFileSync(p, JSON.stringify({ '/path/video.mp4': entry }))
    expect(readMetadataIndex(p)).toEqual({ '/path/video.mp4': entry })
  })
})

describe('writeMetadataEntry', () => {
  it('creates index and writes entry', () => {
    const p = path.join(tmp, 'meta.json')
    writeMetadataEntry('/path/video.mp4', { title: 'Hello', uploader: 'Bob', description: 'X', thumbnailUrl: null, downloadedAt: '2026-01-01T00:00:00.000Z' }, p)
    const index = readMetadataIndex(p)
    expect(index['/path/video.mp4'].title).toBe('Hello')
  })

  it('merges multiple entries without overwriting others', () => {
    const p = path.join(tmp, 'meta.json')
    writeMetadataEntry('/a.mp4', { title: 'A', uploader: null, description: null, thumbnailUrl: null, downloadedAt: '2026-01-01T00:00:00.000Z' }, p)
    writeMetadataEntry('/b.mp4', { title: 'B', uploader: null, description: null, thumbnailUrl: null, downloadedAt: '2026-01-02T00:00:00.000Z' }, p)
    const index = readMetadataIndex(p)
    expect(index['/a.mp4'].title).toBe('A')
    expect(index['/b.mp4'].title).toBe('B')
  })
})
