import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'

const _require = createRequire(import.meta.url)
const DEFAULTS = { outputFolder: '', maxConcurrent: 3 }

function defaultPath() {
  // Lazy-load electron so this module can be imported in Vitest without Electron present.
  // Tests always pass an explicit configPath so this function is never called during tests.
  const { app } = _require('electron')
  return path.join(app.getPath('userData'), 'config.json')
}

export function readConfig(configPath) {
  const p = configPath || defaultPath()
  try {
    return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(p, 'utf8')) }
  } catch {
    return { ...DEFAULTS }
  }
}

export function writeConfig(data, configPath) {
  const p = configPath || defaultPath()
  const current = readConfig(p)
  fs.writeFileSync(p, JSON.stringify({ ...current, ...data }, null, 2))
}
