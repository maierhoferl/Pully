const https = require('https')
const fs = require('fs')
const path = require('path')

const DEST = path.join(__dirname, '..', 'resources', 'yt-dlp')
const URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos'

if (process.platform !== 'darwin') {
  console.log('Skipping yt-dlp download — macOS only')
  process.exit(0)
}

if (fs.existsSync(DEST)) {
  console.log('yt-dlp already present, skipping')
  process.exit(0)
}

fs.mkdirSync(path.dirname(DEST), { recursive: true })

function download(url, dest, hops = 0) {
  if (hops > 5) { console.error('Too many redirects'); process.exit(1) }
  https.get(url, res => {
    if (res.statusCode === 301 || res.statusCode === 302) {
      return download(res.headers.location, dest, hops + 1)
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
      fs.chmodSync(dest, 0o755)
      console.log('yt-dlp downloaded to', dest)
    })
  }).on('error', err => {
    fs.unlink(dest, () => {})
    console.error('Download failed:', err.message)
    process.exit(1)
  })
}

download(URL, DEST)
