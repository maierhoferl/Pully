import React, { useRef, useState, useEffect, useCallback } from 'react'
import { useAppStore } from '../store/app-store.js'
import { MediaPanel } from './MediaPanel.jsx'

const HOME = 'https://www.youtube.com'
const RESCAN_INTERVAL_MS = 30_000

export default function BrowserTab() {
  const webviewRef = useRef(null)
  const [inputUrl, setInputUrl] = useState(HOME)
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)
  const { startMediaScan, setMediaScanResults } = useAppStore()
  const scanDebounceRef = useRef(null)
  const currentUrlRef = useRef(null)

  const scanPage = useCallback(async pageUrl => {
    try {
      const results = await window.api.extractInfo(pageUrl)
      setMediaScanResults(results)
    } catch {
      setMediaScanResults([])
    }
  }, [setMediaScanResults])

  const debouncedScan = useCallback((url) => {
    clearTimeout(scanDebounceRef.current)
    scanDebounceRef.current = setTimeout(() => {
      currentUrlRef.current = url
      startMediaScan()
      scanPage(url)
    }, 500)
  }, [scanPage, startMediaScan])

  useEffect(() => {
    const wv = webviewRef.current
    if (!wv) return

    const updateNav = () => {
      setInputUrl(wv.getURL())
      setCanGoBack(wv.canGoBack())
      setCanGoForward(wv.canGoForward())
    }

    const onNavigate = () => {
      updateNav()
    }

    const onInPageNavigate = () => {
      const url = wv.getURL()
      updateNav()
      if (url !== currentUrlRef.current) {
        debouncedScan(url)
      }
    }

    const onStartLoading = () => {
      clearTimeout(scanDebounceRef.current)
      startMediaScan()
    }

    const onFinishLoad = () => {
      const url = wv.getURL()
      setInputUrl(url)
      setCanGoBack(wv.canGoBack())
      setCanGoForward(wv.canGoForward())
      currentUrlRef.current = url
      scanPage(url)
    }

    wv.addEventListener('did-navigate', onNavigate)
    wv.addEventListener('did-navigate-in-page', onInPageNavigate)
    wv.addEventListener('did-start-loading', onStartLoading)
    wv.addEventListener('did-finish-load', onFinishLoad)

    const intervalId = setInterval(() => {
      const url = wv.getURL()
      if (url && url !== 'about:blank') {
        scanPage(url)
      }
    }, RESCAN_INTERVAL_MS)

    return () => {
      wv.removeEventListener('did-navigate', onNavigate)
      wv.removeEventListener('did-navigate-in-page', onInPageNavigate)
      wv.removeEventListener('did-start-loading', onStartLoading)
      wv.removeEventListener('did-finish-load', onFinishLoad)
      clearTimeout(scanDebounceRef.current)
      clearInterval(intervalId)
    }
  }, [scanPage, startMediaScan, debouncedScan])

  function navigate(raw) {
    const wv = webviewRef.current
    if (!wv) return
    let url = raw
    if (!url.match(/^https?:\/\//)) {
      url = url.includes('.') ? `https://${url}` : `https://www.google.com/search?q=${encodeURIComponent(url)}`
    }
    wv.loadURL(url)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1 px-2 py-1 bg-gray-900 border-b border-gray-700">
        <button onClick={() => webviewRef.current?.goBack()} disabled={!canGoBack}
          className="p-1 rounded text-gray-400 hover:text-white disabled:opacity-30 hover:bg-gray-700">←</button>
        <button onClick={() => webviewRef.current?.goForward()} disabled={!canGoForward}
          className="p-1 rounded text-gray-400 hover:text-white disabled:opacity-30 hover:bg-gray-700">→</button>
        <form onSubmit={e => { e.preventDefault(); navigate(inputUrl) }} className="flex-1">
          <input type="text" value={inputUrl} onChange={e => setInputUrl(e.target.value)}
            onFocus={e => e.target.select()}
            className="w-full bg-gray-800 text-white text-sm px-3 py-1 rounded border border-gray-600 focus:outline-none focus:border-blue-500"
            placeholder="Enter URL or search…" />
        </form>
      </div>
      <div className="flex-1 flex flex-col min-h-0">
        <webview ref={webviewRef} src={HOME} className="flex-1" style={{ width: '100%' }} allowpopups="true" />
        <MediaPanel />
      </div>
    </div>
  )
}
