import fs from 'fs'
import path from 'path'
import logger from './logger.js'
import { readMetadataIndex, moveMetadataEntry, moveThumbnailSidecar } from './metadata-store.js'
import { moveChapter } from './notes-store.js'

const DEFAULT_SUMMARIZE_PROMPT = `Summarize the key topics and insights in concise bullet points. Cover the what, why, how and the implications. Use concise language of an expert. Never go beyond what is covered.`

/** Main orchestrator: runs all 5 curation tasks sequentially. */
export async function runCuration(outputFolder, appDataPath) {
  const results = []

  try {
    const metadataIndexPath = path.join(appDataPath, 'metadata-index.json')

    // 1. Ensure metadata
    results.push(await ensureMetadata(outputFolder, appDataPath))

    // 2. Validate notes
    results.push(await validateNotes(outputFolder))

    // 3. Validate file locations
    results.push(await validateFileLocations(outputFolder, metadataIndexPath))

    // 4. Scan untracked
    results.push(await scanUntracked(outputFolder, metadataIndexPath))

    // 5. Ensure agent folder
    results.push(await ensureAgentFolder(outputFolder))

    // Log summary
    logger.info('curation', 'Folder curation completed', {
      outputFolder,
      tasks: results.length,
      allOk: results.every((r) => r.status === 'ok' || r.status === 'skipped')
    })

    return results
  } catch (error) {
    logger.error('curation', 'Curation failed', {
      outputFolder,
      error: error.message
    })
    return results
  }
}

/** Task 1: Ensure .pully.json metadata file exists and is valid. */
async function ensureMetadata(outputFolder, appDataPath) {
  const task = 'ensureMetadata'
  const details = []

  try {
    const metadataPath = path.join(outputFolder, '.pully.json')
    const now = new Date().toISOString()

    if (fs.existsSync(metadataPath)) {
      try {
        const current = JSON.parse(fs.readFileSync(metadataPath, 'utf8'))
        // Validate schema
        if (current.version === 1 && current.appDataPath) {
          // Update lastMaintainedAt
          current.lastMaintainedAt = now
          fs.writeFileSync(metadataPath, JSON.stringify(current, null, 2))
          details.push('Updated lastMaintainedAt')
          return { task, status: 'ok', details }
        } else {
          // Invalid schema, rewrite
          const fixed = {
            version: 1,
            appDataPath,
            createdAt: current.createdAt || now,
            lastMaintainedAt: now
          }
          fs.writeFileSync(metadataPath, JSON.stringify(fixed, null, 2))
          details.push('Fixed invalid schema')
          return { task, status: 'fixed', details }
        }
      } catch (parseError) {
        // File exists but is invalid JSON, rewrite
        const metadata = {
          version: 1,
          appDataPath,
          createdAt: now,
          lastMaintainedAt: now
        }
        fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2))
        details.push('Rewrote invalid JSON')
        return { task, status: 'fixed', details }
      }
    } else {
      // Create new .pully.json
      const metadata = {
        version: 1,
        appDataPath,
        createdAt: now,
        lastMaintainedAt: now
      }
      fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2))
      details.push('Created new .pully.json')
      return { task, status: 'fixed', details }
    }
  } catch (error) {
    logger.error('curation', `Task ${task} failed`, { error: error.message })
    return { task, status: 'error', details: [error.message] }
  }
}

/** Task 2: Validate and repair notes.md files. */
async function validateNotes(outputFolder) {
  const task = 'validateNotes'
  const details = []

  try {
    const toScan = [outputFolder]

    // Scan root + one level deep
    try {
      const rootItems = fs.readdirSync(outputFolder)
      for (const item of rootItems) {
        if (item.startsWith('.')) continue
        const itemPath = path.join(outputFolder, item)
        try {
          if (fs.statSync(itemPath).isDirectory()) {
            toScan.push(itemPath)
          }
        } catch {
          // Skip unreadable directories
        }
      }
    } catch {
      // Root not readable
    }

    // Check each location for notes.md
    for (const dir of toScan) {
      const notesPath = path.join(dir, 'notes.md')
      if (!fs.existsSync(notesPath)) continue

      try {
        const content = fs.readFileSync(notesPath, 'utf8')
        const lines = content.split('\n')

        // Validate structure: should have # title, ---, ## sections
        const hasTitle = lines.some((l) => l.startsWith('# '))
        const hasSections = lines.some((l) => l.startsWith('## '))

        // Check for pully comment annotations in sections
        let valid = hasTitle
        if (!valid) {
          // Missing title, repair
          const backup = notesPath.replace(/\.md$/, `.backup-${Date.now()}.md`)
          fs.renameSync(notesPath, backup)
          details.push(`Backed up invalid notes.md to ${path.basename(backup)}`)

          const dirName = path.basename(dir) === path.basename(outputFolder) ? 'Library' : path.basename(dir)
          const repaired = `# ${dirName}\n\n`
          fs.writeFileSync(notesPath, repaired)
          details.push(`Created clean notes.md for ${dirName}`)
        }
      } catch (error) {
        logger.warn('curation', `Failed to validate notes.md`, {
          notesPath,
          error: error.message
        })
      }
    }

    return { task, status: details.length > 0 ? 'fixed' : 'ok', details }
  } catch (error) {
    logger.error('curation', `Task ${task} failed`, { error: error.message })
    return { task, status: 'error', details: [error.message] }
  }
}

/** Task 3: Validate file locations match notes.md references. */
async function validateFileLocations(outputFolder, metadataIndexPath) {
  const task = 'validateFileLocations'
  const details = []

  try {
    const toScan = [outputFolder]

    // Collect all folders to scan
    try {
      const rootItems = fs.readdirSync(outputFolder)
      for (const item of rootItems) {
        if (item.startsWith('.')) continue
        const itemPath = path.join(outputFolder, item)
        try {
          if (fs.statSync(itemPath).isDirectory()) {
            toScan.push(itemPath)
          }
        } catch {
          // Skip unreadable
        }
      }
    } catch {
      // Root not readable
    }

    // For each notes.md, check file references
    for (const dir of toScan) {
      const notesPath = path.join(dir, 'notes.md')
      if (!fs.existsSync(notesPath)) continue

      try {
        const content = fs.readFileSync(notesPath, 'utf8')
        const fileMatches = content.matchAll(/<!--\s*pully:file:(.*?)\s*-->/g)

        for (const match of fileMatches) {
          const filename = match[1].trim()
          const expectedPath = path.join(dir, filename)

          if (!fs.existsSync(expectedPath)) {
            // File is missing or in wrong location, try to find it
            const foundPath = findFile(outputFolder, filename)
            if (foundPath && foundPath !== expectedPath) {
              try {
                // Move file to correct location
                fs.renameSync(foundPath, expectedPath)
                moveMetadataEntry(foundPath, expectedPath, metadataIndexPath)
                moveThumbnailSidecar(foundPath, expectedPath)
                try {
                  moveChapter(foundPath, expectedPath, outputFolder)
                } catch {
                  // Chapter move failures are non-blocking
                }
                details.push(`Moved ${filename} to correct folder`)
              } catch (moveError) {
                logger.warn('curation', `Failed to move file`, {
                  filename,
                  from: foundPath,
                  to: expectedPath,
                  error: moveError.message
                })
              }
            }
          }
        }
      } catch (error) {
        logger.warn('curation', `Failed to validate file locations in notes.md`, {
          notesPath,
          error: error.message
        })
      }
    }

    return { task, status: details.length > 0 ? 'fixed' : 'ok', details }
  } catch (error) {
    logger.error('curation', `Task ${task} failed`, { error: error.message })
    return { task, status: 'error', details: [error.message] }
  }
}

/** Helper: find a file by name in the library (two levels deep). */
function findFile(outputFolder, filename) {
  try {
    // Check root
    let candidate = path.join(outputFolder, filename)
    if (fs.existsSync(candidate)) return candidate

    // Check subdirectories
    const items = fs.readdirSync(outputFolder)
    for (const item of items) {
      if (item.startsWith('.')) continue
      const itemPath = path.join(outputFolder, item)
      try {
        if (fs.statSync(itemPath).isDirectory()) {
          candidate = path.join(itemPath, filename)
          if (fs.existsSync(candidate)) return candidate
        }
      } catch {
        // Skip unreadable
      }
    }
  } catch {
    // Root not readable
  }
  return null
}

/** Task 4: Scan for untracked files and update .gitignore. */
async function scanUntracked(outputFolder, metadataIndexPath) {
  const task = 'scanUntracked'
  const details = []

  try {
    const index = readMetadataIndex(metadataIndexPath)
    const trackedPaths = new Set(Object.keys(index))
    const untracked = []

    function scan(dir, depth = 0) {
      if (depth > 1) return // Two levels only

      try {
        const items = fs.readdirSync(dir)
        for (const item of items) {
          if (item.startsWith('.')) continue
          if (isHelperFile(item)) continue

          const itemPath = path.join(dir, item)
          try {
            const stat = fs.statSync(itemPath)
            if (stat.isDirectory()) {
              scan(itemPath, depth + 1)
            } else if (!trackedPaths.has(itemPath)) {
              untracked.push(itemPath)
            }
          } catch {
            // Skip unreadable
          }
        }
      } catch {
        // Skip unreadable directories
      }
    }

    scan(outputFolder)

    if (untracked.length > 0) {
      // Update .gitignore
      const gitignorePath = path.join(outputFolder, '.gitignore')
      let content = ''
      if (fs.existsSync(gitignorePath)) {
        content = fs.readFileSync(gitignorePath, 'utf8')
      }

      // Find or create Pully comment block
      const blockStart = '# Untracked by Pully'
      const blockEnd = '# End Untracked by Pully'

      let lines = content.split('\n')
      let startIdx = lines.findIndex((l) => l.includes(blockStart))
      let endIdx = startIdx !== -1 ? lines.findIndex((l, i) => i > startIdx && l.includes(blockEnd)) : -1

      // Build new block
      const pullyLines = [blockStart, ...untracked.map((p) => path.relative(outputFolder, p)), blockEnd]

      if (startIdx !== -1 && endIdx !== -1) {
        // Replace existing block
        lines = [...lines.slice(0, startIdx), ...pullyLines, ...lines.slice(endIdx + 1)]
      } else if (startIdx !== -1) {
        // Replace from start to end
        lines = [...lines.slice(0, startIdx), ...pullyLines]
      } else {
        // Append new block
        if (content && !content.endsWith('\n')) {
          lines.push('')
        }
        lines = [...lines, ...pullyLines]
      }

      // Preserve non-Pully lines at the end
      const result = lines.filter((l) => l.trim()).join('\n') + '\n'
      fs.writeFileSync(gitignorePath, result)
      details.push(`Updated .gitignore with ${untracked.length} untracked files`)
    }

    return { task, status: untracked.length > 0 ? 'fixed' : 'ok', details }
  } catch (error) {
    logger.error('curation', `Task ${task} failed`, { error: error.message })
    return { task, status: 'error', details: [error.message] }
  }
}

/** Task 5: Ensure .agent/commands/ folder and summarize.md. */
async function ensureAgentFolder(outputFolder) {
  const task = 'ensureAgentFolder'
  const details = []

  try {
    const agentDir = path.join(outputFolder, '.agent', 'commands')
    const summarizePath = path.join(agentDir, 'summarize.md')

    if (!fs.existsSync(agentDir)) {
      fs.mkdirSync(agentDir, { recursive: true })
      details.push('Created .agent/commands directory')
    }

    if (!fs.existsSync(summarizePath)) {
      const content = `---
description: Generate an AI summary for a downloaded video
---

${DEFAULT_SUMMARIZE_PROMPT}
`
      fs.writeFileSync(summarizePath, content)
      details.push('Created summarize.md with default prompt')
    }

    return { task, status: details.length > 0 ? 'fixed' : 'ok', details }
  } catch (error) {
    logger.error('curation', `Task ${task} failed`, { error: error.message })
    return { task, status: 'error', details: [error.message] }
  }
}

/** Helper: check if a file should be excluded from library. */
function isHelperFile(fileName) {
  return (
    /\.(md|txt|nfo)$/i.test(fileName) ||
    /\.thumb(\.[a-z]+)?$/i.test(fileName) ||
    fileName === '.pully.json' ||
    fileName === '.gitignore'
  )
}
