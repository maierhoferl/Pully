import { create } from 'zustand'

function makeTab(browserUrl = 'https://www.youtube.com') {
  return {
    id: crypto.randomUUID(),
    browserUrl,
    title: 'New Tab',
    favicon: null,
    suspended: false,
    lastActiveAt: Date.now(),
    canGoBack: false,
    canGoForward: false,
    mediaScanResults: null,
    mediaScanLoading: false,
    browserActiveChapter: null
  }
}

const _initialTab = makeTab('https://www.youtube.com')

export const useAppStore = create((set) => ({
  activeTab: 'browser',
  setActiveTab: (tab) => set({ activeTab: tab }),

  settingsOpen: false,
  setSettingsOpen: (open) => set({ settingsOpen: open }),

  config: { outputFolder: '', maxConcurrent: 3 },
  setConfig: (config) => set({ config }),

  downloads: [],
  setDownloads: (downloads) => set({ downloads }),
  updateDownloadProgress: ({ id, percent, speed, eta }) =>
    set((state) => ({
      downloads: state.downloads.map((d) => (d.id === id ? { ...d, percent, speed, eta } : d))
    })),
  updateDownloadFailed: ({ id, error }) =>
    set((state) => ({
      downloads: state.downloads.map((d) => (d.id === id ? { ...d, status: 'failed', error } : d))
    })),
  removeDownloadByUrl: (url) =>
    set((state) => ({
      downloads: state.downloads.filter((d) => d.url !== url)
    })),

  // Browser tabs
  browserTabs: [_initialTab],
  activeBrowserTabId: _initialTab.id,

  addBrowserTab: (browserUrl) =>
    set((state) => {
      const tab = makeTab(browserUrl || 'https://www.youtube.com')
      return { browserTabs: [...state.browserTabs, tab], activeBrowserTabId: tab.id }
    }),

  closeBrowserTab: (id) =>
    set((state) => {
      if (state.browserTabs.length === 1) {
        // Last tab: replace with a fresh home tab
        const freshTab = makeTab()
        return { browserTabs: [freshTab], activeBrowserTabId: freshTab.id }
      }
      const idx = state.browserTabs.findIndex((t) => t.id === id)
      const remaining = state.browserTabs.filter((t) => t.id !== id)
      let nextActiveId = state.activeBrowserTabId
      if (state.activeBrowserTabId === id) {
        // Activate adjacent tab (prefer right, fall back to left)
        const nextIdx = Math.min(idx, remaining.length - 1)
        nextActiveId = remaining[nextIdx].id
      }
      return { browserTabs: remaining, activeBrowserTabId: nextActiveId }
    }),

  closeOtherBrowserTabs: (id) =>
    set((state) => ({
      browserTabs: state.browserTabs.filter((t) => t.id === id),
      activeBrowserTabId: id
    })),

  setActiveBrowserTab: (id) => set({ activeBrowserTabId: id }),

  updateBrowserTab: (id, patch) =>
    set((state) => ({
      browserTabs: state.browserTabs.map((t) => (t.id === id ? { ...t, ...patch } : t))
    })),

  reorderBrowserTabs: (tabs) => set({ browserTabs: tabs }),

  suspendBrowserTab: (id) =>
    set((state) => ({
      browserTabs: state.browserTabs.map((t) => (t.id === id ? { ...t, suspended: true } : t))
    })),

  libraryFiles: [],
  setLibraryFiles: (files) => set({ libraryFiles: files }),
  removeLibraryFile: (path) =>
    set((state) => ({
      libraryFiles: state.libraryFiles.filter((f) => f.path !== path)
    })),

  librarySort: { field: 'date', direction: 'desc' },
  setLibrarySort: (field, direction) => set({ librarySort: { field, direction } }),

  librarySearch: '',
  setLibrarySearch: (query) => set({ librarySearch: query }),

  activeNotesFolder: null,
  setActiveNotesFolder: (folder) => set({ activeNotesFolder: folder }),

  activeNotesChapter: null,
  setActiveNotesChapter: (chapter) => set({ activeNotesChapter: chapter }),

  libraryActiveChapter: null,
  setLibraryActiveChapter: (data) => set({ libraryActiveChapter: data }),

  librarySelectedFile: null,
  setLibrarySelectedFile: (filePath) => set({ librarySelectedFile: filePath }),

  logEntries: [],

  appendLogEntry(entry) {
    // Push new entry and cap at 1000
    const updated = [...this.logEntries, entry]
    if (updated.length > 1000) {
      updated.shift() // Remove oldest entry
    }
    this.setLogEntries(updated)
  },

  setLogEntries(entries) {
    this.logEntries = entries
  },

  // Bookmarks
  bookmarks: [],
  setBookmarks: (bookmarks) => set({ bookmarks }),
  addBookmarkLocal: (bm) => set((s) => ({ bookmarks: [...s.bookmarks, bm] })),
  removeBookmarkLocal: (url) =>
    set((s) => ({ bookmarks: s.bookmarks.filter((b) => b.url !== url) })),

  // History
  historyUrls: [],
  setHistoryUrls: (items) => set({ historyUrls: items }),
  upsertHistoryLocal: ({ url, title }) =>
    set((s) => {
      const existing = s.historyUrls.find((h) => h.url === url)
      if (existing) {
        return { historyUrls: s.historyUrls.map((h) => (h.url === url ? { ...h, title } : h)) }
      }
      return { historyUrls: [...s.historyUrls, { url, title }] }
    }),

  // File browser state
  filesLastDir: null, // Path to last browsed folder
  filesSideWidth: 320, // Right panel width (default 320px)
  filesSideSplitPct: 60, // Preview/summary split (60% preview, 40% summary)

  setFilesLastDir: (path) => set({ filesLastDir: path }),
  setFilesSideWidth: (width) => set({ filesSideWidth: width }),
  setFilesSideSplitPct: (pct) => set({ filesSideSplitPct: pct })
}))
