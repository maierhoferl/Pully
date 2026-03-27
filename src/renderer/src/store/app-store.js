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

  mediaScanResults: [],
  mediaScanLoading: false,
  setMediaScanResults: (results) => set({ mediaScanResults: results, mediaScanLoading: false }),
  setMediaScanLoading: loading => set({ mediaScanLoading: loading }),

  libraryFiles: [],
  setLibraryFiles: files => set({ libraryFiles: files }),
}))
