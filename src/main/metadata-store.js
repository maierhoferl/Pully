import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'
import { createRequire } from 'module'

const _require = createRequire(import.meta.url)

function defaultPath() {
  const { app } = _require('electron')
  return path.join(app.getPath('userData'), 'metadata-index.json')
}

export function readMetadataIndex(indexPath) {
  const p = indexPath || defaultPath()
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch {
    return {}
  }
}

export function writeMetadataEntry(filePath, metadata, indexPath) {
  const p = indexPath || defaultPath()
  const index = readMetadataIndex(p)
  index[filePath] = metadata
  fs.writeFileSync(p, JSON.stringify(index, null, 2))
}

export function deleteMetadataEntry(filePath, indexPath) {
  const p = indexPath || defaultPath()
  const index = readMetadataIndex(p)
  delete index[filePath]
  fs.writeFileSync(p, JSON.stringify(index, null, 2))
}

export function moveMetadataEntry(oldPath, newPath, indexPath) {
  const p = indexPath || defaultPath()
  const index = readMetadataIndex(p)
  if (index[oldPath]) {
    index[newPath] = index[oldPath]
    delete index[oldPath]
    fs.writeFileSync(p, JSON.stringify(index, null, 2))
  }
}

// Converts an absolute local file path to a pully:// URL for use in the renderer
export function toPullyUrl(localPath) {
  return 'pully:' + pathToFileURL(localPath).href.slice('file:'.length)
}

export function renameFolderInIndex(oldDirPath, newDirPath, indexPath) {
  const p = indexPath || defaultPath()
  const index = readMetadataIndex(p)
  const sep = path.sep
  const prefix = oldDirPath + sep
  const updated = {}
  for (const [fp, meta] of Object.entries(index)) {
    if (fp.startsWith(prefix)) {
      updated[newDirPath + sep + fp.slice(prefix.length)] = meta
    } else {
      updated[fp] = meta
    }
  }
  fs.writeFileSync(p, JSON.stringify(updated, null, 2))
}

export function deleteFolderFromIndex(dirPath, indexPath) {
  const p = indexPath || defaultPath()
  const index = readMetadataIndex(p)
  const prefix = dirPath + path.sep
  for (const fp of Object.keys(index)) {
    if (fp.startsWith(prefix)) delete index[fp]
  }
  fs.writeFileSync(p, JSON.stringify(index, null, 2))
}

// In-progress set to avoid duplicate concurrent downloads
const _thumbnailPending = new Set()

// Downloads thumbnailUrl to disk next to videoPath, then updates the metadata entry.
// Fire-and-forget safe — all errors are silently swallowed.
export async function downloadAndStoreThumbnail(thumbnailUrl, videoPath) {
  if (_thumbnailPending.has(videoPath)) return
  _thumbnailPending.add(videoPath)
  try {
    const ext = thumbnailUrl.match(/\.(webp|png)(?:[?#]|$)/i)?.[1] || 'jpg'
    const thumbPath = videoPath.replace(/\.[^.]+$/, `.thumb.${ext}`)
    if (fs.existsSync(thumbPath)) {
      // File already downloaded — just backfill the metadata entry if needed
      const index = readMetadataIndex()
      if (index[videoPath] && !index[videoPath].thumbnailLocalPath) {
        writeMetadataEntry(videoPath, { ...index[videoPath], thumbnailLocalPath: thumbPath })
      }
      return
    }
    const response = await fetch(thumbnailUrl)
    if (!response.ok) return
    const buffer = Buffer.from(await response.arrayBuffer())
    fs.writeFileSync(thumbPath, buffer)
    const index = readMetadataIndex()
    if (index[videoPath]) {
      writeMetadataEntry(videoPath, { ...index[videoPath], thumbnailLocalPath: thumbPath })
    }
  } catch {
    // best-effort
  } finally {
    _thumbnailPending.delete(videoPath)
  }
}
