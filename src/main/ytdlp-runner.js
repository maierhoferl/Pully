import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import logger from './logger.js'

const PROGRESS_RE = /\[download\]\s+([\d.]+)%\s+of\s+[\S]+\s+at\s+([\d.]+\S+\/s)\s+ETA\s+([\d:]+)/
const __dirname = path.dirname(fileURLToPath(import.meta.url))

export function getDefaultBinaryPath() {
  const name = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'

  // In dev mode, process.resourcesPath points to Electron's bundled resources, not our binaries
  // Check process.resourcesPath first (production), fall back to project resources (dev)
  if (process.resourcesPath) {
    const bundledPath = path.join(process.resourcesPath, name)
    if (fs.existsSync(bundledPath)) return bundledPath
  }

  // Fallback for dev mode and testing
  return path.join(__dirname, '../../resources', name)
}

export function getDefaultFfmpegPath() {
  const name = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'

  // In dev mode, process.resourcesPath points to Electron's bundled resources, not our binaries
  // Check process.resourcesPath first (production), fall back to project resources (dev)
  if (process.resourcesPath) {
    const bundledPath = path.join(process.resourcesPath, name)
    if (fs.existsSync(bundledPath)) return bundledPath
  }

  // Fallback for dev mode and testing
  return path.join(__dirname, '../../resources', name)
}

export function ensureBinary(src, dest) {
  if (fs.existsSync(dest)) {
    logger.info('app', 'yt-dlp binary confirmed', { binaryPath: dest })
    return
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.copyFileSync(src, dest)
  if (process.platform !== 'win32') fs.chmodSync(dest, 0o755)
  logger.info('app', 'yt-dlp binary confirmed', { binaryPath: dest })
}

export function extractInfo(url, binaryPath = getDefaultBinaryPath(), retryCount = 0) {
  return new Promise((resolve) => {
    // Arguments for yt-dlp with YouTube-friendly flags
    const args = [
      '--dump-json',
      '--flat-playlist',
      '--no-warnings',
      '--socket-timeout',
      '15',
      '--playlist-items',
      '1-20',
      '--user-agent',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      url
    ]

    let timedOut = false
    const proc = spawn(binaryPath, args)
    logger.info('app', 'yt-dlp process spawned', { url, pid: proc.pid, retryCount })
    let out = ''
    let err = ''

    proc.stdout.on('data', (d) => {
      out += d.toString()
    })
    proc.stderr.on('data', (chunk) => {
      err += chunk.toString()
      for (const line of chunk.toString().split('\n')) {
        if (line.trim()) logger.warn('app', line.trim())
      }
    })

    proc.on('close', (code) => {
      if (timedOut) return // Already resolved via timeout

      logger.info('app', 'yt-dlp process exited', { url, exitCode: code, retryCount })

      if (code !== 0) {
        // Retry once on failure (YouTube might be throttling)
        if (retryCount < 1 && err.includes('ERROR')) {
          logger.info('app', 'yt-dlp extraction failed, retrying...', { url })
          setTimeout(() => {
            extractInfo(url, binaryPath, retryCount + 1)
              .then(resolve)
              .catch(() => resolve([]))
          }, 1000)
          return
        }
        return resolve([])
      }

      const entries = []
      for (const line of out.trim().split('\n')) {
        if (!line.trim()) continue
        try {
          entries.push(JSON.parse(line))
        } catch {
          /* skip malformed JSON */
        }
      }
      resolve(entries)
    })

    proc.on('error', (err) => {
      logger.error('app', 'yt-dlp process error', { error: err.message, url })
      resolve([])
    })

    // Timeout after 20s (reduced from 30s for faster feedback)
    const timeoutId = setTimeout(() => {
      timedOut = true
      proc.kill()
      logger.warn('app', 'yt-dlp process timeout', { url, pid: proc.pid })
      // Don't retry on timeout - just return empty
      resolve([])
    }, 20000)

    // Clear timeout if process finishes first
    proc.on('close', () => clearTimeout(timeoutId))
  })
}

export function startDownload(
  url,
  formatId,
  outputDir,
  onProgress,
  onDone,
  onError,
  binaryPath = getDefaultBinaryPath(),
  ffmpegPath = getDefaultFfmpegPath()
) {
  const proc = spawn(binaryPath, [
    '--format',
    formatId,
    '--output',
    path.join(outputDir, '%(title)s.%(ext)s'),
    '--print',
    'after_move:%(filepath)s',
    '--embed-thumbnail',
    '--embed-metadata',
    '--ffmpeg-location',
    ffmpegPath,
    '--newline',
    '--no-warnings',
    url
  ])
  logger.info('app', 'yt-dlp process spawned', { url, pid: proc.pid })
  let buf = ''
  let actualPath = null
  const stderrLines = []
  proc.stdout.on('data', (data) => {
    buf += data.toString()
    const lines = buf.split('\n')
    buf = lines.pop()
    for (const line of lines) {
      const m = line.match(PROGRESS_RE)
      if (m) {
        onProgress({ percent: parseFloat(m[1]), speed: m[2], eta: m[3] })
      } else if (line.trim() && !line.startsWith('[')) {
        actualPath = line.trim()
      } else if (line.trim()) {
        logger.info('download', line.trim())
      }
    }
  })
  proc.stderr.on('data', (chunk) => {
    const text = chunk.toString()
    stderrLines.push(text)
    for (const line of text.split('\n')) {
      if (line.trim()) logger.warn('download', line.trim())
    }
  })
  proc.on('close', (code) => {
    logger.info('app', 'yt-dlp process exited', { url, exitCode: code })
    if (code === 0) {
      onDone(actualPath)
    } else {
      const stderr = stderrLines.join('').trim()
      const errorMsg = stderr ? `yt-dlp exited ${code}\n${stderr}` : `yt-dlp exited ${code}`
      onError(new Error(errorMsg))
    }
  })
  proc.on('error', (err) => {
    logger.error('app', 'yt-dlp process error', { error: err.message })
    onError(err)
  })
  return proc
}
