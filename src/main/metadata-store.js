/**
 * metadata-store.js — Metadata persistence backed by Obsidian notes.
 *
 * Each content item is represented by a companion .md note in the vault:
 *   /vault/folder/video.mp4  →  /vault/folder/video.md
 *   /vault/Title.md          →  reference note (no media file)
 *
 * The old metadata-index.json is no longer written; the YAML frontmatter
 * of each note IS the metadata index.  readMetadataIndex() scans the vault
 * and rebuilds the index on demand.
 */

import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'
import { createRequire } from 'module'
import {
  getNotePath,
  readNote,
  writeNote,
  scanFolderNotes
} from './obsidian-store.js'

const _require = createRequire(import.meta.url)

function getVaultPath() {
  const { app } = _require('electron')
  const { readConfig } = _require('./config-store.js')
  return readConfig().outputFolder || app.getPath('downloads')
}

// ---------------------------------------------------------------------------
// readMetadataIndex
// ---------------------------------------------------------------------------

/**
 * Build and return a metadata index by scanning the vault for .md notes.
 *
 * @param {string} [vaultPath]  Vault root directory.  If omitted, reads from config.
 * @returns {{ [filePath: string]: object }}  Map from absolute file/note path → metadata.
 */
export function readMetadataIndex(vaultPath) {
  const vault = vaultPath || getVaultPath()
  if (!vault || !fs.existsSync(vault)) return {}

  const index = {}

  function processFolder(folderPath, folderName) {
    const notes = scanFolderNotes(folderPath)
    for (const { notePath, frontmatter } of notes) {
      const meta = frontmatterToMeta(frontmatter)
      // Derive the index key
      const key = frontmatter.file
        ? path.join(folderPath, frontmatter.file) // absolute path to media file
        : notePath // reference/page — key is the note itself
      index[key] = meta
    }
  }

  // Root level
  processFolder(vault, null)

  // One level of subdirectories
  try {
    for (const name of fs.readdirSync(vault)) {
      if (name.startsWith('.')) continue
      const dirPath = path.join(vault, name)
      try {
        if (fs.statSync(dirPath).isDirectory()) {
          processFolder(dirPath, name)
        }
      } catch {
        // skip unreadable directories
      }
    }
  } catch {
    // skip unreadable vault
  }

  return index
}

// ---------------------------------------------------------------------------
// writeMetadataEntry
// ---------------------------------------------------------------------------

/**
 * Write (or merge) metadata into the companion .md note for a file.
 *
 * @param {string} filePath   Absolute path to the media file (or .md note for references).
 * @param {object} metadata   Metadata fields (title, uploader, url, contentType, …).
 * @param {string} [_unused]  Ignored — kept for backwards-compatibility with old API.
 */
export function writeMetadataEntry(filePath, metadata, _unused) {
  const notePath = getNotePath(filePath)
  const fm = metaToFrontmatter(filePath, metadata)
  writeNote(notePath, { frontmatter: fm })
}

// ---------------------------------------------------------------------------
// deleteMetadataEntry
// ---------------------------------------------------------------------------

/**
 * Delete the companion .md note for a file.
 */
export function deleteMetadataEntry(filePath, _unused) {
  const notePath = getNotePath(filePath)
  try {
    if (fs.existsSync(notePath)) fs.unlinkSync(notePath)
  } catch {
    // best-effort
  }
}

// ---------------------------------------------------------------------------
// moveMetadataEntry
// ---------------------------------------------------------------------------

/**
 * Move (rename) the companion note when a media file is moved.
 */
export function moveMetadataEntry(oldFilePath, newFilePath, _unused) {
  const oldNote = getNotePath(oldFilePath)
  const newNote = getNotePath(newFilePath)
  if (oldNote === newNote) return
  try {
    if (fs.existsSync(oldNote)) {
      fs.mkdirSync(path.dirname(newNote), { recursive: true })
      // Update the `file` frontmatter field to reflect the new filename
      const note = readNote(oldNote)
      if (note) {
        const newFilename = path.basename(newFilePath)
        const newThumb = newFilename.replace(/\.[^.]+$/, '.thumb.jpg')
        const updatedFm = { ...note.frontmatter, file: newFilename }
        if (note.frontmatter.thumbnail) updatedFm.thumbnail = newThumb
        writeNote(oldNote, { frontmatter: updatedFm })
      }
      fs.renameSync(oldNote, newNote)
    }
  } catch {
    // best-effort
  }
}

// ---------------------------------------------------------------------------
// renameFolderInIndex / deleteFolderFromIndex
// ---------------------------------------------------------------------------

/**
 * After a folder is renamed via fs.renameSync, the .md notes move with it
 * automatically — no index file to update.  This function is a no-op kept
 * for API compatibility.
 */
export function renameFolderInIndex(_oldDirPath, _newDirPath, _unused) {
  // Notes are physical files; they moved with the folder.  Nothing to do.
}

/**
 * Notes inside a deleted folder are removed with the folder itself.
 * This function is a no-op kept for API compatibility.
 */
export function deleteFolderFromIndex(_dirPath, _unused) {
  // Notes are physical files; they are removed when the folder is deleted.
}

// ---------------------------------------------------------------------------
// createReferenceFile  (replaces the old .ref stub)
// ---------------------------------------------------------------------------

/**
 * Create an Obsidian note representing a remembered (but not downloaded) item.
 * Returns the absolute path to the created .md note.
 */
export async function createReferenceFile(
  outputFolder,
  { title, uploader, description, thumbnailUrl, url, contentType = 'video' }
) {
  const safe =
    (title || 'Untitled')
      .replace(/[/\\:*?"<>|]/g, '')
      .replace(/\s+/g, ' ')
      .trim() || 'Untitled'

  let notePath = path.join(outputFolder, `${safe}.md`)
  let counter = 1
  while (fs.existsSync(notePath)) {
    notePath = path.join(outputFolder, `${safe} (${counter}).md`)
    counter++
  }

  const savedAt = new Date().toISOString()
  writeNote(notePath, {
    frontmatter: {
      title: title || 'Untitled',
      url: url || null,
      uploader: uploader || null,
      description: description ? description.slice(0, 500) : null,
      saved_at: savedAt,
      content_type: contentType,
      type: 'reference',
      thumbnail_url: thumbnailUrl || null,
      tags: []
    }
  })

  if (thumbnailUrl) {
    downloadAndStoreThumbnail(thumbnailUrl, notePath).catch(() => {})
  }

  return notePath
}

// ---------------------------------------------------------------------------
// Thumbnail helpers  (unchanged from original)
// ---------------------------------------------------------------------------

const _thumbnailPending = new Set()

/**
 * Download thumbnailUrl and save it as <videoPath>.thumb.jpg.
 * Fire-and-forget safe — all errors are silently swallowed.
 */
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

/**
 * Move the .thumb.jpg sidecar alongside a relocated video.
 * Also moves the companion .md note.
 */
export function moveThumbnailSidecar(oldVideoPath, newVideoPath) {
  const oldThumb = oldVideoPath.replace(/\.[^.]+$/, '.thumb.jpg')
  const newThumb = newVideoPath.replace(/\.[^.]+$/, '.thumb.jpg')
  if (oldThumb !== newThumb && fs.existsSync(oldThumb)) {
    try {
      fs.renameSync(oldThumb, newThumb)
    } catch {
      // best-effort
    }
  }
}

// ---------------------------------------------------------------------------
// pully:// URL helper  (unchanged)
// ---------------------------------------------------------------------------

/**
 * Convert an absolute local file path to a pully:// URL for use in the renderer.
 */
export function toPullyUrl(localPath) {
  return 'pully:' + pathToFileURL(localPath).href.slice('file:'.length)
}

// ---------------------------------------------------------------------------
// Internal converters
// ---------------------------------------------------------------------------

/**
 * Convert Pully metadata object → Obsidian frontmatter fields.
 */
function metaToFrontmatter(filePath, meta) {
  const fm = {}
  if (meta.title !== undefined) fm.title = meta.title
  if (meta.url !== undefined) fm.url = meta.url
  if (meta.uploader !== undefined) fm.uploader = meta.uploader
  if (meta.description !== undefined)
    fm.description = meta.description ? meta.description.slice(0, 500) : null
  if (meta.downloadedAt !== undefined) fm.downloaded_at = meta.downloadedAt
  if (meta.contentType !== undefined) fm.content_type = meta.contentType
  if (meta.thumbnailUrl !== undefined) fm.thumbnail_url = meta.thumbnailUrl
  if (meta.isReference) fm.type = 'reference'
  if (meta.type) fm.type = meta.type
  if (!fm.tags) fm.tags = []

  // For non-note files, store the relative filename so the index key can be derived
  const ext = path.extname(filePath)
  if (ext && ext.toLowerCase() !== '.md') {
    fm.file = path.basename(filePath)
    const thumbPath = filePath.replace(/\.[^.]+$/, '.thumb.jpg')
    if (fs.existsSync(thumbPath)) {
      fm.thumbnail = path.basename(thumbPath)
    }
  }

  return fm
}

/**
 * Convert Obsidian frontmatter fields → Pully metadata object.
 */
function frontmatterToMeta(fm) {
  return {
    title: fm.title || null,
    uploader: fm.uploader || null,
    description: fm.description || null,
    url: fm.url || null,
    thumbnailUrl: fm.thumbnail_url || null,
    downloadedAt: fm.downloaded_at || fm.saved_at || null,
    contentType: fm.content_type || 'video',
    isReference: fm.type === 'reference',
    type: fm.type || null
  }
}
