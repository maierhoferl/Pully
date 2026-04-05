import fs from 'fs'
import path from 'path'
import logger from './logger.js'
import { readMetadataIndex, moveMetadataEntry, moveThumbnailSidecar } from './metadata-store.js'
import { moveChapter } from './notes-store.js'
import { initVault, scanFolderNotes, serializeFrontmatter, parseFrontmatter } from './obsidian-store.js'

const DEFAULT_SUMMARIZE_PROMPT = `Summarize the key topics and insights in concise bullet points. Cover the what, why, how and the implications. Use concise language of an expert. Never go beyond what is covered.`

/** Main orchestrator: runs all curation tasks sequentially. */
export async function runCuration(outputFolder, appDataPath) {
  const results = []

  try {
    // 1. Ensure Obsidian vault structure
    results.push(await ensureVault(outputFolder))

    // 2. Validate notes (Obsidian format)
    results.push(await validateNotes(outputFolder))

    // 3. Validate file locations match note frontmatter
    results.push(await validateFileLocations(outputFolder))

    // 4. Scan for untracked files
    results.push(await scanUntracked(outputFolder))

    // 5. Ensure agent folder
    results.push(await ensureAgentFolder(outputFolder))

    logger.info('curation', 'Folder curation completed', {
      outputFolder,
      tasks: results.length,
      allOk: results.every((r) => r.status === 'ok' || r.status === 'skipped')
    })

    return results
  } catch (error) {
    logger.error('curation', 'Curation failed', { outputFolder, error: error.message })
    return results
  }
}

/** Task 1: Ensure the vault has a valid .obsidian/app.json marker. */
async function ensureVault(outputFolder) {
  const task = 'ensureVault'
  const details = []
  try {
    const obsidianDir = path.join(outputFolder, '.obsidian')
    const wasPresent = fs.existsSync(obsidianDir)
    initVault(outputFolder)
    if (!wasPresent) details.push('Created .obsidian vault marker')
    return { task, status: details.length > 0 ? 'fixed' : 'ok', details }
  } catch (error) {
    logger.error('curation', `Task ${task} failed`, { error: error.message })
    return { task, status: 'error', details: [error.message] }
  }
}

/** Task 2: Validate Obsidian notes have minimum required frontmatter. */
async function validateNotes(outputFolder) {
  const task = 'validateNotes'
  const details = []

  try {
    const foldersToScan = [outputFolder]
    try {
      for (const item of fs.readdirSync(outputFolder)) {
        if (item.startsWith('.')) continue
        const itemPath = path.join(outputFolder, item)
        try {
          if (fs.statSync(itemPath).isDirectory()) foldersToScan.push(itemPath)
        } catch {}
      }
    } catch {}

    for (const dir of foldersToScan) {
      const notes = scanFolderNotes(dir)
      for (const { notePath, frontmatter } of notes) {
        // Repair: ensure at least a title field exists
        if (!frontmatter.title && !frontmatter.file) {
          try {
            const stem = path.parse(notePath).name
            const content = fs.readFileSync(notePath, 'utf8')
            const { frontmatter: fm, body } = parseFrontmatter(content)
            fm.title = stem
            fs.writeFileSync(notePath, `---\n${serializeFrontmatter(fm)}\n---\n\n${body}`, 'utf8')
            details.push(`Repaired missing title in ${path.basename(notePath)}`)
          } catch {
            // best-effort
          }
        }
      }
    }

    return { task, status: details.length > 0 ? 'fixed' : 'ok', details }
  } catch (error) {
    logger.error('curation', `Task ${task} failed`, { error: error.message })
    return { task, status: 'error', details: [error.message] }
  }
}

/** Task 3: Validate that media files referenced in note frontmatter actually exist. */
async function validateFileLocations(outputFolder) {
  const task = 'validateFileLocations'
  const details = []

  try {
    const foldersToScan = [outputFolder]
    try {
      for (const item of fs.readdirSync(outputFolder)) {
        if (item.startsWith('.')) continue
        const itemPath = path.join(outputFolder, item)
        try {
          if (fs.statSync(itemPath).isDirectory()) foldersToScan.push(itemPath)
        } catch {}
      }
    } catch {}

    for (const dir of foldersToScan) {
      const notes = scanFolderNotes(dir)
      for (const { notePath, frontmatter } of notes) {
        if (!frontmatter.file) continue
        const expectedMediaPath = path.join(dir, frontmatter.file)
        if (!fs.existsSync(expectedMediaPath)) {
          const foundPath = findFile(outputFolder, frontmatter.file)
          if (foundPath && foundPath !== expectedMediaPath) {
            try {
              fs.renameSync(foundPath, expectedMediaPath)
              moveMetadataEntry(foundPath, expectedMediaPath)
              moveThumbnailSidecar(foundPath, expectedMediaPath)
              details.push(`Moved ${frontmatter.file} to correct folder`)
            } catch (moveError) {
              logger.warn('curation', `Failed to move file`, {
                filename: frontmatter.file,
                error: moveError.message
              })
            }
          }
        }
      }
    }

    return { task, status: details.length > 0 ? 'fixed' : 'ok', details }
  } catch (error) {
    logger.error('curation', `Task ${task} failed`, { error: error.message })
    return { task, status: 'error', details: [error.message] }
  }
}

/** Helper: find a file by name within the vault (two levels deep). */
function findFile(outputFolder, filename) {
  try {
    const candidate = path.join(outputFolder, filename)
    if (fs.existsSync(candidate)) return candidate
    for (const item of fs.readdirSync(outputFolder)) {
      if (item.startsWith('.')) continue
      const itemPath = path.join(outputFolder, item)
      try {
        if (fs.statSync(itemPath).isDirectory()) {
          const sub = path.join(itemPath, filename)
          if (fs.existsSync(sub)) return sub
        }
      } catch {}
    }
  } catch {}
  return null
}

/** Task 4: Scan for media files not covered by any Obsidian note. */
async function scanUntracked(outputFolder) {
  const task = 'scanUntracked'
  const details = []

  try {
    const coveredMedia = new Set()

    function collectCovered(folderPath) {
      const notes = scanFolderNotes(folderPath)
      for (const { frontmatter } of notes) {
        if (frontmatter.file) {
          coveredMedia.add(path.join(folderPath, frontmatter.file))
        }
      }
    }

    collectCovered(outputFolder)
    try {
      for (const item of fs.readdirSync(outputFolder)) {
        if (item.startsWith('.')) continue
        const itemPath = path.join(outputFolder, item)
        try {
          if (fs.statSync(itemPath).isDirectory()) collectCovered(itemPath)
        } catch {}
      }
    } catch {}

    const untracked = []

    function scan(dir, depth = 0) {
      if (depth > 1) return
      try {
        for (const item of fs.readdirSync(dir)) {
          if (item.startsWith('.') || isHelperFile(item)) continue
          const itemPath = path.join(dir, item)
          try {
            const stat = fs.statSync(itemPath)
            if (stat.isDirectory()) {
              scan(itemPath, depth + 1)
            } else if (!item.endsWith('.md') && !coveredMedia.has(itemPath)) {
              untracked.push(itemPath)
            }
          } catch {}
        }
      } catch {}
    }

    scan(outputFolder)

    if (untracked.length > 0) {
      const gitignorePath = path.join(outputFolder, '.gitignore')
      let content = ''
      if (fs.existsSync(gitignorePath)) content = fs.readFileSync(gitignorePath, 'utf8')
      const blockStart = '# Untracked by Pully'
      const blockEnd = '# End Untracked by Pully'
      let lines = content.split('\n')
      const startIdx = lines.findIndex((l) => l.includes(blockStart))
      const endIdx =
        startIdx !== -1 ? lines.findIndex((l, i) => i > startIdx && l.includes(blockEnd)) : -1
      const pullyLines = [
        blockStart,
        ...untracked.map((p) => path.relative(outputFolder, p)),
        blockEnd
      ]
      if (startIdx !== -1 && endIdx !== -1) {
        lines = [...lines.slice(0, startIdx), ...pullyLines, ...lines.slice(endIdx + 1)]
      } else if (startIdx !== -1) {
        lines = [...lines.slice(0, startIdx), ...pullyLines]
      } else {
        if (content && !content.endsWith('\n')) lines.push('')
        lines = [...lines, ...pullyLines]
      }
      fs.writeFileSync(gitignorePath, lines.filter((l) => l.trim()).join('\n') + '\n')
      details.push(`Updated .gitignore with ${untracked.length} untracked files`)
    }

    return { task, status: untracked.length > 0 ? 'fixed' : 'ok', details }
  } catch (error) {
    logger.error('curation', `Task ${task} failed`, { error: error.message })
    return { task, status: 'error', details: [error.message] }
  }
}

/** Task 5: Ensure .agent/commands/ folder and summarize.md prompt. */
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
      fs.writeFileSync(
        summarizePath,
        `---\ndescription: Generate an AI summary for a downloaded video\n---\n\n${DEFAULT_SUMMARIZE_PROMPT}\n`
      )
      details.push('Created summarize.md with default prompt')
    }
    return { task, status: details.length > 0 ? 'fixed' : 'ok', details }
  } catch (error) {
    logger.error('curation', `Task ${task} failed`, { error: error.message })
    return { task, status: 'error', details: [error.message] }
  }
}

/** Check if a filename is a system/sidecar file to exclude from tracking. */
function isHelperFile(fileName) {
  return (
    /\.thumb(\.[a-z]+)?$/i.test(fileName) ||
    /\.nfo$/i.test(fileName) ||
    fileName === '.pully.json' ||
    fileName === '.gitignore'
  )
}
