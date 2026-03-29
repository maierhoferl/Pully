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

// Moves the .thumb.jpg sidecar alongside a relocated video.
export function moveThumbnailSidecar(oldVideoPath, newVideoPath) {
  const oldThumb = oldVideoPath.replace(/\.[^.]+$/, '.thumb.jpg')
  const newThumb = newVideoPath.replace(/\.[^.]+$/, '.thumb.jpg')
  if (oldThumb !== newThumb && fs.existsSync(oldThumb)) {
    try {
      fs.renameSync(oldThumb, newThumb)
    } catch {
      /* best-effort */
    }
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
      const newMeta = { ...meta }
      if (newMeta.thumbnailLocalPath && newMeta.thumbnailLocalPath.startsWith(prefix)) {
        newMeta.thumbnailLocalPath =
          newDirPath + sep + newMeta.thumbnailLocalPath.slice(prefix.length)
      }
      updated[newDirPath + sep + fp.slice(prefix.length)] = newMeta
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

// Creates a .ref stub file representing a remembered (not downloaded) online video or page.
// Writes metadata to the index and fire-and-forgets the thumbnail sidecar download.
export async function createReferenceFile(
  outputFolder,
  { title, uploader, description, thumbnailUrl, url, contentType = 'video' }
) {
  const safe =
    (title || 'Untitled')
      .replace(/[/\\:*?"<>|]/g, '')
      .replace(/\s+/g, ' ')
      .trim() || 'Untitled'
  let refPath = path.join(outputFolder, `${safe}.ref`)
  let counter = 1
  while (fs.existsSync(refPath)) {
    refPath = path.join(outputFolder, `${safe} (${counter}).ref`)
    counter++
  }
  const downloadedAt = new Date().toISOString()
  fs.writeFileSync(refPath, JSON.stringify({ type: 'reference', url }))
  writeMetadataEntry(refPath, {
    title,
    uploader,
    description,
    thumbnailUrl,
    url,
    downloadedAt,
    contentType,
    isReference: true
  })
  if (thumbnailUrl) {
    downloadAndStoreThumbnail(thumbnailUrl, refPath).catch(() => {})
  }
  return refPath
}

// In-progress set to avoid duplicate concurrent downloads
const _thumbnailPending = new Set()

// Downloads thumbnailUrl and saves it as <videoPath>.thumb.jpg.
// Fire-and-forget safe — all errors are silently swallowed.
export async function downloadAndStoreThumbnail(thumbnailUrl, videoPath) {
  if (_thumbnailPending.has(videoPath)) return
  _thumbnailPending.add(videoPath)
  try {
    const thumbPath = videoPath.replace(/\.[^.]+$/, '.thumb.jpg')
    if (fs.existsSync(thumbPath) && fs.statSync(thumbPath).size > 0) return
    const response = await fetch(thumbnailUrl)
    if (!response.ok) return
    const buffer = Buffer.from(await response.arrayBuffer())
    fs.writeFileSync(thumbPath, buffer)
  } catch {
    // best-effort
  } finally {
    _thumbnailPending.delete(videoPath)
  }
}
