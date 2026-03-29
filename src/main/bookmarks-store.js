import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'

const _require = createRequire(import.meta.url)

function defaultPath() {
  const { app } = _require('electron')
  return path.join(app.getPath('userData'), 'bookmarks.json')
}

function readBookmarksFile(bookmarksPath) {
  const p = bookmarksPath || defaultPath()
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch {
    return []
  }
}

export function listBookmarks(bookmarksPath) {
  return readBookmarksFile(bookmarksPath)
}

export function addBookmark(data, bookmarksPath) {
  const p = bookmarksPath || defaultPath()
  const bookmarks = readBookmarksFile(p)

  // Avoid duplicates: remove if URL already exists, then add
  const filtered = bookmarks.filter(b => b.url !== data.url)
  const newBookmark = {
    url: data.url,
    title: data.title || '',
    favicon: data.favicon || null,
    addedAt: new Date().toISOString()
  }

  filtered.push(newBookmark)
  fs.writeFileSync(p, JSON.stringify(filtered, null, 2))
  return newBookmark
}

export function removeBookmark(url, bookmarksPath) {
  const p = bookmarksPath || defaultPath()
  const bookmarks = readBookmarksFile(p)
  const filtered = bookmarks.filter(b => b.url !== url)
  fs.writeFileSync(p, JSON.stringify(filtered, null, 2))
}
