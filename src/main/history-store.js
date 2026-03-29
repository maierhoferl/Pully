import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'

const _require = createRequire(import.meta.url)

function defaultPath() {
  const { app } = _require('electron')
  return path.join(app.getPath('userData'), 'browser-history.json')
}

function readHistoryFile(historyPath) {
  const p = historyPath || defaultPath()
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch {
    return []
  }
}

function pruneOldEntries(entries) {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  return entries.filter(entry => {
    const lastVisited = new Date(entry.lastVisited)
    return lastVisited >= thirtyDaysAgo
  })
}

export function listHistory(historyPath) {
  const entries = readHistoryFile(historyPath)
  const pruned = pruneOldEntries(entries)

  // If pruning removed entries, write the updated list back
  if (pruned.length !== entries.length) {
    const p = historyPath || defaultPath()
    fs.writeFileSync(p, JSON.stringify(pruned, null, 2))
  }

  return pruned
}

export function upsertHistory(data, historyPath) {
  const p = historyPath || defaultPath()
  let entries = readHistoryFile(p)

  // Find existing entry by URL
  const existingIndex = entries.findIndex(e => e.url === data.url)

  if (existingIndex >= 0) {
    // Update lastVisited and title
    entries[existingIndex] = {
      ...entries[existingIndex],
      title: data.title || entries[existingIndex].title,
      lastVisited: new Date().toISOString()
    }
  } else {
    // Add new entry
    entries.push({
      url: data.url,
      title: data.title || '',
      lastVisited: new Date().toISOString()
    })
  }

  // Prune old entries before writing
  entries = pruneOldEntries(entries)
  fs.writeFileSync(p, JSON.stringify(entries, null, 2))
}
