import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'

const _require = createRequire(import.meta.url)

function getDefaults() {
  const { app } = _require('electron')
  return {
    outputFolder: app ? app.getPath('downloads') : '',
    maxConcurrent: 3,
    adblockEnabled: true,
    confirmDelete: true,
    autoClassifyEnabled: false,
    autoClassifyProvider: 'local',
    autoClassifyApiKey: '',
    autoClassifyModel: '',
    // AI shared config
    aiProvider: 'gemini',
    aiApiKey: '',
    aiModel: '',
    // Notes & summary
    autoSummarizeEnabled: false,
    autoSummarizeModel: '',
    defaultSummaryPrompt:
      'Summarize this video in 3-5 sentences. Highlight the main topic, key points covered, and anything particularly useful or actionable for the viewer.',
    debugMode: false,
    maintainFolder: true,
    searchEngine: 'google'
  }
}

function defaultPath() {
  // Lazy-load electron so this module can be imported in Vitest without Electron present.
  // Tests always pass an explicit configPath so this function is never called during tests.
  const { app } = _require('electron')
  return path.join(app.getPath('userData'), 'config.json')
}

export function readConfig(configPath) {
  const p = configPath || defaultPath()
  try {
    return { ...getDefaults(), ...JSON.parse(fs.readFileSync(p, 'utf8')) }
  } catch {
    return { ...getDefaults() }
  }
}

export function writeConfig(data, configPath) {
  const p = configPath || defaultPath()
  const current = readConfig(p)
  fs.writeFileSync(p, JSON.stringify({ ...current, ...data }, null, 2))
}
