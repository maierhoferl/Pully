import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { createLogger } from '../../src/main/logger.js'

describe('Logger', () => {
  let tempDir
  let logger

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'logger-test-'))
  })

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true })
    }
  })

  it('should create a daily log file', () => {
    logger = createLogger(tempDir)
    logger.info('download', 'Test message', { url: 'http://example.com' })

    const today = new Date().toISOString().split('T')[0]
    const logFile = path.join(tempDir, `${today}.log`)
    expect(fs.existsSync(logFile)).toBe(true)
  })

  it('should write JSON Lines format', () => {
    logger = createLogger(tempDir)
    logger.info('download', 'Test message', { url: 'http://example.com' })

    const today = new Date().toISOString().split('T')[0]
    const logFile = path.join(tempDir, `${today}.log`)
    const content = fs.readFileSync(logFile, 'utf-8').trim()
    const parsed = JSON.parse(content)

    expect(parsed.level).toBe('info')
    expect(parsed.category).toBe('download')
    expect(parsed.message).toBe('Test message')
    expect(parsed.meta).toEqual({ url: 'http://example.com' })
    expect(parsed.ts).toBeDefined()
  })

  it('should append multiple entries to same file', () => {
    logger = createLogger(tempDir)
    logger.info('download', 'Message 1')
    logger.warn('classify', 'Message 2')
    logger.error('summarize', 'Message 3')

    const today = new Date().toISOString().split('T')[0]
    const logFile = path.join(tempDir, `${today}.log`)
    const lines = fs.readFileSync(logFile, 'utf-8').trim().split('\n')

    expect(lines).toHaveLength(3)
    expect(JSON.parse(lines[0]).message).toBe('Message 1')
    expect(JSON.parse(lines[1]).message).toBe('Message 2')
    expect(JSON.parse(lines[2]).message).toBe('Message 3')
  })

  it('should support info, warn, and error levels', () => {
    logger = createLogger(tempDir)
    logger.info('app', 'Info message')
    logger.warn('app', 'Warn message')
    logger.error('app', 'Error message')

    const today = new Date().toISOString().split('T')[0]
    const logFile = path.join(tempDir, `${today}.log`)
    const lines = fs.readFileSync(logFile, 'utf-8').trim().split('\n')
    const parsed = lines.map(l => JSON.parse(l))

    expect(parsed[0].level).toBe('info')
    expect(parsed[1].level).toBe('warn')
    expect(parsed[2].level).toBe('error')
  })

  it('should handle missing meta gracefully', () => {
    logger = createLogger(tempDir)
    logger.info('download', 'Test without meta')

    const today = new Date().toISOString().split('T')[0]
    const logFile = path.join(tempDir, `${today}.log`)
    const content = fs.readFileSync(logFile, 'utf-8').trim()
    const parsed = JSON.parse(content)

    expect(parsed.meta).toBeUndefined()
    expect(parsed.message).toBe('Test without meta')
  })

  it('should clean up logs older than 3 days', () => {
    logger = createLogger(tempDir)

    // Create old log files (4 days old)
    const oldDate = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000)
    const oldFileName = oldDate.toISOString().split('T')[0] + '.log'
    const oldFilePath = path.join(tempDir, oldFileName)
    fs.writeFileSync(oldFilePath, '{}')
    // Set file's modification time to 4 days ago
    const oldTime = Date.now() - 4 * 24 * 60 * 60 * 1000
    fs.utimesSync(oldFilePath, oldTime / 1000, oldTime / 1000)

    // Create a recent file (today)
    const today = new Date().toISOString().split('T')[0]
    const todayPath = path.join(tempDir, `${today}.log`)
    fs.writeFileSync(todayPath, '{}')

    // Trigger cleanup via setDebugMode
    logger.setDebugMode(true)

    // Old file should be deleted
    expect(fs.existsSync(oldFilePath)).toBe(false)
    // Recent file should exist
    expect(fs.existsSync(todayPath)).toBe(true)
  })
})
