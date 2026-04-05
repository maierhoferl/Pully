/**
 * obsidian-store.js — Core Obsidian vault operations for Pully.
 *
 * The output folder IS the Obsidian vault. Every content item has a companion .md note:
 *   video.mp4  →  video.md   (frontmatter with metadata + ## AI Summary + ## My Notes)
 *   Title.md               (reference: pure note, no media file)
 *   page-article.md        (saved page: frontmatter + page body + ## AI Summary + ## My Notes)
 *
 * YAML frontmatter keys (snake_case, Obsidian convention):
 *   title, url, uploader, description, downloaded_at, content_type,
 *   file (relative media filename), thumbnail (relative thumb filename),
 *   type (set to 'reference' for remembered URLs), tags
 */

import fs from 'fs'
import path from 'path'

// ---------------------------------------------------------------------------
// Vault initialisation
// ---------------------------------------------------------------------------

/**
 * Initialise the vault by creating .obsidian/app.json so Obsidian
 * recognises the folder as a vault on first open.
 */
export function initVault(vaultPath) {
  if (!vaultPath || !fs.existsSync(vaultPath)) return
  try {
    const obsidianDir = path.join(vaultPath, '.obsidian')
    fs.mkdirSync(obsidianDir, { recursive: true })
    const appJson = path.join(obsidianDir, 'app.json')
    if (!fs.existsSync(appJson)) {
      fs.writeFileSync(
        appJson,
        JSON.stringify({ legacyEditor: false, livePreview: true }, null, 2)
      )
    }
  } catch {
    // best-effort: vault still works without .obsidian
  }
}

// ---------------------------------------------------------------------------
// Note path helpers
// ---------------------------------------------------------------------------

/**
 * Return the companion note path for a given file path.
 *   /vault/folder/video.mp4  →  /vault/folder/video.md
 *   /vault/folder/Title.md   →  /vault/folder/Title.md  (identity for .md)
 */
export function getNotePath(filePath) {
  if (filePath.endsWith('.md')) return filePath
  const ext = path.extname(filePath)
  const stem = path.basename(filePath, ext)
  return path.join(path.dirname(filePath), `${stem}.md`)
}

/**
 * Return the media file path from a companion note path and its frontmatter.
 * If frontmatter has `file`, return absolute path. Otherwise return the note path.
 */
export function getMediaPath(notePath, frontmatter) {
  if (frontmatter && frontmatter.file) {
    return path.join(path.dirname(notePath), frontmatter.file)
  }
  return notePath
}

// ---------------------------------------------------------------------------
// YAML frontmatter parsing (minimal — covers our usage)
// ---------------------------------------------------------------------------

/**
 * Parse YAML frontmatter from note content.
 * Returns { frontmatter, body } where body is everything after the closing ---.
 */
export function parseFrontmatter(content) {
  if (!content.startsWith('---\n')) return { frontmatter: {}, body: content }
  const end = content.indexOf('\n---\n', 4)
  if (end === -1) return { frontmatter: {}, body: content }

  const fmText = content.slice(4, end)
  const body = content.slice(end + 5)
  const frontmatter = {}

  for (const line of fmText.split('\n')) {
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue
    const key = line.slice(0, colonIdx).trim()
    if (!key) continue
    let value = line.slice(colonIdx + 1).trim()

    // Unquote strings wrapped in " or '
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\')
    }

    // Parse simple inline arrays: [a, b, c]
    if (value.startsWith('[') && value.endsWith(']')) {
      value = value
        .slice(1, -1)
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean)
    }

    frontmatter[key] = value === '' ? null : value
  }

  return { frontmatter, body }
}

/**
 * Serialize a frontmatter object to a YAML string (without the --- delimiters).
 */
export function serializeFrontmatter(fm) {
  const lines = []
  for (const [key, value] of Object.entries(fm)) {
    if (value === null || value === undefined) {
      lines.push(`${key}:`)
    } else if (Array.isArray(value)) {
      lines.push(`${key}: [${value.join(', ')}]`)
    } else {
      const str = String(value)
      // Quote values that contain YAML special characters
      if (str.includes(':') || str.includes('#') || str.includes('"') || str.startsWith(' ')) {
        lines.push(`${key}: "${str.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`)
      } else {
        lines.push(`${key}: ${str}`)
      }
    }
  }
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Note body section helpers
// ---------------------------------------------------------------------------

/**
 * Parse ## Heading sections from a note body.
 * Returns { sectionName → trimmed content string }.
 */
function parseBodySections(body) {
  const sections = {}
  const accumulated = {}
  let current = null

  for (const line of body.split('\n')) {
    if (line.startsWith('## ')) {
      current = line.slice(3).trim()
      accumulated[current] = []
    } else if (current !== null) {
      accumulated[current].push(line)
    }
  }

  for (const [name, lines] of Object.entries(accumulated)) {
    let end = lines.length
    while (end > 0 && lines[end - 1].trim() === '') end--
    sections[name] = lines.slice(0, end).join('\n').trim()
  }

  return sections
}

/**
 * Update or insert a named ## section in a note body.
 * Returns the new body string.
 */
export function updateSection(body, sectionName, newContent) {
  const lines = body.split('\n')
  let sectionStart = -1
  let sectionEnd = lines.length

  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === `## ${sectionName}`) {
      sectionStart = i + 1
    } else if (sectionStart !== -1 && sectionEnd === lines.length) {
      if (lines[i].startsWith('## ')) {
        sectionEnd = i
        break
      }
    }
  }

  if (sectionStart === -1) {
    // Section missing — append
    return `${body.trimEnd()}\n\n## ${sectionName}\n\n${newContent}\n`
  }

  // Trim trailing blank lines before the next section boundary
  while (sectionEnd > sectionStart && lines[sectionEnd - 1].trim() === '') sectionEnd--

  const contentLines = newContent ? newContent.split('\n') : []
  return [
    ...lines.slice(0, sectionStart),
    '',
    ...contentLines,
    '',
    ...lines.slice(sectionEnd)
  ].join('\n')
}

/** Build a default note body with empty ## AI Summary and ## My Notes sections. */
function buildDefaultBody(pageContent) {
  const parts = []
  if (pageContent) {
    parts.push(pageContent.trimEnd(), '')
    parts.push('')
  }
  parts.push('## AI Summary', '', '', '## My Notes', '')
  return parts.join('\n')
}

// ---------------------------------------------------------------------------
// Note read / write
// ---------------------------------------------------------------------------

/**
 * Read and parse a note from disk.
 * Returns { frontmatter, body, sections } or null if the file doesn't exist.
 */
export function readNote(notePath) {
  if (!fs.existsSync(notePath)) return null
  const content = fs.readFileSync(notePath, 'utf8')
  const { frontmatter, body } = parseFrontmatter(content)
  return { frontmatter, body, sections: parseBodySections(body) }
}

/**
 * Write or update a note on disk.
 *
 * @param {string} notePath  Absolute path to the .md file.
 * @param {object} opts
 *   frontmatter   Key/value pairs to set (merged into existing, new wins).
 *   summary       If provided, replaces the ## AI Summary section.
 *   notes         If provided (string or string[]), replaces the ## My Notes section.
 *   pageContent   Initial page body written only when creating a new note.
 */
export function writeNote(notePath, { frontmatter = {}, summary, notes, pageContent } = {}) {
  fs.mkdirSync(path.dirname(notePath), { recursive: true })

  const existing = readNote(notePath)
  let finalFm
  let body

  if (existing) {
    // Merge: existing values are kept unless the caller explicitly provides new ones
    finalFm = { ...existing.frontmatter }
    for (const [k, v] of Object.entries(frontmatter)) {
      if (v !== undefined) finalFm[k] = v
    }
    body = existing.body
  } else {
    finalFm = { ...frontmatter }
    body = buildDefaultBody(pageContent)
  }

  if (summary !== undefined) {
    body = updateSection(body, 'AI Summary', summary)
  }
  if (notes !== undefined) {
    const notesStr =
      typeof notes === 'string' ? notes : notes.map((b) => `- ${b}`).join('\n')
    body = updateSection(body, 'My Notes', notesStr)
  }

  fs.writeFileSync(notePath, `---\n${serializeFrontmatter(finalFm)}\n---\n\n${body}`, 'utf8')
}

// ---------------------------------------------------------------------------
// Folder scanning
// ---------------------------------------------------------------------------

/**
 * Scan a single folder for .md notes.
 * Returns an array of { notePath, frontmatter, mtime } for each note found.
 * Does NOT recurse into subdirectories.
 */
export function scanFolderNotes(folderPath) {
  const results = []
  if (!fs.existsSync(folderPath)) return results
  try {
    for (const name of fs.readdirSync(folderPath)) {
      if (name.startsWith('.') || !name.endsWith('.md')) continue
      const notePath = path.join(folderPath, name)
      try {
        const stat = fs.statSync(notePath)
        if (!stat.isFile()) continue
        const content = fs.readFileSync(notePath, 'utf8')
        const { frontmatter } = parseFrontmatter(content)
        results.push({ notePath, frontmatter, mtime: stat.mtime.toISOString() })
      } catch {
        // skip unreadable files
      }
    }
  } catch {
    // skip unreadable folder
  }
  return results
}
