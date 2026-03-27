import React, { useRef, useState, useEffect, useCallback } from 'react'
import { useAppStore } from '../store/app-store.js'
import { MediaPanel } from './MediaPanel.jsx'

const HOME = 'https://www.youtube.com'

export default function BrowserTab() {
  const webviewRef = useRef(null)
  const [inputUrl, setInputUrl] = useState(HOME)
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)
  const { setMediaScanLoading, setMediaScanResults } = useAppStore()

  const scanPage = useCallback(async pageUrl => {
    setMediaScanLoading(true)
    setMediaScanResults([])
    const results = await window.api.extractInfo(pageUrl)
    setMediaScanResults(results)
  }, [setMediaScanLoading, setMediaScanResults])

  useEffect(() => {
    const wv = webviewRef.current
    if (!wv) return

    const onNavigate = () => {
      setInputUrl(wv.getURL())
      setCanGoBack(wv.canGoBack())
      setCanGoForward(wv.canGoForward())
    }

    const onFinishLoad = () => {
      const url = wv.getURL()
      setInputUrl(url)
      setCanGoBack(wv.canGoBack())
      setCanGoForward(wv.canGoForward())
      scanPage(url)
    }

    wv.addEventListener('did-navigate', onNavigate)
    wv.addEventListener('did-navigate-in-page', onNavigate)
    wv.addEventListener('did-finish-load', onFinishLoad)
    return () => {
      wv.removeEventListener('did-navigate', onNavigate)
      wv.removeEventListener('did-navigate-in-page', onNavigate)
      wv.removeEventListener('did-finish-load', onFinishLoad)
    }
  }, [scanPage])

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
