import fs from 'fs'
import path from 'path'
import logger from './logger.js'

/** Returns absolute path to the notes.md for the folder containing filePath. */
export function getNotesPath(filePath, outputFolder) {
  const rel = path.relative(outputFolder, filePath)
  const parts = rel.split(path.sep)
  if (parts.length <= 1) {
    return path.join(outputFolder, 'notes.md')
  }
  return path.join(outputFolder, parts[0], 'notes.md')
}

function getFolderTitle(notesPath, outputFolder) {
  const rel = path.relative(outputFolder, path.dirname(notesPath))
  if (rel === '.') return 'Library'
  return rel
}

function readFile(notesPath) {
  if (!fs.existsSync(notesPath)) return ''
  return fs.readFileSync(notesPath, 'utf8')
}

function buildChapterStub(fileBasename, metadata) {
  const title = metadata.title || fileBasename
  const url = metadata.url || ''
  const date = metadata.downloadedAt
    ? metadata.downloadedAt.slice(0, 10)
    : new Date().toISOString().slice(0, 10)
  return [
    `## ${title}`,
    `<!-- pully:file:${fileBasename} -->`,
    `<!-- pully:url:${url} -->`,
    `<!-- pully:downloaded:${date} -->`,
    '',
    '### AI Summary',
    '',
    '### My Notes',
    '',
  ].join('\n')
}

/** Creates a chapter stub in the folder's notes.md. No-op if chapter already exists. */
export function initChapter(filePath, metadata, outputFolder) {
  const notesPath = getNotesPath(filePath, outputFolder)
  const fileBasename = path.basename(filePath)
  let content = readFile(notesPath)
  if (content.includes(`<!-- pully:file:${fileBasename} -->`)) return
  if (!content) {
    const title = getFolderTitle(notesPath, outputFolder)
    content = `# ${title}\n\n`
  }
  const stub = buildChapterStub(fileBasename, metadata)
  content = content.trimEnd() + '\n\n---\n\n' + stub + '\n---\n'
  fs.mkdirSync(path.dirname(notesPath), { recursive: true })
  fs.writeFileSync(notesPath, content, 'utf8')
  logger.info('notes', `Chapter initialized: ${fileBasename}`, {
    filename: fileBasename,
    videoTitle: metadata.title
  })
}

/** Parse notes.md into structured chapters. folderName null = root. */
export function readFolderNotes(folderName, outputFolder) {
  const notesPath = folderName
    ? path.join(outputFolder, folderName, 'notes.md')
    : path.join(outputFolder, 'notes.md')
  const content = readFile(notesPath)
  if (!content) return { title: folderName || 'Library', chapters: [] }

  const lines = content.split('\n')
  const chapters = []
  let current = null
  let section = null

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (current) chapters.push(finalizeChapter(current))
      current = { heading: line.slice(3), file: null, url: null, downloadedAt: null, _summary: [], _bullets: [] }
      section = null
    } else if (current) {
      const fm = line.match(/<!--\s*pully:file:(.*?)\s*-->/)
      const um = line.match(/<!--\s*pully:url:(.*?)\s*-->/)
      const dm = line.match(/<!--\s*pully:downloaded:(.*?)\s*-->/)
      if (fm) current.file = fm[1].trim()
      if (um) current.url = um[1].trim()
      if (dm) current.downloadedAt = dm[1].trim()
      if (line === '### AI Summary') { section = 'summary'; continue }
      if (line === '### My Notes') { section = 'notes'; continue }
      if (line.startsWith('### ') || line === '---') { section = null; continue }
      if (section === 'summary' && line.trim()) current._summary.push(line)
      if (section === 'notes' && line.startsWith('- ')) current._bullets.push(line.slice(2).trim())
    }
  }
  if (current) chapters.push(finalizeChapter(current))

  const titleLine = lines.find(l => l.startsWith('# '))
  const title = titleLine ? titleLine.slice(2).trim() : (folderName || 'Library')
  return { title, chapters }
}

function finalizeChapter(c) {
  return {
    file: c.file,
    url: c.url,
    downloadedAt: c.downloadedAt,
    heading: c.heading,
    summary: c._summary.join('\n').trim() || null,
    bullets: c._bullets,
  }
}

/** Surgically replace content under a named section heading (### X) for the chapter identified by fileBasename. */
function updateSection(notesPath, fileBasename, sectionHeading, newBody) {
  const content = readFile(notesPath)
  if (!content.includes(`<!-- pully:file:${fileBasename} -->`)) return
  const lines = content.split('\n')
  let inChapter = false
  let sectionStart = -1
  let sectionEnd = -1

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(`<!-- pully:file:${fileBasename} -->`)) inChapter = true
    if (!inChapter) continue
    if (lines[i] === sectionHeading) { sectionStart = i + 1; continue }
    if (sectionStart !== -1 && sectionEnd === -1) {
      if (lines[i].startsWith('### ') || lines[i] === '---' || lines[i].startsWith('## ')) {
        sectionEnd = i
        break
      }
    }
  }
  if (sectionStart === -1) return
  if (sectionEnd === -1) sectionEnd = lines.length

  // Trim trailing blank lines before sectionEnd
  while (sectionEnd > sectionStart && lines[sectionEnd - 1].trim() === '') sectionEnd--

  const bodyLines = newBody ? newBody.split('\n') : []
  const result = [...lines.slice(0, sectionStart), ...bodyLines, '', ...lines.slice(sectionEnd)]
  fs.writeFileSync(notesPath, result.join('\n'), 'utf8')
}

export function writeSummarySection(filePath, summary, outputFolder) {
  const notesPath = getNotesPath(filePath, outputFolder)
  const fileBasename = path.basename(filePath)
  updateSection(notesPath, fileBasename, '### AI Summary', summary)
  logger.info('notes', `Summary written: ${fileBasename}`, {
    filename: fileBasename
  })
}

export function writeBulletsSection(filePath, bullets, outputFolder) {
  const notesPath = getNotesPath(filePath, outputFolder)
  const fileBasename = path.basename(filePath)
  const body = bullets.map(b => `- ${b}`).join('\n')
  updateSection(notesPath, fileBasename, '### My Notes', body)
  logger.info('notes', `Bullets updated: ${fileBasename}`, {
    filename: fileBasename,
    bulletCount: bullets.length
  })
}

/** Extracts a chapter block from content. Returns { chapterContent, remaining }. */
function extractChapter(content, fileBasename) {
  const lines = content.split('\n')
  let chapterStart = -1
  let chapterEnd = lines.length

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(`<!-- pully:file:${fileBasename} -->`)) {
      // Walk back to find the ## heading
      for (let j = i; j >= 0; j--) {
        if (lines[j].startsWith('## ')) { chapterStart = j; break }
      }
      // Walk forward to find the closing --- or next ##
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j] === '---' || lines[j].startsWith('## ')) {
          chapterEnd = lines[j] === '---' ? j + 1 : j
          break
        }
      }
      break
    }
  }
  if (chapterStart === -1) return { chapterContent: null, remaining: content }

  const chapterLines = lines.slice(chapterStart, chapterEnd)
  const remainingLines = [...lines.slice(0, chapterStart), ...lines.slice(chapterEnd)]
  const remaining = remainingLines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n'
  return { chapterContent: chapterLines.join('\n'), remaining }
}

/** Moves a chapter from oldFilePath's notes.md to newFilePath's notes.md. */
export function moveChapter(oldFilePath, newFilePath, outputFolder) {
  const oldNotesPath = getNotesPath(oldFilePath, outputFolder)
  const newNotesPath = getNotesPath(newFilePath, outputFolder)
  if (oldNotesPath === newNotesPath) return

  const oldBasename = path.basename(oldFilePath)
  const newBasename = path.basename(newFilePath)
  const oldContent = readFile(oldNotesPath)
  const { chapterContent, remaining } = extractChapter(oldContent, oldBasename)
  if (!chapterContent) return

  const updatedChapter = chapterContent.replace(
    `<!-- pully:file:${oldBasename} -->`,
    `<!-- pully:file:${newBasename} -->`
  )

  fs.writeFileSync(oldNotesPath, remaining, 'utf8')

  let newContent = readFile(newNotesPath)
  if (!newContent) {
    const title = getFolderTitle(newNotesPath, outputFolder)
    newContent = `# ${title}\n\n`
  }
  newContent = newContent.trimEnd() + '\n\n---\n\n' + updatedChapter.trimEnd() + '\n---\n'
  fs.mkdirSync(path.dirname(newNotesPath), { recursive: true })
  fs.writeFileSync(newNotesPath, newContent, 'utf8')
  logger.info('notes', `Chapter moved`, {
    oldFile: oldBasename,
    newFile: newBasename,
    oldFolder: path.dirname(oldFilePath),
    newFolder: path.dirname(newFilePath)
  })
}
