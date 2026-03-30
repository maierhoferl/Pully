import React, { useRef, useState, useEffect, useCallback } from 'react'
import { useAppStore } from '../store/app-store.js'
import SidePanel from './SidePanel.jsx'
import BrowserTabBar from './BrowserTabBar.jsx'
import { captureFromWebview } from '../utils/pageCapture.js'

const HOME = 'https://www.youtube.com'
const RESCAN_INTERVAL_MS = 2_000
const SUSPEND_AFTER_MS = 30 * 60 * 1_000 // 30 minutes

const YOUTUBE_EXTRACT_SCRIPT = `
(function() {
  const videos = [];
  const isWatchPage = /watch\\?v=/.test(location.href);
  const isPlaylistPage = /list=/.test(location.href) || /playlist\\?/.test(location.href);
  let initialData = null;
  try {
    const scripts = document.querySelectorAll('script');
    for (const script of scripts) {
      if (script.textContent.includes('var ytInitialData = ')) {
        const match = script.textContent.match(/var ytInitialData = ({.*?});/s);
        if (match) { initialData = JSON.parse(match[1]); break; }
      }
    }
  } catch (e) {}
  if (isWatchPage) {
    const videoId = new URLSearchParams(location.search).get('v');
    if (videoId) {
      let title = document.title.replace(' - YouTube', '').trim();
      const titleElement = document.querySelector('h1 yt-formatted-string, h1.title');
      if (titleElement) title = titleElement.textContent.trim();
      videos.push({ id: videoId, url: \`https://www.youtube.com/watch?v=\${videoId}\`, webpage_url: location.href, title: title || videoId, description: '', thumbnail: \`https://img.youtube.com/vi/\${videoId}/maxresdefault.jpg\`, ext: 'mp4' });
    }
  } else if (isPlaylistPage) {
    const videoSelectors = ['a#video-title-link[href*="watch?v="]', 'a.yt-simple-endpoint[href*="watch?v="]'];
    let videoLinks = [];
    for (const sel of videoSelectors) { videoLinks = Array.from(document.querySelectorAll(sel)); if (videoLinks.length > 0) break; }
    const playlistId = new URLSearchParams(location.search).get('list');
    videoLinks.forEach((link, index) => {
      if (index >= 20) return;
      const href = link.getAttribute('href'); if (!href) return;
      const videoId = new URLSearchParams(href.split('?')[1]).get('v');
      if (videoId) videos.push({ id: videoId, url: \`https://www.youtube.com\${href}\`, webpage_url: \`https://www.youtube.com\${href}\`, title: link.textContent.trim() || videoId, description: '', thumbnail: \`https://img.youtube.com/vi/\${videoId}/default.jpg\`, playlist_id: playlistId, ext: 'mp4' });
    });
  }
  return videos.length > 0 ? videos : null;
})()
`

export default function BrowserTab() {
  // webviewRefs: Map<tabId, HTMLElement>
  const webviewRefs = useRef({})
  const inputRef = useRef(null)
  const [inputUrl, setInputUrl] = useState(HOME)
  const [sideWidth, setSideWidth] = useState(320)
  const [contextMenu, setContextMenu] = useState(null)
  const [bookmarkPanelOpen, setBookmarkPanelOpen] = useState(false)
  const [suggestions, setSuggestions] = useState([])
  const [suggestionIndex, setSuggestionIndex] = useState(-1)
  const suggestionsTimeoutRef = useRef(null)
  const scanDebounceRefs = useRef({}) // Map<tabId, timeoutId>
  const currentUrlRefs = useRef({}) // Map<tabId, string>

  const {
    browserTabs,
    activeBrowserTabId,
    addBrowserTab,
    closeBrowserTab,
    setActiveBrowserTab,
    updateBrowserTab,
    suspendBrowserTab,
    bookmarks,
    historyUrls,
    addBookmarkLocal,
    removeBookmarkLocal,
    upsertHistoryLocal,
    config
  } = useAppStore()

  const activeTab = browserTabs.find((t) => t.id === activeBrowserTabId)

  // Keep URL bar in sync with active tab
  useEffect(() => {
    if (activeTab) setInputUrl(activeTab.browserUrl)
  }, [activeBrowserTabId])

  // Persist tabs on every change
  useEffect(() => {
    const data = {
      tabs: browserTabs.map((t) => ({ ...t, suspended: true })), // save all as suspended
      activeBrowserTabId
    }
    window.api.browserTabsWrite(data).catch(() => {})
  }, [browserTabs, activeBrowserTabId])

  // Load persisted tabs on mount
  useEffect(() => {
    window.api
      .browserTabsRead()
      .then((data) => {
        if (!data?.tabs?.length) return
        const { setActiveBrowserTab: setActive, reorderBrowserTabs } = useAppStore.getState()
        // All tabs start suspended; active tab will be unsuspended by the webview mount
        const restored = data.tabs.map((t) => ({
          ...t,
          suspended: t.id !== data.activeBrowserTabId
        }))
        reorderBrowserTabs(restored)
        setActive(data.activeBrowserTabId)
      })
      .catch(() => {})
  }, [])

  // Suspension timer: suspend tabs idle > 30 min
  useEffect(() => {
    const id = setInterval(() => {
      const { browserTabs: tabs, activeBrowserTabId: activeId } = useAppStore.getState()
      const now = Date.now()
      tabs.forEach((tab) => {
        if (tab.id !== activeId && !tab.suspended && now - tab.lastActiveAt > SUSPEND_AFTER_MS) {
          suspendBrowserTab(tab.id)
        }
      })
    }, 60_000)
    return () => clearInterval(id)
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    function onKeyDown(e) {
      const meta = e.metaKey || e.ctrlKey
      if (!meta) return
      if (e.key === 't') {
        e.preventDefault()
        addBrowserTab()
      } else if (e.key === 'w') {
        e.preventDefault()
        closeBrowserTab(activeBrowserTabId)
      } else if (e.key === ']' && e.shiftKey) {
        e.preventDefault()
        const { browserTabs: tabs, activeBrowserTabId: activeId } = useAppStore.getState()
        const idx = tabs.findIndex((t) => t.id === activeId)
        if (idx < tabs.length - 1) setActiveBrowserTab(tabs[idx + 1].id)
      } else if (e.key === '[' && e.shiftKey) {
        e.preventDefault()
        const { browserTabs: tabs, activeBrowserTabId: activeId } = useAppStore.getState()
        const idx = tabs.findIndex((t) => t.id === activeId)
        if (idx > 0) setActiveBrowserTab(tabs[idx - 1].id)
      } else if (e.key >= '1' && e.key <= '9') {
        e.preventDefault()
        const { browserTabs: tabs } = useAppStore.getState()
        const n = parseInt(e.key, 10)
        const target = n === 9 ? tabs[tabs.length - 1] : tabs[n - 1]
        if (target) setActiveBrowserTab(target.id)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const scanPage = useCallback(async (tabId, pageUrl) => {
    const { updateBrowserTab: update } = useAppStore.getState()
    try {
      const wv = webviewRefs.current[tabId]
      if (!wv) return
      if (pageUrl && pageUrl.includes('youtube.com')) {
        try {
          const pageVideos = await wv.executeJavaScript(YOUTUBE_EXTRACT_SCRIPT)
          if (pageVideos && pageVideos.length > 0) {
            update(tabId, { mediaScanResults: pageVideos, mediaScanLoading: false })
            return
          }
        } catch (_) {}
      }
      const results = await window.api.extractInfo(pageUrl)
      update(tabId, { mediaScanResults: results, mediaScanLoading: false })
    } catch {
      update(tabId, { mediaScanResults: [], mediaScanLoading: false })
    }
  }, [])

  // Attach webview event listeners when a new (non-suspended) webview mounts
  const attachWebviewEvents = useCallback(
    (tabId, wv) => {
      if (!wv || webviewRefs.current[tabId] === wv) return
      webviewRefs.current[tabId] = wv

      const { updateBrowserTab: update, upsertHistoryLocal: upsertHistory } = useAppStore.getState()

      function updateNav() {
        update(tabId, {
          browserUrl: wv.getURL(),
          canGoBack: wv.canGoBack(),
          canGoForward: wv.canGoForward()
        })
        const { activeBrowserTabId: activeId } = useAppStore.getState()
        if (tabId === activeId) setInputUrl(wv.getURL())
      }

      function onNavigate() {
        updateNav()
      }

      function onInPageNavigate() {
        const url = wv.getURL()
        updateNav()
        if (url !== currentUrlRefs.current[tabId]) {
          clearTimeout(scanDebounceRefs.current[tabId])
          scanDebounceRefs.current[tabId] = setTimeout(() => {
            currentUrlRefs.current[tabId] = url
            update(tabId, { browserUrl: url, mediaScanLoading: true, mediaScanResults: null })
            scanPage(tabId, url)
          }, 500)
        }
      }

      function onStartLoading() {
        clearTimeout(scanDebounceRefs.current[tabId])
        update(tabId, { mediaScanLoading: true, mediaScanResults: null })
      }

      function onFinishLoad() {
        const url = wv.getURL()
        const title = wv.getTitle()
        currentUrlRefs.current[tabId] = url
        update(tabId, {
          browserUrl: url,
          title: title || 'New Tab',
          canGoBack: wv.canGoBack(),
          canGoForward: wv.canGoForward()
        })
        const { activeBrowserTabId: activeId } = useAppStore.getState()
        if (tabId === activeId) setInputUrl(url)

        window.api.upsertHistory({ url, title }).catch(() => {})
        upsertHistory({ url, title })
        scanPage(tabId, url)

        if (url.includes('youtube.com')) {
          wv.executeJavaScript(
            `localStorage.setItem('yt-player-autoplay-preference', JSON.stringify({data:"false",creation:Date.now()}))`
          ).catch(() => {})
        }
        wv.executeJavaScript(
          `document.addEventListener('contextmenu', (e) => { if (e.target.tagName === 'VIDEO' || e.target.closest('video')) { e.preventDefault() } }, true)`
        ).catch(() => {})

        // Capture favicon
        wv.executeJavaScript(
          `
        (function() {
          const link = document.querySelector('link[rel~="icon"]');
          return link ? link.href : null;
        })()
      `
        )
          .then((faviconUrl) => {
            if (faviconUrl) update(tabId, { favicon: faviconUrl })
          })
          .catch(() => {})
      }

      function onContextMenu(e) {
        const { mediaType, srcURL, x, y } = e.params
        if (mediaType !== 'video' || !srcURL) return
        const rect = wv.getBoundingClientRect()
        setContextMenu({ x: rect.left + x, y: rect.top + y, srcURL })
      }

      const intervalId = setInterval(() => {
        const url = wv.getURL()
        if (url && url !== 'about:blank') scanPage(tabId, url)
      }, RESCAN_INTERVAL_MS)

      wv.addEventListener('did-navigate', onNavigate)
      wv.addEventListener('did-navigate-in-page', onInPageNavigate)
      wv.addEventListener('did-start-loading', onStartLoading)
      wv.addEventListener('did-finish-load', onFinishLoad)
      wv.addEventListener('context-menu', onContextMenu)

      // Trigger initial scan once webview is attached
      const url = wv.getURL()
      if (url && url !== 'about:blank') {
        scanPage(tabId, url)
      }

      wv._pullyCleanup = () => {
        wv.removeEventListener('did-navigate', onNavigate)
        wv.removeEventListener('did-navigate-in-page', onInPageNavigate)
        wv.removeEventListener('did-start-loading', onStartLoading)
        wv.removeEventListener('did-finish-load', onFinishLoad)
        wv.removeEventListener('context-menu', onContextMenu)
        clearTimeout(scanDebounceRefs.current[tabId])
        clearInterval(intervalId)
      }
    },
    [scanPage]
  )

  // Cleanup webview refs for removed/suspended tabs
  useEffect(() => {
    const activeIds = new Set(browserTabs.filter((t) => !t.suspended).map((t) => t.id))
    Object.keys(webviewRefs.current).forEach((id) => {
      if (!activeIds.has(id)) {
        webviewRefs.current[id]?._pullyCleanup?.()
        delete webviewRefs.current[id]
      }
    })
  }, [browserTabs])

  // Cleanup all webviews on component unmount
  useEffect(() => {
    return () => {
      Object.values(webviewRefs.current).forEach((wv) => {
        if (wv && wv._pullyCleanup) wv._pullyCleanup()
      })
    }
  }, [])

  useEffect(() => {
    if (!contextMenu) return
    const dismiss = () => setContextMenu(null)
    window.addEventListener('mousedown', dismiss)
    return () => window.removeEventListener('mousedown', dismiss)
  }, [contextMenu])

  useEffect(() => {
    if (!bookmarkPanelOpen) return
    const dismiss = () => setBookmarkPanelOpen(false)
    window.addEventListener('mousedown', dismiss)
    return () => window.removeEventListener('mousedown', dismiss)
  }, [bookmarkPanelOpen])

  useEffect(() => {
    if (
      suggestions.length > 0 &&
      inputRef.current &&
      !inputRef.current.value.match(/^https?:\/\//)
    ) {
      const firstUrl = suggestions[0].url
      inputRef.current.value = firstUrl
      const typed = inputUrl
      if (firstUrl.startsWith(typed)) {
        inputRef.current.setSelectionRange(typed.length, firstUrl.length)
      }
    }
  }, [suggestions, inputUrl])

  function handleContextDownload(srcURL) {
    let title
    try {
      title = new URL(srcURL).hostname
    } catch {
      title = 'video'
    }
    window.api.addDownload(srcURL, 'best', title, { url: srcURL })
    setContextMenu(null)
  }

  function navigate(raw) {
    const wv = webviewRefs.current[activeBrowserTabId]
    if (!wv) return
    let url = raw
    if (!url.match(/^https?:\/\//)) {
      if (url.includes('.')) {
        url = `https://${url}`
      } else {
        const searchEngine = config.searchEngine || 'google'
        const searchUrls = {
          google: 'https://www.google.com/search?q=',
          duckduckgo: 'https://duckduckgo.com/?q=',
          bing: 'https://www.bing.com/search?q=',
          brave: 'https://search.brave.com/search?q='
        }
        url = (searchUrls[searchEngine] || searchUrls.google) + encodeURIComponent(url)
      }
    }
    wv.loadURL(url)
  }

  function toggleBookmark() {
    const url = activeTab?.browserUrl
    if (!url) return
    const isBookmarked = bookmarks.some((b) => b.url === url)
    if (isBookmarked) {
      window.api.removeBookmark(url).catch(() => {})
      removeBookmarkLocal(url)
    } else {
      const title = webviewRefs.current[activeBrowserTabId]?.getTitle() || url
      window.api.addBookmark({ url, title }).catch(() => {})
      addBookmarkLocal({ url, title, favicon: null, addedAt: new Date().toISOString() })
    }
  }

  function handleBookmarkClick(bookmarkUrl) {
    navigate(bookmarkUrl)
    setBookmarkPanelOpen(false)
  }

  function handleUrlInputChange(e) {
    const value = e.target.value
    setInputUrl(value)
    if (value.trim().length > 0) {
      const lower = value.toLowerCase()
      setSuggestions(
        historyUrls
          .filter(
            (h) => h.url.toLowerCase().includes(lower) || h.title.toLowerCase().includes(lower)
          )
          .slice(0, 8)
      )
      setSuggestionIndex(-1)
    } else {
      setSuggestions([])
      setSuggestionIndex(-1)
    }
  }

  function handleUrlInputKeyDown(e) {
    if (suggestions.length === 0) {
      if (e.key === 'Enter') {
        navigate(inputUrl)
        setSuggestions([])
      }
      return
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSuggestionIndex((p) => (p + 1) % suggestions.length)
        break
      case 'ArrowUp':
        e.preventDefault()
        setSuggestionIndex((p) => (p - 1 + suggestions.length) % suggestions.length)
        break
      case 'Enter':
        e.preventDefault()
        navigate(suggestionIndex >= 0 ? suggestions[suggestionIndex].url : inputUrl)
        setSuggestions([])
        break
      case 'Escape':
        setSuggestions([])
        setSuggestionIndex(-1)
        break
      default:
        break
    }
  }

  function handleUrlInputBlur() {
    suggestionsTimeoutRef.current = setTimeout(() => {
      setSuggestions([])
      setSuggestionIndex(-1)
    }, 150)
  }

  function handleUrlInputFocus() {
    if (suggestionsTimeoutRef.current) clearTimeout(suggestionsTimeoutRef.current)
    if (inputUrl.trim().length > 0) {
      const lower = inputUrl.toLowerCase()
      const matches = historyUrls
        .filter((h) => h.url.toLowerCase().includes(lower) || h.title.toLowerCase().includes(lower))
        .slice(0, 8)
      if (matches.length > 0) setSuggestions(matches)
    }
  }

  const handleRememberSite = useCallback(async () => {
    const wv = webviewRefs.current[activeBrowserTabId]
    if (!wv) return
    try {
      const meta = await wv.executeJavaScript(`
        (function() {
          const getMetaContent = (property, attr = 'content') => {
            const tag = document.querySelector(\`meta[property="\${property}"], meta[name="\${property}"]\`)
            return tag?.getAttribute(attr) || null
          }
          const pageText = Array.from(document.querySelectorAll('h1, h2, h3, p, li'))
            .map(el => el.textContent?.trim()).filter(text => text && text.length > 0).slice(0, 100).join('\\n')
          return { title: getMetaContent('og:title') || document.title, description: getMetaContent('og:description') || getMetaContent('description'), thumbnailUrl: getMetaContent('og:image'), siteName: getMetaContent('og:site_name') || new URL(location.href).hostname, url: location.href, page: pageText }
        })()
      `)
      await window.api.rememberMedia({
        title: meta.title,
        uploader: meta.siteName,
        description: meta.description,
        thumbnailUrl: meta.thumbnailUrl,
        url: meta.url,
        contentType: 'page',
        page: meta.page
      })
    } catch {}
  }, [activeBrowserTabId])

  const handleDownloadSite = useCallback(async () => {
    const wv = webviewRefs.current[activeBrowserTabId]
    if (!wv) return
    try {
      const { title, siteName, url, markdown } = await captureFromWebview(wv)
      await window.api.savePage({ title, siteName, url, markdown, contentType: 'page' })
    } catch {}
  }, [activeBrowserTabId])

  function handleSideDragStart(e) {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startWidth = sideWidth
    const wv = webviewRefs.current[activeBrowserTabId]
    if (wv) wv.style.pointerEvents = 'none'
    function onMove(ev) {
      setSideWidth(Math.max(1, startWidth + (startX - ev.clientX)))
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      if (wv) wv.style.pointerEvents = 'auto'
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const isBookmarked = bookmarks.some((b) => b.url === activeTab?.browserUrl)

  return (
    <div className="flex flex-col h-full">
      {contextMenu && (
        <div
          className="fixed z-50 bg-gray-800 border border-gray-600 rounded shadow-xl py-1 min-w-[160px] text-sm"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            className="w-full text-left px-3 py-1.5 font-bold text-white hover:bg-blue-600"
            onClick={() => handleContextDownload(contextMenu.srcURL)}
          >
            Download Video
          </button>
          <hr className="border-gray-600 my-1" />
          <button
            className="w-full text-left px-3 py-1.5 text-gray-300 hover:bg-gray-700"
            onClick={() => {
              navigator.clipboard.writeText(contextMenu.srcURL)
              setContextMenu(null)
            }}
          >
            Copy Video URL
          </button>
        </div>
      )}

      {/* Browser tab strip */}
      <BrowserTabBar />

      {/* Navigation bar */}
      <div className="flex items-center gap-1 px-2 py-1 bg-gray-900 border-b border-gray-700">
        <button
          onClick={() => webviewRefs.current[activeBrowserTabId]?.goBack()}
          disabled={!activeTab?.canGoBack}
          className="p-1 rounded text-gray-400 hover:text-white disabled:opacity-30 hover:bg-gray-700"
        >
          ←
        </button>
        <button
          onClick={() => webviewRefs.current[activeBrowserTabId]?.goForward()}
          disabled={!activeTab?.canGoForward}
          className="p-1 rounded text-gray-400 hover:text-white disabled:opacity-30 hover:bg-gray-700"
        >
          →
        </button>
        <button
          onClick={toggleBookmark}
          className="p-1 rounded text-gray-400 hover:text-white hover:bg-gray-700 text-lg"
          title={isBookmarked ? 'Remove bookmark' : 'Add bookmark'}
        >
          {isBookmarked ? '★' : '☆'}
        </button>
        <button
          onClick={() => setBookmarkPanelOpen(!bookmarkPanelOpen)}
          className="p-1 rounded text-gray-400 hover:text-white hover:bg-gray-700"
          title="View bookmarks"
        >
          ⊟
        </button>
        <div className="flex-1 relative">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              navigate(inputUrl)
              setSuggestions([])
            }}
            className="w-full"
          >
            <input
              ref={inputRef}
              type="text"
              value={inputUrl}
              onChange={handleUrlInputChange}
              onKeyDown={handleUrlInputKeyDown}
              onFocus={handleUrlInputFocus}
              onBlur={handleUrlInputBlur}
              className="w-full bg-gray-800 text-white text-sm px-3 py-1 rounded border border-gray-600 focus:outline-none focus:border-blue-500"
              placeholder="Enter URL or search..."
            />
          </form>
          {suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-600 rounded shadow-lg z-40 max-h-60 overflow-y-auto">
              {suggestions.map((s, idx) => (
                <div
                  key={idx}
                  onMouseDown={() => handleBookmarkClick(s.url)}
                  className={`px-3 py-2 cursor-pointer text-sm ${idx === suggestionIndex ? 'bg-blue-600' : 'hover:bg-gray-700'}`}
                >
                  <div className="text-white truncate">{s.title || s.url}</div>
                  <div className="text-gray-400 text-xs truncate">{s.url}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bookmarks panel */}
      {bookmarkPanelOpen && (
        <div className="absolute top-20 left-2 bg-gray-800 border border-gray-700 rounded shadow-xl z-50 max-h-96 overflow-y-auto min-w-[320px]">
          {bookmarks.length === 0 ? (
            <div className="px-4 py-3 text-gray-400 text-sm">No bookmarks yet</div>
          ) : (
            bookmarks.map((bookmark, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 px-3 py-2 hover:bg-gray-700 cursor-pointer group border-b border-gray-700 last:border-b-0"
                onMouseDown={() => handleBookmarkClick(bookmark.url)}
              >
                <span className="text-lg flex-shrink-0">🔖</span>
                <div className="flex-1 min-w-0">
                  <div className="text-white text-sm truncate">{bookmark.title}</div>
                  <div className="text-gray-400 text-xs truncate">{bookmark.url}</div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    window.api.removeBookmark(bookmark.url).catch(() => {})
                    removeBookmarkLocal(bookmark.url)
                  }}
                  className="hidden group-hover:block text-gray-400 hover:text-red-400 flex-shrink-0"
                  title="Remove bookmark"
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* Webviews + Side panel */}
      <div className="flex flex-1 min-h-0 relative">
        {/* Render one webview per non-suspended tab */}
        <div className="flex-1 min-w-0 relative">
          {browserTabs
            .filter((t) => !t.suspended)
            .map((tab) => (
              <webview
                key={tab.id}
                ref={(el) => {
                  if (el) attachWebviewEvents(tab.id, el)
                }}
                src={tab.browserUrl || HOME}
                partition="persist:main"
                allowpopups="true"
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: tab.id === activeBrowserTabId ? 'flex' : 'none',
                  height: '100%',
                  width: '100%'
                }}
              />
            ))}
        </div>
        <div
          role="separator"
          className="w-1 bg-gray-800 hover:bg-blue-600 cursor-col-resize flex-shrink-0 flex items-center justify-center transition-colors"
          onMouseDown={handleSideDragStart}
        >
          <div className="h-6 w-0.5 bg-gray-600 rounded pointer-events-none" />
        </div>
        <div style={{ width: sideWidth }} className="flex-shrink-0 h-full">
          <SidePanel onRememberSite={handleRememberSite} onDownloadSite={handleDownloadSite} />
        </div>
      </div>
    </div>
  )
}
