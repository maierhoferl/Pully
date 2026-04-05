/**
 * notes-store.js — Per-item note operations backed by individual Obsidian notes.
 *
 * Replaces the old aggregate notes.md-per-folder design with individual .md notes:
 *   /vault/video.mp4  →  companion note  /vault/video.md
 *
 * The note format uses YAML frontmatter for metadata and named ## sections for
 * AI-generated summaries and user notes bullets — fully compatible with Obsidian.
 */

import fs from 'fs'
import path from 'path'
import logger from './logger.js'
import {
  getNotePath,
  readNote,
  writeNote,
  updateSection,
  scanFolderNotes
} from './obsidian-store.js'

// ---------------------------------------------------------------------------
// Event emitter (injected from ipc-handlers for real-time renderer updates)
// ---------------------------------------------------------------------------

let eventEmitter = null

export function setNotesEventEmitter(emitter) {
  eventEmitter = emitter
}

function emitChapterUpdated(notePath, chapter) {
  if (eventEmitter) {
    eventEmitter.emit('notes:chapter-updated', { notesPath: notePath, chapter })
  }
}

// ---------------------------------------------------------------------------
// getNotesPath — kept for API compatibility
// ---------------------------------------------------------------------------

/**
 * Return the note path for a given file.
 * In the Obsidian model every file has its own note (same stem, .md extension).
 */
export function getNotesPath(filePath, _outputFolder) {
  return getNotePath(filePath)
}

// ---------------------------------------------------------------------------
// initChapter
// ---------------------------------------------------------------------------

/**
 * Ensure the companion .md note exists for filePath.
 * Creates a stub note if missing; adopts an existing note by URL if found.
 * No-op if the note already references the same file.
 */
export function initChapter(filePath, metadata, outputFolder) {
  const notePath = getNotePath(filePath)
  const existing = readNote(notePath)

  // Determine file anchor value (relative filename or empty for URL stubs)
  const isUrl = filePath.startsWith('http://') || filePath.startsWith('https://')
  const fileBasename = isUrl ? null : path.basename(filePath)

  if (existing) {
    // Note already exists — update file anchor if we now have a real filename
    if (fileBasename && !existing.frontmatter.file) {
      writeNote(notePath, { frontmatter: { file: fileBasename } })
      const chapter = buildChapterFromNote(notePath)
      if (chapter) emitChapterUpdated(notePath, chapter)
    }
    return { isNew: false, filePath: notePath }
  }

  // Check if a note for this URL exists somewhere else in the same folder
  if (metadata.url && outputFolder) {
    const folder = isUrl ? outputFolder : path.dirname(filePath)
    const folderNotes = scanFolderNotes(folder)
    const existingByUrl = folderNotes.find((n) => n.frontmatter.url === metadata.url)
    if (existingByUrl) {
      // Adopt: update file anchor
      if (fileBasename) {
        writeNote(existingByUrl.notePath, { frontmatter: { file: fileBasename } })
      }
      const chapter = buildChapterFromNote(existingByUrl.notePath)
      if (chapter) emitChapterUpdated(existingByUrl.notePath, chapter)
      return { isNew: false, filePath: existingByUrl.notePath }
    }
  }

  // Create new note
  const date = metadata.downloadedAt
    ? metadata.downloadedAt.slice(0, 10)
    : new Date().toISOString().slice(0, 10)

  const fm = {
    title: metadata.title || (fileBasename ? path.parse(fileBasename).name : 'Untitled'),
    url: metadata.url || null,
    uploader: metadata.uploader || null,
    description: metadata.description ? metadata.description.slice(0, 500) : null,
    downloaded_at: date,
    content_type: metadata.contentType || 'video',
    tags: []
  }
  if (fileBasename) fm.file = fileBasename
  if (metadata.contentType && metadata.contentType !== 'video')
    fm.content_type = metadata.contentType

  writeNote(notePath, { frontmatter: fm })

  logger.info('notes', `Chapter initialized: ${fileBasename || metadata.url}`, {
    filename: fileBasename,
    videoTitle: metadata.title
  })

  const chapter = buildChapterFromNote(notePath)
  if (chapter) emitChapterUpdated(notePath, chapter)

  return { isNew: true, filePath: notePath }
}

// ---------------------------------------------------------------------------
// readFolderNotes
// ---------------------------------------------------------------------------

/**
 * Read and parse all notes in a folder, returning a chapters array.
 *
 * @param {string|null} folderName  Subfolder name relative to outputFolder, or null for root.
 * @param {string}      outputFolder
 * @returns {{ title: string, chapters: Array }}
 */
export function readFolderNotes(folderName, outputFolder) {
  const folderPath = folderName ? path.join(outputFolder, folderName) : outputFolder
  const title = folderName || 'Library'

  const notes = scanFolderNotes(folderPath)
  const chapters = notes
    .map(({ notePath }) => buildChapterFromNote(notePath))
    .filter(Boolean)
    .sort((a, b) => {
      // Sort by downloadedAt desc, then title
      const da = a.downloadedAt || ''
      const db = b.downloadedAt || ''
      return db.localeCompare(da) || a.title.localeCompare(b.title)
    })

  return { title, chapters }
}

// ---------------------------------------------------------------------------
// writeSummarySection / writeBulletsSection
// ---------------------------------------------------------------------------

/**
 * Write (or replace) the ## AI Summary section in the companion note.
 */
export function writeSummarySection(filePath, summary, _outputFolder) {
  const notePath = getNotePath(filePath)
  writeNote(notePath, { summary })

  logger.info('notes', `Summary written: ${path.basename(filePath)}`, {
    filename: path.basename(filePath)
  })

  const chapter = buildChapterFromNote(notePath)
  if (chapter) emitChapterUpdated(notePath, chapter)
}

/**
 * Write (or replace) the ## My Notes section in the companion note.
 */
export function writeBulletsSection(filePath, bullets, _outputFolder) {
  const notePath = getNotePath(filePath)
  writeNote(notePath, { notes: bullets })

  logger.info('notes', `Bullets updated: ${path.basename(filePath)}`, {
    filename: path.basename(filePath),
    bulletCount: bullets.length
  })

  const chapter = buildChapterFromNote(notePath)
  if (chapter) emitChapterUpdated(notePath, chapter)
}

// ---------------------------------------------------------------------------
// moveChapter
// ---------------------------------------------------------------------------

/**
 * Move the companion note from oldFilePath's location to newFilePath's location.
 * Updates the `file` frontmatter field to reflect the new filename.
 */
export function moveChapter(oldFilePath, newFilePath, _outputFolder) {
  const oldNote = getNotePath(oldFilePath)
  const newNote = getNotePath(newFilePath)
  if (oldNote === newNote || !fs.existsSync(oldNote)) return

  const note = readNote(oldNote)
  const newBasename = path.basename(newFilePath)

  if (note) {
    const updatedFm = { ...note.frontmatter, file: newBasename }
    writeNote(oldNote, { frontmatter: updatedFm })
  }

  fs.mkdirSync(path.dirname(newNote), { recursive: true })
  fs.renameSync(oldNote, newNote)

  logger.info('notes', `Chapter moved`, {
    oldFile: path.basename(oldFilePath),
    newFile: newBasename
  })

  const chapter = buildChapterFromNote(newNote)
  if (chapter) emitChapterUpdated(newNote, chapter)
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Build a chapter object from a note on disk.
 * Returns null if the note cannot be read.
 */
function buildChapterFromNote(notePath) {
  const note = readNote(notePath)
  if (!note) return null

  const fm = note.frontmatter
  const sections = note.sections

  return {
    filePath: fm.file || path.basename(notePath),
    url: fm.url || null,
    downloadedAt: fm.downloaded_at || fm.saved_at || null,
    contentType: fm.content_type || 'video',
    title: fm.title || path.parse(notePath).name,
    summary: sections['AI Summary'] || null,
    bullets: parseBullets(sections['My Notes'])
  }
}

/** Parse bullet lines from a ## My Notes section string. */
function parseBullets(text) {
  if (!text) return []
  return text
    .split('\n')
    .filter((l) => l.startsWith('- '))
    .map((l) => l.slice(2).trim())
}
