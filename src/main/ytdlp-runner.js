import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'

const PROGRESS_RE = /\[download\]\s+([\d.]+)%\s+of\s+[\S]+\s+at\s+([\d.]+\S+\/s)\s+ETA\s+([\d:]+)/

export function getDefaultBinaryPath() {
  const base = process.resourcesPath || path.join(process.cwd(), 'resources')
  const name = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'
  return path.join(base, name)
}

export function ensureBinary(src, dest) {
  if (fs.existsSync(dest)) return
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.copyFileSync(src, dest)
  if (process.platform !== 'win32') fs.chmodSync(dest, 0o755)
}

export function extractInfo(url, binaryPath = getDefaultBinaryPath()) {
  return new Promise(resolve => {
    const proc = spawn(binaryPath, [
      '--dump-json', '--flat-playlist', '--no-warnings',
      '--playlist-items', '1-20', url
    ])
    let out = ''
    proc.stdout.on('data', d => { out += d.toString() })
    proc.on('close', code => {
      if (code !== 0) return resolve([])
      const entries = []
      for (const line of out.trim().split('\n')) {
        if (!line.trim()) continue
        try { entries.push(JSON.parse(line)) } catch { /* skip */ }
      }
      resolve(entries)
    })
    // Timeout after 30s
    setTimeout(() => { proc.kill(); resolve([]) }, 30000)
  })
}

export function startDownload(url, formatId, outputDir, onProgress, onDone, onError, binaryPath = getDefaultBinaryPath()) {
  const proc = spawn(binaryPath, [
    '--format', formatId,
    '--output', path.join(outputDir, '%(title)s.%(ext)s'),
    '--newline', '--no-warnings', url
  ])
  proc.stdout.on('data', data => {
    const m = data.toString().match(PROGRESS_RE)
    if (m) onProgress({ percent: parseFloat(m[1]), speed: m[2], eta: m[3] })
  })
  proc.on('close', code => code === 0 ? onDone() : onError(new Error(`yt-dlp exited ${code}`)))
  return proc
}
