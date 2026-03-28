const https = require('https')
const fs = require('fs')
const path = require('path')

// --- yt-dlp ---
const YTDLP_BINARIES = {
  darwin: {
    url: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos',
    dest: path.join(__dirname, '..', 'resources', 'yt-dlp'),
    executable: true
  },
  win32: {
    url: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe',
    dest: path.join(__dirname, '..', 'resources', 'yt-dlp.exe'),
    executable: false
  },
  linux: {
    url: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux',
    dest: path.join(__dirname, '..', 'resources', 'yt-dlp'),
    executable: true
  }
}

function download(url, dest, executable, hops = 0) {
  if (hops > 5) { console.error('Too many redirects'); process.exit(1) }
  https.get(url, res => {
    if (res.statusCode === 301 || res.statusCode === 302) {
      return download(res.headers.location, dest, executable, hops + 1)
    }
    if (res.statusCode < 200 || res.statusCode >= 300) {
      res.resume()
      console.error('Unexpected HTTP status:', res.statusCode)
      process.exit(1)
    }
    const file = fs.createWriteStream(dest)
    res.pipe(file)
    file.on('finish', () => {
      file.close()
      if (executable) fs.chmodSync(dest, 0o755)
      console.log('Downloaded to', dest)
    })
  }).on('error', err => {
    fs.unlink(dest, () => {})
    console.error('Download failed:', err.message)
    process.exit(1)
  })
}

// Download yt-dlp
const ytdlpInfo = YTDLP_BINARIES[process.platform]
if (!ytdlpInfo) {
  console.log(`Unsupported platform: ${process.platform}, skipping yt-dlp download`)
} else if (fs.existsSync(ytdlpInfo.dest)) {
  console.log('yt-dlp already present, skipping')
} else {
  fs.mkdirSync(path.dirname(ytdlpInfo.dest), { recursive: true })
  download(ytdlpInfo.url, ytdlpInfo.dest, ytdlpInfo.executable)
}

// Copy ffmpeg from ffmpeg-static
const ffmpegSrc = require('ffmpeg-static')
const ffmpegDest = path.join(
  __dirname, '..', 'resources',
  process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
)
if (fs.existsSync(ffmpegDest)) {
  console.log('ffmpeg already present, skipping')
} else {
  fs.mkdirSync(path.dirname(ffmpegDest), { recursive: true })
  fs.copyFileSync(ffmpegSrc, ffmpegDest)
  if (process.platform !== 'win32') fs.chmodSync(ffmpegDest, 0o755)
  console.log('ffmpeg copied to', ffmpegDest)
}
