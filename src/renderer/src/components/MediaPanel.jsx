import React, { useState, useRef, useEffect } from 'react'
import { useAppStore } from '../store/app-store.js'

function formatSize(bytes) {
  if (!bytes) return ''
  if (bytes > 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
  if (bytes > 1e6) return `${(bytes / 1e6).toFixed(1)} MB`
  return `${(bytes / 1e3).toFixed(0)} KB`
}

function PlaylistIcon() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const scale = window.devicePixelRatio || 1
    canvas.width = 96 * scale
    canvas.height = 56 * scale
    ctx.scale(scale, scale)

    // Background
    ctx.fillStyle = '#1f2937'
    ctx.fillRect(0, 0, 96, 56)

    // Draw stacked lines (playlist representation)
    ctx.strokeStyle = '#9ca3af'
    ctx.lineWidth = 1.5
    ctx.lineCap = 'round'

    const lineWidth = 40
    const startX = (96 - lineWidth) / 2
    const startY = 16

    for (let i = 0; i < 3; i++) {
      const y = startY + i * 12
      ctx.beginPath()
      ctx.moveTo(startX, y)
      ctx.lineTo(startX + lineWidth, y)
      ctx.stroke()
    }

    // Small play icon on the right
    ctx.fillStyle = '#6b7280'
    const playX = startX + lineWidth + 8
    const playY = 20
    const playSize = 8
    ctx.beginPath()
    ctx.moveTo(playX, playY)
    ctx.lineTo(playX, playY + playSize)
    ctx.lineTo(playX + playSize * 0.85, playY + playSize / 2)
    ctx.closePath()
    ctx.fill()
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="w-24 h-14 rounded-md flex-shrink-0 shadow"
      style={{ display: 'block' }}
    />
  )
}

function getBestFormats(entry) {
  if (!entry.formats) {
    return [{ format_id: 'best', label: `Best quality (${entry.ext || 'mp4'})` }]
  }
  const seen = new Set()
  return entry.formats
    .filter((f) => {
      const key = `${f.height || 'audio'}-${f.ext}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => (b.height || 0) - (a.height || 0))
    .slice(0, 8)
    .map((f) => ({
      format_id: f.format_id,
      label: f.height
        ? `${f.height}p ${f.ext}${f.filesize ? ' · ' + formatSize(f.filesize) : ''}`
        : `Audio ${f.ext}`
    }))
}

function DownloadButton({ downloadId }) {
  const downloads = useAppStore((s) => s.downloads)
  const dl = downloads.find((d) => d.id === downloadId)

  if (!dl) return null

  let label = 'Queued'
  let style = 'bg-gray-600 text-gray-300 cursor-not-allowed'

  if (dl.status === 'downloading') {
    const pct = typeof dl.percent === 'number' ? dl.percent : 0
    label = `${Math.round(pct)}%`
    style = 'bg-blue-700 text-white cursor-not-allowed'
  } else if (dl.status === 'done') {
    label = 'Done ✓'
    style = 'bg-green-700 text-white cursor-not-allowed'
  } else if (dl.status === 'failed') {
    label = 'Failed'
    style = 'bg-red-700 text-white cursor-not-allowed'
  }

  return (
    <button
      disabled
      className={`text-xs font-semibold px-2 py-1 rounded flex-shrink-0 transition-colors text-center ${style}`}
    >
      {label}
    </button>
  )
}

function MediaEntry({ entry, libraryMatch }) {
  const formats = getBestFormats(entry)
  const [selected, setSelected] = useState(formats[0]?.format_id || 'best')
  const [downloadId, setDownloadId] = useState(null)
  const [rememberState, setRememberState] = useState('idle') // idle | pending | done | exists | error
  const [forgetting, setForgetting] = useState(false)

  async function handleDownload() {
    const sourceUrl = entry.webpage_url || entry.url
    const metadata = {
      title: entry.title || entry.id || 'Untitled',
      uploader: entry.uploader || entry.channel || null,
      description: entry.description || null,
      thumbnailUrl: entry.thumbnail || null,
      url: sourceUrl
    }
    const id = await window.api.addDownload(
      sourceUrl,
      selected,
      entry.title || entry.id || 'Untitled',
      metadata
    )
    setDownloadId(id)
  }

  async function handleRemember() {
    if (rememberState !== 'idle') return
    setRememberState('pending')
    try {
      const result = await window.api.rememberMedia({
        title: entry.title || entry.id || 'Untitled',
        uploader: entry.uploader || entry.channel || null,
        description: entry.description || null,
        thumbnailUrl: entry.thumbnail || null,
        url: entry.webpage_url || entry.url
      })
      setRememberState(result.alreadyExists ? 'exists' : 'done')
    } catch {
      setRememberState('error')
    }
  }

  async function handleForget() {
    if (!libraryMatch || forgetting) return
    setForgetting(true)
    try {
      await window.api.deleteFile(libraryMatch.path)
      setRememberState('idle')
    } catch {
      console.error('Failed to forget item:', error)
    } finally {
      setForgetting(false)
    }
  }

  const rememberLabel = {
    idle: 'Remember',
    pending: '…',
    done: 'Saved ✓',
    exists: 'In library',
    error: 'Failed'
  }[rememberState]
  const rememberStyle = {
    idle: 'bg-green-700 hover:bg-green-600 text-white cursor-pointer',
    pending: 'bg-gray-600 text-gray-400 cursor-not-allowed',
    done: 'bg-purple-800 text-purple-200 cursor-default',
    exists: 'bg-gray-700 text-gray-400 cursor-default',
    error: 'bg-red-800 text-red-200 cursor-default'
  }[rememberState]

  const isPlaylist = Boolean(entry.playlist_id)
  const inLibrary = Boolean(libraryMatch)

  return (
    <div className="bg-gray-800 hover:bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 transition-colors">
      {/* Title */}
      <p className="text-sm font-medium text-white truncate leading-snug" title={entry.title}>
        {entry.title || entry.id}
      </p>
      {/* Metadata line: type indicator + quality selector */}
      <div className="flex items-center gap-3 mt-0.5">
        <span className="text-[0.65rem] text-gray-400 flex-shrink-0">
          {isPlaylist ? 'Playlist' : 'Single video'}
        </span>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="text-[0.7rem] bg-gray-700 border border-gray-600 rounded px-1.5 py-0.5 text-gray-300"
        >
          {formats.map((f) => (
            <option key={f.format_id} value={f.format_id}>
              {f.label}
            </option>
          ))}
        </select>
      </div>
      {/* Thumbnail + action buttons */}
      <div className="flex gap-3 mt-2">
        {entry.thumbnail ? (
          <img
            src={entry.thumbnail}
            alt=""
            className="w-24 h-14 object-cover rounded-md flex-shrink-0 shadow"
            onError={(e) => {
              e.target.style.display = 'none'
            }}
          />
        ) : isPlaylist ? (
          <PlaylistIcon />
        ) : null}
        <div className="flex flex-col gap-1.5">
          {inLibrary ? (
            <button
              onClick={handleForget}
              disabled={forgetting}
              className="text-xs font-semibold bg-red-700 hover:bg-red-600 text-white px-2 py-1 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {forgetting ? '…' : 'Forget'}
            </button>
          ) : (
            <button
              onClick={handleRemember}
              disabled={rememberState !== 'idle'}
              title={rememberState === 'exists' ? 'Already in library' : 'Save reference without downloading'}
              className={`text-xs font-semibold px-2 py-1 rounded transition-colors ${rememberStyle}`}
            >
              {rememberLabel}
            </button>
          )}
          {inLibrary ? null : downloadId ? (
            <DownloadButton downloadId={downloadId} />
          ) : (
            <button
              onClick={handleDownload}
              className="text-xs font-semibold bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white px-2 py-1 rounded transition-colors"
            >
              Download
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export function MediaPanel({ onRememberSite, onDownloadSite }) {
  const { browserTabs, activeBrowserTabId, updateBrowserTab, libraryFiles, removeLibraryFile } =
    useAppStore()
  const activeTab = browserTabs.find((t) => t.id === activeBrowserTabId)
  const mediaScanResults = activeTab?.mediaScanResults ?? null
  const mediaScanLoading = activeTab?.mediaScanLoading ?? false
  const currentBrowserUrl = activeTab?.browserUrl ?? null

  function startMediaScan() {
    if (activeBrowserTabId)
      updateBrowserTab(activeBrowserTabId, { mediaScanLoading: true, mediaScanResults: null })
  }
  function setMediaScanResults(results) {
    if (activeBrowserTabId)
      updateBrowserTab(activeBrowserTabId, { mediaScanResults: results, mediaScanLoading: false })
  }
  const [collapsed, setCollapsed] = useState(false)
  const [rememberingSite, setRememberingSite] = useState(false)
  const [downloadingSite, setDownloadingSite] = useState(false)

  async function handleRefresh() {
    if (!currentBrowserUrl || mediaScanLoading) return
    startMediaScan()
    try {
      const results = await window.api.extractInfo(currentBrowserUrl)
      setMediaScanResults(results)
    } catch {
      setMediaScanResults([])
    }
  }

  async function handleRememberSiteClick() {
    if (rememberingSite) return
    setRememberingSite(true)
    try {
      await onRememberSite()
    } catch {
      console.error('Failed to remember site')
    } finally {
      setRememberingSite(false)
    }
  }

  async function handleDownloadSiteClick() {
    if (downloadingSite || !onDownloadSite) return
    setDownloadingSite(true)
    try {
      await onDownloadSite()
    } catch {
      console.error('Failed to download site')
    } finally {
      setDownloadingSite(false)
    }
  }

  async function handleForgetSite() {
    const siteMatch = libraryFiles?.find((f) => f.url === currentBrowserUrl)
    if (!siteMatch) return
    try {
      await window.api.deleteFile(siteMatch.path)
      removeLibraryFile(siteMatch.path)
    } catch {
      console.error('Failed to forget site')
    }
  }

  // Don't show before the first navigation
  if (!mediaScanLoading && mediaScanResults === null) return null

  const hasResults = Array.isArray(mediaScanResults) && mediaScanResults.length > 0
  const siteInLibrary = libraryFiles?.some((f) => f.url === currentBrowserUrl)

  function headingText() {
    if (mediaScanLoading) return 'Scanning for content to download…'
    if (!hasResults) return 'No videos found'
    return `${mediaScanResults.length} video${mediaScanResults.length !== 1 ? 's' : ''} found`
  }

  // Split results into videos and playlists
  const videos = hasResults ? mediaScanResults.filter((e) => !e.playlist_id) : []
  const playlists = hasResults ? mediaScanResults.filter((e) => e.playlist_id) : []

  return (
    <div className="bg-gray-950">
      {/* Site control buttons */}
      <div className="px-3 py-2 bg-gray-900 border-b border-gray-800">
        {siteInLibrary ? (
          <button
            onClick={handleForgetSite}
            className="w-full text-xs font-semibold px-2.5 py-1.5 rounded bg-red-700 hover:bg-red-600 text-white transition-colors"
          >
            Forget Site
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-400 flex-shrink-0">Site:</span>
            <button
              onClick={handleDownloadSiteClick}
              disabled={downloadingSite}
              className="flex-1 text-xs font-semibold px-2 py-1.5 rounded bg-blue-700 hover:bg-blue-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white transition-colors"
              title="Save page as markdown file with embedded images"
            >
              {downloadingSite ? '…' : 'Download'}
            </button>
            <button
              onClick={handleRememberSiteClick}
              disabled={rememberingSite}
              className="flex-1 text-xs font-semibold px-2 py-1.5 rounded bg-green-700 hover:bg-green-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white transition-colors"
              title="Save as reference without downloading content"
            >
              {rememberingSite ? '…' : 'Remember'}
            </button>
          </div>
        )}
      </div>

      <div
        onClick={() => hasResults && setCollapsed((c) => !c)}
        className={`flex items-center gap-2 px-3 py-2.5 sticky top-[45px] bg-gray-950 border-b border-gray-800 z-10 ${hasResults ? 'cursor-pointer hover:bg-gray-900' : ''}`}
      >
        <span
          className={`text-sm font-bold tracking-wide ${mediaScanLoading ? 'text-blue-400' : hasResults ? 'text-white' : 'text-gray-500'}`}
        >
          {headingText()}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation()
            handleRefresh()
          }}
          disabled={!currentBrowserUrl || mediaScanLoading}
          className="ml-auto p-1 rounded text-gray-500 hover:text-white hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Refresh"
        >
          ↻
        </button>
        {hasResults && <span className="text-gray-500 text-xs">{collapsed ? '▼' : '▲'}</span>}
      </div>
      {!collapsed && hasResults && (
        <div className="p-2 flex flex-col gap-1">
          {videos.length > 0 && (
            <>
              <div className="text-xs font-semibold text-gray-400 px-1 py-1.5 uppercase tracking-wider">
                Videos
              </div>
              <div className="flex flex-col gap-1">
                {videos.map((entry) => {
                  const libraryMatch = libraryFiles?.find((f) => f.url === (entry.webpage_url || entry.url))
                  return <MediaEntry key={entry.id || entry.url} entry={entry} libraryMatch={libraryMatch} />
                })}
              </div>
            </>
          )}
          {playlists.length > 0 && (
            <>
              <div className="text-xs font-semibold text-gray-400 px-1 py-1.5 uppercase tracking-wider mt-2">
                Playlists
              </div>
              <div className="flex flex-col gap-1">
                {playlists.map((entry) => {
                  const libraryMatch = libraryFiles?.find((f) => f.url === (entry.webpage_url || entry.url))
                  return <MediaEntry key={entry.id || entry.url} entry={entry} libraryMatch={libraryMatch} />
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
