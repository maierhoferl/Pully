import React, { useRef, useState, useEffect, useCallback } from 'react'
import { useAppStore } from '../store/app-store.js'
import SidePanel from './SidePanel.jsx'
import { captureFromWebview } from '../utils/pageCapture.js'

const HOME = 'https://www.youtube.com'
const RESCAN_INTERVAL_MS = 2_000

export default function BrowserTab() {
  const webviewRef = useRef(null)
  const inputRef = useRef(null)
  const [inputUrl, setInputUrl] = useState(HOME)
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)
  const [sideWidth, setSideWidth] = useState(320)
  const [contextMenu, setContextMenu] = useState(null)
  const [bookmarkPanelOpen, setBookmarkPanelOpen] = useState(false)
  const [suggestions, setSuggestions] = useState([])
  const [suggestionIndex, setSuggestionIndex] = useState(-1)
  const suggestionsTimeoutRef = useRef(null)
  const {
    startMediaScan,
    setMediaScanResults,
    setCurrentBrowserUrl,
    bookmarks,
    historyUrls,
    addBookmarkLocal,
    removeBookmarkLocal,
    upsertHistoryLocal,
    config
  } = useAppStore()
  const scanDebounceRef = useRef(null)
  const currentUrlRef = useRef(null)

  const scanPage = useCallback(
    async (pageUrl) => {
      try {
        // For YouTube, try to extract videos from the page first before using yt-dlp
        if (pageUrl && pageUrl.includes('youtube.com')) {
          try {
            const pageVideos = await webviewRef.current?.executeJavaScript(`
              (function() {
                const videos = [];
                const isWatchPage = /watch\\?v=/.test(location.href);
                const isPlaylistPage = /list=/.test(location.href) || /playlist\\?/.test(location.href);

                // Try to extract from ytInitialData if available (most reliable)
                let initialData = null;
                try {
                  const scripts = document.querySelectorAll('script');
                  for (const script of scripts) {
                    if (script.textContent.includes('var ytInitialData = ')) {
                      const match = script.textContent.match(/var ytInitialData = ({.*?});/s);
                      if (match) {
                        initialData = JSON.parse(match[1]);
                        break;
                      }
                    }
                  }
                } catch (e) {}

                if (isWatchPage) {
                  // Extract video info from watch page
                  const videoId = new URLSearchParams(location.search).get('v');
                  if (videoId) {
                    let title = document.title.replace(' - YouTube', '').trim();
                    // Try to get more specific title from page
                    const titleElement = document.querySelector('h1 yt-formatted-string, h1.title');
                    if (titleElement) title = titleElement.textContent.trim();

                    videos.push({
                      id: videoId,
                      url: \`https://www.youtube.com/watch?v=\${videoId}\`,
                      webpage_url: location.href,
                      title: title || videoId,
                      description: '',
                      thumbnail: \`https://img.youtube.com/vi/\${videoId}/maxresdefault.jpg\`,
                      ext: 'mp4'
                    });
                  }
                } else if (isPlaylistPage) {
                  // Extract playlist videos - try multiple selectors for robustness
                  const videoSelectors = [
                    'a#video-title-link[href*="watch?v="]',
                    'a.yt-simple-endpoint[href*="watch?v="]',
                    'span[role="link"][href*="watch?v="]'
                  ];

                  let videoLinks = [];
                  for (const selector of videoSelectors) {
                    videoLinks = Array.from(document.querySelectorAll(selector));
                    if (videoLinks.length > 0) break;
                  }

                  const playlistId = new URLSearchParams(location.search).get('list');

                  videoLinks.forEach((link, index) => {
                    if (index >= 20) return; // Limit to 20 videos
                    const href = link.getAttribute('href');
                    if (!href) return;

                    const videoId = new URLSearchParams(href.split('?')[1]).get('v');
                    if (videoId) {
                      videos.push({
                        id: videoId,
                        url: \`https://www.youtube.com\${href}\`,
                        webpage_url: \`https://www.youtube.com\${href}\`,
                        title: link.textContent.trim() || videoId,
                        description: '',
                        thumbnail: \`https://img.youtube.com/vi/\${videoId}/default.jpg\`,
                        playlist_id: playlistId,
                        ext: 'mp4'
                      });
                    }
                  });
                }

                return videos.length > 0 ? videos : null;
              })()
            `)
            if (pageVideos && pageVideos.length > 0) {
              setMediaScanResults(pageVideos)
              return
            }
          } catch (e) {
            // JS extraction failed, fall through to yt-dlp
          }
        }

        // Fallback to yt-dlp for non-YouTube sites or if JS extraction failed
        const results = await window.api.extractInfo(pageUrl)
        setMediaScanResults(results)
      } catch {
        setMediaScanResults([])
      }
    },
    [setMediaScanResults]
  )

  const debouncedScan = useCallback(
    (url) => {
      clearTimeout(scanDebounceRef.current)
      scanDebounceRef.current = setTimeout(() => {
        currentUrlRef.current = url
        setCurrentBrowserUrl(url)
        startMediaScan()
        scanPage(url)
      }, 500)
    },
    [scanPage, startMediaScan, setCurrentBrowserUrl]
  )

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
      setCurrentBrowserUrl(url)
      scanPage(url)

      // Record visit in history
      const title = wv.getTitle()
      window.api.upsertHistory({ url, title }).catch(() => {})
      upsertHistoryLocal({ url, title })

      if (url.includes('youtube.com')) {
        wv.executeJavaScript(
          `localStorage.setItem('yt-player-autoplay-preference', JSON.stringify({data:"false",creation:Date.now()}))`
        ).catch(() => {})
      }
      // Suppress native context menu on video elements — Pully's custom menu will show instead
      wv.executeJavaScript(
        `
        document.addEventListener('contextmenu', (e) => {
          if (e.target.tagName === 'VIDEO' || e.target.closest('video')) {
            e.preventDefault()
          }
        }, true)
      `
      ).catch(() => {})
    }

    const onContextMenu = (e) => {
      const { mediaType, srcURL, x, y } = e.params
      if (mediaType !== 'video' || !srcURL) return
      const rect = wv.getBoundingClientRect()
      setContextMenu({ x: rect.left + x, y: rect.top + y, srcURL })
    }

    wv.addEventListener('did-navigate', onNavigate)
    wv.addEventListener('did-navigate-in-page', onInPageNavigate)
    wv.addEventListener('did-start-loading', onStartLoading)
    wv.addEventListener('did-finish-load', onFinishLoad)
    wv.addEventListener('context-menu', onContextMenu)

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
      wv.removeEventListener('context-menu', onContextMenu)
      clearTimeout(scanDebounceRef.current)
      clearInterval(intervalId)
    }
  }, [scanPage, startMediaScan, debouncedScan])

  useEffect(() => {
    if (!contextMenu) return
    const dismiss = () => setContextMenu(null)
    window.addEventListener('mousedown', dismiss)
    return () => window.removeEventListener('mousedown', dismiss)
  }, [contextMenu])

  // Close bookmark panel on outside click
  useEffect(() => {
    if (!bookmarkPanelOpen) return
    const dismiss = () => setBookmarkPanelOpen(false)
    window.addEventListener('mousedown', dismiss)
    return () => window.removeEventListener('mousedown', dismiss)
  }, [bookmarkPanelOpen])

  // Inline autocomplete: fill first suggestion's URL with tail selected
  useEffect(() => {
    if (suggestions.length > 0 && inputRef.current && !inputRef.current.value.match(/^https?:\/\//)) {
      const firstUrl = suggestions[0].url
      inputRef.current.value = firstUrl
      // Select the tail (the part after what user typed)
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
    const wv = webviewRef.current
    if (!wv) return
    let url = raw
    if (!url.match(/^https?:\/\//)) {
      if (url.includes('.')) {
        url = `https://${url}`
      } else {
        // Use configured search engine
        const searchEngine = config.searchEngine || 'google'
        const searchUrls = {
          google: 'https://www.google.com/search?q=',
          duckduckgo: 'https://duckduckgo.com/?q=',
          bing: 'https://www.bing.com/search?q=',
          brave: 'https://search.brave.com/search?q='
        }
        const baseUrl = searchUrls[searchEngine] || searchUrls.google
        url = `${baseUrl}${encodeURIComponent(url)}`
      }
    }
    wv.loadURL(url)
  }

  function toggleBookmark() {
    const url = currentUrlRef.current
    if (!url) return

    const isBookmarked = bookmarks.some((b) => b.url === url)

    if (isBookmarked) {
      window.api.removeBookmark(url).catch(() => {})
      removeBookmarkLocal(url)
    } else {
      const title = webviewRef.current?.getTitle() || url
      window.api.addBookmark({ url, title }).catch(() => {})
      const bookmark = { url, title, favicon: null, addedAt: new Date().toISOString() }
      addBookmarkLocal(bookmark)
    }
  }

  function handleBookmarkClick(bookmarkUrl) {
    navigate(bookmarkUrl)
    setBookmarkPanelOpen(false)
  }

  function handleUrlInputChange(e) {
    const value = e.target.value
    setInputUrl(value)

    // Filter history for autocomplete suggestions
    if (value.trim().length > 0) {
      const lowerValue = value.toLowerCase()
      const matches = historyUrls
        .filter(
          (h) => h.url.toLowerCase().includes(lowerValue) || h.title.toLowerCase().includes(lowerValue)
        )
        .slice(0, 8)
      setSuggestions(matches)
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
        setSuggestionIndex((prev) => (prev + 1) % suggestions.length)
        break
      case 'ArrowUp':
        e.preventDefault()
        setSuggestionIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length)
        break
      case 'Enter':
        e.preventDefault()
        if (suggestionIndex >= 0) {
          navigate(suggestions[suggestionIndex].url)
        } else {
          navigate(inputUrl)
        }
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
    // Clear suggestions after 150ms to allow click to register
    suggestionsTimeoutRef.current = setTimeout(() => {
      setSuggestions([])
      setSuggestionIndex(-1)
    }, 150)
  }

  function handleUrlInputFocus() {
    if (suggestionsTimeoutRef.current) {
      clearTimeout(suggestionsTimeoutRef.current)
    }
    // Show suggestions if focused and input has value
    if (inputUrl.trim().length > 0) {
      const lowerValue = inputUrl.toLowerCase()
      const matches = historyUrls
        .filter(
          (h) => h.url.toLowerCase().includes(lowerValue) || h.title.toLowerCase().includes(lowerValue)
        )
        .slice(0, 8)
      if (matches.length > 0) {
        setSuggestions(matches)
      }
    }
  }

  const handleRememberSite = useCallback(async () => {
    try {
      const meta = await webviewRef.current.executeJavaScript(`
        (function() {
          const getMetaContent = (property, attr = 'content') => {
            const tag = document.querySelector(\`meta[property="\${property}"], meta[name="\${property}"]\`)
            return tag?.getAttribute(attr) || null
          }

          // Extract page content: combine title, headings, and body text
          const pageText = Array.from(document.querySelectorAll('h1, h2, h3, p, li'))
            .map(el => el.textContent?.trim())
            .filter(text => text && text.length > 0)
            .slice(0, 100) // Limit to first 100 elements
            .join('\\n')

          return {
            title: getMetaContent('og:title') || document.title,
            description: getMetaContent('og:description') || getMetaContent('description'),
            thumbnailUrl: getMetaContent('og:image'),
            siteName: getMetaContent('og:site_name') || new URL(location.href).hostname,
            url: location.href,
            page: pageText
          }
        })()
      `)

      // If no og:image, try to fetch favicon
      let thumbnailUrl = meta.thumbnailUrl
      if (!thumbnailUrl) {
        const faviconLink = document.querySelector('link[rel="icon"]')
        if (faviconLink?.href) {
          try {
            const url = new URL(faviconLink.href, meta.url)
            thumbnailUrl = url.href
          } catch {
            // ignore invalid favicon URLs
          }
        }
      }

      await window.api.rememberMedia({
        title: meta.title,
        uploader: meta.siteName,
        description: meta.description,
        thumbnailUrl,
        url: meta.url,
        contentType: 'page',
        page: meta.page
      })
    } catch (error) {
      console.error('Failed to remember site:', error)
    }
  }, [])

  const handleDownloadSite = useCallback(async () => {
    try {
      const { title, siteName, url, markdown } = await captureFromWebview(webviewRef.current)
      await window.api.savePage({
        title,
        siteName,
        url,
        markdown,
        contentType: 'page'
      })
    } catch (error) {
      console.error('Failed to download site:', error)
    }
  }, [])

  function handleSideDragStart(e) {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startWidth = sideWidth
    const wv = webviewRef.current

    // Disable pointer events on webview during drag to prevent it from capturing mousemove events
    if (wv) {
      wv.style.pointerEvents = 'none'
    }

    function onMove(ev) {
      setSideWidth(Math.max(1, startWidth + (startX - ev.clientX)))
    }

    function onUp() {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      // Re-enable pointer events on webview
      if (wv) {
        wv.style.pointerEvents = 'auto'
      }
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

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
      <div className="flex items-center gap-1 px-2 py-1 bg-gray-900 border-b border-gray-700">
        <button
          onClick={() => webviewRef.current?.goBack()}
          disabled={!canGoBack}
          className="p-1 rounded text-gray-400 hover:text-white disabled:opacity-30 hover:bg-gray-700"
        >
          ←
        </button>
        <button
          onClick={() => webviewRef.current?.goForward()}
          disabled={!canGoForward}
          className="p-1 rounded text-gray-400 hover:text-white disabled:opacity-30 hover:bg-gray-700"
        >
          →
        </button>

        {/* Bookmark star button */}
        <button
          onClick={toggleBookmark}
          className="p-1 rounded text-gray-400 hover:text-white hover:bg-gray-700 text-lg"
          title={bookmarks.some((b) => b.url === currentUrlRef.current) ? 'Remove bookmark' : 'Add bookmark'}
        >
          {bookmarks.some((b) => b.url === currentUrlRef.current) ? '★' : '☆'}
        </button>

        {/* Bookmark list button */}
        <button
          onClick={() => setBookmarkPanelOpen(!bookmarkPanelOpen)}
          className="p-1 rounded text-gray-400 hover:text-white hover:bg-gray-700"
          title="View bookmarks"
        >
          ⊟
        </button>

        {/* URL input with autocomplete */}
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
              placeholder="Enter URL or search…"
            />
          </form>

          {/* Autocomplete dropdown */}
          {suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-600 rounded shadow-lg z-40 max-h-60 overflow-y-auto">
              {suggestions.map((suggestion, idx) => (
                <div
                  key={idx}
                  onMouseDown={() => handleBookmarkClick(suggestion.url)}
                  className={`px-3 py-2 cursor-pointer text-sm ${
                    idx === suggestionIndex ? 'bg-blue-600' : 'hover:bg-gray-700'
                  }`}
                >
                  <div className="text-white truncate">{suggestion.title || suggestion.url}</div>
                  <div className="text-gray-400 text-xs truncate">{suggestion.url}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bookmarks panel overlay */}
      {bookmarkPanelOpen && (
        <div className="absolute top-12 left-2 bg-gray-800 border border-gray-700 rounded shadow-xl z-50 max-h-96 overflow-y-auto min-w-[320px]">
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
      <div className="flex flex-1 min-h-0">
        <webview
          ref={webviewRef}
          src={HOME}
          className="flex-1 min-w-0"
          style={{ height: '100%' }}
          allowpopups="true"
        />
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
