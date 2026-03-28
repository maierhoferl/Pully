import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { readConfig, writeConfig } from '../../src/main/config-store.js'

let tmp
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-')) })
afterEach(() => { fs.rmSync(tmp, { recursive: true }) })

describe('readConfig', () => {
  it('returns defaults when no file exists', () => {
    const cfg = readConfig(path.join(tmp, 'cfg.json'))
    expect(cfg.maxConcurrent).toBe(3)
    expect(cfg.autoClassifyEnabled).toBe(false)
    expect(cfg.autoClassifyProvider).toBe('local')
    expect(cfg.autoClassifyApiKey).toBe('')
    expect(cfg.autoClassifyModel).toBe('')
  })
  it('merges saved values with defaults', () => {
    const p = path.join(tmp, 'cfg.json')
    fs.writeFileSync(p, JSON.stringify({ outputFolder: '/tmp/vids' }))
    const cfg = readConfig(p)
    expect(cfg.outputFolder).toBe('/tmp/vids')
    expect(cfg.maxConcurrent).toBe(3)
    expect(cfg.autoClassifyEnabled).toBe(false)
    expect(cfg.autoClassifyProvider).toBe('local')
    expect(cfg.autoClassifyApiKey).toBe('')
    expect(cfg.autoClassifyModel).toBe('')
  })
})

describe('writeConfig', () => {
  it('persists and re-reads values', () => {
    const p = path.join(tmp, 'cfg.json')
    writeConfig({ outputFolder: '/dl', maxConcurrent: 2 }, p)
    const cfg = readConfig(p)
    expect(cfg.outputFolder).toBe('/dl')
    expect(cfg.maxConcurrent).toBe(2)
    expect(cfg.autoClassifyEnabled).toBe(false)
    expect(cfg.autoClassifyProvider).toBe('local')
    expect(cfg.autoClassifyApiKey).toBe('')
    expect(cfg.autoClassifyModel).toBe('')
  })
  it('merges partial updates without losing existing values', () => {
    const p = path.join(tmp, 'cfg.json')
    writeConfig({ outputFolder: '/dl', maxConcurrent: 3 }, p)
    writeConfig({ maxConcurrent: 1 }, p)
    const cfg = readConfig(p)
    expect(cfg.outputFolder).toBe('/dl')
    expect(cfg.maxConcurrent).toBe(1)
  })
})
