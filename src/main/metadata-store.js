import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'

const _require = createRequire(import.meta.url)

function defaultPath() {
  const { app } = _require('electron')
  return path.join(app.getPath('userData'), 'metadata-index.json')
}

export function readMetadataIndex(indexPath) {
  const p = indexPath || defaultPath()
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch {
    return {}
  }
}

export function writeMetadataEntry(filePath, metadata, indexPath) {
  const p = indexPath || defaultPath()
  const index = readMetadataIndex(p)
  index[filePath] = metadata
  fs.writeFileSync(p, JSON.stringify(index, null, 2))
}

export function deleteMetadataEntry(filePath, indexPath) {
  const p = indexPath || defaultPath()
  const index = readMetadataIndex(p)
  delete index[filePath]
  fs.writeFileSync(p, JSON.stringify(index, null, 2))
}

export function moveMetadataEntry(oldPath, newPath, indexPath) {
  const p = indexPath || defaultPath()
  const index = readMetadataIndex(p)
  if (index[oldPath]) {
    index[newPath] = index[oldPath]
    delete index[oldPath]
    fs.writeFileSync(p, JSON.stringify(index, null, 2))
  }
}
