import { create } from 'zustand'

export const useAppStore = create((set) => ({
  activeTab: 'browser',
  setActiveTab: tab => set({ activeTab: tab }),

  settingsOpen: false,
  setSettingsOpen: open => set({ settingsOpen: open }),

  config: { outputFolder: '', maxConcurrent: 3 },
  setConfig: config => set({ config }),

  downloads: [],
  setDownloads: downloads => set({ downloads }),
  updateDownloadProgress: ({ id, percent, speed, eta }) => set(state => ({
    downloads: state.downloads.map(d => d.id === id ? { ...d, percent, speed, eta } : d)
  })),
  updateDownloadFailed: ({ id, error }) => set(state => ({
    downloads: state.downloads.map(d => d.id === id ? { ...d, status: 'failed', error } : d)
  })),
  removeDownloadByUrl: url => set(state => ({
    downloads: state.downloads.filter(d => d.url !== url)
  })),

  currentBrowserUrl: null,
  setCurrentBrowserUrl: url => set({ currentBrowserUrl: url }),

  mediaScanResults: null,
  mediaScanLoading: false,
  startMediaScan: () => set({ mediaScanLoading: true, mediaScanResults: null }),
  setMediaScanResults: (results) => set({ mediaScanResults: results, mediaScanLoading: false }),

  libraryFiles: [],
  setLibraryFiles: files => set({ libraryFiles: files }),

  librarySort: { field: 'date', direction: 'desc' },
  setLibrarySort: (field, direction) => set({ librarySort: { field, direction } }),

  librarySearch: '',
  setLibrarySearch: query => set({ librarySearch: query }),

  activeNotesFolder: null,
  setActiveNotesFolder: (folder) => set({ activeNotesFolder: folder }),

  activeNotesChapter: null,
  setActiveNotesChapter: (chapter) => set({ activeNotesChapter: chapter }),

  browserActiveChapter: null,
  setBrowserActiveChapter: (data) => set({ browserActiveChapter: data }),

  librarySelectedFile: null,
  setLibrarySelectedFile: (filePath) => set({ librarySelectedFile: filePath }),

  logEntries: [],

  appendLogEntry(entry) {
    // Push new entry and cap at 1000
    const updated = [
      ...this.logEntries,
      entry
    ]
    if (updated.length > 1000) {
      updated.shift()  // Remove oldest entry
    }
    this.setLogEntries(updated)
  },

  setLogEntries(entries) {
    this.logEntries = entries
  },
}))
